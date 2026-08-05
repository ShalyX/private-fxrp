const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const {
  validateFinalizationState
} = require("../../scripts/lib/fcc-finalization");

describe("FCC AccessRegistry finalization", function () {
  const finalizerPath = path.join(
    __dirname,
    "../../scripts/finalize-fcc-coston2.js"
  );
  const runnerPath = path.join(
    __dirname,
    "../../finalize-coston2-v0.4.0.sh"
  );
  const state = {
    expectedChainId: 114n,
    actualChainId: 114n,
    expectedAdmin: "0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1",
    actualAdmin: "0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1",
    expectedExtensionId: 65835n,
    senderExtensionId: 65835n,
    teeSigner: "0x7820af00DDB9176150B27edF95D8FB191e555108",
    machine: {
      teeId: "0x7820af00DDB9176150B27edF95D8FB191e555108",
      url: "https://augusta-unjoking-sarahi.ngrok-free.dev"
    },
    machineStatus: 2n,
    machineExtensionId: 65835n,
    expectedProxyUrl: "https://augusta-unjoking-sarahi.ngrok-free.dev",
    manifestTeeSigner: null
  };

  it("accepts the registered production machine as the signer", function () {
    expect(() => validateFinalizationState(state)).to.not.throw();
  });

  it("rejects a machine that is not in production", function () {
    expect(() =>
      validateFinalizationState({ ...state, machineStatus: 1n })
    ).to.throw("PRODUCTION");
  });

  it("rejects the wrong extension or callback URL", function () {
    expect(() =>
      validateFinalizationState({ ...state, machineExtensionId: 65836n })
    ).to.throw("extension");
    expect(() =>
      validateFinalizationState({
        ...state,
        machine: { ...state.machine, url: "https://stale.example" }
      })
    ).to.throw("URL");
  });

  it("rejects an unexpected admin or conflicting manifest signer", function () {
    expect(() =>
      validateFinalizationState({
        ...state,
        actualAdmin: "0x0000000000000000000000000000000000000001"
      })
    ).to.throw("admin");
    expect(() =>
      validateFinalizationState({
        ...state,
        manifestTeeSigner: "0x0000000000000000000000000000000000000002"
      })
    ).to.throw("manifest");
  });

  it("validates live machine state before authorizing the signer", function () {
    const source = fs.readFileSync(finalizerPath, "utf8");
    const validation = source.indexOf("validateFinalizationState");
    const authorization = source.indexOf("setTeeSigner");

    expect(source).to.include("getTeeMachine");
    expect(source).to.include("getTeeMachineStatus");
    expect(source).to.include("getExtensionId");
    expect(validation).to.be.greaterThan(-1);
    expect(authorization).to.be.greaterThan(validation);
  });

  it("uses on-chain signer state as the idempotency source", function () {
    const source = fs.readFileSync(finalizerPath, "utf8");

    expect(source).to.include("registeredTeeSigners");
    expect(source).to.not.include("teeSignerAddress && !manifest.fcc.teeSigner");
  });

  it("keeps the deployment key hidden and pins the production TEE signer", function () {
    const source = fs.readFileSync(runnerPath, "utf8");

    expect(source).to.match(/read -r -s/);
    expect(source).to.include("unset DEPLOYER_PRIVATE_KEY");
    expect(source).to.include("trap cleanup EXIT INT TERM");
    expect(source).to.include("0x7820af00DDB9176150B27edF95D8FB191e555108");
    expect(source).to.include("npm run finalize:fcc:coston2");
    expect(source).to.include("npm run evidence:coston2");
  });
});
