const { expect } = require("chai");

const {
  collectCoston2Evidence
} = require("../../scripts/lib/coston2-evidence");

const address = (suffix) =>
  `0x${suffix.toString(16).padStart(40, "0")}`;
const hash = (byte) => `0x${byte.repeat(32)}`;

const manifest = {
  chainId: 114,
  deployedAtBlock: 100,
  deployer: address(1),
  policyId: hash("1"),
  protocol: {
    flareContractsRegistry: address(2),
    assetManagerFxrp: address(3),
    fxrp: address(4),
    ftsoV2: address(5),
    flareTeeManager: address(6)
  },
  contracts: {
    policyRegistry: address(11),
    accessRegistry: address(12),
    xrpUsdOracle: address(13),
    privateAccessInstructionSender: address(14),
    privateFxrpVault: address(15)
  },
  policy: {
    issuer: address(20),
    rulesHash: hash("2"),
    maxPriceAgeSeconds: 120
  },
  transactions: {
    policyRegistryDeployment: hash("a"),
    policyCreation: hash("b")
  },
  fcc: {
    extensionId: "65536",
    teeSigner: address(30)
  }
};

function fixture({ active = true } = {}) {
  const provider = {
    getNetwork: async () => ({ chainId: 114n }),
    getBlockNumber: async () => 222,
    getCode: async () => "0x60016000",
    getTransactionReceipt: async (transactionHash) => ({
      hash: transactionHash,
      blockNumber: 101,
      status: 1
    })
  };
  const contracts = {
    [manifest.contracts.policyRegistry]: {
      getPolicy: async () => [
        manifest.deployer,
        manifest.policy.issuer,
        manifest.policy.rulesHash,
        active
      ]
    },
    [manifest.contracts.accessRegistry]: {
      policyRegistry: async () => manifest.contracts.policyRegistry,
      registeredTeeSigners: async () => true
    },
    [manifest.contracts.xrpUsdOracle]: {
      ftsoV2: async () => manifest.protocol.ftsoV2,
      maxAge: async () => 120n
    },
    [manifest.contracts.privateAccessInstructionSender]: {
      TEE_EXTENSION_REGISTRY: async () => manifest.protocol.flareTeeManager,
      TEE_MACHINE_REGISTRY: async () => manifest.protocol.flareTeeManager,
      extensionId: async () => 65536n
    },
    [manifest.contracts.privateFxrpVault]: {
      fxrp: async () => manifest.protocol.fxrp,
      accessRegistry: async () => manifest.contracts.accessRegistry,
      priceOracle: async () => manifest.contracts.xrpUsdOracle,
      policyId: async () => manifest.policyId
    }
  };
  return {
    provider,
    contractFactory: (contractAddress) => contracts[contractAddress]
  };
}

describe("Coston2 deployment evidence", function () {
  it("collects bytecode, state, and transaction evidence", async function () {
    const { provider, contractFactory } = fixture();
    const evidence = await collectCoston2Evidence(
      provider,
      manifest,
      contractFactory
    );

    expect(evidence.blockNumber).to.equal(222);
    expect(evidence.verification.passed).to.equal(true);
    expect(evidence.transactions.policyCreation.status).to.equal(1);
  });

  it("fails when deployed policy state no longer matches the manifest", async function () {
    const { provider, contractFactory } = fixture({ active: false });

    await expect(
      collectCoston2Evidence(provider, manifest, contractFactory)
    ).to.be.rejectedWith("Policy active mismatch");
  });
});
