# 90-Second Hackathon Demo Video

## Recording format

- Screen-only capture, 16:9, 1080p if available.
- Keep the browser at 100% zoom.
- Use the live app: `https://private-fxrp-access-desk-351242117184.us-west1.run.app/`
- Hide browser bookmarks and personal notifications.
- Use Coston2 testnet only; do not show private keys or credential plaintext.

## Timeline and narration

### 0:00–0:08 — Problem

**Show:** Landing view with the policy and privacy copy visible.

**Say:**

> FXRP and DeFi applications need to enforce eligibility and exposure rules, but they should not receive or publish a user’s private jurisdiction, risk score, or investor category.

### 0:08–0:18 — Product

**Show:** Policy panel, issuer status, and Coston2/FCC status.

**Say:**

> Private FXRP Access Desk separates private evaluation from public enforcement. An issuer signs a wallet-bound credential, and the applicant controls the request from the browser.

### 0:18–0:32 — Issuer credential

**Show:** Issuer workspace. Enter the eligible demo attributes and sign the credential. Do not pause on sensitive values longer than necessary.

**Say:**

> The issuer creates a credential containing the applicant’s private attributes. The credential is bound to this wallet and the committed policy, so it cannot be reused for another account or silently changed.

### 0:32–0:45 — Local encryption

**Show:** Import the credential package and click the access request button. Keep the workflow activity visible.

**Say:**

> Before leaving the browser, the credential is encrypted to the registered FCC TEE public key. The plaintext attributes are not sent to the frontend server or written onchain.

### 0:45–1:00 — Confidential decision

**Show:** Activity steps progressing through encrypted request, confidential evaluation, and wallet approval.

**Say:**

> Flare Confidential Compute evaluates the encrypted request. The TEE returns a narrow signed decision: the wallet, policy, approved limit, expiry, and nonce—not the underlying credential.

### 1:00–1:12 — Onchain pass

**Show:** Issued access pass and the transaction links.

**Say:**

> AccessRegistry verifies the TEE signer, prevents replay, and stores the reusable access pass. Any compatible FXRP application can enforce that pass without seeing the user’s private attributes.

### 1:12–1:24 — FXRP use case

**Show:** Vault panel and the deposit/limit interface. Do not send a second transaction unless the wallet is already funded for the demo.

**Say:**

> The reference FXRP vault uses Flare FTSOv2 XRP/USD pricing to enforce the approved dollar exposure limit onchain. This same pattern can protect lending markets, vaults, OTC desks, and institutional products.

### 1:24–1:30 — Proof and close

**Show:** Final pass state, FCC `PRODUCTION` status, and one transaction link.

**Say:**

> This is a live Coston2 deployment using FCC extension 65835. Private FXRP Access Desk turns confidential eligibility into a composable access primitive for Flare applications.

## End card

```text
Private FXRP Access Desk
Confidential eligibility for FXRP applications

Coston2 • Flare Confidential Compute • FTSOv2
private-fxrp-access-desk-351242117184.us-west1.run.app
```

## Capture checklist

- Start recording before opening the live app.
- Use a test credential only.
- Never show private keys, Secret Manager values, terminal history, or raw credential JSON.
- If the wallet approval takes longer than the narration, cut that pause during editing.
- End on the issued pass and transaction proof, not on a loading state.
