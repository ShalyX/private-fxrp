# Veyra Product Truth Sheet

Locked for the 90-second hackathon demo review cut.

## Identity

- Product: Veyra
- Category: confidential eligibility and reusable access authorization
- Network: Coston2
- Chain ID: `114`
- Confidential compute: Flare Confidential Compute (FCC)
- Public app: `https://veyra-fxrp.web.app/`
- Repository: `https://github.com/ShalyX/private-fxrp`

## Implemented mechanism

1. The configured credential issuer signs EIP-712 credential data.
2. Credential fields are `account`, `jurisdiction`, `investorCategory`,
   `riskScore`, and `expiresAt`.
3. `account` binds the credential to the applicant wallet.
4. The browser fetches the registered TEE public key from the FCC proxy.
5. The browser encrypts the complete access request with geth-compatible ECIES
   before the request is submitted.
6. The FCC extension decrypts the request inside the node boundary.
7. FCC checks the wallet binding, issuer signature, policy rules commitment,
   jurisdiction, investor category, risk ceiling, expiry, and nonce.
8. The FCC result contains the target registry, account, policy ID, rules hash,
   credential issuer, eligibility, USD limit, expiry, and nonce.
9. `AccessRegistry` verifies the registered TEE signer, result target, active
   policy, rules commitment, issuer, eligibility, expiry, and increasing nonce.
10. The stored pass contains `limitUsd`, `expiresAt`, and `nonce`, keyed by
    account and policy.
11. FCC action IDs and decision digests are one-time-use, and nonces must
    increase.
12. `PrivateFXRPVault` requires an active pass before deposits and rejects
    exposure above the pass limit using FTSOv2 XRP/USD pricing.

## Recorded Coston2 evidence

- Deployment manifest block: `33421926`
- Policy ID: `0x68a5c10d48bd9281c62c075d87beb0b5673f8b1eaba8f87dc5a9257267fe402c`
- AccessRegistry: `0xE095076FD5Ba799Cf13b3ac073B7186cCD302174`
- Instruction sender: `0xd8429a3e52cbaE7a7B39768CF5e5778047f9f177`
- Reference FXRP vault: `0xF4092F5b4Ed4A3f9dAF615211719FBeD4e11EeF6`
- FCC extension: `65835`
- Registered TEE signer: `0x7820af00DDB9176150B27edF95D8FB191e555108`
- Registration evidence block: `33637184`
- Recorded live-access evidence block: `33637745`
- Recorded instruction ID: `0x3b878dc622c2dfecc1ca86a06c236a71847c698d1a85309db6f4c7d50ba727b5`
- Recorded request transaction: `0x1864c02eff9903c44265bea52902426ee40f19db14c8012c28ee4c8cb6002ffa`
- Recorded relay transaction: `0xdfa4c938a99ea82351568b44a8a0ce4957f4971a44cad87948e0ae344d6e8c71`
- Recorded frontend result: `PRIVATE_ACCESS_PASS_ISSUED`
- Credential attributes recorded in evidence: `false`
- Plaintext request recorded in evidence: `false`
- Ciphertext recorded in evidence: `false`

## Current capture status

- The public Veyra web app loads successfully.
- Landing, issuer, access, network, and vault views were captured from the
  deployed app.
- The current browser has no wallet extension, so a new issuer signature or
  access request cannot be captured from this session.
- The previously issued pass is no longer active because passes expire.
- The stored Coston2 explorer links currently resolve inconsistently and are
  excluded as visual proof from this cut.
- The registered ngrok FCC endpoint returned HTTP `502` during the capture
  audit. This cut describes the successful access flow as a recorded run, not
  as a fresh transaction performed during recording.

## Approved claims for this cut

- Veyra encrypts the access request in the browser.
- FCC evaluates the issuer-signed credential against the committed policy.
- Only a narrow authorization result is submitted to `AccessRegistry`.
- The registry verifies the registered signer and replay protections.
- A recorded Coston2 run issued a private access pass through FCC extension
  `65835`.
- The TEE registration reached `PRODUCTION` in the recorded evidence.
- The reference vault is implemented to require the pass and enforce the USD
  exposure limit.

## Claims blocked until proof is refreshed

- A fresh access pass was issued during this recording.
- The FCC endpoint is currently healthy.
- The recorded transaction hashes currently resolve correctly in the public
  explorer.
- A successful FXRP vault deposit occurred during this recording.
