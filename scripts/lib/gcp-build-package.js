const SAFE_PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SAFE_LOCATION = /^[a-z][a-z0-9-]{1,62}$/;
const SAFE_NAME = /^[a-z][a-z0-9._-]{1,126}[a-z0-9]$/;
const SAFE_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

function validateBuildOptions(options) {
  const {
    projectId,
    region,
    repository,
    image,
    proxyImage,
    tag,
    teeNodeRef,
    sourceDateEpoch
  } = options;

  if (!SAFE_PROJECT_ID.test(projectId || "")) {
    throw new Error("projectId is malformed");
  }
  if (!SAFE_LOCATION.test(region || "")) {
    throw new Error("region is malformed");
  }
  for (const [name, value] of Object.entries({ repository, image, proxyImage })) {
    if (!SAFE_NAME.test(value || "")) {
      throw new Error(`${name} is malformed`);
    }
  }
  if (!SAFE_TAG.test(tag || "")) {
    throw new Error("tag is malformed");
  }
  if (!SAFE_TAG.test(teeNodeRef || "")) {
    throw new Error("teeNodeRef is malformed");
  }
  if (!/^\d+$/.test(sourceDateEpoch || "") || BigInt(sourceDateEpoch) <= 0n) {
    throw new Error("sourceDateEpoch must be a positive integer");
  }

  return options;
}

function buildCloudBuildConfig(options) {
  validateBuildOptions(options);
  const {
    projectId,
    region,
    repository,
    image,
    proxyImage,
    tag,
    teeNodeRef,
    sourceDateEpoch
  } = options;
  const imageUri =
    `${region}-docker.pkg.dev/${projectId}/${repository}/${image}:${tag}`;
  const proxyImageUri =
    `${region}-docker.pkg.dev/${projectId}/${repository}/${proxyImage}:${tag}`;
  const teeNodeBaseImage = `local/tee-node-base:${teeNodeRef}`;

  return [
    "steps:",
    "  - name: 'gcr.io/cloud-builders/docker'",
    "    env:",
    "      - 'DOCKER_BUILDKIT=1'",
    "    args:",
    "      - 'build'",
    "      - '--no-cache'",
    "      - '--build-arg'",
    `      - 'SOURCE_DATE_EPOCH=${sourceDateEpoch}'`,
    "      - '--build-arg'",
    `      - 'TEE_NODE_REF=${teeNodeRef}'`,
    "      - '--tag'",
    `      - '${teeNodeBaseImage}'`,
    "      - '--file'",
    "      - 'docker/node-base.Dockerfile'",
    "      - 'docker/'",
    "  - name: 'gcr.io/cloud-builders/docker'",
    "    env:",
    "      - 'DOCKER_BUILDKIT=1'",
    "    args:",
    "      - 'build'",
    "      - '--no-cache'",
    "      - '--build-arg'",
    `      - 'SOURCE_DATE_EPOCH=${sourceDateEpoch}'`,
    "      - '--build-arg'",
    `      - 'TEE_NODE_REF=${teeNodeRef}'`,
    "      - '--tag'",
    `      - '${imageUri}'`,
    "      - '--file'",
    "      - 'typescript/Dockerfile'",
    "      - '.'",
    "  - name: 'gcr.io/cloud-builders/docker'",
    "    args:",
    "      - 'run'",
    "      - '--rm'",
    "      - '--entrypoint'",
    "      - 'node'",
    `      - '${imageUri}'`,
    "      - '--input-type=module'",
    "      - '--eval'",
    "      - 'await import(\"/app/extension/dist/app/config.js\")'",
    "  - name: 'gcr.io/cloud-builders/docker'",
    "    env:",
    "      - 'DOCKER_BUILDKIT=1'",
    "    args:",
    "      - 'build'",
    "      - '--no-cache'",
    "      - '--tag'",
    `      - '${proxyImageUri}'`,
    "      - '--file'",
    "      - 'proxy/Dockerfile'",
    "      - '.'",
    "images:",
    `  - '${imageUri}'`,
    `  - '${proxyImageUri}'`,
    "timeout: '1800s'",
    ""
  ].join("\n");
}

module.exports = {
  buildCloudBuildConfig,
  validateBuildOptions
};
