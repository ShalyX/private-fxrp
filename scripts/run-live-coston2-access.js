const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const {
  buildSignedAccessRequest,
  decodeAndValidateDecision,
  encryptGethEcies,
  extractAndVerifyTeePublicKey,
  normalizeAndVerifyActionResponse
} = require("./lib/live-coston2-access");

const CHAIN_ID = 114n;
const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const PROXY_URL = "https://augusta-unjoking-sarahi.ngrok-free.dev";
const TEE_SIGNER = "0x7820af00DDB9176150B27edF95D8FB191e555108";
const EXPECTED_EXTENSION_ID = 65835n;
const EXPECTED_DEPLOYER = "0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1";
const EXPECTED_ISSUER = "0x4ed30418Dce6C743b4b1F0da4DB33D9927699456";
const INSTRUCTION_FEE = 1000000n;
const POLICY_RULES = {
  allowedJurisdictions: ["GB", "NG"],
  minimumInvestorCategory: 2,
  maximumRiskScore: 40,
  limitByCategory: { "2": "25000000000", "3": "100000000000" }
};

const POLICY_ABI = [
  "function getPolicy(bytes32) view returns (tuple(address owner,address credentialIssuer,bytes32 rulesHash,bool active))"
];
const ACCESS_ABI = [
  "function registeredTeeSigners(address) view returns (bool)",
  "function getAccess(address,bytes32) view returns (tuple(uint128 limitUsd,uint64 expiresAt,uint64 nonce))",
  "function canAccess(address,bytes32) view returns (bool)",
  "function submitFccDecision(bytes,bytes32,string,uint8,bytes)"
];
const SENDER_ABI = [
  "function extensionId() view returns (uint256)",
  "function requestAccess(bytes) payable returns (bytes32)",
  "event AccessEvaluationRequested(bytes32 indexed instructionId,address indexed applicant)"
];
const MANAGER_ABI = [
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getExtensionId(address) view returns (uint256)"
];

function required(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

function sameAddress(actual, expected, label) {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} does not match`);
  }
}

async function fetchJson(url, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function pollActionResult(instructionId) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await fetch(`${PROXY_URL}/action/result/${instructionId}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (response.ok) {
      const body = await response.json();
      if (body?.result?.status === 0) {
        throw new Error(body.result.log || "FCC action failed");
      }
      if (body?.result?.status === 1) return body;
    } else if (![404, 425, 503].includes(response.status)) {
      throw new Error(`FCC action polling returned HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("FCC action did not complete within five minutes");
}

function writeEvidence(outputPath, evidence) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600
  });
  fs.renameSync(temporary, outputPath);
}

async function main() {
  const manifestPath = path.resolve(
    process.env.DEPLOYMENT_OUTPUT || "deployments/coston2.json"
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  try {
    const applicant = new ethers.Wallet(required("DEPLOYER_PRIVATE_KEY"), provider);
    const issuer = new ethers.Wallet(required("POLICY_ISSUER_PRIVATE_KEY"));
    sameAddress(applicant.address, EXPECTED_DEPLOYER, "applicant/deployer key");
    sameAddress(issuer.address, EXPECTED_ISSUER, "policy issuer key");

    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) throw new Error("wrong Coston2 chain ID");
    if ((await provider.getBalance(applicant.address)) === 0n) {
      throw new Error("applicant/deployer wallet has no Coston2 funds");
    }

    const policyRegistry = new ethers.Contract(
      manifest.contracts.policyRegistry,
      POLICY_ABI,
      provider
    );
    const accessRegistry = new ethers.Contract(
      manifest.contracts.accessRegistry,
      ACCESS_ABI,
      applicant
    );
    const sender = new ethers.Contract(
      manifest.contracts.privateAccessInstructionSender,
      SENDER_ABI,
      applicant
    );
    const manager = new ethers.Contract(
      manifest.protocol.flareTeeManager,
      MANAGER_ABI,
      provider
    );

    const [policy, extensionId, teeStatus, teeExtensionId, signerRegistered] =
      await Promise.all([
        policyRegistry.getPolicy(manifest.policyId),
        sender.extensionId(),
        manager.getTeeMachineStatus(TEE_SIGNER),
        manager.getExtensionId(TEE_SIGNER),
        accessRegistry.registeredTeeSigners(TEE_SIGNER)
      ]);
    sameAddress(policy.owner, EXPECTED_DEPLOYER, "policy owner");
    sameAddress(policy.credentialIssuer, EXPECTED_ISSUER, "on-chain issuer");
    if (!policy.active) throw new Error("policy is inactive");
    if (policy.rulesHash.toLowerCase() !== manifest.policy.rulesHash.toLowerCase()) {
      throw new Error("policy rules hash does not match the deployment manifest");
    }
    if (extensionId !== EXPECTED_EXTENSION_ID || teeExtensionId !== extensionId) {
      throw new Error("FCC extension binding does not match");
    }
    if (teeStatus !== 2n || !signerRegistered) {
      throw new Error("registered TEE is not authorized in PRODUCTION");
    }

    const info = await fetchJson(`${PROXY_URL}/info`);
    const teePublicKey = extractAndVerifyTeePublicKey(info, TEE_SIGNER);
    const currentPass = await accessRegistry.getAccess(
      applicant.address,
      manifest.policyId
    );
    const nonce = Number(currentPass.nonce) + 1;
    if (!Number.isSafeInteger(nonce)) throw new Error("access nonce overflow");
    const credentialExpiresAt = Math.floor(Date.now() / 1000) + 7200;
    const request = await buildSignedAccessRequest({
      issuerWallet: issuer,
      registry: manifest.contracts.accessRegistry,
      account: applicant.address,
      policyId: manifest.policyId,
      rulesHash: policy.rulesHash,
      policy: POLICY_RULES,
      nonce,
      expiresAt: credentialExpiresAt
    });
    const plaintext = Buffer.from(JSON.stringify(request), "utf8");
    const ciphertext = ethers.hexlify(encryptGethEcies(teePublicKey, plaintext));
    plaintext.fill(0);

    console.log("Sending encrypted FCC access instruction…");
    const requestTransaction = await sender.requestAccess(ciphertext, {
      value: INSTRUCTION_FEE
    });
    const requestReceipt = await requestTransaction.wait();
    if (!requestReceipt || requestReceipt.status !== 1) {
      throw new Error("FCC request transaction failed");
    }
    let instructionId = null;
    for (const log of requestReceipt.logs) {
      try {
        const parsed = sender.interface.parseLog(log);
        if (parsed?.name === "AccessEvaluationRequested") {
          instructionId = parsed.args.instructionId;
          break;
        }
      } catch {}
    }
    if (!instructionId) throw new Error("instruction ID was not emitted");

    console.log(`Waiting for confidential evaluation ${instructionId}…`);
    const response = await pollActionResult(instructionId);
    const action = normalizeAndVerifyActionResponse(
      response,
      TEE_SIGNER,
      CHAIN_ID
    );
    if (action.id.toLowerCase() !== instructionId.toLowerCase()) {
      throw new Error("FCC action ID does not match the requested instruction");
    }
    const decision = decodeAndValidateDecision(action.data, {
      registry: manifest.contracts.accessRegistry,
      account: applicant.address,
      policyId: manifest.policyId,
      rulesHash: policy.rulesHash,
      issuer: EXPECTED_ISSUER,
      nonce,
      now: Math.floor(Date.now() / 1000)
    });

    console.log("Relaying the verified TEE decision to AccessRegistry…");
    const relayTransaction = await accessRegistry.submitFccDecision(
      action.data,
      action.id,
      action.submissionTag,
      action.status,
      action.signature
    );
    const relayReceipt = await relayTransaction.wait();
    if (!relayReceipt || relayReceipt.status !== 1) {
      throw new Error("AccessRegistry relay transaction failed");
    }

    const [confirmedPass, activeAccess, evidenceBlock] = await Promise.all([
      accessRegistry.getAccess(applicant.address, manifest.policyId),
      accessRegistry.canAccess(applicant.address, manifest.policyId),
      provider.getBlockNumber()
    ]);
    if (
      !activeAccess ||
      confirmedPass.nonce !== decision.nonce ||
      confirmedPass.limitUsd !== decision.limitUsd ||
      confirmedPass.expiresAt !== decision.expiresAt
    ) {
      throw new Error("confirmed on-chain access pass does not match the TEE decision");
    }

    const outputPath = path.resolve(
      process.env.LIVE_EVIDENCE_OUTPUT || "evidence/coston2-live-access.json"
    );
    writeEvidence(outputPath, {
      schemaVersion: 1,
      network: "coston2",
      chainId: Number(CHAIN_ID),
      blockNumber: evidenceBlock,
      generatedAt: new Date().toISOString(),
      applicant: applicant.address,
      issuer: issuer.address,
      policyId: manifest.policyId,
      extensionId: extensionId.toString(),
      tee: {
        id: TEE_SIGNER,
        status: "PRODUCTION",
        proxyUrl: PROXY_URL,
        resultSignerVerified: true
      },
      privacy: {
        plaintextCredentialRecorded: false,
        ciphertextRecorded: false,
        ciphertextHash: ethers.keccak256(ciphertext)
      },
      fccAction: {
        instructionId,
        actionId: action.id,
        submissionTag: action.submissionTag,
        status: action.status,
        resultData: action.data,
        signature: action.signature
      },
      transactions: {
        encryptedRequest: {
          hash: requestTransaction.hash,
          blockNumber: requestReceipt.blockNumber,
          status: requestReceipt.status
        },
        accessRelay: {
          hash: relayTransaction.hash,
          blockNumber: relayReceipt.blockNumber,
          status: relayReceipt.status
        }
      },
      accessPass: {
        eligible: true,
        limitUsd: confirmedPass.limitUsd.toString(),
        expiresAt: confirmedPass.expiresAt.toString(),
        nonce: confirmedPass.nonce.toString(),
        active: activeAccess
      },
      verification: { passed: true }
    });

    console.log(
      `PRIVATE_FXRP_LIVE_ACCESS_VERIFIED applicant=${applicant.address} instruction=${instructionId} request_tx=${requestTransaction.hash} relay_tx=${relayTransaction.hash} evidence_block=${evidenceBlock}`
    );
  } finally {
    provider.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
