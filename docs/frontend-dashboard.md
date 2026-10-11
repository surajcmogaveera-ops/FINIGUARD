# FINIGUARD frontend dashboard

## Views

- **Overview** combines live `/health`, `/observability`, and recent `/audit/events` responses. Counts are explicitly process-local; an unavailable response is shown as unavailable, not zero.
- **Request inspector** supports backend-recognized balance inquiries and synthetic INR P2P transfers to Ananya, Ravi, or Review Hold. Browser checks help with field entry; backend validation and policy remain authoritative. Verdict presentation separates detector findings, advisory AI status, final policy, and actual execution status. A same-key retry is shown only for an in-memory submission and is explicitly presented as an idempotent replay.
- **Decision trace** combines input-validation/normalization checks from the real verdict with stages loaded from `/audit/requests/:requestId`. A missing timeline does not imply that a stage passed.
- **Audit explorer** uses `/audit/events` for server-filtered decision, event type, category, time range, and page queries; `/audit/events/:eventId` for sanitized details; and `/audit/requests/:requestId` for timelines. Query values and responses are checked before rendering. The frontend never renders backend strings as HTML.
- **Operations** displays `/health` and `/observability`, including provider configuration, retained-event counters, failures, and reset scope.
- **Evaluation** reports unavailable because no evaluation-result endpoint exists. Run `npm run evaluate` in the project root to calculate the synthetic fixture report locally.

## API routing and interaction

By default, the frontend uses same-origin `/api/v1` requests. Vite's development and preview server proxy `/api` to the local backend. `VITE_API_BASE_URL` can be set at frontend build time to a complete API base for separately hosted services; do not place secrets in frontend environment variables. Without this override, a production deployment needs a same-origin `/api` reverse proxy.

Request submission has a ten-second network timeout, abortable requests, stale-response guards, and a disabled submit button while in flight. Verdict and audit data are shape-checked, identifiers can be copied with feedback, and network or malformed-response conditions have explicit error states. Motion is limited to short page/result transitions and pending indicators, with `prefers-reduced-motion` support. Layout, navigation, inputs, tables, and details use semantic controls, visible focus treatment, and narrow-screen breakpoints.

The interface consumes synthetic demo state only. It does not calculate authorization, infer success from policy approval, fabricate operational traffic, or expose raw audit bodies, secrets, provider credentials, internal prompts, or authorization capabilities.
