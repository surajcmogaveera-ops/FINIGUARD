# FINIGUARD architecture

FINIGUARD is the product name for this submission to the original **“Bankism: Blue-Team AI Firewall & Guardrail Defense”** hackathon challenge.

```text
React playground
  └─ POST /api/v1/evaluate
       ├─ HTTP body limit and JSON parsing
       ├─ Server-side request validation
       ├─ Unicode and whitespace normalization
       ├─ Deterministic detector layers (request, memo, recipient)
       ├─ Optional provider-independent AI adapter, timeout, strict output/evidence validation
       ├─ Deterministic policy engine and reason code
       ├─ Optional idempotency reservation
       ├─ Server issues short-lived, single-use, detail-bound authorization
       ├─ Executor repeats transaction validation and atomically updates demo accounts and ledger
       └─ In-memory audit record and structured verdict
```

The API owns validation and authorization. The browser sends only request text and optional transaction details; a client approval field is not accepted. Normalized analysis views are separate from the submitted transaction values. The scanner applies instruction override, jailbreak, protected-data extraction, policy evasion, embedded instruction, and encoded-instruction patterns, plus a Unicode lookalike view. Unicode lookalikes alone do not trigger a finding. Findings include a detector ID, category, field, and explanation; they do not echo source text. The policy maps memo matches to `MEMO_INJECTION` and treats any deterministic finding as a block. Detector errors fail closed to review.

The policy engine returns eligibility, an outcome, reason code, and rationale; it never performs the operation. Policy order is: threat block; shape and detail validation; detail contradiction; supported and explicit intent; invalid AI output review; valid AI findings/recommendation review; source/destination account availability and recipient risk; currency and amount precision; self-transfer and configured transaction/session limits; available balance. AI provider outages fall back to deterministic-only policy. An invalid response schema does not. Approval therefore means eligible for authorization, not execution.

The source account and destination aliases resolve against a fixed synthetic registry. The executor checks the capability binding, expiry, account status, destination identity, currency, amount precision, transfer/session limits, and current balance again immediately before an atomic debit/credit and ledger write. It rolls back ledger and balance changes if the operation write fails. The capability is a private object tracked in a WeakMap, bound to the exact normalized request, validated transaction fields, and idempotency key; failed attempts consume it. A client cannot receive or forge it.

HTTP transfers may supply an `Idempotency-Key`. The in-memory store reserves the key synchronously before the asynchronous analyzer runs, so concurrent identical submissions join the original result rather than executing twice. Same-key/different-request submissions receive `IDEMPOTENCY_KEY_CONFLICT`. No key means independent explicit transfer requests remain separate. The bounded key store, account balances, ledger, and audit store reset on restart.

AI output must match an exact schema and quote evidence from the supplied normalized request, memo, or recipient label. Provider failures fall back to deterministic-only policy; valid AI threat indicators or `BLOCK`/`REVIEW` recommendations hold a transaction for review. A deterministic threat blocks regardless of AI approval. The server does not send amount, currency, account identifiers, secrets, ledger data, or authorization capabilities to the provider. Model output and confidence are advisory, the latter is uncalibrated, and no tool calls or executable fields are accepted. Prompt wording is defense in depth and is not treated as a prompt-injection guarantee. `GET /api/v1/health` exposes only provider configuration status.

The service has no real banking integration. Policy limits in `.env.example` are configurable simulation values, not claims about real-world bank rules. Audit records omit raw request text, payment memos, idempotency keys, and capabilities. Fixture evaluation calculates threat detection metrics separately from policy decisions, and checks actual account balances, ledger entries, balance deltas, and audit consistency. The scanner is a starter control, not a complete prompt-injection detector.

