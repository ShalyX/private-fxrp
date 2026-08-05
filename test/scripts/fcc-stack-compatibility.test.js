const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const FCC = path.join(ROOT, "fcc-extension");
const LIVE_TEE_MANAGER = "0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE";
const REQUIRED_NODE = "v0.0.24";
const REQUIRED_PROXY_MODULE = "v0.0.21-0.20260729123751-0c6d016b0994";
const REQUIRED_PROXY_COMMIT = "0c6d016b09948cba9a508ba357e592eb6088fd1c";

function read(relativePath) {
  return fs.readFileSync(path.join(FCC, relativePath), "utf8");
}

function moduleVersion(goMod, moduleName) {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = goMod.match(new RegExp(`^\\s*${escaped}\\s+(v\\S+)`, "m"));
  return match?.[1] || null;
}

describe("Coston2 FCC stack compatibility", function () {
  it("pins the extension and deployment tools to the current compatible tee-node", function () {
    expect(moduleVersion(read("go/go.mod"), "github.com/flare-foundation/tee-node"))
      .to.equal(REQUIRED_NODE);
    expect(moduleVersion(read("tools/go.mod"), "github.com/flare-foundation/tee-node"))
      .to.equal(REQUIRED_NODE);
  });

  it("pins tee-proxy develop immutably in both tooling and its container build", function () {
    expect(moduleVersion(read("tools/go.mod"), "github.com/flare-foundation/tee-proxy"))
      .to.equal(REQUIRED_PROXY_MODULE);

    const dockerfile = read("proxy/Dockerfile");
    expect(dockerfile).to.include(`ARG TEE_PROXY_COMMIT=${REQUIRED_PROXY_COMMIT}`);
    expect(dockerfile).to.include('git checkout --detach "${TEE_PROXY_COMMIT}"');
    expect(dockerfile).to.include(
      "COPY --from=builder /app/tee-proxy/config/config.example.toml ./config/config.toml"
    );
    expect(dockerfile).to.not.include("/app/tee-proxy/config.example.toml");
    expect(dockerfile).to.not.include("--branch develop");
  });

  it("checks the proxy module pseudo-version against the immutable build commit", function () {
    const versions = read("scripts/lib/versions.sh");
    const checker = read("scripts/check-versions.sh");

    expect(versions).to.include("TEE_PROXY_COMMIT");
    expect(checker).to.include("_versions_ref \"$TOOLS_PROXY\"");
    expect(checker).to.include("$TEE_PROXY_COMMIT");
  });

  it("targets the live Coston2 manager and uses a fresh registration challenge", function () {
    const addresses = JSON.parse(read("config/coston2/deployed-addresses.json"));
    const manager = addresses.find((entry) => entry.name === "FlareTeeManager");

    expect(manager?.address).to.equal(LIVE_TEE_MANAGER);
    expect(read("scripts/post-build.sh")).to.match(/-command\s+rRap/);
  });

  it("keeps simulated TEE mode explicit for Coston2 judging", function () {
    expect(read(".env.example")).to.match(/^SIMULATED_TEE=true$/m);
  });
});
