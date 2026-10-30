# Adjudication and concurrent-review safeguards

This change extends Northline Atelier's **synthetic, loopback-only** work-order demo. It does **not** introduce production authentication or multi-user identity.

## Candidate-level rejection

The specification ledger presents a reasoned **Reject claim** action for each direct assertion. The reason (3–300 characters), demo reviewer label, and timestamp are stored in `job.candidateReviews[candidateId]`. Quoted history and questions remain evidence, but cannot be rejected through this action because they were never actionable assertions.

Rejected assertions remain fully visible and source-linked. They are excluded from active source conflicts, cannot be confirmed, and can be restored. Each substantive reject or restore also appends a timestamped event to `job.candidateReviewEvents`, preserving the original rejection rationale after a restoration. The ledger displays this journal beneath its corresponding source claim. Rejecting a selected candidate clears that field's current resolution so a reviewer cannot unintentionally release an invalidated decision. The rejection itself is reflected in the Contrast Room, including changes since approval. The ordinary audit table receives action metadata without raw source text or rejection rationale.

On approval the exact adjudication map is copied into `WorkOrderRevision.candidateReviewSnapshot`. Previous approval snapshots are not mutated. New post-approval adjudications create a visible change review even when specification values are otherwise unchanged.

## Optimistic concurrency

Each persisted job has an integer `version` starting at 1. All **existing-job** write endpoints require `expectedVersion`, including `import`, `pdf`, `resolve`, `review-candidate`, and `approve`.

- Missing or malformed precondition: HTTP **428**, `code: VERSION_REQUIRED`
- Stale version: HTTP **409**, `code: STALE_WRITE`, `currentVersion`
- Successful substantive mutation: version increments by one
- Idempotent duplicate import or unchanged decision: version does not increment

The server checks the precondition before attempting the mutation and uses a conditional SQLite `UPDATE` against the saved version. The browser includes the version it originally displayed. On 409 it refreshes the case, displays a conflict message, and **does not automatically replay** the stale action.

Previously saved database JSON objects lacking a version or candidate-review map are read as version 1 with no rejections; the next successful mutation persists these fields. The schema remains the original jobs table containing JSON; this is a local proof of the concurrency contract, not a full multi-actor event store.

## Verification

`npm test` exercises rejected-candidate readiness, snapshot isolation and comparison deltas. The GitHub Actions integration script runs the SQLite-backed server and verifies precondition enforcement, two-session stale writes, invalid cross-field candidate references, duplicate-import idempotency, approval snapshots and PDF evidence.

## Critical limits

**This is not production authorization.** `role: reviewer` remains a client-selected demo role. A browser visitor can claim that role. Do not expose the server on the internet or use it to release real manufacturing work orders.

Before production: identity and organization-scoped authorization derived from authenticated server sessions; durable actor attribution; CSRF and authenticated session controls; version-aware authentication for all writes; full audit integrity; more robust domain feasibility rules; controlled data retention, backup and recovery; and a formal migration plan for multi-organization data.

No external messages are sent; all examples and approvals are synthetic.
