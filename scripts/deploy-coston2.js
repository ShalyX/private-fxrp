const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");
const { loadCoston2Config } = require("./lib/coston2-config");
const { runCoston2Preflight } = require("./lib/coston2-protocol");

async function deploy(name, args) {
  const contract = await ethers.deployContract(name, args);
  await contract.waitForDeployment();
  return {
    contract,
    transactionHash: contract.deploymentTransaction().hash
  };
}

function writeManifest(outputPath, manifest) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600
  });
  fs.renameSync(temporary, resolved);
}

async function main() {
  const config = loadCoston2Config();
  const [deployer] = await ethers.getSigners();
  if (
    config.deployerAddress &&
    deployer.address !== config.deployerAddress
  ) {
    throw new Error(
      `DEPLOYER_PRIVATE_KEY resolves to ${deployer.address}, not DEPLOYER_ADDRESS ${config.deployerAddress}`
    );
  }
  const preflight = await runCoston2Preflight(ethers.provider, config);
  const fxrpAddress = preflight.protocol.fxrp;

  const policy = await deploy("PolicyRegistry", [deployer.address]);
  const access = await deploy("AccessRegistry", [
    deployer.address,
    await policy.contract.getAddress()
  ]);
  const oracle = await deploy("FtsoV2XrpUsdOracle", [
    config.ftsoV2Address,
    config.maxPriceAgeSeconds
  ]);
  const instructionSender = await deploy("PrivateAccessInstructionSender", [
    config.teeExtensionRegistryAddress,
    config.teeMachineRegistryAddress
  ]);

  const policyId = await policy.contract.computePolicyId(
    deployer.address,
    config.policySalt
  );
  const createPolicyTx = await policy.contract.createPolicy(
    config.policySalt,
    config.issuerAddress,
    config.rulesHash
  );
  await createPolicyTx.wait();

  let teeSignerTransactionHash = null;
  if (config.teeSignerAddress) {
    const teeSignerTx = await access.contract.setTeeSigner(
      config.teeSignerAddress,
      true
    );
    await teeSignerTx.wait();
    teeSignerTransactionHash = teeSignerTx.hash;
  }

  const vault = await deploy("PrivateFXRPVault", [
    fxrpAddress,
    await access.contract.getAddress(),
    await oracle.contract.getAddress(),
    policyId
  ]);

  const block = await ethers.provider.getBlock("latest");
  const manifest = {
    schemaVersion: 1,
    network: "coston2",
    chainId: preflight.chainId,
    deployedAtBlock: block.number,
    preflightBlock: preflight.blockNumber,
    deployer: deployer.address,
    policyId,
    policy: {
      issuer: config.issuerAddress,
      rulesHash: config.rulesHash,
      maxPriceAgeSeconds: config.maxPriceAgeSeconds
    },
    protocol: {
      ...preflight.protocol,
      codeHashes: preflight.codeHashes
    },
    contracts: {
      policyRegistry: await policy.contract.getAddress(),
      accessRegistry: await access.contract.getAddress(),
      xrpUsdOracle: await oracle.contract.getAddress(),
      privateAccessInstructionSender:
        await instructionSender.contract.getAddress(),
      privateFxrpVault: await vault.contract.getAddress()
    },
    transactions: {
      policyRegistryDeployment: policy.transactionHash,
      accessRegistryDeployment: access.transactionHash,
      oracleDeployment: oracle.transactionHash,
      instructionSenderDeployment: instructionSender.transactionHash,
      policyCreation: createPolicyTx.hash,
      teeSignerRegistration: teeSignerTransactionHash,
      vaultDeployment: vault.transactionHash
    },
    fcc: {
      extensionRegistration: "pending",
      extensionId: null,
      teeSigner: config.teeSignerAddress,
      nextAction:
        "Register privateAccessInstructionSender with the FCC scaffold, then call setExtensionId()."
    }
  };

  writeManifest(config.outputPath, manifest);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
