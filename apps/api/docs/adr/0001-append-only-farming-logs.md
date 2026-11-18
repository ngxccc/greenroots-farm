---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 1. Append-Only Farming Logs

## Context

Cultivation logs are the evidence base for VietGAP traceability and customer-facing batch history. A log that can be edited or deleted after the fact cannot support an audit or a recall. The API layer is not the only writer: seed scripts and administrative SQL also touch the database.

- **Target module**: `apps/api/src/database`
- **Migration reference**: `apps/api/drizzle/20261113020004_immutable_farming_logs`
- **Extracted from** the pre-split repo-wide ADR (0001) §8 during the 2026-11-18 ADR split, because this is an API-context decision.

## Decision

- Protect `farming_logs` with the `trg_immutable_farming_logs` trigger and `prevent_farming_log_mutation()`, which reject UPDATE and DELETE.
- Install the trigger through a forward-only custom migration rather than a Drizzle-generated schema change.
- Require corrections to be recorded as new log entries that reference the corrected entry, never as in-place edits.

## Positive Consequences

- The log is append-only regardless of which process writes it.
- Traceability and recalls can rely on an untampered history.
- Corrections remain visible instead of overwriting the original record.

## Negative Consequences / Risks

- A mistaken entry cannot be removed, only superseded, so the log grows.
- Schema changes to `farming_logs` must account for the trigger.
- Test fixtures cannot truncate the table through normal row deletes.

## Explicit Tradeoffs

- **Database trigger over service-only discipline**: tamper resistance wins over the ability to fix bad rows in place.
- **Correction entries over updates**: auditability wins over a compact table.
