# Signed release attestations — Ed25519

The release receipt remains a reproducible SHA-256 self-consistency checksum. A **new** approved release additionally carries a `northline-attestation-v1` Ed25519 signature over canonical claims: fixed synthetic organization, case ID, release ID and number, receipt SHA-256, approval timestamp, synthetic account label/ID and signer public-key fingerprint. Keys are identified by SHA-256 of their SPKI DER-encoded public key. The signature uses Node's Ed25519 implementation and canonical sorted-key JSON.

**Mathematical validity is not trusted identity.** Anybody can create an Ed25519 key pair and sign a forged packet. Matching the embedded public key yields **SIGNATURE VALID · SIGNER NOT TRUSTED**, never a trusted-signature badge in the browser. An independently distributed and pinned public key is needed to evaluate signer trust. Downloading a key from the same app or the packet being verified is not independent trust.

## Demo signing keys

By default, a new ephemeral Ed25519 private key is generated each time the local server starts. Only its **public key fingerprint** is printed in the terminal, never the private key. Earlier signatures retain their embedded public keys and remain mathematically verifiable, but new releases after a restart use a new signer.

To use a stable demo signing identity, generate and retain a private key **outside the repository**:

```sh
openssl genpkey -algorithm ED25519 -out /safe/private/northline-ed25519.pem
openssl pkey -in /safe/private/northline-ed25519.pem -pubout -out /safe/trusted/northline-public.pem
NORTHLINE_ATTESTATION_PRIVATE_KEY_FILE=/safe/private/northline-ed25519.pem npm start
```

Protect the private PEM and establish trust in its public-key fingerprint through an independent channel. The authenticated `GET /api/attestation-public-key` endpoint returns the currently active key and public fingerprint, but does **not** create external trust. The release archive can export the specific release's public PEM for inspection.

## Independently verify a packet

Download an approved **Evidence packet** and run:

```sh
node --experimental-strip-types scripts/verify-bundle.ts evidence.json --trusted-public-key /trusted/pinned-public.pem
```

- Exit **0**: SHA-256 receipt matches all referenced source text and released values, and Ed25519 signature matches the independently pinned public key
- Exit **1**: checksum mismatch, forged/malformed signature, or signing key differs from the pinned key
- Exit **2**: historical unsigned approval or no SHA-256 receipt
- Exit **3**: internally valid signature with no independently pinned trusted key supplied

The explicit `--receipt-only` flag reproduces the older checksum-only check (exit 0 when it matches), without any identity assurance. Existing unsigned releases do not acquire retroactive signatures.

## Boundary

This remains a **synthetic loopback demonstration**, not workforce identity verification. Cryptographic possession of a private key does not prove which employee authorized the action. This prototype lacks hardware-backed key custody, independent timestamping, revocation registry, real organization membership, verified account identities, production approval policy and external audit witnessing. Source checks cover preserved text, not PDF binary originals. No real manufacturing release or compliance claim is warranted.
