const { ethers } = require("ethers");

function sameAddress(actual, expected, label) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} does not match`);
  }
}

function validateFinalizationState(state) {
  if (BigInt(state.actualChainId) !== BigInt(state.expectedChainId)) {
    throw new Error("wrong Coston2 chain ID");
  }
  sameAddress(state.actualAdmin, state.expectedAdmin, "AccessRegistry admin");
  if (BigInt(state.senderExtensionId) !== BigInt(state.expectedExtensionId)) {
    throw new Error("instruction sender extension ID does not match");
  }
  sameAddress(state.machine.teeId, state.teeSigner, "TEE machine identity");
  if (BigInt(state.machineStatus) !== 2n) {
    throw new Error("TEE machine is not in PRODUCTION");
  }
  if (BigInt(state.machineExtensionId) !== BigInt(state.expectedExtensionId)) {
    throw new Error("TEE machine belongs to the wrong extension");
  }
  if (state.machine.url !== state.expectedProxyUrl) {
    throw new Error("TEE machine URL does not match the live proxy URL");
  }
  if (state.manifestTeeSigner) {
    sameAddress(
      state.manifestTeeSigner,
      state.teeSigner,
      "deployment manifest TEE signer"
    );
  }
}

module.exports = { validateFinalizationState };
