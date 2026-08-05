const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");
const { COSTON2_CHAIN_ID } = require("./lib/coston2-config");
const {
  validateFinalizationState
} = require("./lib/fcc-finalization");

const EXPECTED_EXTENSION_ID = 65835n;
const EXPECTED_PROXY_URL =
  "https://augusta-unjoking-sarahi.ngrok-free.dev";
const TEE_MANAGER_ABI = [
  "function getTeeMachine(address) view returns ((address teeId,address teeProxyId,string url))",
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getExtensionId(address) view returns (uint256)"
];

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Deployment manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.chainId !== Number(COSTON2_CHAIN_ID)) {
    throw new Error(`Manifest is not for Coston2: ${manifestPath}`);
  }
  return manifest;
}

function writeManifest(manifestPath, manifest) {
  const temporary = `${manifestPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600
  });
  fs.renameSync(temporary, manifestPath);
}

async function main() {
  const manifestPath = path.resolve(
    process.env.DEPLOYMENT_OUTPUT || "deployments/coston2.json"
  );
  const manifest = loadManifest(manifestPath);
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== COSTON2_CHAIN_ID) {
    throw new Error(
      `Wrong network: expected chain ID ${COSTON2_CHAIN_ID}, received ${network.chainId}`
    );
  }
  const [operator] = await ethers.getSigners();
  if (ethers.getAddress(operator.address) !== ethers.getAddress(manifest.deployer)) {
    throw new Error(
      `Configured key controls ${operator.address}, not deployment admin ${manifest.deployer}`
    );
  }

  const senderAddress = ethers.getAddress(
    manifest.contracts.privateAccessInstructionSender
  );
  if ((await ethers.provider.getCode(senderAddress)) === "0x") {
    throw new Error(`Instruction sender has no code at ${senderAddress}`);
  }

  const sender = await ethers.getContractAt(
    "PrivateAccessInstructionSender",
    senderAddress
  );
  let extensionId = await sender.extensionId();
  let extensionIdTransactionHash =
    manifest.transactions.extensionIdResolution || null;
  if (extensionId === 0n) {
    const transaction = await sender.setExtensionId();
    await transaction.wait();
    extensionIdTransactionHash = transaction.hash;
    extensionId = await sender.extensionId();
  }

  const teeSignerAddress = process.env.TEE_SIGNER_ADDRESS
    ? ethers.getAddress(process.env.TEE_SIGNER_ADDRESS)
    : manifest.fcc.teeSigner;
  if (!teeSignerAddress) {
    throw new Error("TEE_SIGNER_ADDRESS is required for FCC finalization");
  }

  const accessRegistry = await ethers.getContractAt(
    "AccessRegistry",
    manifest.contracts.accessRegistry
  );
  const teeManager = new ethers.Contract(
    manifest.protocol.flareTeeManager,
    TEE_MANAGER_ABI,
    ethers.provider
  );
  const [actualAdmin, machine, machineStatus, machineExtensionId] =
    await Promise.all([
      accessRegistry.admin(),
      teeManager.getTeeMachine(teeSignerAddress),
      teeManager.getTeeMachineStatus(teeSignerAddress),
      teeManager.getExtensionId(teeSignerAddress)
    ]);

  validateFinalizationState({
    expectedChainId: COSTON2_CHAIN_ID,
    actualChainId: network.chainId,
    expectedAdmin: manifest.deployer,
    actualAdmin,
    expectedExtensionId: EXPECTED_EXTENSION_ID,
    senderExtensionId: extensionId,
    teeSigner: teeSignerAddress,
    machine,
    machineStatus,
    machineExtensionId,
    expectedProxyUrl: EXPECTED_PROXY_URL,
    manifestTeeSigner: manifest.fcc.teeSigner
  });

  let teeSignerTransactionHash =
    manifest.transactions.teeSignerRegistration || null;
  const alreadyRegistered =
    await accessRegistry.registeredTeeSigners(teeSignerAddress);
  if (!alreadyRegistered) {
    const transaction = await accessRegistry.setTeeSigner(
      teeSignerAddress,
      true
    );
    await transaction.wait();
    teeSignerTransactionHash = transaction.hash;
  }
  if (!(await accessRegistry.registeredTeeSigners(teeSignerAddress))) {
    throw new Error("TEE signer registration did not persist on-chain");
  }

  manifest.transactions.extensionIdResolution = extensionIdTransactionHash;
  manifest.transactions.teeSignerRegistration = teeSignerTransactionHash;
  manifest.fcc = {
    extensionRegistration: "registered",
    extensionId: extensionId.toString(),
    teeSigner: teeSignerAddress,
    teeMachineStatus: "PRODUCTION",
    teeMachineUrl: machine.url,
    nextAction:
      "Run an encrypted Coston2 access request and retain transaction evidence."
  };
  writeManifest(manifestPath, manifest);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
