const { expect } = require("chai");
const { Wallet, getBytes, id } = require("ethers");
const {
  createTeeKeyPair,
  computePolicyRulesHash,
  encryptCredential,
  processAccessRequest,
  signCredential
} = require("../../extension/policy-engine");

describe("confidential policy engine", function () {
  const policyRules = {
    allowedJurisdictions: ["NG", "GB"],
    minimumInvestorCategory: 2,
    maximumRiskScore: 40,
    limitByCategory: {
      2: "25000000000",
      3: "100000000000"
    }
  };
  const policy = {
    policyId: id("policy-alpha"),
    rulesHash: computePolicyRulesHash(policyRules),
    ...policyRules
  };

  it("decrypts an issuer-signed credential and returns a narrow decision", async function () {
    const issuer = Wallet.createRandom();
    const applicant = Wallet.createRandom();
    const teeWallet = Wallet.createRandom();
    const teeEncryption = createTeeKeyPair();
    const credential = {
      account: applicant.address,
      jurisdiction: "NG",
      investorCategory: 2,
      riskScore: 20,
      expiresAt: Math.floor(Date.now() / 1000) + 7200
    };
    const issuerSignature = await signCredential(issuer, credential);
    const encrypted = encryptCredential(
      teeEncryption.publicKey,
      { credential, issuerSignature },
      policy.policyId
    );

    const result = await processAccessRequest({
      encrypted,
      policy,
      issuerAddress: issuer.address,
      teePrivateKey: teeEncryption.privateKey,
      teeDecisionWallet: teeWallet,
      chainId: 114,
      accessRegistryAddress: Wallet.createRandom().address,
      nonce: 1
    });

    expect(result.decision).to.deep.include({
      account: applicant.address,
      policyId: policy.policyId,
      eligible: true,
      limitUsd: "25000000000",
      nonce: 1
    });
    expect(result.decision).not.to.have.keys(
      "jurisdiction",
      "investorCategory",
      "riskScore"
    );
    expect(result.signature).to.match(/^0x[0-9a-f]+$/i);
  });

  it("keeps credential attributes out of the encrypted payload", async function () {
    const teeEncryption = createTeeKeyPair();
    const encrypted = encryptCredential(
      teeEncryption.publicKey,
      {
        credential: {
          account: Wallet.createRandom().address,
          jurisdiction: "NG",
          investorCategory: 2,
          riskScore: 17,
          expiresAt: Math.floor(Date.now() / 1000) + 7200
        },
        issuerSignature: "0x1234"
      },
      policy.policyId
    );

    const serialized = JSON.stringify(encrypted);
    expect(serialized).not.to.include("jurisdiction");
    expect(serialized).not.to.include("riskScore");
    expect(serialized).not.to.include('"NG"');
  });

  it("rejects ciphertext modified after encryption", async function () {
    const issuer = Wallet.createRandom();
    const teeEncryption = createTeeKeyPair();
    const credential = {
      account: Wallet.createRandom().address,
      jurisdiction: "NG",
      investorCategory: 2,
      riskScore: 20,
      expiresAt: Math.floor(Date.now() / 1000) + 7200
    };
    const encrypted = encryptCredential(
      teeEncryption.publicKey,
      {
        credential,
        issuerSignature: await signCredential(issuer, credential)
      },
      policy.policyId
    );
    const altered = {
      ...encrypted,
      ciphertext: `0x${Buffer.from(getBytes(encrypted.ciphertext))
        .fill(0, 0, 1)
        .toString("hex")}`
    };

    await expect(
      processAccessRequest({
        encrypted: altered,
        policy,
        issuerAddress: issuer.address,
        teePrivateKey: teeEncryption.privateKey,
        teeDecisionWallet: Wallet.createRandom(),
        chainId: 114,
        accessRegistryAddress: Wallet.createRandom().address,
        nonce: 2
      })
    ).to.be.rejectedWith("Unable to decrypt credential");
  });

  it("rejects credentials not signed by the policy issuer", async function () {
    const issuer = Wallet.createRandom();
    const impostor = Wallet.createRandom();
    const teeEncryption = createTeeKeyPair();
    const credential = {
      account: Wallet.createRandom().address,
      jurisdiction: "NG",
      investorCategory: 2,
      riskScore: 20,
      expiresAt: Math.floor(Date.now() / 1000) + 7200
    };
    const encrypted = encryptCredential(
      teeEncryption.publicKey,
      {
        credential,
        issuerSignature: await signCredential(impostor, credential)
      },
      policy.policyId
    );

    await expect(
      processAccessRequest({
        encrypted,
        policy,
        issuerAddress: issuer.address,
        teePrivateKey: teeEncryption.privateKey,
        teeDecisionWallet: Wallet.createRandom(),
        chainId: 114,
        accessRegistryAddress: Wallet.createRandom().address,
        nonce: 3
      })
    ).to.be.rejectedWith("Credential issuer mismatch");
  });

  it("rejects policy rules that do not match the onchain commitment", async function () {
    const issuer = Wallet.createRandom();
    const teeEncryption = createTeeKeyPair();
    const credential = {
      account: Wallet.createRandom().address,
      jurisdiction: "NG",
      investorCategory: 2,
      riskScore: 20,
      expiresAt: Math.floor(Date.now() / 1000) + 7200
    };
    const encrypted = encryptCredential(
      teeEncryption.publicKey,
      {
        credential,
        issuerSignature: await signCredential(issuer, credential)
      },
      policy.policyId
    );

    await expect(
      processAccessRequest({
        encrypted,
        policy: { ...policy, maximumRiskScore: 99 },
        issuerAddress: issuer.address,
        teePrivateKey: teeEncryption.privateKey,
        teeDecisionWallet: Wallet.createRandom(),
        chainId: 114,
        accessRegistryAddress: Wallet.createRandom().address,
        nonce: 4
      })
    ).to.be.rejectedWith("Policy rules hash mismatch");
  });
});
