const { ethers } = require("ethers");
const {
  loadCoston2PreflightConfig
} = require("./lib/coston2-config");
const { runCoston2Preflight } = require("./lib/coston2-protocol");
const {
  assessDeploymentFunding,
  requireExternallyOwnedAccount
} = require("./lib/deployer-readiness");

const DEFAULT_DEPLOYMENT_GAS_BUDGET = 8_000_000n;

function required(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return process.env[name];
}

function positiveBigInt(raw, name) {
  let value;
  try {
    value = BigInt(raw);
  } catch {
    throw new Error(`${name} must be a positive integer`);
  }
  if (value <= 0n) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(
    required("COSTON2_RPC_URL")
  );
  try {
    const deployer = ethers.getAddress(required("DEPLOYER_ADDRESS"));
    if (deployer === ethers.ZeroAddress) {
      throw new Error("DEPLOYER_ADDRESS cannot be the zero address");
    }
    await requireExternallyOwnedAccount(provider, deployer);
    const gasBudget = process.env.DEPLOYMENT_GAS_BUDGET
      ? positiveBigInt(
          process.env.DEPLOYMENT_GAS_BUDGET,
          "DEPLOYMENT_GAS_BUDGET"
        )
      : DEFAULT_DEPLOYMENT_GAS_BUDGET;
    const [preflight, balanceWei, pendingNonce, latestNonce, feeData] =
      await Promise.all([
        runCoston2Preflight(
          provider,
          loadCoston2PreflightConfig()
        ),
        provider.getBalance(deployer),
        provider.getTransactionCount(deployer, "pending"),
        provider.getTransactionCount(deployer, "latest"),
        provider.getFeeData()
      ]);
    const feePerGasWei = feeData.maxFeePerGas || feeData.gasPrice;
    if (!feePerGasWei) {
      throw new Error("Coston2 RPC did not return usable fee data");
    }
    const funding = assessDeploymentFunding({
      balanceWei,
      feePerGasWei,
      deploymentGasBudget: gasBudget
    });
    const report = {
      schemaVersion: 1,
      network: "coston2",
      chainId: preflight.chainId,
      blockNumber: preflight.blockNumber,
      deployer,
      balanceWei: funding.balanceWei.toString(),
      balanceC2flr: ethers.formatEther(funding.balanceWei),
      pendingNonce,
      latestNonce,
      pendingTransactions: pendingNonce - latestNonce,
      feePerGasWei: funding.feePerGasWei.toString(),
      deploymentGasBudget: funding.deploymentGasBudget.toString(),
      fundingBufferPercent: funding.fundingBufferPercent,
      minimumBalanceWei: funding.minimumBalanceWei.toString(),
      minimumBalanceC2flr: ethers.formatEther(
        funding.minimumBalanceWei
      ),
      deficitWei: funding.deficitWei.toString(),
      funded: funding.funded,
      protocolPreflightPassed: true,
      ready: funding.funded
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 2;
  } finally {
    provider.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
