#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CHAIN_URL="https://coston2-api.flare.network/ext/C/rpc"
EXT_PROXY_URL="https://augusta-unjoking-sarahi.ngrok-free.dev"
NORMAL_PROXY_URL="https://tee-proxy-coston2-1.flare.rocks"
EXPECTED_OWNER="0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1"
MANAGER="0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE"
EXTENSION_ID="65835"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$SCRIPT_DIR/tools"
ADDRESSES_FILE="$SCRIPT_DIR/config/coston2/deployed-addresses.json"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/private-fxrp-register.XXXXXX")"
STATE_FILE="$WORK_DIR/register-tee.state"
REGISTER_LOG="$WORK_DIR/register-tee.log"

cleanup() {
  unset DEPLOYMENT_PRIVATE_KEY EXTENSION_OWNER_KEY
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT INT TERM

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for command in curl go; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done
[[ -r "$ADDRESSES_FILE" ]] || fail "Coston2 address configuration is missing"
grep -Fq "$MANAGER" "$ADDRESSES_FILE" || fail "address file does not contain the live Coston2 manager"

echo "Checking the Private FXRP and Coston2 proxy endpoints…"
curl --fail --silent --show-error --max-time 20 "$EXT_PROXY_URL/info" >/dev/null ||
  fail "Private FXRP proxy is unavailable"
curl --fail --silent --show-error --max-time 20 "$NORMAL_PROXY_URL/info" >/dev/null ||
  fail "Coston2 normal proxy is unavailable"

read -r -s -p "Coston2 deployer private key (input hidden): " DEPLOYMENT_PRIVATE_KEY
echo
DEPLOYMENT_PRIVATE_KEY="${DEPLOYMENT_PRIVATE_KEY#0x}"
DEPLOYMENT_PRIVATE_KEY="${DEPLOYMENT_PRIVATE_KEY#0X}"
[[ "$DEPLOYMENT_PRIVATE_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || fail "private key must contain exactly 64 hexadecimal characters"

echo "Verifying deployer identity…"
DERIVED_OWNER="$(printf '%s' "$DEPLOYMENT_PRIVATE_KEY" | (cd "$TOOLS_DIR" && go run ./cmd/key-address))" ||
  fail "could not derive the deployer address"
[[ "${DERIVED_OWNER,,}" == "${EXPECTED_OWNER,,}" ]] ||
  fail "this key controls $DERIVED_OWNER, not the expected deployer $EXPECTED_OWNER"

export DEPLOYMENT_PRIVATE_KEY
export EXTENSION_OWNER_KEY="$DEPLOYMENT_PRIVATE_KEY"
export INITIAL_OWNER="$EXPECTED_OWNER"
export GOVERNANCE_SIGNERS="$EXPECTED_OWNER"
export GOVERNANCE_THRESHOLD="1"
export SIMULATED_TEE=true
export GOTOOLCHAIN=auto

cd "$TOOLS_DIR"

echo "1/3 Allowing the v0.4.0 TEE workload…"
go run ./cmd/allow-tee-version \
  -a "$ADDRESSES_FILE" \
  -c "$CHAIN_URL" \
  -p "$EXT_PROXY_URL" \
  -version "v0.4.0"

echo "2/3 Setting single-owner TEE governance…"
go run ./cmd/set-governance \
  -a "$ADDRESSES_FILE" \
  -c "$CHAIN_URL" \
  -p "$EXT_PROXY_URL"

echo "3/3 Registering the TEE with a fresh challenge…"
go run ./cmd/register-tee \
  -a "$ADDRESSES_FILE" \
  -c "$CHAIN_URL" \
  -p "$EXT_PROXY_URL" \
  -h "$EXT_PROXY_URL" \
  -ep "$NORMAL_PROXY_URL" \
  -state "$STATE_FILE" \
  -command rRap 2>&1 | tee "$REGISTER_LOG"

TEE_ID="$(sed -n 's/.*Registration of TEE with ID \([0-9a-fA-F]\{40\}\).*/0x\1/p' "$REGISTER_LOG" | tail -n 1)"
[[ "$TEE_ID" =~ ^0x[0-9a-fA-F]{40}$ ]] || fail "registration completed but the TEE ID could not be extracted"

echo "Waiting for Coston2 data providers to promote $TEE_ID to PRODUCTION…"
for _ in $(seq 1 36); do
  STATUS="$(go run ./cmd/query-tee -rpc "$CHAIN_URL" -reg "$MANAGER" "$TEE_ID" 2>&1)"
  if grep -Fq "getTeeMachineStatus: 2" <<<"$STATUS"; then
    grep -F "getTeeMachine:" <<<"$STATUS"
    grep -F "getTeeMachineStatus:" <<<"$STATUS"
    echo "PRIVATE_FXRP_TEE_REGISTERED tee_id=$TEE_ID extension_id=$EXTENSION_ID status=PRODUCTION"
    exit 0
  fi
  sleep 5
done

echo "$STATUS"
fail "TEE registered as $TEE_ID but did not reach PRODUCTION within 3 minutes"
