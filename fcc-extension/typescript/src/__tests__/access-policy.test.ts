import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleEvaluateAccess } from "../app/handlers.js";
import { bytesToHex } from "../base/encoding.js";

const issuer = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const registry = "0x00000000000000000000000000000000000000a1";
const account = "0x00000000000000000000000000000000000000b2";
const policyId = `0x${"11".repeat(32)}` as const;
const credentialTypes = {
  Credential: [
    { name: "account", type: "address" },
    { name: "jurisdiction", type: "string" },
    { name: "investorCategory", type: "uint8" },
    { name: "riskScore", type: "uint16" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

afterEach(() => vi.restoreAllMocks());

async function requestPayload(overrides: Record<string, unknown> = {}) {
  const credential = {
    account,
    jurisdiction: "NG",
    investorCategory: 2,
    riskScore: 20,
    expiresAt: Math.floor(Date.now() / 1000) + 7200,
  };
  const signature = await issuer.signTypedData({
    domain: { name: "Private FXRP Credential", version: "1" },
    types: credentialTypes,
    primaryType: "Credential",
    message: credential,
  });
  const policy = {
    allowedJurisdictions: ["GB", "NG"],
    minimumInvestorCategory: 2,
    maximumRiskScore: 40,
    limitByCategory: { "2": "25000000000", "3": "100000000000" },
  };
  const rulesHash = keccak256(
    encodeAbiParameters(
      [
        { type: "string[]" },
        { type: "uint8" },
        { type: "uint16" },
        { type: "uint8[]" },
        { type: "uint128[]" },
      ],
      [["GB", "NG"], 2, 40, [2, 3], [25_000_000_000n, 100_000_000_000n]],
    ),
  );

  return {
    registry,
    account,
    policyId,
    issuer: issuer.address,
    credential,
    issuerSignature: signature,
    policy,
    rulesHash,
    nonce: 1,
    ...overrides,
  };
}

function mockDecrypt(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        decryptedMessage: Buffer.from(JSON.stringify(payload)).toString("base64"),
      }),
    }),
  );
}

describe("EVALUATE_ACCESS handler", () => {
  it("returns the narrow ABI decision after confidential evaluation", async () => {
    const payload = await requestPayload();
    mockDecrypt(payload);

    const result = await handleEvaluateAccess(bytesToHex(Buffer.from("ciphertext")));

    expect([result[1], result[2]]).toEqual([1, null]);
    const decoded = decodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bool" },
        { type: "uint128" },
        { type: "uint64" },
        { type: "uint64" },
      ],
      result[0] as `0x${string}`,
    );
    expect(decoded[0].toLowerCase()).toBe(registry.toLowerCase());
    expect(decoded[1].toLowerCase()).toBe(account.toLowerCase());
    expect(decoded[2]).toBe(policyId);
    expect(decoded[4]).toBe(issuer.address);
    expect(decoded[5]).toBe(true);
    expect(decoded[6]).toBe(25_000_000_000n);
    expect(decoded[8]).toBe(1n);
  });

  it("rejects an issuer signature from another wallet", async () => {
    const payload = await requestPayload();
    const impostor = privateKeyToAccount(
      "0x8b3a350cf5c34c9194ca3a545d4d1c6f4f5d7488a9a4a62e9b89926c14b6b4e0",
    );
    payload.issuerSignature = await impostor.signTypedData({
      domain: { name: "Private FXRP Credential", version: "1" },
      types: credentialTypes,
      primaryType: "Credential",
      message: payload.credential,
    });
    mockDecrypt(payload);

    const result = await handleEvaluateAccess(bytesToHex(Buffer.from("ciphertext")));

    expect(result[1]).toBe(0);
    expect(result[2]).toContain("credential issuer mismatch");
  });

  it("rejects a policy whose rules do not match its commitment", async () => {
    const payload = await requestPayload();
    payload.rulesHash = `0x${"ff".repeat(32)}`;
    mockDecrypt(payload);

    const result = await handleEvaluateAccess(bytesToHex(Buffer.from("ciphertext")));

    expect(result[1]).toBe(0);
    expect(result[2]).toContain("policy rules hash mismatch");
  });
});
