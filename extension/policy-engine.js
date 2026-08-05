const {
  createCipheriv,
  createDecipheriv,
  createECDH,
  hkdfSync,
  randomBytes
} = require("node:crypto");
const {
  AbiCoder,
  getAddress,
  keccak256,
  verifyTypedData
} = require("ethers");

const CREDENTIAL_DOMAIN = {
  name: "Private FXRP Credential",
  version: "1"
};
const CREDENTIAL_TYPES = {
  Credential: [
    { name: "account", type: "address" },
    { name: "jurisdiction", type: "string" },
    { name: "investorCategory", type: "uint8" },
    { name: "riskScore", type: "uint16" },
    { name: "expiresAt", type: "uint64" }
  ]
};
const DECISION_TYPES = {
  AccessDecision: [
    { name: "account", type: "address" },
    { name: "policyId", type: "bytes32" },
    { name: "eligible", type: "bool" },
    { name: "limitUsd", type: "uint128" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint64" }
  ]
};

function createTeeKeyPair() {
  const ecdh = createECDH("secp256k1");
  ecdh.generateKeys();
  return {
    publicKey: `0x${ecdh.getPublicKey().toString("hex")}`,
    privateKey: `0x${ecdh.getPrivateKey().toString("hex")}`
  };
}

function deriveKey(privateKey, publicKey, context) {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(stripHexPrefix(privateKey), "hex"));
  const sharedSecret = ecdh.computeSecret(
    Buffer.from(stripHexPrefix(publicKey), "hex")
  );

  return Buffer.from(
    hkdfSync(
      "sha256",
      sharedSecret,
      Buffer.from(stripHexPrefix(context), "hex"),
      Buffer.from("private-fxrp-access-desk:v1"),
      32
    )
  );
}

function encryptCredential(teePublicKey, payload, policyId) {
  const ephemeral = createECDH("secp256k1");
  ephemeral.generateKeys();
  const key = deriveKey(
    `0x${ephemeral.getPrivateKey().toString("hex")}`,
    teePublicKey,
    policyId
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(stripHexPrefix(policyId), "hex"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);

  return {
    ephemeralPublicKey: `0x${ephemeral.getPublicKey().toString("hex")}`,
    iv: `0x${iv.toString("hex")}`,
    ciphertext: `0x${ciphertext.toString("hex")}`,
    authTag: `0x${cipher.getAuthTag().toString("hex")}`
  };
}

function decryptCredential(teePrivateKey, encrypted, policyId) {
  try {
    const key = deriveKey(
      teePrivateKey,
      encrypted.ephemeralPublicKey,
      policyId
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(stripHexPrefix(encrypted.iv), "hex")
    );
    decipher.setAAD(Buffer.from(stripHexPrefix(policyId), "hex"));
    decipher.setAuthTag(
      Buffer.from(stripHexPrefix(encrypted.authTag), "hex")
    );
    const plaintext = Buffer.concat([
      decipher.update(
        Buffer.from(stripHexPrefix(encrypted.ciphertext), "hex")
      ),
      decipher.final()
    ]);

    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Unable to decrypt credential");
  }
}

async function signCredential(issuerWallet, credential) {
  return issuerWallet.signTypedData(
    CREDENTIAL_DOMAIN,
    CREDENTIAL_TYPES,
    credential
  );
}

async function processAccessRequest({
  encrypted,
  policy,
  issuerAddress,
  teePrivateKey,
  teeDecisionWallet,
  chainId,
  accessRegistryAddress,
  nonce
}) {
  if (computePolicyRulesHash(policy) !== policy.rulesHash) {
    throw new Error("Policy rules hash mismatch");
  }

  const { credential, issuerSignature } = decryptCredential(
    teePrivateKey,
    encrypted,
    policy.policyId
  );
  validateCredential(credential);

  const recoveredIssuer = verifyTypedData(
    CREDENTIAL_DOMAIN,
    CREDENTIAL_TYPES,
    credential,
    issuerSignature
  );
  if (getAddress(recoveredIssuer) !== getAddress(issuerAddress)) {
    throw new Error("Credential issuer mismatch");
  }

  const now = Math.floor(Date.now() / 1000);
  const eligible =
    credential.expiresAt > now &&
    policy.allowedJurisdictions.includes(credential.jurisdiction) &&
    credential.investorCategory >= policy.minimumInvestorCategory &&
    credential.riskScore <= policy.maximumRiskScore;
  const limitUsd = eligible
    ? String(policy.limitByCategory[credential.investorCategory] ?? "0")
    : "0";
  const decision = {
    account: getAddress(credential.account),
    policyId: policy.policyId,
    eligible: eligible && limitUsd !== "0",
    limitUsd,
    expiresAt: Math.min(credential.expiresAt, now + 3600),
    nonce
  };
  const signature = await teeDecisionWallet.signTypedData(
    {
      name: "Private FXRP Access Desk",
      version: "1",
      chainId,
      verifyingContract: accessRegistryAddress
    },
    DECISION_TYPES,
    decision
  );

  return { decision, signature };
}

function computePolicyRulesHash(policy) {
  const jurisdictions = [...policy.allowedJurisdictions].sort();
  const categories = Object.keys(policy.limitByCategory)
    .map(Number)
    .sort((left, right) => left - right);
  const limits = categories.map((category) =>
    String(policy.limitByCategory[category])
  );

  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
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

function validateCredential(credential) {
  if (
    typeof credential !== "object" ||
    typeof credential.account !== "string" ||
    typeof credential.jurisdiction !== "string" ||
    !Number.isInteger(credential.investorCategory) ||
    !Number.isInteger(credential.riskScore) ||
    !Number.isInteger(credential.expiresAt)
  ) {
    throw new Error("Malformed credential");
  }
  getAddress(credential.account);
}

function stripHexPrefix(value) {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error("Expected hex value");
  }
  return value.slice(2);
}

module.exports = {
  computePolicyRulesHash,
  createTeeKeyPair,
  encryptCredential,
  processAccessRequest,
  signCredential
};
