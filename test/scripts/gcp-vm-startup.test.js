const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const STARTUP = path.join(ROOT, "scripts/gcp/private-fxrp-vm-startup-v0.3.0.sh");

describe("Private FXRP VM startup", function () {
  let script;

  before(function () {
    script = fs.readFileSync(STARTUP, "utf8");
  });

  it("runs the reviewed workload images by immutable digest", function () {
    expect(script).to.include(
      "private-fxrp-tee@sha256:2c494746ccb2d1efe38aa4c1639110473c2d51fbe156b066550a4362971298f7"
    );
    expect(script).to.include(
      "private-fxrp-proxy@sha256:794d32fe30a21d06cbebbf01bbef20d67828de9168f61ba44fcb34225460579f"
    );
    expect(script).to.not.match(/private-fxrp-(?:tee|proxy):v0\.3\.0/);
  });

  it("loads every private runtime value from Secret Manager", function () {
    for (const name of [
      "private-fxrp-indexer-host",
      "private-fxrp-indexer-database",
      "private-fxrp-indexer-username",
      "private-fxrp-indexer-password",
      "private-fxrp-proxy-key",
      "private-fxrp-ngrok-domain",
      "private-fxrp-ngrok-authtoken"
    ]) {
      expect(script).to.include(name);
    }
    expect(script).to.not.match(/INDEXER_PASSWORD=['\"][^$]/);
  });

  it("normalizes Secret Manager URL-safe Base64 before decoding", function () {
    expect(script).to.match(/jq -er '\.payload\.data'\s*\\\n\s*\| tr '_-' '\/\+'/);
  });

  it("normalizes an unprefixed proxy signing key in memory", function () {
    expect(script).to.include(
      '[[ "$PROXY_PRIVATE_KEY" =~ ^[0-9A-Fa-f]{64}$ ]]'
    );
    expect(script).to.include('PROXY_PRIVATE_KEY="0x$PROXY_PRIVATE_KEY"');
  });

  it("binds the simulated node to the registered Coston2 extension", function () {
    expect(script).to.include(
      "EXTENSION_ID=0x000000000000000000000000000000000000000000000000000000000001012b"
    );
    expect(script).to.include("CHAIN_ID=114");
    expect(script).to.include("SIMULATED_TEE=true");
    expect(script).to.include("PROXY_URL=http://127.0.0.1:6663");
  });

  it("keeps the proxy private and exposes only its callback port through ngrok", function () {
    expect(script).to.include('redis_port = "127.0.0.1:6379"');
    expect(script).to.include("upstream:");
    expect(script).to.include("url: http://127.0.0.1:6664");
    expect(script).to.not.include("0.0.0.0:");
    expect(script).to.include("--network host");
  });

  it("starts the TEE after the proxy internal port and before waiting for the external port", function () {
    const internalHealth = script.indexOf("http://127.0.0.1:6663/healthy");
    const teeStart = script.indexOf('echo "Starting Private FXRP TEE node…"');
    const externalHealth = script.indexOf("http://127.0.0.1:6664/info");

    expect(internalHealth).to.be.greaterThan(-1);
    expect(teeStart).to.be.greaterThan(internalHealth);
    expect(externalHealth).to.be.greaterThan(teeStart);
  });

  it("makes the root-owned ngrok configuration readable only by the container user", function () {
    expect(script).to.include(
      'docker run --rm --entrypoint id "$NGROK_IMAGE" -u'
    );
    expect(script).to.include(
      'chown "$NGROK_UID:$NGROK_GID" "$RUN_DIR/ngrok.yml"'
    );
    expect(script).to.not.include('chmod 0444 "$RUN_DIR/ngrok.yml"');
  });
});
