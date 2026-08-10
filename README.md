# Veyra

Private FXRP access infrastructure.

Confidential policy evaluation and reusable wallet access decisions for FXRP
products on Flare.

**Live Coston2 app:** https://veyra-fxrp.web.app/

Veyra lets an institution prove that a wallet satisfies an
access policy without publishing the underlying jurisdiction, investor
category, or risk score. The resulting onchain pass can be reused by FXRP
products until its limit or expiry is reached.

This repository contains a tested vertical slice:

- Protocol operators commit versioned eligibility rules onchain.
- An issuer signs a wallet-bound credential.
- The applicant encrypts that credential to a confidential-compute key.
- The policy engine verifies the issuer, rule commitment, and private fields.
- A registered TEE signer issues a narrow EIP-712 access decision.
- `AccessRegistry` verifies and stores only the limit, expiry, policy, and nonce.
- `PrivateFXRPVault` consumes that pass and uses FTSOv2 XRP/USD pricing to
  enforce a USD exposure limit.

## Architecture

| Component | Responsibility |
| --- | --- |
| `PolicyRegistry` | Operator-owned policy commitments and revocation |
| `policy-engine.js` | Local confidential-compute implementation and crypto |
| `fcc-extension/` | Official Flare FCE scaffold with TypeScript policy handler |
| `PrivateAccessInstructionSender` | Routes encrypted requests through the FCC manager |
| `AccessRegistry` | TEE signer verification, replay protection, access passes |
| `FtsoV2XrpUsdOracle` | XRP/USD block-latency feed with freshness checks |
| `PrivateFXRPVault` | Reference FXRP consumer with USD-denominated limits |

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm test
npm run demo
```

The demo deploys the complete system to an ephemeral Hardhat chain, encrypts
and evaluates a credential, submits the signed decision, and deposits mock FXRP.
It prints only the narrow public decision and transaction evidence.

## Run the Access Desk

The production web client lives in `web/`. For a deployed environment, generate
`web/.env.local` from the Coston2 deployment manifest with
`npm run export:web:coston2`; the exporter verifies that `POLICY_RULES_JSON`
matches the committed policy hash.
`EXT_PROXY_URL` is server-only and must point to the registered FCC extension
proxy.

```bash
cd web
npm ci
npm run dev
```

The client verifies the connected wallet, issuer signature, active policy, and
rules commitment before enabling an access request. It fetches the registered
TEE public key through the same-origin API, performs Geth-compatible ECIES
encryption in the browser, submits the ciphertext, polls the signed FCC result,
and relays the result into `AccessRegistry`. The vault panel supports approval,
deposit, and withdrawal against the resulting access pass.

The issuer workspace completes the reference flow. The configured policy issuer
can enter verified applicant attributes, sign the wallet-bound EIP-712
credential with its browser wallet, and export the resulting JSON package for
private delivery. The application does not store issuer inputs or credential
packages; production identity verification and source records remain in the
issuer's own system.

For a production build:

```bash
npm run build
npm start
```

The included server applies security headers and rate limits, serves the static
build, and exposes only the required FCC proxy reads.

## Verify the FCC extension

The official scaffold's TypeScript dependencies are installed separately:

```bash
cd fcc-extension/typescript
npm ci
cd ../..
npm run check:fcc
npm run test:fcc:conformance
```

The handler uses tee-node's private `/decrypt` interface and returns an
ABI-encoded decision inside the signed FCC `ActionResult`. `AccessRegistry`
reconstructs that envelope hash onchain before accepting the decision.

## Deploy to Coston2

Set the variables listed in `.env.example` through your shell or secret manager.
Never commit private keys.

```bash
export COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
export DEPLOYER_ADDRESS=<funded Coston2 EOA>
export POLICY_ISSUER_ADDRESS=...
export POLICY_RULES_JSON='{"allowedJurisdictions":["GB","NG"],"minimumInvestorCategory":2,"maximumRiskScore":40,"limitByCategory":{"2":"25000000000","3":"100000000000"}}'
npm run preflight:coston2
npm run ready:deployer:coston2
# Inject DEPLOYER_PRIVATE_KEY through your secret manager.
npm run deploy:coston2
```

For the configured hackathon wallets, the secure interactive launcher prompts
for the deployer key with terminal echo disabled, verifies the public deployer
and funding gate, and deploys without writing the key to disk or shell history:

```bash
npm run deploy:coston2:secure
```

The signer-free preflight resolves `AssetManagerFXRP` through the
`FlareContractsRegistry`, then resolves FXRP through `fAsset()`. It validates
the chain ID and bytecode for the registry, AssetManager, FXRP, FTSOv2, and FCC
manager and records code hashes in `deployments/coston2-preflight.json`.
`FXRP_ADDRESS` is optional; when set, it acts as a safety pin and must match the
onchain result. Deployment repeats the same checks before sending a transaction
and writes an atomic manifest to `deployments/coston2.json`.
The deployer readiness command requires only the public deployer address. It
rejects contract accounts, checks pending nonce and live fee data, and applies a
25% buffer to the configured deployment gas budget. Deployment then verifies
that the injected private key resolves to the same pinned address.

Generate the matching frontend environment after deployment:

```bash
npm run export:web:coston2
```

FCC registration remains an explicit protocol phase because the official
scaffold performs container measurement and TEE registration outside Hardhat.
Reuse the sender from the deployment manifest rather than deploying the
scaffold's example sender:

```bash
cd fcc-extension
export CHAIN=coston2
export LOCAL_MODE=false
export CHAIN_URL="$COSTON2_RPC_URL"
export EXISTING_INSTRUCTION_SENDER=<privateAccessInstructionSender from manifest>
./scripts/pre-build.sh
./scripts/start-services.sh --chain coston2
./scripts/post-build.sh
cd ..
export TEE_SIGNER_ADDRESS=<registered FCC TEE signing address>
npm run finalize:fcc:coston2
```

Finalization resolves the registered extension ID onchain, optionally
registers the TEE signer with `AccessRegistry`, and updates the same manifest.
Private keys belong in environment variables or a secret manager, never in the
manifest or shell history.

After finalization, collect reproducible Coston2 evidence:

```bash
npm run evidence:coston2
```

The collector verifies deployed bytecode, contract wiring, policy state, FCC
extension and signer state, and successful transaction receipts. It writes the
block-anchored result atomically to `evidence/coston2.json`. The checked-in
`deployments/coston2.json` records the deployed contracts and CLI proof, while
`evidence/coston2-frontend-live-access.json` records a separate successful flow
from the public frontend without retaining private credential fields.

## Live Coston2 proof

- FCC extension `65835` is registered and the TEE machine is in `PRODUCTION`.
- TEE signer: `0x7820af00DDB9176150B27edF95D8FB191e555108`
- Frontend request transaction:
  `0x0c9d0b18ee4f62440e89b795c24bf57b374018d12268cad3ab63aabbe5625f77`
- Frontend relay transaction:
  `0xdbe8d29147da5677fe158bd004b8f421647780ec756aff8d32b2429768262030`
- Access registry: `0xE095076FD5Ba799Cf13b3ac073B7186cCD302174`
- Reference vault: `0xF4092F5b4Ed4A3f9dAF615211719FBeD4e11EeF6`

See [`SUBMISSION.md`](SUBMISSION.md) for the judge-facing overview and
[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the demo path.

## Security properties

- AES-256-GCM authenticates encrypted credential payloads.
- secp256k1 ECDH derives a unique encryption key per request.
- Issuer signatures bind credentials to the applicant wallet.
- Policy fields must match the committed onchain `rulesHash`.
- Decisions are EIP-712 bound to chain ID and `AccessRegistry`.
- Only registered TEE signers are accepted.
- Used decisions and non-increasing nonces are rejected.
- Oracle values must be non-zero and fresh.
- Withdrawals do not depend on continued eligibility.

## Current readiness

The contracts, policy engine, FCC extension, oracle adapter, deployment tools,
web application, and security behavior are automated-test covered. The full
flow has been exercised from the public frontend on Coston2, including local
credential encryption, FCC evaluation, TEE-signed decision relay, and access
pass issuance. The contracts have not been audited.

The shipped web and FCC dependency trees and the root runtime dependency tree
pass high-severity npm audits. Hardhat 2's development-only dependency graph
still reports upstream advisories; migrating the CommonJS deployment/test
tooling to Hardhat 3 remains a separate hardening task rather than an automatic
breaking upgrade.

This is a public Coston2 testnet deployment, not a mainnet or audited real-capital
product. The FCC extension is registered as extension `65835`; its simulated TEE
is in `PRODUCTION`, which is the hackathon-supported Coston2 configuration. A
mainnet release would require production identity-provider integrations,
independent contract and infrastructure audits, operational monitoring, key
rotation, incident response, and a hardware-backed confidential-compute rollout.
