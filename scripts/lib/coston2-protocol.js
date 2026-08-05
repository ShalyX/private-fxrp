const { ethers } = require("ethers");

const REGISTRY_ABI = [
  "function getContractAddressByName(string name) view returns (address)"
];
const ASSET_MANAGER_ABI = ["function fAsset() view returns (address)"];
const ERC20_METADATA_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

function defaultContractFactory(address, abi, provider) {
  return new ethers.Contract(address, abi, provider);
}

async function requireContract(provider, address, label) {
  const normalized = ethers.getAddress(address);
  const code = await provider.getCode(normalized);
  if (code === "0x") {
    throw new Error(`${label} has no contract code at ${normalized}`);
  }
  return { address: normalized, code, codeHash: ethers.keccak256(code) };
}

async function resolveCoston2Protocol(
  provider,
  config,
  contractFactory = defaultContractFactory
) {
  const registry = await requireContract(
    provider,
    config.flareContractsRegistryAddress,
    "FlareContractsRegistry"
  );
  const registryContract = contractFactory(
    registry.address,
    REGISTRY_ABI,
    provider
  );
  const assetManagerAddress = ethers.getAddress(
    await registryContract.getContractAddressByName("AssetManagerFXRP")
  );
  const assetManager = await requireContract(
    provider,
    assetManagerAddress,
    "AssetManagerFXRP"
  );
  const assetManagerContract = contractFactory(
    assetManager.address,
    ASSET_MANAGER_ABI,
    provider
  );
  const fxrpAddress = ethers.getAddress(await assetManagerContract.fAsset());
  const fxrp = await requireContract(provider, fxrpAddress, "FXRP");

  if (
    config.fxrpAddress &&
    ethers.getAddress(config.fxrpAddress) !== fxrp.address
  ) {
    throw new Error(
      `FXRP_ADDRESS does not match the registry: expected ${fxrp.address}, received ${ethers.getAddress(config.fxrpAddress)}`
    );
  }

  const token = contractFactory(fxrp.address, ERC20_METADATA_ABI, provider);
  const [decimals, symbol] = await Promise.all([
    token.decimals(),
    token.symbol()
  ]);
  const numericDecimals = Number(decimals);
  if (!Number.isInteger(numericDecimals) || numericDecimals < 0 || numericDecimals > 18) {
    throw new Error(`FXRP returned unsupported decimals: ${decimals}`);
  }

  return {
    flareContractsRegistry: registry.address,
    assetManagerFxrp: assetManager.address,
    fxrp: fxrp.address,
    fxrpDecimals: numericDecimals,
    fxrpSymbol: symbol,
    codeHashes: {
      flareContractsRegistry: registry.codeHash,
      assetManagerFxrp: assetManager.codeHash,
      fxrp: fxrp.codeHash
    }
  };
}

async function runCoston2Preflight(
  provider,
  config,
  contractFactory = defaultContractFactory
) {
  const network = await provider.getNetwork();
  if (network.chainId !== config.chainId) {
    throw new Error(
      `Wrong network: expected chain ID ${config.chainId}, received ${network.chainId}`
    );
  }

  const [ftsoV2, flareTeeManager, resolved] = await Promise.all([
    requireContract(provider, config.ftsoV2Address, "FTSOv2"),
    requireContract(provider, config.teeManagerAddress, "FlareTeeManager"),
    resolveCoston2Protocol(provider, config, contractFactory)
  ]);
  const blockNumber = await provider.getBlockNumber();

  return {
    schemaVersion: 1,
    network: "coston2",
    chainId: Number(network.chainId),
    blockNumber,
    protocol: {
      flareContractsRegistry: resolved.flareContractsRegistry,
      assetManagerFxrp: resolved.assetManagerFxrp,
      fxrp: resolved.fxrp,
      fxrpSymbol: resolved.fxrpSymbol,
      fxrpDecimals: resolved.fxrpDecimals,
      ftsoV2: ftsoV2.address,
      flareTeeManager: flareTeeManager.address
    },
    codeHashes: {
      ...resolved.codeHashes,
      ftsoV2: ftsoV2.codeHash,
      flareTeeManager: flareTeeManager.codeHash
    }
  };
}

module.exports = {
  requireContract,
  resolveCoston2Protocol,
  runCoston2Preflight
};
