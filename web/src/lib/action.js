import { getBytes, hexlify, isHexString } from "ethers";

export function normalizeActionResult(response) {
  const result = response?.result;
  if (result?.status !== 1) {
    throw new Error(result?.error || "FCC action failed");
  }
  if (
    !isHexString(result.data) ||
    !isHexString(result.id, 32) ||
    typeof result.submissionTag !== "string" ||
    !isHexString(response.signature, 65)
  ) {
    throw new Error("FCC action response is incomplete");
  }
  const signatureBytes = getBytes(response.signature);
  if (signatureBytes[64] === 0 || signatureBytes[64] === 1) {
    signatureBytes[64] += 27;
  }
  if (signatureBytes[64] !== 27 && signatureBytes[64] !== 28) {
    throw new Error("FCC action signature has an invalid recovery byte");
  }
  return {
    data: result.data,
    actionId: result.id,
    submissionTag: result.submissionTag,
    status: result.status,
    signature: hexlify(signatureBytes)
  };
}

export async function pollActionResult(instructionId, options = {}) {
  const attempts = options.attempts ?? 20;
  const delayMs = options.delayMs ?? 2500;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/tee/action/${instructionId}`, {
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      const body = await response.json();
      if (body?.result?.status !== undefined) {
        return normalizeActionResult(body);
      }
    } else if (response.status >= 500) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "FCC proxy is unavailable");
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("FCC result was not ready before the polling window closed");
}
