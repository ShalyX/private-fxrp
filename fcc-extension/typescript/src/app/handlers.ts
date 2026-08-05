/**
 * ★ MAIN CUSTOMIZATION POINT: your extension's handlers.
 *
 * Mirrors go/internal/extension/extension.go. Each handler follows the same
 * 4-step pattern: decode, validate, execute, respond.
 *
 * Handler contract:
 *   (originalMessageHex) => [dataHexOrNull, status, errorOrNull]
 *   status 0 = error, 1 = success. See docs/extension-contract.md §4.6.
 *
 * The framework serializes handler calls, so plain module-level state is safe.
 */

import { bytesToHex, hexToBytes } from "../base/encoding.js";
import { NodeClient } from "../base/node.js";
import type { Framework, HandlerResult } from "../base/types.js";
import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  recoverTypedDataAddress,
} from "viem";

import { decodeSayGoodbye } from "./abi.js";
import {
  OP_COMMAND_SAY_GOODBYE,
  OP_COMMAND_SAY_HELLO,
  OP_COMMAND_EVALUATE_ACCESS,
  OP_TYPE_GREETING,
  OP_TYPE_PRIVATE_ACCESS,
} from "./config.js";

// --- Extension state ---------------------------------------------------------
// Serialized by the framework; no locking needed here.
let greetingCount = 0;
let lastGreeting = "";
let farewellCount = 0;
let lastFarewell = "";
let decisionsProcessed = 0;
let lastPolicyId = "";

/** Reset all state. Used by tests; not part of the wire contract. */
export function resetState(): void {
  greetingCount = 0;
  lastGreeting = "";
  farewellCount = 0;
  lastFarewell = "";
  decisionsProcessed = 0;
  lastPolicyId = "";
}

/** Wire handlers to (opType, opCommand) pairs. */
export function register(framework: Framework): void {
  framework.handle(OP_TYPE_GREETING, OP_COMMAND_SAY_HELLO, handleSayHello);
  framework.handle(OP_TYPE_GREETING, OP_COMMAND_SAY_GOODBYE, handleSayGoodbye);
  framework.handle(
    OP_TYPE_PRIVATE_ACCESS,
    OP_COMMAND_EVALUATE_ACCESS,
    handleEvaluateAccess,
  );
}

/** Snapshot returned by GET /state. Mirrors the Go State struct. */
export function reportState(): unknown {
  return {
    greetingCount,
    lastGreeting,
    farewellCount,
    lastFarewell,
  };
}

type Credential = {
  account: `0x${string}`;
  jurisdiction: string;
  investorCategory: number;
  riskScore: number;
  expiresAt: number;
};

type PolicyRules = {
  allowedJurisdictions: string[];
  minimumInvestorCategory: number;
  maximumRiskScore: number;
  limitByCategory: Record<string, string>;
};

type AccessRequest = {
  registry: `0x${string}`;
  account: `0x${string}`;
  policyId: `0x${string}`;
  rulesHash: `0x${string}`;
  issuer: `0x${string}`;
  credential: Credential;
  issuerSignature: `0x${string}`;
  policy: PolicyRules;
  nonce: number;
};

const credentialTypes = {
  Credential: [
    { name: "account", type: "address" },
    { name: "jurisdiction", type: "string" },
    { name: "investorCategory", type: "uint8" },
    { name: "riskScore", type: "uint16" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export async function handleEvaluateAccess(
  msg: string,
): Promise<HandlerResult> {
  let ciphertext: Uint8Array;
  try {
    ciphertext = hexToBytes(msg);
    if (ciphertext.length === 0) throw new Error("ciphertext is empty");
  } catch (e) {
    return [null, 0, `decoding request: ${String(e)}`];
  }

  let request: AccessRequest;
  try {
    const node = new NodeClient(process.env.SIGN_PORT ?? "9090");
    const plaintext = await node.decrypt(ciphertext);
    request = JSON.parse(Buffer.from(plaintext).toString("utf-8")) as AccessRequest;
  } catch (e) {
    return [null, 0, `decryption failed: ${String(e)}`];
  }

  const validationError = validateAccessRequest(request);
  if (validationError) return [null, 0, validationError];

  const computedRulesHash = computePolicyRulesHash(request.policy);
  if (computedRulesHash.toLowerCase() !== request.rulesHash.toLowerCase()) {
    return [null, 0, "policy rules hash mismatch"];
  }

  let recoveredIssuer: string;
  try {
    recoveredIssuer = await recoverTypedDataAddress({
      domain: { name: "Private FXRP Credential", version: "1" },
      types: credentialTypes,
      primaryType: "Credential",
      message: {
        ...request.credential,
        expiresAt: BigInt(request.credential.expiresAt),
      },
      signature: request.issuerSignature,
    });
  } catch (e) {
    return [null, 0, `credential signature invalid: ${String(e)}`];
  }
  if (recoveredIssuer.toLowerCase() !== request.issuer.toLowerCase()) {
    return [null, 0, "credential issuer mismatch"];
  }

  const now = Math.floor(Date.now() / 1000);
  const eligible =
    request.credential.account.toLowerCase() === request.account.toLowerCase() &&
    request.credential.expiresAt > now &&
    request.policy.allowedJurisdictions.includes(
      request.credential.jurisdiction,
    ) &&
    request.credential.investorCategory >=
      request.policy.minimumInvestorCategory &&
    request.credential.riskScore <= request.policy.maximumRiskScore;
  const limitUsd = eligible
    ? BigInt(
        request.policy.limitByCategory[
          String(request.credential.investorCategory)
        ] ?? "0",
      )
    : 0n;
  const finalEligible = eligible && limitUsd > 0n;
  const expiresAt = BigInt(
    Math.min(request.credential.expiresAt, now + 3600),
  );

  const result = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "address" },
      { type: "bool" },
      { type: "uint128" },
      { type: "uint64" },
      { type: "uint64" },
    ],
    [
      request.registry,
      request.account,
      request.policyId,
      request.rulesHash,
      request.issuer,
      finalEligible,
      limitUsd,
      expiresAt,
      BigInt(request.nonce),
    ],
  );

  decisionsProcessed++;
  lastPolicyId = request.policyId;
  return [result, 1, null];
}

function computePolicyRulesHash(policy: PolicyRules): `0x${string}` {
  const jurisdictions = [...policy.allowedJurisdictions].sort();
  const categories = Object.keys(policy.limitByCategory)
    .map(Number)
    .sort((left, right) => left - right);
  const limits = categories.map((category) =>
    BigInt(policy.limitByCategory[String(category)]),
  );

  return keccak256(
    encodeAbiParameters(
      [
        { type: "string[]" },
        { type: "uint8" },
        { type: "uint16" },
        { type: "uint8[]" },
        { type: "uint128[]" },
      ],
      [
        jurisdictions,
        policy.minimumInvestorCategory,
        policy.maximumRiskScore,
        categories,
        limits,
      ],
    ),
  );
}

function validateAccessRequest(request: AccessRequest): string | null {
  if (!request || typeof request !== "object") return "invalid access request";
  if (!isAddress(request.registry)) return "invalid registry address";
  if (!isAddress(request.account)) return "invalid account address";
  if (!isAddress(request.issuer)) return "invalid issuer address";
  if (!/^0x[0-9a-fA-F]{64}$/.test(request.policyId)) {
    return "invalid policy id";
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(request.rulesHash)) {
    return "invalid rules hash";
  }
  if (
    !request.credential ||
    !isAddress(request.credential.account) ||
    typeof request.credential.jurisdiction !== "string" ||
    !Number.isInteger(request.credential.investorCategory) ||
    !Number.isInteger(request.credential.riskScore) ||
    !Number.isInteger(request.credential.expiresAt)
  ) {
    return "invalid credential";
  }
  if (
    !request.policy ||
    !Array.isArray(request.policy.allowedJurisdictions) ||
    !Number.isInteger(request.policy.minimumInvestorCategory) ||
    !Number.isInteger(request.policy.maximumRiskScore) ||
    typeof request.policy.limitByCategory !== "object"
  ) {
    return "invalid policy";
  }
  if (!Number.isSafeInteger(request.nonce) || request.nonce <= 0) {
    return "invalid nonce";
  }
  return null;
}

/** GREETING/SAY_HELLO — JSON payload {"name": "..."}. */
export function handleSayHello(msg: string): HandlerResult {
  // 1. Decode
  let raw: Uint8Array;
  try {
    raw = hexToBytes(msg);
  } catch (e) {
    return [null, 0, `decoding request: invalid hex: ${String(e)}`];
  }

  let req: unknown;
  try {
    req = JSON.parse(Buffer.from(raw).toString("utf-8"));
  } catch (e) {
    return [null, 0, `decoding request: ${String(e)}`];
  }

  if (typeof req !== "object" || req === null || Array.isArray(req)) {
    return [null, 0, "decoding request: expected a JSON object"];
  }

  // Match Go's DisallowUnknownFields.
  const unknown = Object.keys(req).filter((k) => k !== "name").sort();
  if (unknown.length > 0) {
    return [null, 0, `decoding request: unknown field "${unknown[0]}"`];
  }

  // 2. Validate
  const name = (req as { name?: unknown }).name;
  if (typeof name !== "string" || name === "") {
    return [null, 0, "name must not be empty"];
  }

  // 3. Execute
  greetingCount++;
  const greeting = `Hello, ${name}! Welcome to Flare Confidential Compute.`;
  lastGreeting = greeting;

  // 4. Respond
  const resp = { greeting, greetingNumber: greetingCount };
  return [bytesToHex(Buffer.from(JSON.stringify(resp), "utf-8")), 1, null];
}

/** GREETING/SAY_GOODBYE — ABI-encoded (string name, string reason). */
export function handleSayGoodbye(msg: string): HandlerResult {
  // 1. Decode
  let hex: string;
  try {
    // Normalize through hexToBytes so malformed input fails here, not in viem.
    hex = bytesToHex(hexToBytes(msg));
  } catch (e) {
    return [null, 0, `decoding request: invalid hex: ${String(e)}`];
  }

  let decoded: { name: string; reason: string };
  try {
    decoded = decodeSayGoodbye(hex as `0x${string}`);
  } catch (e) {
    return [null, 0, `decoding request: ${e instanceof Error ? e.message : String(e)}`];
  }

  // 2. Validate
  if (!decoded.name) {
    return [null, 0, "name must not be empty"];
  }

  // 3. Execute
  farewellCount++;
  const farewell = `Goodbye, ${decoded.name}! Reason: ${decoded.reason}`;
  lastFarewell = farewell;

  // 4. Respond
  const resp = { farewell, farewellNumber: farewellCount };
  return [bytesToHex(Buffer.from(JSON.stringify(resp), "utf-8")), 1, null];
}
