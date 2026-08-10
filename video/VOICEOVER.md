# Veyra 90-Second Voiceover

Target pace: approximately 125 words per minute with deliberate pauses.

Protocols often need to know whether a wallet meets jurisdiction, risk, or
investor requirements. They should not need the underlying credential.

Veyra separates private eligibility from public enforcement. An authorized
issuer signs a wallet-bound credential containing the applicant's jurisdiction,
category, risk score, and expiry.

In the browser, Veyra retrieves the registered TEE public key and encrypts the
full request before it leaves the device.

Flare Confidential Compute decrypts it inside the confidential boundary,
verifies the issuer and committed policy, and evaluates the private fields.
Only a narrow result leaves: account, policy, eligibility, approved limit,
expiry, and nonce.

AccessRegistry verifies the registered signer, policy commitment, issuer,
expiry, and replay state before recording the pass.

A recorded Coston2 run issued the access pass through FCC, with the TEE
registered as production.

The reference FXRP vault requires that pass before accepting deposits and
enforces the approved dollar exposure limit with FTSOv2 pricing.

Applications consume the authorization, not the private credential.

Veyra. Prove eligibility. Not identity. Try it at veyra-fxrp dot web dot app.
