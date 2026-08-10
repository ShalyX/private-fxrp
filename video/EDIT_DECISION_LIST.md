# Veyra 90-Second Edit Decision List

Status: approved for production. Runtime: exactly 90 seconds. Format: 1920x1080,
30 fps, 16:9. Truth authority: `PRODUCT_TRUTH_SHEET.md`.

## Global Motion Rules

- Use hard or eight-frame eased cuts; no decorative wipes.
- UI movement is a restrained 100%-102% push unless a proof crop is specified.
- Designed cards enter with a 10-frame opacity rise and 16-pixel vertical settle.
- Headlines resolve before supporting copy; evidence qualifiers never fade early.
- Do not animate unverified hashes, statuses, deposits, or endpoint health.
- Keep UI text readable at 100% playback and preserve the real Veyra interface.

## Shot List

| # | In-Out | Dur. | Picture and camera | On-screen text | Voiceover sync | Sound cue | Required source |
|---:|---|---:|---|---|---|---|---|
| 01 | 00:00-00:06 | 6s | Designed problem card. Start at 100%, push to 101.5%. Eight-frame fade from white; hard cut out. | `Should private facts become public just to prove access?` Supporting line remains visible from 00:02. | “Protocols often need to know whether a wallet meets jurisdiction, risk, or investor requirements.” | Low pulse at 00:00; soft tonal rise at 00:04. | `assets/graphics/problem.svg` |
| 02 | 00:06-00:14 | 8s | Real landing UI. Full product view with a 100%-102% center push. Match cut from problem card. | `LIVE WEB APP` and Veyra value proposition. | “They should not need the underlying credential. Veyra separates private eligibility from public enforcement.” | Add restrained interface texture; no click sounds. | `assets/captures/landing-hero.jpg` |
| 03 | 00:14-00:24 | 10s | Real issuer workspace. Hold first 2s, then push toward the credential form while preserving page context. | `ISSUER WORKFLOW`; wallet-bound credential caption. | “An authorized issuer signs a wallet-bound credential containing the applicant's jurisdiction, category, risk score, and expiry.” | One muted confirmation tone as the caption resolves. | `assets/captures/issuer-workspace.jpg` |
| 04 | 00:24-00:32 | 8s | Designed browser-encryption mechanism. Credential card to ciphertext, left-to-right visual causality. | `Encrypted in the browser`; `Encrypted to the registered TEE public key`. | “In the browser, Veyra retrieves the registered TEE public key and encrypts the full request before it leaves the device.” | Short filtered sweep from credential to ciphertext. | `assets/graphics/encryption.svg` |
| 05 | 00:32-00:44 | 12s | FCC mechanism card. Start wide; push 2% into the dark FCC boundary. Steps remain sequentially readable. | `Flare Confidential Compute`; four verification steps. | “Flare Confidential Compute decrypts it inside the confidential boundary, verifies the issuer and committed policy, and evaluates the private fields.” | Deeper bed enters at 00:32; four quiet ticks align to verification steps. | `assets/graphics/fcc.svg` |
| 06 | 00:44-00:52 | 8s | Narrow-decision card. Settle from 16px below; hold all output fields for at least 5s. | `Only the decision leaves FCC`; account, policy, eligible, limit, expiry, nonce, signature. | “Only a narrow result leaves: account, policy, eligibility, approved limit, expiry, and nonce.” | Confidential-boundary tone resolves into a clean confirmation note. | `assets/graphics/decision.svg` |
| 07 | 00:52-01:01 | 9s | Real Access Desk UI. Start on workflow rail, push toward the private-check and pass area without implying a fresh transaction. | `IMPLEMENTED ACCESS FLOW`; registry verification caption. | “AccessRegistry verifies the registered signer, policy commitment, issuer, expiry, and replay state before recording the pass.” | Subtle mechanical pulse; no transaction-success sound. | `assets/captures/access-workspace.jpg` |
| 08 | 01:01-01:09 | 8s | Recorded evidence frame. Persistent full-width evidence banner from first to last frame. No fade or crop may remove it. | `RECORDED COSTON2 RUN · 2026-08-05`; `Private access pass issued`; extension `65835`; evidence block `33,637,745`; recorded hashes. | “A recorded Coston2 run issued the access pass through FCC...” | One restrained success tone at 01:02; hold ambience underneath. | `assets/graphics/recorded-proof.svg` and `evidence/coston2-frontend-live-access.json` |
| 09 | 01:09-01:11 | 2s | First real-UI proof crop: magnify the actual `Coston2 testnet` label. Cut directly from recorded evidence. | `RECORDED REGISTRATION · COSTON2 TESTNET`. | “...with the TEE...” | Proof pulse 1 of 3. | `assets/captures/network-production.jpg` |
| 10 | 01:11-01:13 | 2s | Second real-UI proof crop: magnify actual `FCC extension #65835` and evidence block. | `RECORDED REGISTRATION · FCC EXTENSION 65835`. | VO continues without pause. | Proof pulse 2 of 3. | `assets/captures/network-production.jpg` |
| 11 | 01:13-01:16 | 3s | Third real-UI proof crop: magnify the actual green `PRODUCTION` badge. Hold it for at least 2s. | `RECORDED REGISTRATION · PRODUCTION`. | “...registered as production.” | Proof pulse 3 resolves brighter, then drops. | `assets/captures/network-production.jpg` |
| 12 | 01:16-01:20 | 4s | Real vault UI showing `Not issued`. Preserve the disabled deposit control and current state. | `REFERENCE CONSUMER · CURRENT PASS EXPIRED`; `Without an active pass, deposits remain unavailable.` | “The reference FXRP vault requires that pass before accepting deposits...” | Low rejection tone; no error alarm. | `assets/captures/fxrp-vault.jpg` |
| 13 | 01:20-01:24 | 4s | Implemented enforcement diagram. Left-to-right causal read from pass to `canAccess()` to vault checks. | `canAccess() → active pass + policy → limit enforcement`. | “...and enforces the approved dollar exposure limit with FTSOv2 pricing. Applications consume the authorization, not the private credential.” | Four compact ticks follow the vault steps. | `assets/graphics/consumer.svg` |
| 14 | 01:24-01:30 | 6s | Veyra end card. Logo and name settle first; URL enters at 01:26 and holds through final frame. | `Veyra`; `Prove eligibility. Not identity.`; `veyra-fxrp.web.app`. | “Veyra. Prove eligibility. Not identity. Try it at veyra-fxrp dot web dot app.” | Brand resolve at 01:24; bed fades from 01:27 to silence. | `assets/graphics/cta.svg` and `web/public/veyra-mark.png` |

## Evidence Locks

- Shot 08 must carry the recorded-run date qualifier for its full eight seconds.
- Shots 09-11 magnify the real captured UI; do not recreate the evidence values.
- Shot 12 treats `Not issued` as current expired-pass enforcement, not as the state
  of the historical pass in Shot 08.
- The film does not claim a fresh issuance, a currently healthy FCC endpoint, a
  resolving explorer link, or a successful vault deposit during this recording.
