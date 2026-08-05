import { describe, expect, it } from "vitest";
import { getBytes, hexlify, toUtf8Bytes } from "ethers";
import { encryptGethEcies, fetchTeeInfo } from "./tee";

describe("Geth-compatible ECIES", () => {
  it("assembles the live FCC x/y public-key response", async () => {
    const publicKey =
      "044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        teeInfo: {
          publicKey: {
            x: `0x${publicKey.slice(2, 66)}`,
            y: `0x${publicKey.slice(66)}`
          }
        }
      })
    });

    try {
      expect((await fetchTeeInfo()).publicKey).toBe(`0x${publicKey}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("matches the official FCC reference package wire format", async () => {
    const publicKey = getBytes(
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1"
    );
    const ciphertext = await encryptGethEcies(
      publicKey,
      toUtf8Bytes("Private FXRP Access Desk"),
      {
        ephemeralPrivateKey: getBytes(`0x${"22".repeat(32)}`),
        iv: getBytes(`0x${"33".repeat(16)}`)
      }
    );

    expect(hexlify(ciphertext)).to.equal(
      "0x04466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276728176c3c6431f8eeda4538dc37c865e2784f3a9e77d044f33e407797e1278a333333333333333333333333333333336a74c881617b94966ff68052cadc761bd5a7087ca18f5d6e59300173a7024d4826a6162ad7e66e5d507472d224ed6576670c79377e1227d1"
    );
  });
});
