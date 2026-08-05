# Private FXRP Access Desk

## One-line pitch

Privacy-preserving eligibility checks that issue reusable, wallet-bound access
passes for FXRP products without putting investor attributes onchain.

## Problem

Institutions and regulated applications need to enforce jurisdiction, investor
category, risk, and exposure rules before granting access to yield vaults or
other FXRP products. Publishing those attributes onchain creates a permanent
privacy leak. Rechecking them inside every product also fragments policy logic
and forces each operator to handle sensitive data.

## Solution

Private FXRP Access Desk separates private evaluation from public enforcement:

1. An operator commits a versioned policy hash on Coston2.
2. A trusted issuer signs a credential bound to the applicant wallet.
3. The browser encrypts the credential directly to the FCC TEE public key.
4. The FCC extension decrypts and evaluates the private fields.
5. A registered TEE signs only the narrow result: wallet, policy, limit, expiry,
   and nonce.
6. `AccessRegistry` verifies that result and stores a reusable access pass.
7. FXRP applications consume the pass without seeing the original credential.

The reference vault converts deposits to USD using Flare FTSOv2 XRP/USD data and
enforces the pass limit onchain.

## Why it matters beyond the hackathon

This is shared access-control infrastructure, not a vault-specific allowlist.
Lenders, vaults, OTC desks, tokenized funds, and institutional frontends can all
consume the same narrowly scoped pass while keeping private attributes out of
their contracts and databases. Operators can revoke or replace policy versions,
and applications receive deterministic onchain enforcement.

## Flare integration

- **Flare Confidential Compute:** encrypted policy evaluation and TEE-signed
  decisions through a registered FCC extension.
- **FTSOv2:** fresh XRP/USD pricing for USD-denominated FXRP exposure limits.
- **FAssets / FXRP:** the reference consumer resolves and uses Coston2 FTestXRP.
- **Coston2 contracts:** policy commitment, replay-safe access registry,
  instruction sender, oracle adapter, and reference vault.

## Live deployment

- App: https://private-fxrp-access-desk-351242117184.us-west1.run.app/
- Network: Coston2, chain ID `114`
- FCC extension: `65835`
- TEE status: `PRODUCTION`
- TEE signer: `0x7820af00DDB9176150B27edF95D8FB191e555108`
- Policy registry: `0x188D706c69835826c4cc92616A959CA8b636Fb8b`
- Access registry: `0xE095076FD5Ba799Cf13b3ac073B7186cCD302174`
- Instruction sender: `0xd8429a3e52cbaE7a7B39768CF5e5778047f9f177`
- Reference vault: `0xF4092F5b4Ed4A3f9dAF615211719FBeD4e11EeF6`

## Verifiable frontend proof

A complete request was submitted from the public web app and produced a private
access pass:

- Request transaction:
  `0x0c9d0b18ee4f62440e89b795c24bf57b374018d12268cad3ab63aabbe5625f77`
- Relay transaction:
  `0xdbe8d29147da5677fe158bd004b8f421647780ec756aff8d32b2429768262030`
- Result: `PRIVATE_ACCESS_PASS_ISSUED`

The evidence record deliberately contains no credential attributes, plaintext
request, or ciphertext. See `evidence/coston2-frontend-live-access.json`.

## Security design

- Browser-side Geth-compatible ECIES encryption to the verified TEE public key.
- Issuer EIP-712 signatures bind credentials to the applicant wallet.
- Onchain policy commitments prevent the evaluator from silently changing rules.
- TEE EIP-712 decisions are bound to chain ID and `AccessRegistry`.
- Registered signer checks, decision replay protection, and monotonic nonces.
- Fresh, non-zero FTSOv2 price enforcement.
- Withdrawals remain available after access expires or is revoked.
- Security headers, request validation, same-origin FCC reads, and rate limits in
  the public web service.

## Readiness boundary

The end-to-end path is live and verified on Coston2. The FCC simulated TEE is in
`PRODUCTION`, consistent with the hackathon's testnet configuration. This is not
an audited mainnet deployment and should not hold real capital. Production use
would add regulated issuer integrations, hardware-backed confidential compute,
independent audits, monitoring, key rotation, and incident-response controls.
