const FUNDING_BUFFER_PERCENT = 25n;

async function requireExternallyOwnedAccount(provider, address) {
  const code = await provider.getCode(address);
  if (code !== "0x") {
    throw new Error(`DEPLOYER_ADDRESS must be an EOA: ${address}`);
  }
}

function assessDeploymentFunding({
  balanceWei,
  feePerGasWei,
  deploymentGasBudget
}) {
  if (feePerGasWei <= 0n) {
    throw new Error("feePerGasWei must be positive");
  }
  if (deploymentGasBudget <= 0n) {
    throw new Error("deploymentGasBudget must be positive");
  }
  const baseCostWei = feePerGasWei * deploymentGasBudget;
  const minimumBalanceWei =
    (baseCostWei * (100n + FUNDING_BUFFER_PERCENT)) / 100n;
  const funded = balanceWei >= minimumBalanceWei;

  return {
    balanceWei,
    feePerGasWei,
    deploymentGasBudget,
    fundingBufferPercent: Number(FUNDING_BUFFER_PERCENT),
    minimumBalanceWei,
    funded,
    deficitWei: funded ? 0n : minimumBalanceWei - balanceWei
  };
}

module.exports = {
  assessDeploymentFunding,
  requireExternallyOwnedAccount
};
