const {
  createCipheriv,
  createECDH,
  createHash,
  createHmac,
  randomBytes
} = require("node:crypto");
const { ethers } = require("ethers");

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

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function concatKdf(secret, outputLength) {
  const chunks = [];
  let written = 0;
  for (let counter = 1; written < outputLength; counter += 1) {
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(counter);
    const chunk = sha256(Buffer.concat([prefix, secret]));
    chunks.push(chunk);
    written += chunk.length;
  }
  return Buffer.concat(chunks).subarray(0, outputLength);
}

function encryptGethEcies(publicKey, plaintext, options = {}) {
  const recipient = Buffer.from(ethers.getBytes(publicKey));
  if (recipient.length !== 65 || recipient[0] !== 4) {
    throw new Error("TEE public key must be an uncompressed secp256k1 key");
  }
  const ephemeral = createECDH("secp256k1");
  if (options.ephemeralPrivateKey) {
    ephemeral.setPrivateKey(options.ephemeralPrivateKey);
  } else {
    ephemeral.generateKeys();
  }
  const iv = options.iv || randomBytes(16);
  if (iv.length !== 16) throw new Error("ECIES IV must be 16 bytes");

  const derived = concatKdf(ephemeral.computeSecret(recipient), 32);
  const encryptionKey = derived.subarray(0, 16);
  const macKey = sha256(derived.subarray(16));
  const cipher = createCipheriv("aes-128-ctr", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const ivCiphertext = Buffer.concat([iv, encrypted]);
  const mac = createHmac("sha256", macKey).update(ivCiphertext).digest();

  return Buffer.concat([
    ephemeral.getPublicKey(undefined, "uncompressed"),
    ivCiphertext,
    mac
  ]);
}

function extractAndVerifyTeePublicKey(info, expectedTeeAddress) {
  const strings = [];
  const byteArrays = [];
  const coordinatePairs = [];
  const visit = (value) => {
    if (typeof value === "string") {
      strings.push(value);
    } else if (Array.isArray(value)) {
      if (
        [33, 64, 65].includes(value.length) &&
        value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
      ) {
        byteArrays.push(Buffer.from(value));
      }
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      const x = value.x ?? value.X;
      const y = value.y ?? value.Y;
      if (
        typeof x === "string" &&
        typeof y === "string" &&
        /^(0x)?[0-9a-fA-F]{64}$/.test(x) &&
        /^(0x)?[0-9a-fA-F]{64}$/.test(y)
      ) {
        coordinatePairs.push(
          Buffer.from(`04${x.replace(/^0x/i, "")}${y.replace(/^0x/i, "")}`, "hex")
        );
      }
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(info);

  const expected = ethers.getAddress(expectedTeeAddress);
  let foundPublicKey = false;
  const acceptCandidate = (input) => {
    let candidate = input;
    if (candidate.length === 64) {
      candidate = Buffer.concat([Buffer.from([4]), candidate]);
    }
    if (
      !(
        (candidate.length === 65 && candidate[0] === 4) ||
        (candidate.length === 33 && [2, 3].includes(candidate[0]))
      )
    ) {
      return null;
    }
    foundPublicKey = true;
    const normalized = ethers.hexlify(candidate);
    try {
      return ethers.computeAddress(normalized) === expected ? normalized : null;
    } catch {
      return null;
    }
  };
  for (const value of strings) {
    const candidates = [];
    const raw = value.startsWith("0x") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(raw) && [66, 128, 130].includes(raw.length)) {
      candidates.push(Buffer.from(raw, "hex"));
    }
    try {
      const decoded = Buffer.from(value, "base64");
      if ([33, 64, 65].includes(decoded.length)) candidates.push(decoded);
    } catch {}

    for (const candidate of candidates) {
      const matched = acceptCandidate(candidate);
      if (matched) return matched;
    }
  }
  for (const candidate of byteArrays) {
    const matched = acceptCandidate(candidate);
    if (matched) return matched;
  }
  for (const candidate of coordinatePairs) {
    const matched = acceptCandidate(candidate);
    if (matched) return matched;
  }
  if (foundPublicKey) {
    throw new Error("FCC public key does not match the registered TEE");
  }
  throw new Error("FCC proxy did not return a TEE public key");
}

function normalizeAndVerifyActionResponse(response, expectedTeeAddress, chainId) {
  const result = response?.result;
  if (result?.status !== 1) {
    throw new Error(result?.log || "FCC action failed");
  }
  if (
    !ethers.isHexString(result.data) ||
    !ethers.isHexString(result.id, 32) ||
    typeof result.submissionTag !== "string" ||
    !ethers.isHexString(response.signature, 65)
  ) {
    throw new Error("FCC action response is incomplete");
  }
  const signatureBytes = ethers.getBytes(response.signature);
  if (signatureBytes[64] === 0 || signatureBytes[64] === 1) {
    signatureBytes[64] += 27;
  }
  if (signatureBytes[64] !== 27 && signatureBytes[64] !== 28) {
    throw new Error("FCC action signature has an invalid recovery byte");
  }
  const signature = ethers.hexlify(signatureBytes);
  const resultHash = ethers.solidityPackedKeccak256(
    ["bytes32", "bytes32", "bytes32", "uint8"],
    [
      ethers.keccak256(result.data),
      result.id,
      ethers.keccak256(ethers.toUtf8Bytes(result.submissionTag)),
      result.status
    ]
  );
  const payloadHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "bytes32"],
      [
        ethers.encodeBytes32String("TEE_ACTION_RESULT"),
        BigInt(chainId),
        resultHash
      ]
    )
  );
  const recovered = ethers.verifyMessage(
    ethers.getBytes(payloadHash),
    signature
  );
  if (recovered !== ethers.getAddress(expectedTeeAddress)) {
    throw new Error(`FCC result signer ${recovered} is not the registered TEE`);
  }
  return {
    data: result.data,
    id: result.id,
    submissionTag: result.submissionTag,
    status: result.status,
    signature
  };
}

function decodeAndValidateDecision(data, expected) {
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
    [
      "address",
      "address",
      "bytes32",
      "bytes32",
      "address",
      "bool",
      "uint128",
      "uint64",
      "uint64"
    ],
    data
  );
  const decision = {
    registry: decoded[0],
    account: decoded[1],
    policyId: decoded[2],
    rulesHash: decoded[3],
    issuer: decoded[4],
    eligible: decoded[5],
    limitUsd: decoded[6],
    expiresAt: decoded[7],
    nonce: decoded[8]
  };
  const sameAddress = (actual, wanted, label) => {
    if (ethers.getAddress(actual) !== ethers.getAddress(wanted)) {
      throw new Error(`FCC decision ${label} mismatch`);
    }
  };
  const sameHex = (actual, wanted, label) => {
    if (actual.toLowerCase() !== wanted.toLowerCase()) {
      throw new Error(`FCC decision ${label} mismatch`);
    }
  };
  sameAddress(decision.registry, expected.registry, "registry");
  sameAddress(decision.account, expected.account, "account");
  sameAddress(decision.issuer, expected.issuer, "issuer");
  sameHex(decision.policyId, expected.policyId, "policy ID");
  sameHex(decision.rulesHash, expected.rulesHash, "rules hash");
  if (!decision.eligible) throw new Error("FCC decision is not eligible");
  if (decision.limitUsd <= 0n) throw new Error("FCC decision limit is zero");
  if (decision.expiresAt <= BigInt(expected.now)) {
    throw new Error("FCC decision is already expired");
  }
  if (decision.nonce !== BigInt(expected.nonce)) {
    throw new Error("FCC decision nonce mismatch");
  }
  return decision;
}

async function buildSignedAccessRequest({
  issuerWallet,
  registry,
  account,
  policyId,
  rulesHash,
  policy,
  nonce,
  expiresAt
}) {
  const credential = {
    account: ethers.getAddress(account),
    jurisdiction: "NG",
    investorCategory: 2,
    riskScore: 20,
    expiresAt
  };
  const issuerSignature = await issuerWallet.signTypedData(
    CREDENTIAL_DOMAIN,
    CREDENTIAL_TYPES,
    credential
  );
  return {
    registry: ethers.getAddress(registry),
    account: credential.account,
    policyId,
    rulesHash,
    issuer: issuerWallet.address,
    credential,
    issuerSignature,
    policy,
    nonce
  };
}

module.exports = {
  buildSignedAccessRequest,
  decodeAndValidateDecision,
  encryptGethEcies,
  extractAndVerifyTeePublicKey,
  normalizeAndVerifyActionResponse
};
