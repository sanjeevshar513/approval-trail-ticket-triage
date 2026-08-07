---
title: 'Build Approval-Trail Ticket Triage Platform'
type: 'feature'
created: '2026-08-07'
status: 'done'
baseline_commit: '98fe2e994fa439ab00ed09a425f0b436d95b1f87'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/prds/prd-approval-trail-ticket-triage-2026-08-07/prd.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-approval-trail-ticket-triage-2026-08-07/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Support ticket systems either lack AI speed or lack high-trust human safety boundaries and strict compliance-oriented auditing, leading to high triage workloads or risky automated responses.

**Approach:** Implement a full Express.js and SQLite web application adhering to a layered port-adapter architecture, incorporating configuration-driven Gemini classification, strict AI pre-action audit logging, manual human-in-the-loop validation, and triggers that enforce append-only database immutability.

## Boundaries & Constraints

**Always:**
- Load ticket categories dynamically from `server/config/categories.json` at startup. Fail startup immediately if missing or malformed.
- Write Gemini's proposed classification, priority, confidence, and draft reply to the `audit_trail` table (status `Pending Approval`) *before* returning recommendations to any client view or queue.
- Block all `UPDATE` and `DELETE` commands targeting the `audit_trail` table using SQL schema-level database triggers.
- Require an authorized agent's click to dispatch any response. Zero auto-sending allowed.

**Ask First:**
- Adjusting the SQLite database filename or port mappings.

**Never:**
- Hardcode ticket categories inside Express files or prompt structures.
- Dispatch mock emails without checking for a corresponding `Approved` action in the audit trail.
- Permit deletion of tickets or audit log rows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Submit Ticket | Name, Email, Subject, Body | Ticket ID returned, status `Pending Triage` | 400 bad request if empty |
| AI Triage Processing | Ticket Created event | Gemini classification called, AI logs written, status becomes `Pending Approval` | fallback to `Pending Triage (Error)` on API timeout |
| Agent Approve & Send | Approval button click + draft edits | Outbound mock email recorded, ticket status `Resolved`, `HUMAN_APPROVAL` log written | Block request if ticket status is not `Pending Approval` |
| Direct SQL Hack | Attempt UPDATE on `audit_trail` | SQL engine rejects modification with failure code | Trigger throws standard SQL execution error |

</frozen-after-approval>

## Code Map

- `server/config/categories.json` -- Dynamically loaded allowed ticket classification categories.
- `server/db/database.js` -- SQLite database engine, schema setup, and immutable UPDATE/DELETE trigger configurations.
- `server/adapters/gemini.js` -- Connector wrapper to `@google/generative-ai` SDK.
- `server/adapters/email.js` -- Mock dispatch sender ensuring zero auto-dispatch without verification.
- `server/services/triage.js` -- Central logic orchestrating ingestion, pre-action log checks, and agent approvals.
- `server/app.js` -- Express main runner mounting controllers, REST endpoints, and UI view directories.
- `server/views/` -- Complete frontend user interfaces (Customer submission, Agent Queue dashboard, and Auditor Log explorer).
- `__tests__/triage.test.js` -- Comprehensive integration and invariant validation tests.

## Tasks & Acceptance

**Execution:**
- [x] `server/config/categories.json` -- Create category dictionary with default Billing, Technical Bug, and Feature categories.
- [x] `server/db/database.js` -- Set up SQLite database initialization, tables (`tickets`, `audit_trail`), and immutable logs trigger configurations.
- [x] `server/adapters/gemini.js` -- Create Gemini client invoking `@google/generative-ai` with config-based categories, falling back to mock predictions on API credential errors.
- [x] `server/adapters/email.js` -- Build human-only mock dispatcher writing sent mail outputs to local arrays or JSON logs.
- [x] `server/services/triage.js` -- Create triage and approval orchestration services containing the strict pre-action and post-action DB logging logic.
- [x] `server/app.js` -- Build Express endpoints, static view assets hosting, and server bootloaders that validate `categories.json` presence.
- [x] `server/views/` -- Create complete HTML dashboards for customer tickets, agent approvals, and read-only auditor views.
- [x] `__tests__/triage.test.js` -- Write unit and integration tests confirming the strict pre-action logging and DB-level triggers prevent any data tampering.

**Acceptance Criteria:**
- Given a support ticket with a dynamic category config, when submitted, then Gemini API is invoked using categories from `categories.json` and the proposed result is stored in `audit_trail` (with status `Pending Approval`) before being displayed to an agent.
- Given an agent reviewing a ticket, when they click "Approve and Send", then the response is sent via mock dispatch, the ticket becomes `Resolved`, and a `HUMAN_APPROVAL` action is logged.
- Given an active database, when any query attempts to update or delete any row in `audit_trail`, then the database-level triggers abort the query with an error message.

## Design Notes

The Express views will be single HTML files utilizing Tailwind CSS served directly as static files or simple templates. This avoids webpack compilation layers, providing a rapid, clean dev experience.

### Immutable Triggers Example
```javascript
db.exec(`
CREATE TRIGGER block_audit_updates
BEFORE UPDATE ON audit_trail
BEGIN
    SELECT RAISE(FAIL, 'Updates are forbidden on audit_trail table');
END;
`);
```

## Verification

**Commands:**
- `npm test` -- expected: Jest executes all integration tests successfully, confirming trigger blocks, dynamic categories, and pre-action logs.
- `node server/app.js` -- expected: Server boots successfully, reporting successful config resolution and database connections.
