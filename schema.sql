-- Migration 001. Job aggregates contain schemaVersion, messages/attachment text,
-- candidates with source references, resolutions, immutable revision snapshots.
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY,
 org TEXT NOT NULL,
 body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY,
 at TEXT,
 action TEXT,
 job TEXT
);
