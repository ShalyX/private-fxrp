const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const {
  buildCloudBuildConfig,
  validateBuildOptions
} = require("../../scripts/lib/gcp-build-package");

describe("GCP FCC build package", function () {
  const releaseScriptPath = path.join(
    __dirname,
    "../../fcc-extension/release-v0.4.0.sh"
  );
  const options = {
    projectId: "project-d79f9e62-d832-4631-9f6",
    region: "us-west1",
    repository: "private-fxrp",
    image: "private-fxrp-tee",
    proxyImage: "private-fxrp-proxy",
    tag: "v0.4.0",
    teeNodeRef: "v0.0.24",
    sourceDateEpoch: "1785878651"
  };

  it("builds the Private FXRP TypeScript workload on the pinned tee-node", function () {
    const config = buildCloudBuildConfig(options);

    expect(config).to.include("docker/node-base.Dockerfile");
    expect(config).to.include("local/tee-node-base:v0.0.24");
    expect(config).to.include("TEE_NODE_REF=v0.0.24");
    expect(config).to.include("typescript/Dockerfile");
    expect(config).to.not.include("go/Dockerfile");
    expect(config).to.include("proxy/Dockerfile");
    expect(config).to.include("DOCKER_BUILDKIT=1");
    expect(config).to.include("SOURCE_DATE_EPOCH=1785878651");
    expect(config).to.include(
      "us-west1-docker.pkg.dev/project-d79f9e62-d832-4631-9f6/private-fxrp/private-fxrp-tee:v0.4.0"
    );
    expect(config).to.include(
      "us-west1-docker.pkg.dev/project-d79f9e62-d832-4631-9f6/private-fxrp/private-fxrp-proxy:v0.4.0"
    );
    expect(config).to.include("--no-cache");
    expect(config).to.not.include("PRIVATE_KEY");
  });

  it("rejects malformed destinations and non-positive timestamps", function () {
    expect(() =>
      validateBuildOptions({ ...options, projectId: "Not A Project" })
    ).to.throw("projectId");
    expect(() =>
      validateBuildOptions({ ...options, sourceDateEpoch: "0" })
    ).to.throw("sourceDateEpoch");
    expect(() =>
      validateBuildOptions({ ...options, teeNodeRef: "main; echo unsafe" })
    ).to.throw("teeNodeRef");
  });

  it("ships the reviewed Cloud Build configuration used for the release image", function () {
    const checkedIn = fs.readFileSync(
      path.join(__dirname, "../../fcc-extension/cloudbuild.yaml"),
      "utf8"
    );

    expect(checkedIn).to.equal(
      buildCloudBuildConfig(options)
    );
  });

  it("preserves traversal permissions for compiled TypeScript modules", function () {
    const dockerfile = fs.readFileSync(
      path.join(__dirname, "../../fcc-extension/typescript/Dockerfile"),
      "utf8"
    );

    expect(dockerfile).to.not.match(
      /COPY --chmod=644[^\n]*--from=ext-builder \/ext\/(?:dist|node_modules)/
    );
    expect(dockerfile).to.include(
      "find /app/extension/dist -type d -exec chmod 0755 {} +"
    );
  });

  it("smoke-imports a nested compiled module before publishing the image", function () {
    const config = buildCloudBuildConfig(options);

    expect(config).to.include("--input-type=module");
    expect(config).to.include(
      'await import("/app/extension/dist/app/config.js")'
    );
  });

  it("installs only registry-resolved immutable image digests on the VM", function () {
    const release = fs.readFileSync(releaseScriptPath, "utf8");
    const build = release.indexOf("gcloud builds submit");
    const digestValidation = release.indexOf('^sha256:[0-9a-f]{64}$');
    const metadataUpdate = release.indexOf(
      "gcloud compute instances add-metadata"
    );

    expect(build).to.be.greaterThan(-1);
    expect(digestValidation).to.be.greaterThan(build);
    expect(metadataUpdate).to.be.greaterThan(digestValidation);
  });

  it("removes temporary Cloud Build and source-bucket permissions on exit", function () {
    const release = fs.readFileSync(releaseScriptPath, "utf8");

    expect(release).to.include("trap cleanup EXIT INT TERM");
    expect(release).to.include("gcloud projects add-iam-policy-binding");
    expect(release).to.include("gcloud projects remove-iam-policy-binding");
    expect(release).to.include("gcloud storage buckets add-iam-policy-binding");
    expect(release).to.include(
      "gcloud storage buckets remove-iam-policy-binding"
    );
  });
});
