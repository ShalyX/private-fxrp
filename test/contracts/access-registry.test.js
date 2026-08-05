const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AccessRegistry", function () {
  async function deployFixture() {
    const [admin, operator, issuer, applicant, teeSigner, outsider] =
      await ethers.getSigners();

    const policyRegistry = await ethers.deployContract("PolicyRegistry", [admin.address]);
    const accessRegistry = await ethers.deployContract("AccessRegistry", [
      admin.address,
      await policyRegistry.getAddress()
    ]);

    const rulesHash = ethers.keccak256(ethers.toUtf8Bytes("policy-v1"));
    const salt = ethers.id("fxrp-vault-alpha");
    const policyId = await policyRegistry.computePolicyId(operator.address, salt);

    await policyRegistry
      .connect(operator)
      .createPolicy(salt, issuer.address, rulesHash);
    await accessRegistry.connect(admin).setTeeSigner(teeSigner.address, true);

    return {
      admin,
      operator,
      issuer,
      applicant,
      teeSigner,
      outsider,
      policyRegistry,
      accessRegistry,
      policyId,
      rulesHash
    };
  }

  async function signDecision(accessRegistry, signer, decision) {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "Private FXRP Access Desk",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await accessRegistry.getAddress()
    };
    const types = {
      AccessDecision: [
        { name: "account", type: "address" },
        { name: "policyId", type: "bytes32" },
        { name: "eligible", type: "bool" },
        { name: "limitUsd", type: "uint128" },
        { name: "expiresAt", type: "uint64" },
        { name: "nonce", type: "uint64" }
      ]
    };

    return signer.signTypedData(domain, types, decision);
  }

  async function signFccResult(signer, resultData, actionId, tag, status) {
    const network = await ethers.provider.getNetwork();
    const resultHash = ethers.solidityPackedKeccak256(
      ["bytes32", "bytes32", "bytes32", "uint8"],
      [
        ethers.keccak256(resultData),
        actionId,
        ethers.keccak256(ethers.toUtf8Bytes(tag)),
        status
      ]
    );
    const prefix = ethers.encodeBytes32String("TEE_ACTION_RESULT");
    const payloadHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "bytes32"],
        [prefix, network.chainId, resultHash]
      )
    );
    return signer.signMessage(ethers.getBytes(payloadHash));
  }

  it("stores a valid access decision from a registered TEE", async function () {
    const { applicant, teeSigner, accessRegistry, policyId } =
      await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const decision = {
      account: applicant.address,
      policyId,
      eligible: true,
      limitUsd: 25_000_000000n,
      expiresAt: now + 3600,
      nonce: 1
    };
    const signature = await signDecision(accessRegistry, teeSigner, decision);

    await expect(accessRegistry.submitDecision(decision, signature))
      .to.emit(accessRegistry, "AccessGranted")
      .withArgs(
        applicant.address,
        policyId,
        decision.limitUsd,
        decision.expiresAt,
        decision.nonce
      );

    const pass = await accessRegistry.getAccess(applicant.address, policyId);
    expect(pass.limitUsd).to.equal(decision.limitUsd);
    expect(pass.expiresAt).to.equal(decision.expiresAt);
    expect(await accessRegistry.canAccess(applicant.address, policyId)).to.equal(true);
  });

  it("rejects replayed decisions", async function () {
    const { applicant, teeSigner, accessRegistry, policyId } =
      await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const decision = {
      account: applicant.address,
      policyId,
      eligible: true,
      limitUsd: 10_000_000000n,
      expiresAt: now + 3600,
      nonce: 7
    };
    const signature = await signDecision(accessRegistry, teeSigner, decision);

    await accessRegistry.submitDecision(decision, signature);

    await expect(
      accessRegistry.submitDecision(decision, signature)
    ).to.be.revertedWithCustomError(accessRegistry, "DecisionAlreadyUsed");
  });

  it("rejects decisions signed by an unregistered signer", async function () {
    const { applicant, outsider, accessRegistry, policyId } =
      await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const decision = {
      account: applicant.address,
      policyId,
      eligible: true,
      limitUsd: 10_000_000000n,
      expiresAt: now + 3600,
      nonce: 2
    };
    const signature = await signDecision(accessRegistry, outsider, decision);

    await expect(
      accessRegistry.submitDecision(decision, signature)
    ).to.be.revertedWithCustomError(accessRegistry, "UnregisteredTeeSigner");
  });

  it("rejects a decision changed after it was signed", async function () {
    const { applicant, teeSigner, accessRegistry, policyId } =
      await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const decision = {
      account: applicant.address,
      policyId,
      eligible: true,
      limitUsd: 10_000_000000n,
      expiresAt: now + 3600,
      nonce: 3
    };
    const signature = await signDecision(accessRegistry, teeSigner, decision);

    await expect(
      accessRegistry.submitDecision(
        { ...decision, limitUsd: 100_000_000000n },
        signature
      )
    ).to.be.revertedWithCustomError(accessRegistry, "UnregisteredTeeSigner");
  });

  it("does not issue a pass for an ineligible decision", async function () {
    const { applicant, teeSigner, accessRegistry, policyId } =
      await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const decision = {
      account: applicant.address,
      policyId,
      eligible: false,
      limitUsd: 0,
      expiresAt: now + 3600,
      nonce: 4
    };
    const signature = await signDecision(accessRegistry, teeSigner, decision);

    await expect(
      accessRegistry.submitDecision(decision, signature)
    ).to.be.revertedWithCustomError(accessRegistry, "ApplicantNotEligible");
  });

  it("invalidates access when the policy owner deactivates the policy", async function () {
    const {
      operator,
      applicant,
      teeSigner,
      policyRegistry,
      accessRegistry,
      policyId
    } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const decision = {
      account: applicant.address,
      policyId,
      eligible: true,
      limitUsd: 10_000_000000n,
      expiresAt: now + 3600,
      nonce: 5
    };
    const signature = await signDecision(accessRegistry, teeSigner, decision);
    await accessRegistry.submitDecision(decision, signature);

    await policyRegistry.connect(operator).setPolicyActive(policyId, false);

    expect(await accessRegistry.canAccess(applicant.address, policyId)).to.equal(false);
  });

  it("stores an access decision from a signed FCC ActionResult", async function () {
    const {
      issuer,
      applicant,
      teeSigner,
      accessRegistry,
      policyId,
      rulesHash
    } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const actionId = ethers.id("fcc-action-1");
    const resultData = ethers.AbiCoder.defaultAbiCoder().encode(
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
      [
        await accessRegistry.getAddress(),
        applicant.address,
        policyId,
        rulesHash,
        issuer.address,
        true,
        25_000_000000n,
        now + 3600,
        11
      ]
    );
    const signature = await signFccResult(
      teeSigner,
      resultData,
      actionId,
      "submit",
      1
    );

    await expect(
      accessRegistry.submitFccDecision(
        resultData,
        actionId,
        "submit",
        1,
        signature
      )
    ).to.emit(accessRegistry, "AccessGranted");

    expect(await accessRegistry.canAccess(applicant.address, policyId)).to.equal(true);
  });

  it("rejects replay of an FCC action result", async function () {
    const {
      issuer,
      applicant,
      teeSigner,
      accessRegistry,
      policyId,
      rulesHash
    } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const actionId = ethers.id("fcc-action-replay");
    const resultData = ethers.AbiCoder.defaultAbiCoder().encode(
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
      [
        await accessRegistry.getAddress(),
        applicant.address,
        policyId,
        rulesHash,
        issuer.address,
        true,
        10_000_000000n,
        now + 3600,
        12
      ]
    );
    const signature = await signFccResult(
      teeSigner,
      resultData,
      actionId,
      "submit",
      1
    );
    await accessRegistry.submitFccDecision(
      resultData,
      actionId,
      "submit",
      1,
      signature
    );

    await expect(
      accessRegistry.submitFccDecision(
        resultData,
        actionId,
        "submit",
        1,
        signature
      )
    ).to.be.revertedWithCustomError(accessRegistry, "FccActionAlreadyUsed");
  });

  it("rejects an FCC result evaluated against a different policy commitment", async function () {
    const {
      issuer,
      applicant,
      teeSigner,
      accessRegistry,
      policyId
    } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const actionId = ethers.id("fcc-action-wrong-rules");
    const resultData = ethers.AbiCoder.defaultAbiCoder().encode(
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
      [
        await accessRegistry.getAddress(),
        applicant.address,
        policyId,
        ethers.id("different-rules"),
        issuer.address,
        true,
        10_000_000000n,
        now + 3600,
        13
      ]
    );
    const signature = await signFccResult(
      teeSigner,
      resultData,
      actionId,
      "submit",
      1
    );

    await expect(
      accessRegistry.submitFccDecision(
        resultData,
        actionId,
        "submit",
        1,
        signature
      )
    ).to.be.revertedWithCustomError(accessRegistry, "PolicyCommitmentMismatch");
  });
});
