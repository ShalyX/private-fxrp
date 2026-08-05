import { getAddress, isHexString } from "ethers";

const env = import.meta.env;

function optionalAddress(name) {
  const value = env[name];
  if (!value) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function parsePolicyRules() {
  try {
    const value = JSON.parse(env.VITE_POLICY_RULES_JSON || "{}");
    if (
      !Array.isArray(value.allowedJurisdictions) ||
      !Number.isInteger(value.minimumInvestorCategory) ||
      !Number.isInteger(value.maximumRiskScore) ||
      typeof value.limitByCategory !== "object"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

const policyId = env.VITE_POLICY_ID;

export const config = {
  chainId: 114n,
  chainName: "Coston2",
  rpcUrl:
    env.VITE_CHAIN_RPC_URL ||
    "https://coston2-api.flare.network/ext/C/rpc",
  explorerUrl:
    env.VITE_EXPLORER_URL || "https://coston2-explorer.flare.network",
  addresses: {
    accessRegistry: optionalAddress("VITE_ACCESS_REGISTRY_ADDRESS"),
    policyRegistry: optionalAddress("VITE_POLICY_REGISTRY_ADDRESS"),
    instructionSender: optionalAddress("VITE_INSTRUCTION_SENDER_ADDRESS"),
    vault: optionalAddress("VITE_PRIVATE_FXRP_VAULT_ADDRESS"),
    fxrp: optionalAddress("VITE_FXRP_ADDRESS")
  },
  policyId: isHexString(policyId, 32) ? policyId : null,
  policyRules: parsePolicyRules(),
  instructionFeeWei: BigInt(env.VITE_INSTRUCTION_FEE_WEI || "0"),
  liveProof: {
    extensionId: /^\d+$/.test(env.VITE_FCC_EXTENSION_ID || "")
      ? Number(env.VITE_FCC_EXTENSION_ID)
      : null,
    teeSigner: optionalAddress("VITE_TEE_SIGNER"),
    instructionId: isHexString(env.VITE_LIVE_INSTRUCTION_ID, 32)
      ? env.VITE_LIVE_INSTRUCTION_ID
      : null,
    requestTransaction: isHexString(env.VITE_LIVE_REQUEST_TX, 32)
      ? env.VITE_LIVE_REQUEST_TX
      : null,
    relayTransaction: isHexString(env.VITE_LIVE_RELAY_TX, 32)
      ? env.VITE_LIVE_RELAY_TX
      : null,
    evidenceBlock: /^\d+$/.test(env.VITE_LIVE_EVIDENCE_BLOCK || "")
      ? Number(env.VITE_LIVE_EVIDENCE_BLOCK)
      : null
  }
};

export const missingConfiguration = [
  ...Object.entries(config.addresses)
    .filter(([, value]) => !value)
    .map(([name]) => name),
  !config.policyId && "policyId",
  !config.policyRules && "policyRules",
  ...Object.entries(config.liveProof)
    .filter(([, value]) => !value)
    .map(([name]) => `liveProof.${name}`)
].filter(Boolean);
