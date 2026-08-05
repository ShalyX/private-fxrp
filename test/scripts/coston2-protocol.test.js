const { expect } = require("chai");
const { ethers } = require("ethers");

const {
  resolveCoston2Protocol,
  runCoston2Preflight
} = require("../../scripts/lib/coston2-protocol");

const ADDRESSES = {
  registry: "0x0000000000000000000000000000000000000011",
  assetManager: "0x0000000000000000000000000000000000000012",
  fxrp: "0x0000000000000000000000000000000000000013",
  ftso: "0x0000000000000000000000000000000000000014",
  teeManager: "0x0000000000000000000000000000000000000015"
};

function fixture({ chainId = 114n, decimals = 6n, missingCode = null } = {}) {
  const provider = {
    getNetwork: async () => ({ chainId }),
    getBlockNumber: async () => 12345,
    getCode: async (address) =>
      address.toLowerCase() === missingCode?.toLowerCase() ? "0x" : "0x60016000"
  };
  const contractFactory = (address) => {
    if (address === ADDRESSES.registry) {
      return {
        getContractAddressByName: async (name) => {
          expect(name).to.equal("AssetManagerFXRP");
          return ADDRESSES.assetManager;
        }
      };
    }
    if (address === ADDRESSES.assetManager) {
      return { fAsset: async () => ADDRESSES.fxrp };
    }
    if (address === ADDRESSES.fxrp) {
      return { decimals: async () => decimals, symbol: async () => "FXRP" };
    }
    throw new Error(`Unexpected contract: ${address}`);
  };
  return { provider, contractFactory };
}

describe("Coston2 protocol preflight", function () {
  it("resolves AssetManagerFXRP and FXRP from the registry", async function () {
    const { provider, contractFactory } = fixture();

    const protocol = await resolveCoston2Protocol(
      provider,
      {
        flareContractsRegistryAddress: ADDRESSES.registry,
        fxrpAddress: null
      },
      contractFactory
    );

    expect(protocol.assetManagerFxrp).to.equal(ADDRESSES.assetManager);
    expect(protocol.fxrp).to.equal(ADDRESSES.fxrp);
    expect(protocol.fxrpDecimals).to.equal(6);
    expect(protocol.fxrpSymbol).to.equal("FXRP");
  });

  it("rejects a pinned FXRP address that disagrees with the registry", async function () {
    const { provider, contractFactory } = fixture();

    await expect(
      resolveCoston2Protocol(
        provider,
        {
          flareContractsRegistryAddress: ADDRESSES.registry,
          fxrpAddress: ethers.getAddress(
            "0x0000000000000000000000000000000000000099"
          )
        },
        contractFactory
      )
    ).to.be.rejectedWith("FXRP_ADDRESS does not match");
  });

  it("rejects the wrong chain and addresses without bytecode", async function () {
    const wrongChain = fixture({ chainId: 16n });
    await expect(
      runCoston2Preflight(
        wrongChain.provider,
        {
          chainId: 114n,
          flareContractsRegistryAddress: ADDRESSES.registry,
          ftsoV2Address: ADDRESSES.ftso,
          teeManagerAddress: ADDRESSES.teeManager,
          fxrpAddress: null
        },
        wrongChain.contractFactory
      )
    ).to.be.rejectedWith("Wrong network");

    const missingFtso = fixture({ missingCode: ADDRESSES.ftso });
    await expect(
      runCoston2Preflight(
        missingFtso.provider,
        {
          chainId: 114n,
          flareContractsRegistryAddress: ADDRESSES.registry,
          ftsoV2Address: ADDRESSES.ftso,
          teeManagerAddress: ADDRESSES.teeManager,
          fxrpAddress: null
        },
        missingFtso.contractFactory
      )
    ).to.be.rejectedWith("FTSOv2 has no contract code");
  });

  it("returns a block-anchored report with code hashes", async function () {
    const { provider, contractFactory } = fixture();

    const report = await runCoston2Preflight(
      provider,
      {
        chainId: 114n,
        flareContractsRegistryAddress: ADDRESSES.registry,
        ftsoV2Address: ADDRESSES.ftso,
        teeManagerAddress: ADDRESSES.teeManager,
        fxrpAddress: null
      },
      contractFactory
    );

    expect(report.blockNumber).to.equal(12345);
    expect(report.protocol.fxrp).to.equal(ADDRESSES.fxrp);
    expect(report.codeHashes.fxrp).to.equal(
      ethers.keccak256("0x60016000")
    );
  });
});
