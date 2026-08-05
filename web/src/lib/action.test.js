import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeActionResult } from "./action";

describe("FCC action response", () => {
  it("maps the proxy response to AccessRegistry relay arguments", () => {
    const actionId = `0x${"11".repeat(32)}`;
    const signature = `0x${"aa".repeat(64)}1b`;
    const data = `0x${"bb".repeat(32)}`;

    expect(
      normalizeActionResult({
        result: {
          data,
          id: actionId,
          submissionTag: "submit",
          status: 1
        },
        signature
      })
    ).toEqual({ data, actionId, submissionTag: "submit", status: 1, signature });
  });

  it("canonicalizes the FCC recovery byte for AccessRegistry", () => {
    const actionId = `0x${"11".repeat(32)}`;
    const proxySignature = `0x${"aa".repeat(64)}01`;
    const canonicalSignature = `0x${"aa".repeat(64)}1c`;
    const data = `0x${"bb".repeat(32)}`;

    expect(
      normalizeActionResult({
        result: {
          data,
          id: actionId,
          submissionTag: "submit",
          status: 1
        },
        signature: proxySignature
      }).signature
    ).toBe(canonicalSignature);
  });

  it("rejects failed or incomplete action responses", () => {
    expect(() =>
      normalizeActionResult({ result: { status: 0 }, signature: "0x" })
    ).toThrow("FCC action failed");
  });

  it("completes encryption before showing wallet approval", () => {
    const source = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
    const encrypted = source.indexOf(
      "const ciphertext = await encryptAccessRequest"
    );
    const completed = source.indexOf('title: "Credential encrypted"', encrypted);
    const wallet = source.indexOf('title: "Awaiting wallet approval"', encrypted);

    expect(encrypted).toBeGreaterThan(-1);
    expect(completed).toBeGreaterThan(encrypted);
    expect(wallet).toBeGreaterThan(completed);
  });
});
