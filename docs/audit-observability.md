# Audit and observability contract

The API emits schema version 1 events in bounded process memory (`MAX_AUDIT_EVENTS = 1000`). Each event has a random event ID, server generated request ID, per-request sequence, ISO timestamp, event type and stage. Events contain only allowlisted decision fields, stable threat categories, validated AI finding categories, execution state, simulated transaction reference, and sanitized error category. Raw user text, evidence quotes, prompts, environment values, provider credentials, capabilities, and exception messages are excluded.

Normal evaluated requests produce `THREAT_SCAN_COMPLETED`, `AI_ANALYSIS_COMPLETED`, `POLICY_DECIDED`, a truthful transaction event, and `REQUEST_COMPLETED`. Parser failures produce a rejection/failure event. A same-key idempotent replay gets a fresh request ID and `IDEMPOTENT_REPLAY` linked to the original request ID; it does not create a second successful transaction event or mutate state. Sequence values order events within one request. Retention may evict early timeline events; the timeline endpoint reports `complete: false` and `truncated: true` when its beginning or completion event is unavailable.

## Endpoints

- `GET /api/v1/audit/events`: filters `requestId`, `decision`, `outcome`, `eventType`, `threatCategory`, `from`, `to`; page with `limit` (1–100, default 25) and `offset` (0–100000, default 0). Unknown or malformed query fields return a generic 400.
- `GET /api/v1/audit/events/:eventId`: one retained event.
- `GET /api/v1/audit/requests/:requestId`: ordered request timeline, including linked replay attempts.
- `GET /api/v1/observability`: counts derived only from retained events; evaluation reports are marked unavailable because the offline evaluator runs in another process.
- Existing `GET /api/v1/audit` remains available for the compatible summary records.

Every HTTP request receives a fresh server-generated `X-Request-Id`; client-supplied request identifiers are ignored. The ID is passed to analysis as a correlation value (header only; not model content), policy evaluation context, simulated execution and audit events. It is not an authentication credential.

Audit data, operational counts, simulated account state, and idempotency keys are volatile and reset when the backend process restarts. Retention is bounded, so old events can be evicted. This is an investigation aid for a local prototype, not immutable, tamper-proof, or compliance-certified evidence. Live provider health reflects configuration, not provider uptime. No persistent database or historical metrics are included.
