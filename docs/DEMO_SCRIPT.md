# Demo Script

Target length: 3 minutes.

## 1. Set up the problem

Open the live app and explain: an FXRP product needs to know whether a wallet is
eligible and how much exposure it may take, but it should not learn or publish
the applicant's jurisdiction, category, or risk score.

## 2. Show the committed policy

Connect a wallet on Coston2. Point out the active policy, issuer, access registry,
and live FCC status. Explain that the plaintext rules are checked against the
policy hash committed onchain.

## 3. Issue a credential

In the issuer workspace, enter eligible test attributes and sign the
wallet-bound credential. Export the credential package and switch back to the
applicant view. The demo issuer is a separate role from the applicant even when
one test wallet is used to keep the live walkthrough short.

## 4. Request private access

Import the credential and submit the request. Narrate the visible stages:

1. The browser verifies the credential and encrypts it to the TEE key.
2. The encrypted instruction is sent through the FCC manager.
3. The confidential extension evaluates the private fields.
4. The registered TEE signs a narrow decision.
5. The app relays that decision to `AccessRegistry`.

Emphasize that the public result includes only the wallet, policy, limit, expiry,
and nonce.

## 5. Show proof and reuse

Show the issued access pass and both transaction links. Open the vault panel to
show that a separate FXRP product can consume the same pass. Explain that FTSOv2
XRP/USD pricing converts the token amount to USD before enforcing the limit.

## 6. Close with the boundary

The complete flow is live on Coston2 with FCC extension `65835` and a TEE machine
in `PRODUCTION`. It is a testnet deployment using the hackathon-supported
simulated TEE, not an audited mainnet product.

## Backup proof

- Live app: https://private-fxrp-access-desk-351242117184.us-west1.run.app/
- Request transaction:
  `0x0c9d0b18ee4f62440e89b795c24bf57b374018d12268cad3ab63aabbe5625f77`
- Relay transaction:
  `0xdbe8d29147da5677fe158bd004b8f421647780ec756aff8d32b2429768262030`
- Evidence file: `evidence/coston2-frontend-live-access.json`
