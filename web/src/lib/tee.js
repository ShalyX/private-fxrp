import { secp256k1 } from "@noble/curves/secp256k1";
import { getBytes, hexlify, toUtf8Bytes } from "ethers";

export async function fetchTeeInfo() {
  const response = await fetch("/api/tee/info", {
    signal: AbortSignal.timeout(8000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Unable to reach the FCC proxy");
  }
  let publicKey =
    body?.machineData?.publicKey ||
    body?.machine_data?.public_key ||
    body?.teeInfo?.publicKey ||
    body?.publicKey;
  if (
    publicKey &&
    typeof publicKey === "object" &&
    /^(0x)?[0-9a-fA-F]{64}$/.test(publicKey.x || "") &&
    /^(0x)?[0-9a-fA-F]{64}$/.test(publicKey.y || "")
  ) {
    publicKey = `0x04${publicKey.x.replace(/^0x/i, "")}${publicKey.y.replace(/^0x/i, "")}`;
  }
  if (typeof publicKey !== "string") {
    throw new Error("FCC proxy did not return a TEE public key");
  }
  return { ...body, publicKey };
}

export async function encryptAccessRequest(publicKey, request) {
  const normalized = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
  return hexlify(
    await encryptGethEcies(
      getBytes(normalized),
      toUtf8Bytes(JSON.stringify(request))
    )
  );
}

export async function encryptGethEcies(publicKey, plaintext, options = {}) {
  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error("TEE public key must be an uncompressed secp256k1 key");
  }

  const ephemeralPrivateKey =
    options.ephemeralPrivateKey || randomPrivateKey();
  const iv = options.iv || crypto.getRandomValues(new Uint8Array(16));
  if (iv.length !== 16) throw new Error("ECIES IV must be 16 bytes");

  const recipient = secp256k1.ProjectivePoint.fromHex(publicKey);
  const privateScalar = BigInt(hexlify(ephemeralPrivateKey));
  const sharedPoint = recipient.multiply(privateScalar).toRawBytes(false);
  const sharedX = sharedPoint.slice(1, 33);
  const derived = await concatKdf(sharedX, 32);
  const encryptionKey = derived.slice(0, 16);
  const macKey = await sha256(derived.slice(16));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CTR", counter: iv, length: 128 },
      await crypto.subtle.importKey("raw", encryptionKey, "AES-CTR", false, [
        "encrypt"
      ]),
      plaintext
    )
  );
  const ivCiphertext = concatBytes(iv, encrypted);
  const hmac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey(
        "raw",
        macKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      ),
      ivCiphertext
    )
  );

  return concatBytes(
    secp256k1.getPublicKey(ephemeralPrivateKey, false),
    ivCiphertext,
    hmac
  );
}

async function concatKdf(secret, outputLength) {
  const chunks = [];
  for (let counter = 1, written = 0; written < outputLength; counter += 1) {
    const prefix = new Uint8Array([
      counter >>> 24,
      counter >>> 16,
      counter >>> 8,
      counter
    ]);
    chunks.push(await sha256(concatBytes(prefix, secret)));
    written += 32;
  }
  return concatBytes(...chunks).slice(0, outputLength);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}

function randomPrivateKey() {
  let value;
  do {
    value = crypto.getRandomValues(new Uint8Array(32));
  } while (!secp256k1.utils.isValidPrivateKey(value));
  return value;
}

function concatBytes(...values) {
  const output = new Uint8Array(
    values.reduce((length, value) => length + value.length, 0)
  );
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}
