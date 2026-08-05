const { expect } = require("chai");

const {
  COSTON2_CHAIN_ID,
  COSTON2_FLARE_CONTRACTS_REGISTRY,
  COSTON2_FLARE_TEE_MANAGER,
  COSTON2_FTSOV2,
  loadCoston2Config
} = require("../../scripts/lib/coston2-config");
const {
  computePolicyRulesHash
} = require("../../scripts/lib/web-config");

const POLICY_RULES = {
  allowedJurisdictions: ["GB", "NG"],
  minimumInvestorCategory: 2,
  maximumRiskScore: 40,
  limitByCategory: {
    2: "25000000000",
    3: "100000000000"
  }
};

const VALID_ENV = {
  FXRP_ADDRESS: "0x0000000000000000000000000000000000000001",
  POLICY_ISSUER_ADDRESS: "0x0000000000000000000000000000000000000002",
  TEE_SIGNER_ADDRESS: "0x0000000000000000000000000000000000000003",
  POLICY_RULES_JSON: JSON.stringify(POLICY_RULES)
};

describe("Coston2 deployment configuration", function () {
  it("uses the official Coston2 protocol addresses", function () {
    const config = loadCoston2Config(VALID_ENV);

    expect(COSTON2_CHAIN_ID).to.equal(114n);
    expect(config.flareContractsRegistryAddress).to.equal(
      COSTON2_FLARE_CONTRACTS_REGISTRY
    );
    expect(config.ftsoV2Address).to.equal(COSTON2_FTSOV2);
    expect(config.teeManagerAddress).to.equal(COSTON2_FLARE_TEE_MANAGER);
    expect(config.teeExtensionRegistryAddress).to.equal(
      config.teeMachineRegistryAddress
    );
  });

  it("allows FXRP to be resolved from the Flare contracts registry", function () {
    const config = loadCoston2Config({
      ...VALID_ENV,
      FXRP_ADDRESS: ""
    });

    expect(config.fxrpAddress).to.equal(null);
  });

  it("normalizes required values and parses bounded numeric settings", function () {
    const config = loadCoston2Config({
      ...VALID_ENV,
      MAX_PRICE_AGE_SECONDS: "300"
    });

    expect(config.maxPriceAgeSeconds).to.equal(300);
    expect(config.rulesHash).to.equal(computePolicyRulesHash(POLICY_RULES));
  });

  it("rejects missing, malformed, and zero deployment values", function () {
    expect(() =>
      loadCoston2Config({ ...VALID_ENV, FXRP_ADDRESS: "not-an-address" })
    ).to.throw("FXRP_ADDRESS must be a valid address");
    expect(() =>
      loadCoston2Config({
        ...VALID_ENV,
        POLICY_RULES_HASH:
          "0x1111111111111111111111111111111111111111111111111111111111111111"
      })
    ).to.throw("POLICY_RULES_HASH does not match POLICY_RULES_JSON");
    expect(() =>
      loadCoston2Config({ ...VALID_ENV, POLICY_RULES_JSON: "not-json" })
    ).to.throw("POLICY_RULES_JSON must be valid JSON");
    expect(() =>
      loadCoston2Config({ ...VALID_ENV, MAX_PRICE_AGE_SECONDS: "0" })
    ).to.throw("MAX_PRICE_AGE_SECONDS must be an integer from 1 to 86400");
  });
});
