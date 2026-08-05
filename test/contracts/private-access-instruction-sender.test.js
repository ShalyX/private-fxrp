const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateAccessInstructionSender", function () {
  async function deployFixture() {
    const [applicant, tee] = await ethers.getSigners();
    const manager = await ethers.deployContract("MockTeeManager", [tee.address]);
    const sender = await ethers.deployContract("PrivateAccessInstructionSender", [
      await manager.getAddress(),
      await manager.getAddress()
    ]);

    await manager.setInstructionSender(0x10000, await sender.getAddress());
    await sender.setExtensionId();

    return { applicant, manager, sender };
  }

  it("forwards the encrypted request using the FCC operation contract", async function () {
    const { applicant, manager, sender } = await deployFixture();
    const ciphertext = ethers.hexlify(ethers.toUtf8Bytes("encrypted-policy-request"));
    const fee = ethers.parseEther("0.01");

    await expect(sender.connect(applicant).requestAccess(ciphertext, { value: fee }))
      .to.emit(sender, "AccessEvaluationRequested")
      .withArgs(await manager.INSTRUCTION_ID(), applicant.address);

    expect(await manager.lastOpType()).to.equal(
      ethers.encodeBytes32String("PRIVATE_ACCESS")
    );
    expect(await manager.lastOpCommand()).to.equal(
      ethers.encodeBytes32String("EVALUATE_ACCESS")
    );
    expect(await manager.lastMessage()).to.equal(ciphertext);
    expect(await manager.lastClaimBackAddress()).to.equal(applicant.address);
    expect(await manager.lastValue()).to.equal(fee);
  });

  it("rejects an empty encrypted payload", async function () {
    const { sender } = await deployFixture();

    await expect(sender.requestAccess("0x")).to.be.revertedWith(
      "encrypted payload is empty"
    );
  });

  it("cannot be used until the registered extension ID is resolved", async function () {
    const [, tee] = await ethers.getSigners();
    const manager = await ethers.deployContract("MockTeeManager", [tee.address]);
    const sender = await ethers.deployContract("PrivateAccessInstructionSender", [
      await manager.getAddress(),
      await manager.getAddress()
    ]);

    await expect(sender.requestAccess("0x01")).to.be.revertedWith(
      "Extension ID is not set."
    );
  });
});
