const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const {
  loadCoston2PreflightConfig
} = require("./lib/coston2-config");
const { runCoston2Preflight } = require("./lib/coston2-protocol");

function required(env, name) {
  if (!env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return env[name];
}

function writeJson(outputPath, value) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  });
  fs.renameSync(temporary, resolved);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(
    required(process.env, "COSTON2_RPC_URL")
  );
  const report = await runCoston2Preflight(
    provider,
    loadCoston2PreflightConfig()
  );
  const outputPath =
    process.env.PREFLIGHT_OUTPUT || "deployments/coston2-preflight.json";
  writeJson(outputPath, report);
  console.log(JSON.stringify(report, null, 2));
  provider.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
