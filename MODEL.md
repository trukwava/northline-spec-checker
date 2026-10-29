# Product brief and acceptance contract

Primary user: fictional Northline Fabrication coordinator. Promise: review source-traced specifications and save a human-approved production snapshot without provider credentials.

P0: job creation; product schema; source import; candidate evidence; competing values; required-field validation; reviewer decisions; clarification draft; immutable release; JSON/CSV/printable HTML export; late-source review; persistence and demo reset.
Parking lot: provider email connectors, OCR, model extraction, costing, machinery scheduling, procurement, ERP, real identity and multitenancy.

## Domain model 1.0

Job is an organization-scoped SQLite aggregate. ProductSchemaVersion is the pinned schemaVersion plus product type. Message preserves the source text, headers, timestamp text, quoted lines and references; id is a SHA-256 content digest. AttachmentVersion is represented by a PDF-kind source with extracted page text, filename and content digest (original PDF binary is not retained). SpecificationCandidate retains original raw value, normalized value/unit, field, sourceId, line and assertion/question/quoted classification. EvidenceReference is sourceId + extracted-text line; PDF pages have explicit markers. Conflict is a derived competing-value issue. ReviewResolution stores accepted candidateId or labeled manual value/unit/reason. WorkOrderRevision stores a deep snapshot, source IDs and embedded Approval (reviewer and UTC timestamp). AuditEvent is an append-only event row. These are logical entities, not separately normalized SQL tables.

States: Needs review -> Ready for approval -> Approved. An additional source or changed draft after approval -> Change review. Required values and contradictory unresolved values block approval. Changed source values invalidate affected draft resolutions. Quoted history and questions cannot be directly confirmed as instructions. Repeated identical source text does not add a source; revision export always uses the saved snapshot. Dates are date-only YYYY-MM-DD; event timestamps use UTC, displayed in America/New_York. Dimensions normalize to mm; quantity is an independent integer field.

## Acceptance scenarios defined for critical rules

1. 500 assertion + quoted 300 + proposed 750 produces one eligible initial quantity; approved 600 adds a competing eligible candidate.
2. 100 without a dimensional unit cannot pass approval; 2 in normalizes to 50.8 mm and retains raw text.
3. Missing artwork and unresolved required fields prevent approval.
4. Coordinator release is rejected server-side; demo reviewer may approve a valid order.
5. Late evidence preserves every approved value and source set while reopening draft review.
6. Exact duplicate import leaves message count unchanged.
7. Blue PDF evidence and red change evidence remain visible together.
8. Reload retains approval and exports include normalized units and artwork revision.

No rule certifies physical feasibility. No source text can execute instructions; extraction is deterministic data parsing only.
