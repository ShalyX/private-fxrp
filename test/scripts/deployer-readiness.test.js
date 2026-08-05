const { expect } = require("chai");

const {
  assessDeploymentFunding,
  requireExternallyOwnedAccount
} = require("../../scripts/lib/deployer-readiness");

describe("Coston2 deployer readiness", function () {
  it("includes a fee buffer when calculating required funding", function () {
    const result = assessDeploymentFunding({
      balanceWei: 12_500n,
      feePerGasWei: 10n,
      deploymentGasBudget: 1_000n
    });

    expect(result.minimumBalanceWei).to.equal(12_500n);
    expect(result.funded).to.equal(true);
  });

  it("reports the funding deficit without weakening the gate", function () {
    const result = assessDeploymentFunding({
      balanceWei: 2_000n,
      feePerGasWei: 10n,
      deploymentGasBudget: 1_000n
    });

    expect(result.funded).to.equal(false);
    expect(result.deficitWei).to.equal(10_500n);
  });

  it("rejects unusable fee or gas inputs", function () {
    expect(() =>
      assessDeploymentFunding({
        balanceWei: 1n,
        feePerGasWei: 0n,
        deploymentGasBudget: 1_000n
      })
    ).to.throw("feePerGasWei must be positive");
  });

  it("rejects a contract address as the deployer", async function () {
    await expect(
      requireExternallyOwnedAccount(
        { getCode: async () => "0x60016000" },
        "0x0000000000000000000000000000000000000001"
      )
    ).to.be.rejectedWith("DEPLOYER_ADDRESS must be an EOA");
  });
});
