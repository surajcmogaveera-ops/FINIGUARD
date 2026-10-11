# Implementation notes

- Local API: `http://127.0.0.1:3001/api/v1`
- Health check: `GET /api/v1/health`
- Evaluation: `POST /api/v1/evaluate`
- In-memory audit list: `GET /api/v1/audit`
- Simulated starting balance: INR 25,000
- Simulated transfer cap: INR 10,000 per request
- AI analysis: opt-in OpenAI-compatible provider; disabled by default, exact-schema/evidence validation, bounded request/output, timeout, deterministic-only outage fallback
- Tests: `npm test` (Node built-in test runner)
- Fixture evaluation: `npm run evaluate` (versioned JSON cases, isolated bank/audit state)
- No real bank connection, persistent database, authentication, or deployment is configured.

Phase 4 baseline verification at Phase 5 start: `npm test` passed 17 tests and `npm run evaluate` passed 50 fixtures with TP=19, FP=0, TN=31, FN=0; v3 regressions were 0.

Phase 5 policy verification: simulated source/destination accounts, supported-currency and decimal precision rules, source/destination account validity, prohibited self-transfer, configurable transfer/session limits, recipient review status, explicit intent and ambiguity checks, single-use detail-bound expiring capabilities, execution-boundary policy rechecks, rollback, and bounded in-memory idempotency are implemented. Decision compatibility is retained with an explicit `outcome` (`APPROVED`, `BLOCKED`, `REVIEW_REQUIRED`, `INVALID_REQUEST`) and a `reasonCode` on the verdict. `npm test` passes 27 tests; `npm run evaluate` passes 54 fixtures with TP=19, FP=0, TN=35, FN=0, precision=1.000, recall=1.000, 0 unauthorized/unexpected/failed-valid executions, and 0 regressions against v3.

Phase 6 adds a provider-independent analyzer interface, `openai-compatible` chat completion adapter, provider status, strict schema validation, exact evidence matching, deterministic-only outage fallback, and output/failure explainability. Model confidence is not calibrated. Provider-backed metrics are mock-only unless a user separately runs the opt-in smoke check.

Build verification: `npm run build` completed successfully with Vite 7.3.7. Vite Preview served the built page and successfully proxied both `GET /api/v1/health` and a balance inquiry to the backend.

The previous Windows `spawn EFTYPE` was traced to a mismatched local esbuild executable. The installed esbuild package expected SHA-256 `C7BEE37877D0AA6A046E52783FA0A2CF1A9CE5579D68BB3083BDA99D4BFF18EF`; the existing file hashed to `91A994C2AA528B7019B264EFC2324839BEA9E4E72635BD0B6CCA520B47CF50C`. Windows rejected the mismatched executable as an invalid application, and Node returned `EFTYPE`. The exact 0.28.2 Windows package was staged and verified, then only the corresponding dependency package was replaced. The lockfile was repaired and `npm ci` completed successfully in Phase 3; esbuild's postinstall was skipped by the environment's install-script policy, but the restored Windows executable has since built successfully.

Run the frontend and backend in separate terminals from the project root with `npm run dev:frontend` and `npm run dev:backend`.

