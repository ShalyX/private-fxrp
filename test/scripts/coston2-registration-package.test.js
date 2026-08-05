const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

describe("Coston2 TEE registration package", function () {
  const scriptPath = path.join(
    __dirname,
    "../../fcc-extension/register-coston2-v0.4.0.sh"
  );

  function script() {
    return fs.readFileSync(scriptPath, "utf8");
  }

  it("collects the private key invisibly and clears it on every exit", function () {
    const source = script();

    expect(source).to.match(/read -r -s/);
    expect(source).to.include("unset DEPLOYMENT_PRIVATE_KEY EXTENSION_OWNER_KEY");
    expect(source).to.include("trap cleanup EXIT INT TERM");
    expect(source).to.not.match(/echo[^\n]*DEPLOYMENT_PRIVATE_KEY/);
  });

  it("verifies the key controls the expected deployer before any write", function () {
    const source = script();
    const verification = source.indexOf("cmd/key-address");
    const firstWrite = source.indexOf("cmd/allow-tee-version");

    expect(verification).to.be.greaterThan(-1);
    expect(firstWrite).to.be.greaterThan(verification);
    expect(source).to.include("0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1");
  });

  it("preflights both proxies and registers with a fresh challenge", function () {
    const source = script();

    expect(source).to.include("https://augusta-unjoking-sarahi.ngrok-free.dev");
    expect(source).to.include("https://tee-proxy-coston2-1.flare.rocks");
    expect(source).to.include("https://coston2-api.flare.network/ext/C/rpc");
    expect(source).to.include("-command rRap");
    expect(source).to.include("SIMULATED_TEE=true");
  });

  it("uses the live redeployed Coston2 manager configuration", function () {
    const addresses = fs.readFileSync(
      path.join(
        __dirname,
        "../../fcc-extension/config/coston2/deployed-addresses.json"
      ),
      "utf8"
    );

    expect(addresses).to.include("0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE");
  });
});
