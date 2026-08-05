#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

export COSTON2_RPC_URL="${COSTON2_RPC_URL:-https://coston2-api.flare.network/ext/C/rpc}"
export DEPLOYER_ADDRESS="${DEPLOYER_ADDRESS:-0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1}"
export POLICY_ISSUER_ADDRESS="${POLICY_ISSUER_ADDRESS:-0x4ed30418Dce6C743b4b1F0da4DB33D9927699456}"
export POLICY_RULES_JSON="${POLICY_RULES_JSON:-{\"allowedJurisdictions\":[\"GB\",\"NG\"],\"minimumInvestorCategory\":2,\"maximumRiskScore\":40,\"limitByCategory\":{\"2\":\"25000000000\",\"3\":\"100000000000\"}}}"

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  read -r -s -p "Coston2 deployer private key (input hidden): " DEPLOYER_PRIVATE_KEY
  printf '\n'
  export DEPLOYER_PRIVATE_KEY
fi
trap 'unset DEPLOYER_PRIVATE_KEY' EXIT

if [[ ! "$DEPLOYER_PRIVATE_KEY" =~ ^(0x)?[0-9a-fA-F]{64}$ ]]; then
  echo "Invalid private key format." >&2
  exit 1
fi
if [[ "$DEPLOYER_PRIVATE_KEY" != 0x* ]]; then
  DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY"
  export DEPLOYER_PRIVATE_KEY
fi

npm run ready:deployer:coston2
npm run deploy:coston2
