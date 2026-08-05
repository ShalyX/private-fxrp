#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_DEPLOYER="0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1"
TEE_SIGNER_ADDRESS="0x7820af00DDB9176150B27edF95D8FB191e555108"
COSTON2_RPC_URL="https://coston2-api.flare.network/ext/C/rpc"
EXT_PROXY_URL="https://augusta-unjoking-sarahi.ngrok-free.dev"

cleanup() {
  unset DEPLOYER_PRIVATE_KEY
}
trap cleanup EXIT INT TERM

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for command in curl node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

cd "$PROJECT_DIR"
echo "Installing the locked finalization toolchain…"
npm ci --ignore-scripts --no-audit --no-fund

echo "Checking the registered Private FXRP endpoint…"
curl --fail --silent --show-error --max-time 20 "$EXT_PROXY_URL/info" >/dev/null ||
  fail "Private FXRP proxy is unavailable"

read -r -s -p "Coston2 deployer private key (input hidden): " DEPLOYER_PRIVATE_KEY
echo
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY#0x}"
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY#0X}"
[[ "$DEPLOYER_PRIVATE_KEY" =~ ^[0-9a-fA-F]{64}$ ]] ||
  fail "private key must contain exactly 64 hexadecimal characters"
DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY"

DERIVED_DEPLOYER="$(
  DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" node -e '
    const { Wallet } = require("ethers");
    process.stdout.write(new Wallet(process.env.DEPLOYER_PRIVATE_KEY).address);
  '
)" || fail "could not derive deployer address"
[[ "${DERIVED_DEPLOYER,,}" == "${EXPECTED_DEPLOYER,,}" ]] ||
  fail "this key does not control the deployed contracts"

export DEPLOYER_PRIVATE_KEY COSTON2_RPC_URL TEE_SIGNER_ADDRESS
export DEPLOYMENT_OUTPUT="$PROJECT_DIR/deployments/coston2.json"
export EVIDENCE_OUTPUT="$PROJECT_DIR/evidence/coston2.json"

echo "Compiling and validating the finalizer…"
npx hardhat compile

echo "Authorizing the verified PRODUCTION TEE signer…"
npm run finalize:fcc:coston2

echo "Collecting block-anchored Coston2 evidence…"
npm run evidence:coston2

node - <<'NODE'
const manifest = require("./deployments/coston2.json");
const evidence = require("./evidence/coston2.json");
if (
  manifest.fcc.teeSigner?.toLowerCase() !==
    "0x7820af00ddb9176150b27edf95d8fb191e555108" ||
  manifest.fcc.teeMachineStatus !== "PRODUCTION" ||
  evidence.state.teeSignerRegistered !== true ||
  evidence.verification.passed !== true
) {
  throw new Error("final evidence verification failed");
}
console.log(
  `PRIVATE_FXRP_FCC_FINALIZED signer=${manifest.fcc.teeSigner} evidence_block=${evidence.blockNumber}`
);
NODE
