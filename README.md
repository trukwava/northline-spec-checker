# Northline Fabrication — local specification review

A working local demonstration for a fictional packaging coordinator. TypeScript on Node 24 uses built-in SQLite, HTTP and crypto modules, with a lightweight browser interface. No install, service account, paid API, or frontend build is needed. Browser code is plain JavaScript; server and rules are TypeScript.

## Run

Requirements: Node 24+, Poppler `pdftotext` for PDF upload. From this folder:

```sh
npm start
```

Open http://127.0.0.1:4317, then paste a **local coordinator or reviewer key** from the startup terminal into the access dialog. The server generates two different random keys at startup if you have not configured them. Keys are kept only in tab memory, so refreshing requires entering the key again. The reviewer key can approve a production revision and reset the synthetic demo; the coordinator key can review and edit, but cannot approve. These are operator capabilities, **not user identities**. Node 24+ is required; verify with `node --version`. Install Poppler with `brew install poppler` on macOS or `sudo apt-get install poppler-utils` on Debian/Ubuntu for PDF support.

No environment variables are required. To provide your own access keys, set `NORTHLINE_COORDINATOR_KEY` and `NORTHLINE_REVIEWER_KEY` to distinct random strings of at least 32 characters before running the server. Never commit or share these values. See `.env.example`. Migration 001 is in `schema.sql` and runs automatically at startup. The persistent file is `data/northline.sqlite`. Stop the server before copying that file as a backup. Restore by replacing it while stopped. The demo reset button deletes only rows scoped to northline-demo and reseeds; it does not target other organization rows. This app has no supported non-demo organization mode.

## Operator guide

1. Explore the eight seeded orders, or use + to create a Label, Sleeve or Carton job.
2. Add sources: paste headers and field/value lines, or upload a text PDF. Try the two PDFs and `critical-thread.txt` in samples. Product field names appear in `domain.ts`; use `artwork: AP_R3.pdf`, `quantity: 600`, `width: 100 mm` etc. The adapter deliberately requires this simple notation; it is not general prose understanding.
3. In the matrix inspect source candidates. Source links open the original preserved text with line numbers. Quoted and question values cannot be confirmed. Explicit customer approval is still a candidate until the reviewer confirms it.
4. Confirm a source value or enter a reviewed value with a reason. Manual dimensions require mm. Clear decision reopens a field. You can also reject a direct assertion with a recorded reason; rejected claims stay source-linked and can be restored. If the rejected claim had been selected, the field reopens.
5. Open Clarification draft for field-mapped questions. Its editable text is temporary and is never sent or saved automatically.
6. Once blockers are resolved, unlock the application using the reviewer access key printed in the terminal; approve explicitly from the ledger. The server verifies the key and rejects forged `role` values in request bodies. This records synthetic approval under a shared local capability, not a verified human identity.
7. Approved revisions offers JSON, CSV, and an HTML production sheet you can print or save as PDF through the browser.
8. Import a different quantity after approval. The draft reopens and the previous release stays unchanged. Confirm and approve a new revision to adopt the change.
9. Open the Contrast Room to inspect active disagreements, rejected evidence and changes against the last approved revision. In another browser session, an outdated decision is blocked with a stale-case warning rather than overwriting newer review work.

Three complete, two missing-detail, two conflicting and one late-change fixture are created on reset, with over twenty source messages and two PDF evidence records. One additional job may be approved from the browser verification. Reset returns the original distribution.

## Verification

```sh
npm test
# With server running (integration check resets synthetic demo decisions):
NORTHLINE_COORDINATOR_KEY=<your-existing-key> NORTHLINE_REVIEWER_KEY=<your-existing-key> node --experimental-strip-types integration.ts
```

The initial demo passed eight domain tests and its original API integration. This branch adds automated regression cases for candidate rejection, approved adjudication snapshots, rejected-claim comparison and optimistic concurrency. See GitHub Actions for the latest branch execution result. Browser verification rendered the matrix, approved NL-1041, reopened approved revisions after a browser reload and showed the saved quantity, units and artwork. Desktop screenshot is in `docs/preview.png`. Mobile/tablet CSS exists but viewport testing and a complete keyboard-only pass have not been performed. No real job accuracy or time-saving claim has been measured.

## Status and limits

- Implemented: local creation, deterministic field extraction, source timeline, evidence links, Atelier review ledger and Contrast Room, per-candidate rejection and restoration, numeric/unit/date/required rules, manual decisions, draft questions, SQLite persistence, version-preconditioned writes, approval and adjudication snapshots, exports, late review, demo reset, audit events, focused tests.
- Partial: PDF text extraction uses page markers and extracted line locations, not PDF coordinate highlights; original binary attachments are not retained. Attachment references in email remain raw text. Quoted history is preserved and classified, not removed from the timeline. Message splitting recognizes From headers. No arbitrary MIME/email format support.
- Partial: schema types currently vary by required depth for cartons; real material/print compatibility and dimensional feasibility rules require shop-approved configurations. Ordinary prose dimensions such as “100 × 50” require manual review. Unsupported prose does not populate fields.
- Deferred: OCR, model/provider adapters, real sign-in/roles, production organization management, persistent edited clarification drafts, semantic quote deduplication, tamper-proof database immutability, identity-linked multi-user authorization, conflict-merge tooling, automated mobile checks.

Security boundary: loopback-only synthetic demo. The local role keys are server-verified but shared and ephemeral; they are not production authentication or named-user identity. API reads are scoped to a fixed demo organization. Do not expose this server publicly or import private production documents. Real deployment needs authenticated server-derived roles, authorization tests, host validation, CSRF/session protections and production-grade concurrent editing and merge UX. Source HTML is escaped. Uploads are bounded; PDF processing has a timeout and output cap; subprocess arguments are fixed. Missing Poppler produces an error rather than fabricated text. No external network connector or model exists; nothing is sent.

Retention: source text, review decisions, snapshots and event metadata remain locally until demo reset or database removal. PDF temporary files are deleted after extraction. Reset removes demo jobs; audit event metadata remains. There is no automatic expiry, compliance certification, encryption-at-rest feature, or remote backup. Domain snapshots are immutable through the app API; an administrator editing the database can change them.


## Evidence adjudication and concurrent sessions

All existing-job API writes require an integer `expectedVersion` obtained from the job read. The server returns HTTP 409 `STALE_WRITE` when another session has changed the case and does not apply the stale mutation. The browser refreshes for explicit re-review; it never silently retries. Version 1 is the default for older saved demo JSON objects. No-op duplicate imports do not advance the version. Rejected assertions carry a saved reason and remain traceable without counting as active conflicts; release snapshots retain the rejection map. See [`docs/ADJUDICATION_AND_CONCURRENCY.md`](docs/ADJUDICATION_AND_CONCURRENCY.md) for the contract and limitations.

## Local access design

All `/api` reads and changes (except anonymous `/api/health`) require a bearer key recognized by the loopback server. The server derives `coordinator`/`reviewer` authority from the key and ignores the untrusted client-provided role for approval. The public interface never embeds a key or supplies default production credentials. A local server restart invalidates randomly generated keys. The terminal is the only bootstrap location for such keys. The browser retains the entered key only in tab memory; a refresh prompts for it again. This is a deliberate transitional demo control, **not** production authentication: local operators sharing a key are indistinguishable, no audit actor identity is verified, and there is no password management, SSO, MFA, tenant membership, or credential revocation within a running session. Do not bind this app to a public network interface or use real customer documents.
