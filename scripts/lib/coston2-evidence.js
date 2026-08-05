const { ethers } = require("ethers");

const ABIS = {
  policyRegistry: [
    "function getPolicy(bytes32) view returns (address owner,address credentialIssuer,bytes32 rulesHash,bool active)"
  ],
  accessRegistry: [
    "function policyRegistry() view returns (address)",
    "function registeredTeeSigners(address) view returns (bool)"
  ],
  xrpUsdOracle: [
    "function ftsoV2() view returns (address)",
    "function maxAge() view returns (uint64)"
  ],
  privateAccessInstructionSender: [
    "function TEE_EXTENSION_REGISTRY() view returns (address)",
    "function TEE_MACHINE_REGISTRY() view returns (address)",
    "function extensionId() view returns (uint256)"
  ],
  privateFxrpVault: [
    "function fxrp() view returns (address)",
    "function accessRegistry() view returns (address)",
    "function priceOracle() view returns (address)",
    "function policyId() view returns (bytes32)"
  ]
};

function defaultContractFactory(address, abi, provider) {
  return new ethers.Contract(address, abi, provider);
}

function sameAddress(actual, expected, label) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function sameValue(actual, expected, label) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

async function collectCoston2Evidence(
  provider,
  manifest,
  contractFactory = defaultContractFactory
) {
  const network = await provider.getNetwork();
  if (network.chainId !== 114n || manifest.chainId !== 114) {
    throw new Error("Provider and manifest must both target Coston2");
  }

  const addresses = {
    ...manifest.protocol,
    ...manifest.contracts
  };
  delete addresses.fxrpSymbol;
  delete addresses.fxrpDecimals;
  delete addresses.codeHashes;

  const bytecode = {};
  await Promise.all(
    Object.entries(addresses).map(async ([name, rawAddress]) => {
      const address = ethers.getAddress(rawAddress);
      const code = await provider.getCode(address);
      if (code === "0x") {
        throw new Error(`${name} has no contract code at ${address}`);
      }
      bytecode[name] = {
        address,
        codeHash: ethers.keccak256(code),
        byteLength: (code.length - 2) / 2
      };
    })
  );

  const contracts = Object.fromEntries(
    Object.entries(ABIS).map(([name, abi]) => [
      name,
      contractFactory(manifest.contracts[name], abi, provider)
    ])
  );
  const [
    policy,
    accessPolicyRegistry,
    oracleFtso,
    oracleMaxAge,
    senderExtensionRegistry,
    senderMachineRegistry,
    extensionId,
    vaultFxrp,
    vaultAccessRegistry,
    vaultOracle,
    vaultPolicyId
  ] = await Promise.all([
    contracts.policyRegistry.getPolicy(manifest.policyId),
    contracts.accessRegistry.policyRegistry(),
    contracts.xrpUsdOracle.ftsoV2(),
    contracts.xrpUsdOracle.maxAge(),
    contracts.privateAccessInstructionSender.TEE_EXTENSION_REGISTRY(),
    contracts.privateAccessInstructionSender.TEE_MACHINE_REGISTRY(),
    contracts.privateAccessInstructionSender.extensionId(),
    contracts.privateFxrpVault.fxrp(),
    contracts.privateFxrpVault.accessRegistry(),
    contracts.privateFxrpVault.priceOracle(),
    contracts.privateFxrpVault.policyId()
  ]);

  sameAddress(policy[0], manifest.deployer, "Policy owner");
  sameAddress(policy[1], manifest.policy.issuer, "Policy issuer");
  sameValue(policy[2], manifest.policy.rulesHash, "Policy rules hash");
  if (policy[3] !== true) {
    throw new Error(`Policy active mismatch: expected true, received ${policy[3]}`);
  }
  sameAddress(
    accessPolicyRegistry,
    manifest.contracts.policyRegistry,
    "AccessRegistry policy registry"
  );
  sameAddress(oracleFtso, manifest.protocol.ftsoV2, "Oracle FTSOv2");
  sameValue(
    oracleMaxAge,
    manifest.policy.maxPriceAgeSeconds,
    "Oracle max age"
  );
  sameAddress(
    senderExtensionRegistry,
    manifest.protocol.flareTeeManager,
    "Instruction sender extension registry"
  );
  sameAddress(
    senderMachineRegistry,
    manifest.protocol.flareTeeManager,
    "Instruction sender machine registry"
  );
  if (manifest.fcc.extensionId !== null) {
    sameValue(extensionId, manifest.fcc.extensionId, "FCC extension ID");
  }
  sameAddress(vaultFxrp, manifest.protocol.fxrp, "Vault FXRP");
  sameAddress(
    vaultAccessRegistry,
    manifest.contracts.accessRegistry,
    "Vault access registry"
  );
  sameAddress(
    vaultOracle,
    manifest.contracts.xrpUsdOracle,
    "Vault oracle"
  );
  sameValue(vaultPolicyId, manifest.policyId, "Vault policy ID");

  let teeSignerRegistered = null;
  if (manifest.fcc.teeSigner) {
    teeSignerRegistered =
      await contracts.accessRegistry.registeredTeeSigners(
        manifest.fcc.teeSigner
      );
    if (!teeSignerRegistered) {
      throw new Error("Manifest TEE signer is not registered");
    }
  }

  const transactions = {};
  await Promise.all(
    Object.entries(manifest.transactions)
      .filter(([, transactionHash]) => transactionHash)
      .map(async ([name, transactionHash]) => {
        const receipt = await provider.getTransactionReceipt(transactionHash);
        if (!receipt || receipt.status !== 1) {
          throw new Error(`${name} does not have a successful receipt`);
        }
        transactions[name] = {
          hash: transactionHash,
          blockNumber: receipt.blockNumber,
          status: receipt.status
        };
      })
  );

  return {
    schemaVersion: 1,
    network: "coston2",
    chainId: 114,
    blockNumber: await provider.getBlockNumber(),
    deploymentBlock: manifest.deployedAtBlock,
    policyId: manifest.policyId,
    bytecode,
    state: {
      policy: {
        owner: policy[0],
        issuer: policy[1],
        rulesHash: policy[2],
        active: policy[3]
      },
      extensionId: extensionId.toString(),
      teeSigner: manifest.fcc.teeSigner,
      teeSignerRegistered
    },
    transactions,
    verification: { passed: true }
  };
}

module.exports = { collectCoston2Evidence };
