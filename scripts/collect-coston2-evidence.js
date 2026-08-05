const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const {
  collectCoston2Evidence
} = require("./lib/coston2-evidence");

function required(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return process.env[name];
}

async function main() {
  const manifestPath = path.resolve(
    process.env.DEPLOYMENT_OUTPUT || "deployments/coston2.json"
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(required("COSTON2_RPC_URL"));
  const evidence = await collectCoston2Evidence(provider, manifest);
  const outputPath = path.resolve(
    process.env.EVIDENCE_OUTPUT || "evidence/coston2.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600
  });
  fs.renameSync(temporary, outputPath);
  console.log(JSON.stringify(evidence, null, 2));
  provider.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
