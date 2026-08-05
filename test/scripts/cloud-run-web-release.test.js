const { expect } = require("chai");
const fs = require("node:fs");
const path = require("node:path");

describe("Cloud Run web release", function () {
  const webRoot = path.join(__dirname, "../../web");
  const dockerfilePath = path.join(webRoot, "Dockerfile");
  const releasePath = path.join(webRoot, "deploy-cloud-run-v0.5.0.sh");

  it("deploys the verified web image by digest with bounded scale", function () {
    expect(fs.existsSync(dockerfilePath)).to.equal(true);
    expect(fs.existsSync(releasePath)).to.equal(true);

    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
    const release = fs.readFileSync(releasePath, "utf8");

    expect(dockerfile).to.include("npm ci --ignore-scripts");
    expect(dockerfile).to.include("USER node");
    expect(release).to.include('^sha256:[0-9a-f]{64}$');
    expect(release).to.include('--image="$IMAGE_BASE@$IMAGE_DIGEST"');
    expect(release).to.include("--min-instances=0");
    expect(release).to.include("--max-instances=2");
    expect(release).to.include("--allow-unauthenticated");
    expect(release).to.include('curl --fail --silent --show-error "$SERVICE_URL/health"');
  });

  it("removes temporary build permissions on every exit", function () {
    expect(fs.existsSync(releasePath)).to.equal(true);
    const release = fs.readFileSync(releasePath, "utf8");

    expect(release).to.include("trap cleanup EXIT INT TERM");
    expect(release).to.include("gcloud projects remove-iam-policy-binding");
    expect(release).to.include("gcloud storage buckets remove-iam-policy-binding");
  });
});
