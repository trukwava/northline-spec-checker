# Contrast Room (Atelier extension)

The Contrast Room is a **read-only view** launched from the top bar of an active Northline case. It is intentionally theatrical, but all counts and comparisons derive from the saved synthetic job data.

- **Act I / Evidence in opposition:** Groups distinct normalized values only from source candidates classified as `assertion`. Quoted history and hypothetical questions remain visible as non-authoritative context, never as competing instructions. A manually confirmed decision is shown separately from source claims.
- **Act II / Release delta:** Compares the current draft's resolved values against the last approved revision. A missing current resolution is shown as unresolved, not as an accepted change. Sources imported after the release are listed independently, even if no resolved value changed.
- Evidence buttons navigate to the existing source timeline, with line references where available. Ledger buttons navigate to the existing field review. The overlay cannot approve or release a work order.

Run `npm test` (including `tests/contrast.test.mjs`) and `npm start` on Node 24+. This is a synthetic, loopback-only demo; the role selector is not real authentication.

No remote assets, paid services, or external model calls are introduced.
