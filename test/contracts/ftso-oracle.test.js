const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FtsoV2XrpUsdOracle", function () {
  it("returns the XRP/USD feed in wei", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const ftso = await ethers.deployContract("MockFtsoV2", [
      ethers.parseUnits("2.25", 18),
      now
    ]);
    const oracle = await ethers.deployContract("FtsoV2XrpUsdOracle", [
      await ftso.getAddress(),
      120
    ]);

    const [price, timestamp] = await oracle.currentPrice.staticCall();

    expect(price).to.equal(ethers.parseUnits("2.25", 18));
    expect(timestamp).to.equal(now);
    expect(await ftso.lastFeedId()).to.equal(
      "0x015852502f55534400000000000000000000000000"
    );
  });

  it("rejects stale FTSOv2 values", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const ftso = await ethers.deployContract("MockFtsoV2", [
      ethers.parseUnits("2", 18),
      now - 121
    ]);
    const oracle = await ethers.deployContract("FtsoV2XrpUsdOracle", [
      await ftso.getAddress(),
      120
    ]);

    await expect(oracle.currentPrice()).to.be.revertedWithCustomError(
      oracle,
      "StalePrice"
    );
  });

  it("rejects a zero price", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const ftso = await ethers.deployContract("MockFtsoV2", [0, now]);
    const oracle = await ethers.deployContract("FtsoV2XrpUsdOracle", [
      await ftso.getAddress(),
      120
    ]);

    await expect(oracle.currentPrice()).to.be.revertedWithCustomError(
      oracle,
      "InvalidPrice"
    );
  });
});
