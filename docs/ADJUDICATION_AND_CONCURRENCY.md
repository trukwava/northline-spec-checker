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

**Synthetic accounts are not verified employee identities.** The loopback server now grants authority through short-lived, revocable sessions attached to fixed demo accounts rather than through a role field in request bodies. There is no real employee verification, identity provider, or account provisioning; production use remains prohibited.

Before production: identity and organization-scoped authorization derived from authenticated server sessions; durable actor attribution; CSRF and authenticated session controls; version-aware authentication for all writes; full audit integrity; more robust domain feasibility rules; controlled data retention, backup and recovery; and a formal migration plan for multi-organization data.

No external messages are sent; all examples and approvals are synthetic.

## Synthetic account sessions

`POST /api/login` accepts one of two local demo account IDs (`coordinator`, `reviewer`) and the corresponding random bootstrap password printed by the server when it starts. Session tokens are random 256-bit values delivered as HTTP-only, SameSite=Strict cookies restricted to `/api`. Tokens are stored by hash in an in-memory server map and expire after 30 minutes. `GET /api/session` returns the current synthetic account and CSRF token; `POST /api/logout` revokes it immediately. Protected mutations require `X-Northline-CSRF` as well as the session cookie. Missing or expired sessions return HTTP 401, missing/invalid CSRF returns HTTP 403. The reviewer account can approve or reset; the coordinator cannot, even if it forges a reviewer role in JSON.

Configured demo passwords (`NORTHLINE_COORDINATOR_KEY`, `NORTHLINE_REVIEWER_KEY`) must be distinct 32–256 character printable ASCII strings without spaces; these environment variable names are retained for compatibility with the previous local-key development scripts. The bootstrap passwords are salted and hashed with Node's scrypt before verification. New random passwords are generated if not configured. The password itself is never sent as an API credential after login.

A session can be revoked by logout; a restart revokes all sessions. The local account ID is recorded for subsequent audit operations. **This is not real workforce identity verification, delegated authorization, production multi-tenancy, or a compliance audit trail.** The only organization is the fixed synthetic `northline-demo` tenant, the demo account passwords can be shared, and the server binds to local HTTP loopback. Real deployment requires external authentication, password and account lifecycle management, TLS/secure cookies, granular organization membership, and hardened operation/audit controls. Do not expose the service publicly or import real customer documents.
