import { describe, expect, it } from "vitest";
import {
  buildAccessRequest,
  buildCredential,
  computePolicyRulesHash,
  parseCredentialPackage,
  signCredentialPackage
} from "./policy";
import { Wallet, verifyTypedData } from "ethers";

const account = "0x0000000000000000000000000000000000000001";
const issuer = "0x0000000000000000000000000000000000000002";
const registry = "0x0000000000000000000000000000000000000003";
const policyId = `0x${"11".repeat(32)}`;
const rules = {
  allowedJurisdictions: ["NG", "GB"],
  minimumInvestorCategory: 2,
  maximumRiskScore: 40,
  limitByCategory: { 3: "100000000000", 2: "25000000000" }
};

describe("policy request preparation", () => {
  it("hashes policy rules deterministically", () => {
    expect(computePolicyRulesHash(rules)).to.equal(
      computePolicyRulesHash({
        ...rules,
        allowedJurisdictions: ["GB", "NG"],
        limitByCategory: { 2: "25000000000", 3: "100000000000" }
      })
    );
  });

  it("validates credential package shape", () => {
    const parsed = parseCredentialPackage(
      JSON.stringify({
        credential: {
          account,
          jurisdiction: "NG",
          investorCategory: 2,
          riskScore: 20,
          expiresAt: 2000000000
        },
        issuerSignature: `0x${"aa".repeat(65)}`
      })
    );

    expect(parsed.credential.account).to.equal(account);
  });

  it("builds the exact FCC private access request", () => {
    const credentialPackage = parseCredentialPackage(
      JSON.stringify({
        credential: {
          account,
          jurisdiction: "NG",
          investorCategory: 2,
          riskScore: 20,
          expiresAt: 2000000000
        },
        issuerSignature: `0x${"aa".repeat(65)}`
      })
    );

    const request = buildAccessRequest({
      registry,
      account,
      policyId,
      rulesHash: computePolicyRulesHash(rules),
      issuer,
      credentialPackage,
      policy: rules,
      nonce: 7
    });

    expect(request).toMatchObject({
      registry,
      account,
      policyId,
      issuer,
      nonce: 7,
      credential: credentialPackage.credential
    });
  });
});

describe("issuer credential package", () => {
  it("normalizes and validates issuer inputs", () => {
    expect(
      buildCredential({
        account,
        jurisdiction: "ng",
        investorCategory: 2,
        riskScore: 20,
        expiresAt: 2000000000
      })
    ).toEqual({
      account,
      jurisdiction: "NG",
      investorCategory: 2,
      riskScore: 20,
      expiresAt: 2000000000
    });
  });

  it("rejects out-of-range credential fields", () => {
    expect(() =>
      buildCredential({
        account,
        jurisdiction: "Nigeria",
        investorCategory: 2,
        riskScore: 20,
        expiresAt: 2000000000
      })
    ).toThrow("two-letter country code");
    expect(() =>
      buildCredential({
        account,
        jurisdiction: "NG",
        investorCategory: 256,
        riskScore: 20,
        expiresAt: 2000000000
      })
    ).toThrow("Investor category");
  });

  it("creates a recoverable issuer-signed package", async () => {
    const wallet = Wallet.createRandom();
    const credential = buildCredential({
      account,
      jurisdiction: "NG",
      investorCategory: 2,
      riskScore: 20,
      expiresAt: 2000000000
    });
    const credentialPackage = await signCredentialPackage(wallet, credential);

    expect(
      verifyTypedData(
        { name: "Private FXRP Credential", version: "1" },
        {
          Credential: [
            { name: "account", type: "address" },
            { name: "jurisdiction", type: "string" },
            { name: "investorCategory", type: "uint8" },
            { name: "riskScore", type: "uint16" },
            { name: "expiresAt", type: "uint64" }
          ]
        },
        credential,
        credentialPackage.issuerSignature
      )
    ).to.equal(wallet.address);
  });
});
