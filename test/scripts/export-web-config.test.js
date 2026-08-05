const { expect } = require("chai");
const { ethers } = require("ethers");

const {
  buildWebEnvironment,
  computePolicyRulesHash
} = require("../../scripts/lib/web-config");

const rules = {
  allowedJurisdictions: ["NG", "GB"],
  minimumInvestorCategory: 2,
  maximumRiskScore: 40,
  limitByCategory: {
    2: "25000000000",
    3: "100000000000"
  }
};

const manifest = {
  chainId: 114,
  policyId: `0x${"12".repeat(32)}`,
  protocol: {
    fxrp: "0x0000000000000000000000000000000000000011"
  },
  contracts: {
    accessRegistry: "0x0000000000000000000000000000000000000021",
    policyRegistry: "0x0000000000000000000000000000000000000022",
    privateAccessInstructionSender:
      "0x0000000000000000000000000000000000000023",
    privateFxrpVault: "0x0000000000000000000000000000000000000024"
  },
  fcc: {
    status: "PRODUCTION",
    extensionId: 65835,
    teeSigner: "0x0000000000000000000000000000000000000031",
    liveProof: {
      instructionId: `0x${"31".repeat(32)}`,
      requestTransaction: `0x${"32".repeat(32)}`,
      relayTransaction: `0x${"33".repeat(32)}`,
      evidenceBlock: 33637745
    }
  }
};

describe("web deployment configuration export", function () {
  it("builds frontend configuration from a verified manifest and policy", function () {
    const output = buildWebEnvironment(
      {
        ...manifest,
        policy: { rulesHash: computePolicyRulesHash(rules) }
      },
      rules,
      { instructionFeeWei: "1000" }
    );

    expect(output).to.include(
      `VITE_ACCESS_REGISTRY_ADDRESS=${manifest.contracts.accessRegistry}`
    );
    expect(output).to.include(`VITE_POLICY_ID=${manifest.policyId}`);
    expect(output).to.include("VITE_INSTRUCTION_FEE_WEI=1000");
    expect(output).to.include(
      `VITE_POLICY_RULES_JSON=${JSON.stringify(rules)}`
    );
    expect(output).to.include("VITE_FCC_EXTENSION_ID=65835");
    expect(output).to.include(`VITE_TEE_SIGNER=${manifest.fcc.teeSigner}`);
    expect(output).to.include(
      `VITE_LIVE_RELAY_TX=${manifest.fcc.liveProof.relayTransaction}`
    );
    expect(output).to.include("VITE_LIVE_EVIDENCE_BLOCK=33637745");
  });

  it("rejects policy rules that do not match the on-chain commitment", function () {
    expect(() =>
      buildWebEnvironment(
        {
          ...manifest,
          policy: { rulesHash: ethers.id("different rules") }
        },
        rules
      )
    ).to.throw("POLICY_RULES_JSON does not match");
  });

  it("rejects manifests for another chain", function () {
    expect(() =>
      buildWebEnvironment(
        {
          ...manifest,
          chainId: 14,
          policy: { rulesHash: computePolicyRulesHash(rules) }
        },
        rules
      )
    ).to.throw("Manifest is not for Coston2");
  });
});
