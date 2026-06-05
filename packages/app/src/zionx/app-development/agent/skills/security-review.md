---
name: security-review
description: Load when reviewing generated code for security. Secret hygiene, input validation, auth boundaries, sandbox guardrails. Returns a JSON severity-ranked report.
---

# Security review (subagent skill)

This skill is loaded by the `security-review` reviewer subagent. It scans the
generated workspace and emits a ranked report. Severity levels:

- `block` — fail the build
- `warn`  — surface in chat, don't block
- `info`  — log only

## Output

```json
{
  "passed": false,
  "findings": [
    { "severity": "block", "file": "app/(tabs)/index.tsx", "line": 12, "rule": "client-secret", "message": "ANTHROPIC_API_KEY in client code" },
    { "severity": "warn",  "file": "src/data/index.ts",     "line": 8,  "rule": "no-validation", "message": "User-supplied id used in fetch URL without validation" }
  ]
}
```

## Rules (severity in brackets)

### Secrets (block)

- ✗ Any `*_API_KEY`, `*_SECRET`, `*_TOKEN` in client-side files (`app/`,
  `components/`, `src/`).
- ✗ `.env` committed; secrets in `app.json` `expo.extra`.
- ✗ Hardcoded credentials in any string literal (regex: `sk-[a-zA-Z0-9]{20,}`,
  `xoxb-`, AWS access key patterns).

### Auth boundaries (block)

- ✗ User-supplied `userId` accepted from request body without verifying the
  session.
- ✗ Resource access (project, file, asset) without ownership check.
- ✗ Server endpoint that runs LLM/agent without rate limiting per user.

### Input validation (warn)

- ⚠ Untyped `req.body` accessed directly — should go through a Zod schema.
- ⚠ User input used in regex / file path without sanitization.
- ⚠ User input used in shell command — block unless inside an allowlist.

### Output / response (warn)

- ⚠ Stack traces sent to clients in error responses.
- ⚠ PII echoed in logs.
- ⚠ Stringified errors that include database details.

### Sandbox (block, for E2B-bound code)

- ✗ `run_command` with user-supplied input concatenated into the command.
- ✗ Egress to non-allowlisted hosts.
- ✗ File read/write outside the project workspace.

### Auth proxy (block)

- ✗ Preview URL exposed without auth check.
- ✗ Signed token without expiration.
- ✗ Token TTL > 24 hours.

### Crypto / random (warn)

- ⚠ `Math.random()` for IDs / tokens — use `crypto.randomUUID()`.
- ⚠ MD5 / SHA-1 for hashing — use SHA-256 minimum.

### Dependencies (warn)

- ⚠ `npm audit` high or critical findings unpatched.
- ⚠ Any package not on the allowlist (the canonical Expo SDK 54 dependency
  set + a small extension list).

## Standard mitigations to recommend

- Move client secrets to a server endpoint that reads from
  `seraphim/<service>` via the credential manager.
- Add a Zod schema at every API boundary; reject on parse failure with 400.
- Wrap shell calls in the `command-allowlist` guardrail (regex match against
  the canonical allowlist).
- Generate `crypto.randomUUID()` for any user-facing ID.
- Use `bcrypt` or `argon2` for any password hashing (Better Auth handles
  this — don't roll your own).

## Self-check before declaring "done"

- [ ] Zero secrets in client code.
- [ ] Every `/app-dev/*` and `/api/preview/*` endpoint behind auth.
- [ ] Every resource access through ownership check.
- [ ] Zod schemas at API boundaries.
- [ ] No user input concatenated into shell commands.
- [ ] No stack traces sent to clients in error responses.
- [ ] Token TTLs ≤ 24 hours.
