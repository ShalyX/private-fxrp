const { expect } = require("chai");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const {
  buildSignedAccessRequest,
  decodeAndValidateDecision,
  encryptGethEcies,
  extractAndVerifyTeePublicKey,
  normalizeAndVerifyActionResponse
} = require("../../scripts/lib/live-coston2-access");

describe("live Coston2 private access proof", function () {
  const liveScriptPath = path.join(
    __dirname,
    "../../scripts/run-live-coston2-access.js"
  );
  const runnerPath = path.join(
    __dirname,
    "../../run-live-coston2-access-v0.4.0.sh"
  );
  it("produces the FCC-compatible ECIES wire format", function () {
    const publicKey =
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1";
    const ciphertext = encryptGethEcies(
      publicKey,
      Buffer.from("Private FXRP Access Desk"),
      {
        ephemeralPrivateKey: Buffer.from("22".repeat(32), "hex"),
        iv: Buffer.from("33".repeat(16), "hex")
      }
    );

    expect(ethers.hexlify(ciphertext)).to.equal(
      "0x04466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276728176c3c6431f8eeda4538dc37c865e2784f3a9e77d044f33e407797e1278a333333333333333333333333333333336a74c881617b94966ff68052cadc761bd5a7087ca18f5d6e59300173a7024d4826a6162ad7e66e5d507472d224ed6576670c79377e1227d1"
    );
  });

  it("extracts the nested FCC key only when it matches the registered TEE", function () {
    const publicKey =
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1";
    const expected = ethers.computeAddress(publicKey);

    expect(
      extractAndVerifyTeePublicKey(
        { teeInfo: { machineData: { publicKey } } },
        expected
      )
    ).to.equal(publicKey);
    expect(() =>
      extractAndVerifyTeePublicKey(
        { teeInfo: { machineData: { publicKey } } },
        "0x0000000000000000000000000000000000000001"
      )
    ).to.throw("registered TEE");
  });

  it("discovers a Base64 public key at an unknown nested path", function () {
    const publicKey =
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1";
    const encoded = Buffer.from(ethers.getBytes(publicKey)).toString("base64");

    expect(
      extractAndVerifyTeePublicKey(
        { payload: { attestation: { encryptionKey: encoded } } },
        ethers.computeAddress(publicKey)
      )
    ).to.equal(publicKey);
  });

  it("discovers a public key serialized as a byte array", function () {
    const publicKey =
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1";

    expect(
      extractAndVerifyTeePublicKey(
        { tee: { identity: Array.from(ethers.getBytes(publicKey)) } },
        ethers.computeAddress(publicKey)
      )
    ).to.equal(publicKey);
  });

  it("assembles the live FCC x/y coordinate public-key schema", function () {
    const publicKey =
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1";
    const raw = publicKey.slice(4);
    const x = `0x${raw.slice(0, 64)}`;
    const y = `0x${raw.slice(64)}`;

    expect(
      extractAndVerifyTeePublicKey(
        { teeInfo: { publicKey: { x, y } } },
        ethers.computeAddress(publicKey)
      )
    ).to.equal(publicKey);
  });

  it("recovers the registered TEE from the FCC ActionResult signature", async function () {
    const tee = new ethers.Wallet(`0x${"44".repeat(32)}`);
    const result = {
      data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [7n]),
      id: `0x${"11".repeat(32)}`,
      submissionTag: "submit",
      status: 1
    };
    const resultHash = ethers.solidityPackedKeccak256(
      ["bytes32", "bytes32", "bytes32", "uint8"],
      [
        ethers.keccak256(result.data),
        result.id,
        ethers.keccak256(ethers.toUtf8Bytes(result.submissionTag)),
        result.status
      ]
    );
    const payloadHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "bytes32"],
        [ethers.encodeBytes32String("TEE_ACTION_RESULT"), 114n, resultHash]
      )
    );
    const signature = await tee.signMessage(ethers.getBytes(payloadHash));

    expect(
      normalizeAndVerifyActionResponse(
        { result, signature },
        tee.address,
        114n
      )
    ).to.deep.equal({ ...result, signature });
    expect(() =>
      normalizeAndVerifyActionResponse(
        { result, signature },
        "0x0000000000000000000000000000000000000001",
        114n
      )
    ).to.throw("signer");
  });

  it("canonicalizes an FCC recovery byte before relaying the signature", async function () {
    const tee = new ethers.Wallet(`0x${"44".repeat(32)}`);
    const result = {
      data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [7n]),
      id: `0x${"11".repeat(32)}`,
      submissionTag: "submit",
      status: 1
    };
    const resultHash = ethers.solidityPackedKeccak256(
      ["bytes32", "bytes32", "bytes32", "uint8"],
      [
        ethers.keccak256(result.data),
        result.id,
        ethers.keccak256(ethers.toUtf8Bytes(result.submissionTag)),
        result.status
      ]
    );
    const payloadHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "bytes32"],
        [ethers.encodeBytes32String("TEE_ACTION_RESULT"), 114n, resultHash]
      )
    );
    const canonicalSignature = await tee.signMessage(
      ethers.getBytes(payloadHash)
    );
    const proxyBytes = ethers.getBytes(canonicalSignature);
    proxyBytes[64] -= 27;
    const proxySignature = ethers.hexlify(proxyBytes);

    expect(
      normalizeAndVerifyActionResponse(
        { result, signature: proxySignature },
        tee.address,
        114n
      ).signature
    ).to.equal(canonicalSignature);
  });

  it("accepts only an eligible decision bound to the expected request", function () {
    const expected = {
      registry: "0x0000000000000000000000000000000000000011",
      account: "0x0000000000000000000000000000000000000022",
      policyId: `0x${"33".repeat(32)}`,
      rulesHash: `0x${"44".repeat(32)}`,
      issuer: "0x0000000000000000000000000000000000000055",
      nonce: 9n,
      now: 1_000n
    };
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "address",
        "address",
        "bytes32",
        "bytes32",
        "address",
        "bool",
        "uint128",
        "uint64",
        "uint64"
      ],
      [
        expected.registry,
        expected.account,
        expected.policyId,
        expected.rulesHash,
        expected.issuer,
        true,
        25_000_000_000n,
        2_000n,
        expected.nonce
      ]
    );

    expect(decodeAndValidateDecision(data, expected).limitUsd).to.equal(
      25_000_000_000n
    );
    expect(() =>
      decodeAndValidateDecision(data, { ...expected, nonce: 10n })
    ).to.throw("nonce");
  });

  it("binds the issuer signature to the applicant credential", async function () {
    const issuer = new ethers.Wallet(`0x${"55".repeat(32)}`);
    const account = "0x0000000000000000000000000000000000000022";
    const request = await buildSignedAccessRequest({
      issuerWallet: issuer,
      registry: "0x0000000000000000000000000000000000000011",
      account,
      policyId: `0x${"33".repeat(32)}`,
      rulesHash: `0x${"44".repeat(32)}`,
      policy: {
        allowedJurisdictions: ["GB", "NG"],
        minimumInvestorCategory: 2,
        maximumRiskScore: 40,
        limitByCategory: { "2": "25000000000", "3": "100000000000" }
      },
      nonce: 9,
      expiresAt: 2_000
    });

    expect(request.credential.account).to.equal(account);
    expect(request.issuer).to.equal(issuer.address);
    expect(
      ethers.verifyTypedData(
        { name: "Private FXRP Credential", version: "1" },
        {
          Credential: [
            { name: "account", type: "address" },
            { name: "jurisdiction", type: "string" },
            { name: "investorCategory", type: "uint8" },
            { name: "riskScore", type: "uint16" },
            { name: "expiresAt", type: "uint64" }
          ]
        },
        request.credential,
        request.issuerSignature
      )
    ).to.equal(issuer.address);
  });

  it("relays only a verified FCC result and records a confirmed pass", function () {
    const source = fs.readFileSync(liveScriptPath, "utf8");
    const verify = source.indexOf("normalizeAndVerifyActionResponse");
    const relay = source.indexOf("submitFccDecision");

    expect(source).to.include("requestAccess");
    expect(source).to.include("1000000n");
    expect(verify).to.be.greaterThan(-1);
    expect(relay).to.be.greaterThan(verify);
    expect(source).to.include("canAccess");
    expect(source).to.include("writeFileSync");
    expect(source).to.include("renameSync");
  });

  it("collects both role keys invisibly and clears them on exit", function () {
    const source = fs.readFileSync(runnerPath, "utf8");

    expect(source.match(/read -r -s/g)).to.have.length(2);
    expect(source).to.include(
      "unset DEPLOYER_PRIVATE_KEY POLICY_ISSUER_PRIVATE_KEY"
    );
    expect(source).to.include("trap cleanup EXIT INT TERM");
    expect(source).to.include("npm run live-access:coston2");
  });
});
