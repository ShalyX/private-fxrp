import {
  AbiCoder,
  getAddress,
  isHexString,
  keccak256
} from "ethers";

export const credentialDomain = {
  name: "Private FXRP Credential",
  version: "1"
};

export const credentialTypes = {
  Credential: [
    { name: "account", type: "address" },
    { name: "jurisdiction", type: "string" },
    { name: "investorCategory", type: "uint8" },
    { name: "riskScore", type: "uint16" },
    { name: "expiresAt", type: "uint64" }
  ]
};

export function computePolicyRulesHash(policy) {
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

export function parseCredentialPackage(value) {
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("Credential package is not valid JSON");
  }

  const credential = parsed?.credential;
  if (
    !credential ||
    typeof credential.jurisdiction !== "string" ||
    !Number.isInteger(credential.investorCategory) ||
    !Number.isInteger(credential.riskScore) ||
    !Number.isSafeInteger(credential.expiresAt)
  ) {
    throw new Error("Credential package has invalid fields");
  }

  const account = getAddress(credential.account);
  if (!isHexString(parsed.issuerSignature, 65)) {
    throw new Error("Credential package has an invalid issuer signature");
  }

  return {
    credential: { ...credential, account },
    issuerSignature: parsed.issuerSignature
  };
}

export function buildCredential({
  account,
  jurisdiction,
  investorCategory,
  riskScore,
  expiresAt
}) {
  const countryCode = String(jurisdiction || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("Jurisdiction must be a two-letter country code");
  }
  if (
    !Number.isInteger(investorCategory) ||
    investorCategory < 0 ||
    investorCategory > 255
  ) {
    throw new Error("Investor category must be an integer from 0 to 255");
  }
  if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 65535) {
    throw new Error("Risk score must be an integer from 0 to 65535");
  }
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Credential expiry must be in the future");
  }

  return {
    account: getAddress(account),
    jurisdiction: countryCode,
    investorCategory,
    riskScore,
    expiresAt
  };
}

export async function signCredentialPackage(signer, credential) {
  const issuerSignature = await signer.signTypedData(
    credentialDomain,
    credentialTypes,
    credential
  );
  return { credential, issuerSignature };
}

export function buildAccessRequest({
  registry,
  account,
  policyId,
  rulesHash,
  issuer,
  credentialPackage,
  policy,
  nonce
}) {
  if (!Number.isSafeInteger(nonce) || nonce <= 0) {
    throw new Error("Nonce must be a positive integer");
  }
  return {
    registry: getAddress(registry),
    account: getAddress(account),
    policyId,
    rulesHash,
    issuer: getAddress(issuer),
    credential: credentialPackage.credential,
    issuerSignature: credentialPackage.issuerSignature,
    policy,
    nonce
  };
}
