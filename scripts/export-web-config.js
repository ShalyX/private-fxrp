const fs = require("node:fs");
const path = require("node:path");
const { buildWebEnvironment } = require("./lib/web-config");

function required(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return process.env[name];
}

function main() {
  const manifestPath = path.resolve(
    process.env.DEPLOYMENT_OUTPUT || "deployments/coston2.json"
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const policyRules = JSON.parse(required("POLICY_RULES_JSON"));
  const output = buildWebEnvironment(manifest, policyRules, {
    rpcUrl: process.env.COSTON2_RPC_URL,
    explorerUrl: process.env.EXPLORER_URL,
    instructionFeeWei: process.env.INSTRUCTION_FEE_WEI
  });
  const outputPath = path.resolve(
    process.env.WEB_ENV_OUTPUT || "web/.env.local"
  );
  const temporary = `${outputPath}.tmp`;
  fs.writeFileSync(temporary, output, { mode: 0o600 });
  fs.renameSync(temporary, outputPath);
  console.log(`Wrote verified web configuration to ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
