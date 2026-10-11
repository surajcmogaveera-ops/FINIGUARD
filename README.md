# FINIGUARD — AI Security Firewall for Financial Transactions

**Intelligence analyzed. Every action verified.**

FINIGUARD is a defensive AI firewall that analyzes untrusted financial requests and enforces deterministic policy guardrails before simulated banking transactions can execute.

This product is the project submission for the original hackathon challenge, **“Bankism: Blue-Team AI Firewall & Guardrail Defense.”** The challenge title is retained to identify the source problem statement; FINIGUARD is the product name.

> This prototype uses in-memory synthetic data only. It is not connected to a bank and is not production-ready.

## Requirements and installation

- Node.js 22.12+ (Node.js 24 is also suitable)
- npm 10+

From the project root:

```sh
npm ci
```

## Run locally

Open two terminals from the project root:

```sh
npm run dev:backend
```

```sh
npm run dev:frontend
```

Open the local URL printed by Vite. The frontend proxies `/api` requests to the backend at `127.0.0.1:3001`.

The browser calls the same-origin `/api/v1` by default, so development and Vite preview use the configured `/api` proxy while production can use a same-origin reverse proxy. Set the Vite build-time `VITE_API_BASE_URL` to a full API base such as `https://api.example.test/api/v1` only when the frontend and backend are hosted separately. No backend security settings or provider credentials belong in frontend variables.

## API and authorization

- `GET /api/v1/health` — backend health.
- `POST /api/v1/evaluate` — evaluate `{ "request": "...", "transaction": { "amount": 500, "currency": "INR", "recipient": "Ananya", "memo": "Lunch" } }`. Transaction details are optional for read-only requests.
- `GET /api/v1/audit` — view bounded in-memory audit metadata.
- `GET /api/v1/audit/events` — query versioned security events with bounded filters and pagination.
- `GET /api/v1/audit/events/:eventId` and `GET /api/v1/audit/requests/:requestId` — inspect an event or request timeline.
- `GET /api/v1/observability` — service counts derived from retained events (offline evaluation is explicitly unavailable here).

The structured verdict separates `deterministicFindings`, `aiAnalysis`, `policyDecision`, and `executionStatus`. `decision` preserves the `APPROVED` / `BLOCKED` / `REVIEW` contract; `outcome` distinguishes `APPROVED`, `BLOCKED`, `REVIEW_REQUIRED`, and `INVALID_REQUEST`. A successful transfer returns `executionStatus: "EXECUTED"`. Deterministic findings include rule IDs and fields without echoing submitted text. AI output includes its provider/availability status, validated recommendation, exact evidence references, and whether its threat signal disagrees with deterministic detection. Confidence is explicitly an uncalibrated model score, never a probability. Transfers still require explicit intent, validated details, a known simulated destination, clean deterministic detection, deterministic currency/limit/balance checks, and an opaque single-use server capability bound to the normalized request and exact validated transaction. The executor repeats account, amount, currency, limit, and available balance checks. Client fields and AI output cannot grant authorization.

The FINIGUARD dashboard has overview, request inspector, audit explorer, operations, and evaluation views. It consumes only live health, verdict, audit, timeline, and observability responses. The evaluation command is not exposed by the backend API, so the evaluation view explicitly shows unavailable and directs developers to run `npm run evaluate`; it does not display old metrics as live data. See [docs/frontend-dashboard.md](docs/frontend-dashboard.md) for view behavior and interaction details.

## Optional AI analysis

AI is disabled by default. The backend's `npm run dev` and `npm start` scripts load the ignored root `.env` file. Copy `.env.example` to `.env`, then set `BANKISM_AI_PROVIDER=openai-compatible`, `BANKISM_AI_MODEL`, and `BANKISM_AI_API_KEY` locally to opt in. `BANKISM_AI_ENDPOINT` can select an OpenAI-compatible chat-completions endpoint; otherwise the standard endpoint is used. `BANKISM_AI_TIMEOUT_MS` accepts 100–30000 milliseconds. Never put credentials in chat, source code, logs, or documentation. `.env` files are ignored by Git.

`GET /api/v1/health` reports whether AI is disabled, configured, or unavailable, without returning credentials. The adapter uses built-in `fetch`, sends only the normalized request, memo, and recipient label, limits output tokens, and times out. It does not send amount, currency, account identifiers, ledger state, secrets, or authorization capabilities. Provider content is treated as untrusted and validated against the exact schema in `prompts/v2-security-analysis.md`; evidence quotes must match supplied text exactly. The displayed AI explanation is rebuilt from validated categories and exact evidence quotes rather than trusting freeform provider prose. A malformed schema is held for review. A provider timeout, outage, or rate limit falls back to deterministic-only policy: deterministic blocks and reviews still apply, and only an otherwise eligible request can proceed through the existing server authorization. When AI is disabled, the same deterministic-only path is used. A valid AI block/review or threat finding causes review; AI allow cannot overrule a deterministic finding. Disagreements are returned explicitly.

To manually contact a configured live provider with a synthetic balance question, run `npm run ai:smoke`. Automated tests and evaluation do not contact a live provider or require paid access.

The synthetic registry contains source account `sim-checking-001` (Demo User) and recipients Ananya, Ravi, and Review Hold. Review Hold always requires review; Demo User is the source and cannot receive a transfer under the default no-self-transfer rule. Unknown account names and mismatched account IDs are invalid. This is demo configuration, not a real account directory.

Transfer requests may send an `Idempotency-Key` header (1–128 letters, digits, `.`, `_`, `:`, or `-`). Repeating the same logical request and key returns the original transaction result without another transfer and emits a linked `IDEMPOTENT_REPLAY` event under a fresh request ID. Reusing a key for different details returns HTTP 409 with `IDEMPOTENCY_KEY_CONFLICT`. The bounded in-memory idempotency store, accounts, ledger, and audit records reset when the backend restarts.

```sh
curl -X POST http://127.0.0.1:3001/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: transfer-demo-001" \
  -d '{"request":"Transfer INR 500 to Ananya.","transaction":{"amount":500,"currency":"INR","recipient":"Ananya"}}'
```

The simulated source balance starts at INR 25,000. Default demo policies support INR with two decimal places, cap a transfer at INR 10,000, cap total session debits at INR 20,000, and prohibit self-transfers. Configure `BANKISM_SUPPORTED_CURRENCY`, `BANKISM_DECIMAL_PLACES`, `BANKISM_MAX_TRANSFER_INR`, and `BANKISM_MAX_SESSION_DEBIT_INR` in `.env`. These are simulation rules, not regulatory requirements. Self-transfers remain prohibited to avoid meaningless or incorrect balance updates. Audit records omit raw request text, payment memos, and authorization capabilities. Schema, event types, filters, metric scope, retention, and privacy behavior are documented in [docs/audit-observability.md](docs/audit-observability.md). Event records and counts are volatile, bounded process memory; they are not immutable, tamper-proof, or compliance-certified logs.

## Tests and evaluation

```sh
npm test
npm run evaluate
npm run lint
npm run build
```

The Node built-in test suite inspects actual simulated account balances, ledger entries, authorization replay/expiry/binding, idempotency, rollback, provider failure behavior, and audit outcomes. Synthetic fixture version 5 is in `backend/evaluation/cases.v5.json`; version 3 remains the regression baseline. Evaluation reports deterministic-only, AI-only (valid mocked analyses), and combined metrics separately, then checks actual source/destination balance deltas, ledger count, and audit consistency for every case.

Phase 6 evaluation (66 fixtures): deterministic-only detection TP=20, FP=0, TN=45, FN=1 (precision 1.000, recall 0.952). AI-only on 6 valid mocked analyses TP=1, FP=2, TN=1, FN=2 (precision 0.333, recall 0.333). Combined deterministic plus mocked AI/fallback TP=21, FP=2, TN=43, FN=0 (precision 0.913, recall 1.000). This fixture set demonstrates one intentionally missed pattern receiving an AI review, at the cost of two false positives; it does not establish general detection improvement. Provider outcomes: available=17, disabled=34, rate_limited=1, skipped=10, timeout=1, unavailable=3; 3 provider-failure cases used deterministic fallback. Final policy outcomes: APPROVED=11, BLOCKED=24, INVALID_REQUEST=9, REVIEW_REQUIRED=22. Unauthorized executions=0, unexpected executions=0, failed valid transactions=0, and regressions against v3=0. The deterministic one-vs-rest `POLICY_BYPASS` category has TP=2, FP=0, TN=63, FN=1 (precision 1.000, recall 0.667); other categories are DATA_EXFILTRATION TP=4/FP=0/TN=62/FN=0, INSTRUCTION_OVERRIDE TP=9/FP=0/TN=57/FN=0, MEMO_INJECTION TP=3/FP=0/TN=63/FN=0, OBFUSCATION TP=3/FP=0/TN=63/FN=0, ROLEPLAY_JAILBREAK TP=2/FP=0/TN=64/FN=0. A zero denominator prints `n/a`. All AI figures use deterministic local mocks; these small synthetic metrics are not live-provider or real-world performance estimates.

## Checks and known limits

Phase 7 verification: `npm test` passed 40 tests, `npm run evaluate` passed all 66 fixtures, `npm run lint` passed, and `npm run build` succeeded with Vite 7.3.7. Local HTTP checks exercised health/provider status, a simulated transfer, a malicious blocked request, a missing-credential AI provider failure, a replay, malformed JSON, audit queries, and live metrics. The no-credential provider failure remained on deterministic policy; no provider request was sent.

Supported actions are balance inquiries and simple INR simulated transfers. Transaction history, authentication, persistent storage, frontend linting, and deployment are not implemented. Only an OpenAI-compatible chat-completions interface is included; provider-specific quirks and live response quality are not tested. Deterministic patterns and Unicode lookalike checks are explainable starting controls; neither they nor prompting can cover every adversarial wording, language, or encoding. Evaluation metrics only describe the included synthetic fixtures.

Copy `.env.example` to `.env` only to configure the API port. Never put credentials in source control.

