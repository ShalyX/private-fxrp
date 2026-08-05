#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_DEPLOYER="0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1"
EXPECTED_ISSUER="0x4ed30418Dce6C743b4b1F0da4DB33D9927699456"

cleanup() {
  unset DEPLOYER_PRIVATE_KEY POLICY_ISSUER_PRIVATE_KEY
}
trap cleanup EXIT INT TERM

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for command in node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

cd "$PROJECT_DIR"
echo "Installing the locked live-proof toolchain…"
npm ci --ignore-scripts --no-audit --no-fund

read -r -s -p "Coston2 deployer/applicant private key (input hidden): " DEPLOYER_PRIVATE_KEY
echo
read -r -s -p "Policy issuer private key (input hidden): " POLICY_ISSUER_PRIVATE_KEY
echo

normalize_key() {
  local key="${1#0x}"
  key="${key#0X}"
  [[ "$key" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
  printf '0x%s' "$key"
}

DEPLOYER_PRIVATE_KEY="$(normalize_key "$DEPLOYER_PRIVATE_KEY")" ||
  fail "invalid deployer private key"
POLICY_ISSUER_PRIVATE_KEY="$(normalize_key "$POLICY_ISSUER_PRIVATE_KEY")" ||
  fail "invalid policy issuer private key"

DERIVED_DEPLOYER="$(
  KEY="$DEPLOYER_PRIVATE_KEY" node -e '
    const { Wallet } = require("ethers");
    process.stdout.write(new Wallet(process.env.KEY).address);
  '
)"
DERIVED_ISSUER="$(
  KEY="$POLICY_ISSUER_PRIVATE_KEY" node -e '
    const { Wallet } = require("ethers");
    process.stdout.write(new Wallet(process.env.KEY).address);
  '
)"
[[ "${DERIVED_DEPLOYER,,}" == "${EXPECTED_DEPLOYER,,}" ]] ||
  fail "deployer key controls $DERIVED_DEPLOYER, not $EXPECTED_DEPLOYER"
[[ "${DERIVED_ISSUER,,}" == "${EXPECTED_ISSUER,,}" ]] ||
  fail "issuer key controls $DERIVED_ISSUER, not $EXPECTED_ISSUER"

export DEPLOYER_PRIVATE_KEY POLICY_ISSUER_PRIVATE_KEY
export DEPLOYMENT_OUTPUT="$PROJECT_DIR/deployments/coston2.json"
export LIVE_EVIDENCE_OUTPUT="$PROJECT_DIR/evidence/coston2-live-access.json"

npm run live-access:coston2
