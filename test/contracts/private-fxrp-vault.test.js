const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateFXRPVault", function () {
  async function signDecision(accessRegistry, signer, decision) {
    const network = await ethers.provider.getNetwork();
    return signer.signTypedData(
      {
        name: "Private FXRP Access Desk",
        version: "1",
        chainId: network.chainId,
        verifyingContract: await accessRegistry.getAddress()
      },
      {
        AccessDecision: [
          { name: "account", type: "address" },
          { name: "policyId", type: "bytes32" },
          { name: "eligible", type: "bool" },
          { name: "limitUsd", type: "uint128" },
          { name: "expiresAt", type: "uint64" },
          { name: "nonce", type: "uint64" }
        ]
      },
      decision
    );
  }

  async function deployFixture() {
    const [admin, operator, issuer, applicant, teeSigner, unapproved] =
      await ethers.getSigners();
    const policyRegistry = await ethers.deployContract("PolicyRegistry", [
      admin.address
    ]);
    const accessRegistry = await ethers.deployContract("AccessRegistry", [
      admin.address,
      await policyRegistry.getAddress()
    ]);
    const token = await ethers.deployContract("MockERC20", [
      "Mock FXRP",
      "FXRP",
      6
    ]);
    const oracle = await ethers.deployContract("MockXrpUsdOracle", [
      ethers.parseUnits("2", 18)
    ]);
    const salt = ethers.id("vault-policy");
    const policyId = await policyRegistry.computePolicyId(
      operator.address,
      salt
    );
    await policyRegistry
      .connect(operator)
      .createPolicy(salt, issuer.address, ethers.id("rules-v1"));
    await accessRegistry.connect(admin).setTeeSigner(teeSigner.address, true);

    const vault = await ethers.deployContract("PrivateFXRPVault", [
      await token.getAddress(),
      await accessRegistry.getAddress(),
      await oracle.getAddress(),
      policyId
    ]);
    await token.mint(applicant.address, ethers.parseUnits("20000", 6));
    await token
      .connect(applicant)
      .approve(await vault.getAddress(), ethers.MaxUint256);

    async function grantAccess(limitUsd = "25000") {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const decision = {
        account: applicant.address,
        policyId,
        eligible: true,
        limitUsd: ethers.parseUnits(limitUsd, 6),
        expiresAt: now + 3600,
        nonce: 1
      };
      await accessRegistry.submitDecision(
        decision,
        await signDecision(accessRegistry, teeSigner, decision)
      );
    }

    return {
      operator,
      applicant,
      unapproved,
      policyRegistry,
      accessRegistry,
      token,
      oracle,
      vault,
      policyId,
      grantAccess
    };
  }

  it("accepts FXRP when the applicant has access and capacity", async function () {
    const { applicant, vault, grantAccess } = await deployFixture();
    await grantAccess();
    const amount = ethers.parseUnits("1000", 6);

    await expect(vault.connect(applicant).deposit(amount))
      .to.emit(vault, "Deposited")
      .withArgs(applicant.address, amount, ethers.parseUnits("2000", 6));

    expect(await vault.positionOf(applicant.address)).to.equal(amount);
  });

  it("rejects deposits from an account without an active pass", async function () {
    const { unapproved, vault } = await deployFixture();

    await expect(
      vault.connect(unapproved).deposit(ethers.parseUnits("1", 6))
    ).to.be.revertedWithCustomError(vault, "AccessRequired");
  });

  it("rejects deposits that would exceed the USD limit", async function () {
    const { applicant, vault, grantAccess } = await deployFixture();
    await grantAccess("25000");

    await expect(
      vault.connect(applicant).deposit(ethers.parseUnits("13000", 6))
    )
      .to.be.revertedWithCustomError(vault, "ExposureLimitExceeded")
      .withArgs(ethers.parseUnits("26000", 6), ethers.parseUnits("25000", 6));
  });

  it("revalues the full position before accepting another deposit", async function () {
    const { applicant, oracle, vault, grantAccess } = await deployFixture();
    await grantAccess("25000");
    await vault.connect(applicant).deposit(ethers.parseUnits("10000", 6));
    await oracle.setPrice(ethers.parseUnits("2.5", 18));

    await expect(
      vault.connect(applicant).deposit(ethers.parseUnits("1", 6))
    ).to.be.revertedWithCustomError(vault, "ExposureLimitExceeded");
  });

  it("allows withdrawals after the underlying policy is deactivated", async function () {
    const {
      operator,
      applicant,
      policyRegistry,
      token,
      vault,
      policyId,
      grantAccess
    } = await deployFixture();
    await grantAccess();
    const amount = ethers.parseUnits("1000", 6);
    await vault.connect(applicant).deposit(amount);
    await policyRegistry.connect(operator).setPolicyActive(policyId, false);

    await expect(vault.connect(applicant).withdraw(amount))
      .to.emit(vault, "Withdrawn")
      .withArgs(applicant.address, amount);

    expect(await vault.positionOf(applicant.address)).to.equal(0);
    expect(await token.balanceOf(applicant.address)).to.equal(
      ethers.parseUnits("20000", 6)
    );
  });
});
