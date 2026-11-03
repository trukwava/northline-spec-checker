# Northline release receipts: verifiable local consistency

Northline Atelier now seals **new** synthetic approvals with a SHA-256 digest that covers an approved release's identity, revision number, time, synthetic reviewer label and ID, schema version, full reviewed specification, rejection snapshot, ordered source IDs, and SHA-256 digests of each referenced source's preserved **text**.

A stable canonical serializer recursively sorts object keys and preserves array ordering, so JSON property insertion order does not create false integrity warnings. The receipt uses the versioned format `northline-receipt-v1`, algorithm `SHA-256`, and stores a `sourceHashes` manifest. The server verifies the receipt each time it returns a case, and it provides `GET /api/jobs/:id/releases/:zeroBasedIndex/verify` to authenticated demo users.

Statuses: **verified** means the current release and referenced source text match the stored receipt; **mismatch** means data is missing or different, or the receipt is malformed; **legacy** means an earlier approval has no receipt and cannot be retroactively claimed as verified. Later imported source messages or edits to the *draft* do not invalidate an older release's fingerprint. The release archive labels all three conditions; on mismatch the browser refuses to export the affected snapshot. HTML production sheets display the full release fingerprint.

Important limitations: this is a **self-contained consistency checksum, not a digital signature**. Anyone who can modify the database can rewrite the receipt as well. There is no external timestamp service, secret signing key, append-only storage, external witness, key custody, or independent audit assurance. It does not prove that an order is manufacturable or that the approving individual was genuinely identified. For PDF imports the checksum covers extracted text, **not the original PDF binary** (which this demo does not retain). Source contents must remain in the database for verification.

The API is still restricted to loopback and synthetic demo accounts. Do not use this to approve real work orders, represent it as tamper-proof, or expose it publicly.

Tests cover source text changes, approved specification changes, key-order invariance, missing source data, legacy releases, late evidence, successful API verification, and rendered browser receipt state.

## Exporting and checking an evidence packet without the app

The release archive's **Evidence packet** control downloads a JSON document containing the approved release and the exact source text referenced at sign-off. It does not include passwords, session cookies or unrelated source records. Treat exported source text as potentially sensitive in a real deployment (this demo only uses synthetic material).

From a local checkout of the repository, run:

```sh
node --experimental-strip-types scripts/verify-bundle.ts NL-1041-revision-1.bundle
```

The CLI returns **VERIFIED** with the digest and exit code 0 only when the packet's source list and the fingerprint match. A mismatch returns exit code 1; a legacy unsealed release returns exit code 2. This is independent recomputation using the same public canonicalization algorithm, not third-party attestation. The bundle includes a synthetic case name/ID for presentation but the fingerprint authenticates only the release fields and referenced source text, **not the outer case envelope**.

The offline CLI is deliberately dependency-free and does not contact an external service. It cannot detect an adversary who changes both the packet and its checksum or who substitutes an entirely forged but internally consistent packet. A production system needs a trusted external signature/witness and secure distribution of public verification keys.


## Signed attestations

New approvals include a separate Ed25519 attestation binding this receipt to the case, revision and synthetic reviewer. This digital signature is not the same as the receipt: its embedded public key can verify the signature mathematically, but is not evidence that the signer is trustworthy. The offline verifier accepts `--trusted-public-key pinned.pem` and returns success only when the SHA-256 receipt and signature match the separately pinned key. See [SIGNED_ATTESTATIONS.md](SIGNED_ATTESTATIONS.md) for algorithms, key custody, exit codes and limitations. Legacy releases are not retroactively signed.
