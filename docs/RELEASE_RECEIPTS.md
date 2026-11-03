# Northline release receipts: verifiable local consistency

Northline Atelier now seals **new** synthetic approvals with a SHA-256 digest that covers an approved release's identity, revision number, time, synthetic reviewer label and ID, schema version, full reviewed specification, rejection snapshot, ordered source IDs, and SHA-256 digests of each referenced source's preserved **text**.

A stable canonical serializer recursively sorts object keys and preserves array ordering, so JSON property insertion order does not create false integrity warnings. The receipt uses the versioned format `northline-receipt-v1`, algorithm `SHA-256`, and stores a `sourceHashes` manifest. The server verifies the receipt each time it returns a case, and it provides `GET /api/jobs/:id/releases/:zeroBasedIndex/verify` to authenticated demo users.

Statuses: **verified** means the current release and referenced source text match the stored receipt; **mismatch** means data is missing or different, or the receipt is malformed; **legacy** means an earlier approval has no receipt and cannot be retroactively claimed as verified. Later imported source messages or edits to the *draft* do not invalidate an older release's fingerprint. The release archive labels all three conditions; on mismatch the browser refuses to export the affected snapshot. HTML production sheets display the full release fingerprint.

Important limitations: this is a **self-contained consistency checksum, not a digital signature**. Anyone who can modify the database can rewrite the receipt as well. There is no external timestamp service, secret signing key, append-only storage, external witness, key custody, or independent audit assurance. It does not prove that an order is manufacturable or that the approving individual was genuinely identified. For PDF imports the checksum covers extracted text, **not the original PDF binary** (which this demo does not retain). Source contents must remain in the database for verification.

The API is still restricted to loopback and synthetic demo accounts. Do not use this to approve real work orders, represent it as tamper-proof, or expose it publicly.

Tests cover source text changes, approved specification changes, key-order invariance, missing source data, legacy releases, late evidence, successful API verification, and rendered browser receipt state.
