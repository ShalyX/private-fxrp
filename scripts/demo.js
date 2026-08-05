const { ethers } = require("hardhat");
const {
  computePolicyRulesHash,
  createTeeKeyPair,
  encryptCredential,
  processAccessRequest,
  signCredential
} = require("../extension/policy-engine");

async function main() {
  const [admin, operator, issuer, applicant, teeSigner] =
    await ethers.getSigners();
  const policyRules = {
    allowedJurisdictions: ["GB", "NG"],
    minimumInvestorCategory: 2,
    maximumRiskScore: 40,
    limitByCategory: {
      2: ethers.parseUnits("25000", 6).toString(),
      3: ethers.parseUnits("100000", 6).toString()
    }
  };
  const rulesHash = computePolicyRulesHash(policyRules);

  const policyRegistry = await ethers.deployContract("PolicyRegistry", [
    admin.address
  ]);
  const accessRegistry = await ethers.deployContract("AccessRegistry", [
    admin.address,
    await policyRegistry.getAddress()
  ]);
  const fxrp = await ethers.deployContract("MockERC20", [
    "Demo FXRP",
    "FXRP",
    6
  ]);
  const oracle = await ethers.deployContract("MockXrpUsdOracle", [
    ethers.parseUnits("2", 18)
  ]);

  const salt = ethers.id("private-fxrp-demo");
  const policyId = await policyRegistry.computePolicyId(operator.address, salt);
  await (
    await policyRegistry
      .connect(operator)
      .createPolicy(salt, issuer.address, rulesHash)
  ).wait();
  await (
    await accessRegistry.connect(admin).setTeeSigner(teeSigner.address, true)
  ).wait();

  const vault = await ethers.deployContract("PrivateFXRPVault", [
    await fxrp.getAddress(),
    await accessRegistry.getAddress(),
    await oracle.getAddress(),
    policyId
  ]);

  const teeEncryption = createTeeKeyPair();
  const credential = {
    account: applicant.address,
    jurisdiction: "NG",
    investorCategory: 2,
    riskScore: 20,
    expiresAt: Math.floor(Date.now() / 1000) + 7200
  };
  const encrypted = encryptCredential(
    teeEncryption.publicKey,
    {
      credential,
      issuerSignature: await signCredential(issuer, credential)
    },
    policyId
  );
  const network = await ethers.provider.getNetwork();
  const result = await processAccessRequest({
    encrypted,
    policy: { policyId, rulesHash, ...policyRules },
    issuerAddress: issuer.address,
    teePrivateKey: teeEncryption.privateKey,
    teeDecisionWallet: teeSigner,
    chainId: network.chainId,
    accessRegistryAddress: await accessRegistry.getAddress(),
    nonce: 1
  });
  await (
    await accessRegistry.submitDecision(result.decision, result.signature)
  ).wait();

  const depositAmount = ethers.parseUnits("1000", 6);
  await (await fxrp.mint(applicant.address, depositAmount)).wait();
  await (
    await fxrp.connect(applicant).approve(await vault.getAddress(), depositAmount)
  ).wait();
  const depositReceipt = await (
    await vault.connect(applicant).deposit(depositAmount)
  ).wait();

  console.log(
    JSON.stringify(
      {
        status: "completed",
        policyId,
        applicant: applicant.address,
        publicDecision: result.decision,
        plaintextAttributesPublished: false,
        vault: await vault.getAddress(),
        depositedFxrp: ethers.formatUnits(depositAmount, 6),
        depositTransaction: depositReceipt.hash
      },
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
