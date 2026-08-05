const { ethers } = require("ethers");
const { computePolicyRulesHash } = require("./web-config");

const COSTON2_CHAIN_ID = 114n;
const COSTON2_FLARE_CONTRACTS_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
const COSTON2_FTSOV2 = "0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d";
const COSTON2_FLARE_TEE_MANAGER =
  "0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE";
const ZERO_ADDRESS = ethers.ZeroAddress;

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function address(env, name, fallback) {
  const raw = fallback === undefined ? required(env, name) : env[name] || fallback;
  let value;
  try {
    value = ethers.getAddress(raw);
  } catch {
    throw new Error(`${name} must be a valid address`);
  }
  if (value === ZERO_ADDRESS) {
    throw new Error(`${name} cannot be the zero address`);
  }
  return value;
}

function optionalAddress(env, name) {
  return env[name] ? address(env, name) : null;
}

function boundedInteger(env, name, fallback, minimum, maximum) {
  const raw = env[name] || String(fallback);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function policyCommitment(env) {
  const rawRules = required(env, "POLICY_RULES_JSON");
  let policyRules;
  try {
    policyRules = JSON.parse(rawRules);
  } catch {
    throw new Error("POLICY_RULES_JSON must be valid JSON");
  }
  const rulesHash = computePolicyRulesHash(policyRules);
  if (env.POLICY_RULES_HASH) {
    if (!ethers.isHexString(env.POLICY_RULES_HASH, 32)) {
      throw new Error("POLICY_RULES_HASH must be a bytes32 value");
    }
    if (env.POLICY_RULES_HASH.toLowerCase() !== rulesHash.toLowerCase()) {
      throw new Error(
        "POLICY_RULES_HASH does not match POLICY_RULES_JSON"
      );
    }
  }
  return { policyRules, rulesHash };
}

function loadCoston2Config(env = process.env) {
  const teeManagerAddress = address(
    env,
    "FLARE_TEE_MANAGER_ADDRESS",
    COSTON2_FLARE_TEE_MANAGER
  );

  const commitment = policyCommitment(env);
  return {
    chainId: COSTON2_CHAIN_ID,
    flareContractsRegistryAddress: address(
      env,
      "FLARE_CONTRACTS_REGISTRY_ADDRESS",
      COSTON2_FLARE_CONTRACTS_REGISTRY
    ),
    ftsoV2Address: address(env, "FTSOV2_ADDRESS", COSTON2_FTSOV2),
    teeManagerAddress,
    teeExtensionRegistryAddress: teeManagerAddress,
    teeMachineRegistryAddress: teeManagerAddress,
    fxrpAddress: optionalAddress(env, "FXRP_ADDRESS"),
    deployerAddress: optionalAddress(env, "DEPLOYER_ADDRESS"),
    issuerAddress: address(env, "POLICY_ISSUER_ADDRESS"),
    teeSignerAddress: optionalAddress(env, "TEE_SIGNER_ADDRESS"),
    policyRules: commitment.policyRules,
    rulesHash: commitment.rulesHash,
    policySalt: ethers.id(env.POLICY_SALT || "private-fxrp-vault-v1"),
    maxPriceAgeSeconds: boundedInteger(
      env,
      "MAX_PRICE_AGE_SECONDS",
      120,
      1,
      86400
    ),
    outputPath: env.DEPLOYMENT_OUTPUT || "deployments/coston2.json"
  };
}

function loadCoston2PreflightConfig(env = process.env) {
  return {
    chainId: COSTON2_CHAIN_ID,
    flareContractsRegistryAddress: address(
      env,
      "FLARE_CONTRACTS_REGISTRY_ADDRESS",
      COSTON2_FLARE_CONTRACTS_REGISTRY
    ),
    ftsoV2Address: address(env, "FTSOV2_ADDRESS", COSTON2_FTSOV2),
    teeManagerAddress: address(
      env,
      "FLARE_TEE_MANAGER_ADDRESS",
      COSTON2_FLARE_TEE_MANAGER
    ),
    fxrpAddress: optionalAddress(env, "FXRP_ADDRESS")
  };
}

module.exports = {
  COSTON2_CHAIN_ID,
  COSTON2_FLARE_CONTRACTS_REGISTRY,
  COSTON2_FLARE_TEE_MANAGER,
  COSTON2_FTSOV2,
  loadCoston2Config,
  loadCoston2PreflightConfig
};
