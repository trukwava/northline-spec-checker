# Northline Fabrication — local specification review

A working local demonstration for a fictional packaging coordinator. TypeScript on Node 24 uses built-in SQLite, HTTP and crypto modules, with a lightweight browser interface. No install, service account, paid API, or frontend build is needed. Browser code is plain JavaScript; server and rules are TypeScript.

## Run

Requirements: Node 24+, Poppler `pdftotext` for PDF upload. From this folder:

```sh
npm start
```

Open http://127.0.0.1:4317. Node 24+ is required; verify with `node --version`. Install Poppler with `brew install poppler` on macOS or `sudo apt-get install poppler-utils` on Debian/Ubuntu for PDF support.

No environment variables are required; see `.env.example`. Migration 001 is in `schema.sql` and runs automatically at startup. The persistent file is `data/northline.sqlite`. Stop the server before copying that file as a backup. Restore by replacing it while stopped. The demo reset button deletes only rows scoped to northline-demo and reseeds; it does not target other organization rows. This app has no supported non-demo organization mode.

## Operator guide

1. Explore the eight seeded orders, or use + to create a Label, Sleeve or Carton job.
2. Add sources: paste headers and field/value lines, or upload a text PDF. Try the two PDFs and `critical-thread.txt` in samples. Product field names appear in `domain.ts`; use `artwork: AP_R3.pdf`, `quantity: 600`, `width: 100 mm` etc. The adapter deliberately requires this simple notation; it is not general prose understanding.
3. In the matrix inspect source candidates. Source links open the original preserved text with line numbers. Quoted and question values cannot be confirmed. Explicit customer approval is still a candidate until the reviewer confirms it.
4. Confirm a source value or enter a reviewed value with a reason. Manual dimensions require mm. Clear decision reopens a field; candidate-level rejection history is not yet implemented.
5. Open Clarification draft for field-mapped questions. Its editable text is temporary and is never sent or saved automatically.
6. Once blockers are resolved, choose Authorized demo reviewer and approve. This records a synthetic reviewer approval, not a real authenticated identity.
7. Approved revisions offers JSON, CSV, and an HTML production sheet you can print or save as PDF through the browser.
8. Import a different quantity after approval. The draft reopens and the previous release stays unchanged. Confirm and approve a new revision to adopt the change.

Three complete, two missing-detail, two conflicting and one late-change fixture are created on reset, with over twenty source messages and two PDF evidence records. One additional job may be approved from the browser verification. Reset returns the original distribution.

## Verification

```sh
npm test
# With server running (integration check resets synthetic demo decisions):
node --experimental-strip-types integration.ts
```

Actual results: eight domain tests passed. API integration passed source count, unauthorized approval, successful approval, late-change invalidation, duplicate import, immutable snapshots, subsequent approval, persistent reread, PDF extraction and blue/red evidence. Browser verification rendered the matrix, approved NL-1041, reopened approved revisions after a browser reload and showed the saved quantity, units and artwork. Desktop screenshot is in `docs/preview.png`. Mobile/tablet CSS exists but viewport testing and a complete keyboard-only pass have not been performed. No real job accuracy or time-saving claim has been measured.

## Status and limits

- Implemented: local creation, deterministic field extraction, source timeline, evidence links, review matrix, numeric/unit/date/required rules, manual decisions, draft questions, SQLite persistence, approval snapshots, exports, late review, demo reset, audit events, focused tests.
- Partial: PDF text extraction uses page markers and extracted line locations, not PDF coordinate highlights; original binary attachments are not retained. Attachment references in email remain raw text. Quoted history is preserved and classified, not removed from the timeline. Message splitting recognizes From headers. No arbitrary MIME/email format support.
- Partial: schema types currently vary by required depth for cartons; real material/print compatibility and dimensional feasibility rules require shop-approved configurations. Ordinary prose dimensions such as “100 × 50” require manual review. Unsupported prose does not populate fields.
- Deferred: OCR, model/provider adapters, real sign-in/roles, production organization management, per-candidate reject persistence, persistent edited clarification drafts, semantic quote deduplication, tamper-proof database immutability, multi-user stale-write detection, automated mobile checks.

Security boundary: loopback-only synthetic demo. The role selector is a simulation and must not be used as production authorization. API reads are scoped to a fixed demo organization. Do not expose this server publicly or import private production documents. Real deployment needs authenticated server-derived roles, authorization tests, host validation, CSRF/session protections and concurrent write control. Source HTML is escaped. Uploads are bounded; PDF processing has a timeout and output cap; subprocess arguments are fixed. Missing Poppler produces an error rather than fabricated text. No external network connector or model exists; nothing is sent.

Retention: source text, review decisions, snapshots and event metadata remain locally until demo reset or database removal. PDF temporary files are deleted after extraction. Reset removes demo jobs; audit event metadata remains. There is no automatic expiry, compliance certification, encryption-at-rest feature, or remote backup. Domain snapshots are immutable through the app API; an administrator editing the database can change them.

