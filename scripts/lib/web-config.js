const { ethers } = require("ethers");

const DEFAULT_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const DEFAULT_EXPLORER_URL = "https://coston2-explorer.flare.network";

function computePolicyRulesHash(policy) {
  if (
    !policy ||
    !Array.isArray(policy.allowedJurisdictions) ||
    !Number.isInteger(policy.minimumInvestorCategory) ||
    !Number.isInteger(policy.maximumRiskScore) ||
    !policy.limitByCategory ||
    typeof policy.limitByCategory !== "object"
  ) {
    throw new Error("POLICY_RULES_JSON has an invalid shape");
  }
  const jurisdictions = [...policy.allowedJurisdictions].sort();
  const categories = Object.keys(policy.limitByCategory)
    .map(Number)
    .sort((left, right) => left - right);
  if (
    categories.some(
      (category) =>
        !Number.isInteger(category) || category < 0 || category > 255
    )
  ) {
    throw new Error("POLICY_RULES_JSON has an invalid category");
  }
  const limits = categories.map((category) =>
    String(policy.limitByCategory[category])
  );

  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string[]", "uint8", "uint16", "uint8[]", "uint128[]"],
      [
        jurisdictions,
        policy.minimumInvestorCategory,
        policy.maximumRiskScore,
        categories,
        limits
      ]
    )
  );
}

function requireAddress(value, label) {
  try {
    return ethers.getAddress(value);
  } catch {
    throw new Error(`Manifest ${label} is not a valid address`);
  }
}

function buildWebEnvironment(manifest, policyRules, options = {}) {
  if (manifest.chainId !== 114) {
    throw new Error("Manifest is not for Coston2");
  }
  if (!ethers.isHexString(manifest.policyId, 32)) {
    throw new Error("Manifest policyId is not bytes32");
  }
  const committedRulesHash = manifest.policy?.rulesHash;
  if (!ethers.isHexString(committedRulesHash, 32)) {
    throw new Error("Manifest policy.rulesHash is not bytes32");
  }
  const computedRulesHash = computePolicyRulesHash(policyRules);
  if (computedRulesHash.toLowerCase() !== committedRulesHash.toLowerCase()) {
    throw new Error(
      `POLICY_RULES_JSON does not match manifest policy commitment ${committedRulesHash}`
    );
  }
  if (manifest.fcc?.status !== "PRODUCTION") {
    throw new Error("Manifest FCC machine is not in PRODUCTION");
  }
  if (!Number.isSafeInteger(manifest.fcc.extensionId) || manifest.fcc.extensionId <= 0) {
    throw new Error("Manifest fcc.extensionId is invalid");
  }
  const liveProof = manifest.fcc.liveProof;
  for (const [name, value] of Object.entries({
    instructionId: liveProof?.instructionId,
    requestTransaction: liveProof?.requestTransaction,
    relayTransaction: liveProof?.relayTransaction
  })) {
    if (!ethers.isHexString(value, 32)) {
      throw new Error(`Manifest fcc.liveProof.${name} is not bytes32`);
    }
  }
  if (!Number.isSafeInteger(liveProof.evidenceBlock) || liveProof.evidenceBlock <= 0) {
    throw new Error("Manifest fcc.liveProof.evidenceBlock is invalid");
  }

  const instructionFeeWei = options.instructionFeeWei || "0";
  if (!/^\d+$/.test(instructionFeeWei)) {
    throw new Error("INSTRUCTION_FEE_WEI must be an unsigned integer");
  }
  const values = {
    VITE_CHAIN_RPC_URL: options.rpcUrl || DEFAULT_RPC_URL,
    VITE_EXPLORER_URL: options.explorerUrl || DEFAULT_EXPLORER_URL,
    VITE_ACCESS_REGISTRY_ADDRESS: requireAddress(
      manifest.contracts?.accessRegistry,
      "contracts.accessRegistry"
    ),
    VITE_POLICY_REGISTRY_ADDRESS: requireAddress(
      manifest.contracts?.policyRegistry,
      "contracts.policyRegistry"
    ),
    VITE_INSTRUCTION_SENDER_ADDRESS: requireAddress(
      manifest.contracts?.privateAccessInstructionSender,
      "contracts.privateAccessInstructionSender"
    ),
    VITE_PRIVATE_FXRP_VAULT_ADDRESS: requireAddress(
      manifest.contracts?.privateFxrpVault,
      "contracts.privateFxrpVault"
    ),
    VITE_FXRP_ADDRESS: requireAddress(
      manifest.protocol?.fxrp,
      "protocol.fxrp"
    ),
    VITE_POLICY_ID: manifest.policyId,
    VITE_INSTRUCTION_FEE_WEI: instructionFeeWei,
    VITE_POLICY_RULES_JSON: JSON.stringify(policyRules),
    VITE_FCC_EXTENSION_ID: String(manifest.fcc.extensionId),
    VITE_TEE_SIGNER: requireAddress(manifest.fcc.teeSigner, "fcc.teeSigner"),
    VITE_LIVE_INSTRUCTION_ID: liveProof.instructionId,
    VITE_LIVE_REQUEST_TX: liveProof.requestTransaction,
    VITE_LIVE_RELAY_TX: liveProof.relayTransaction,
    VITE_LIVE_EVIDENCE_BLOCK: String(liveProof.evidenceBlock)
  };

  return `${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
}

module.exports = {
  buildWebEnvironment,
  computePolicyRulesHash
};
