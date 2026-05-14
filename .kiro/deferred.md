# Deferred Items

Items identified during development that are intentionally deferred. Review periodically.

---

## Phase 2 — npm audit vulnerabilities (2026-05-13)

7 npm audit vulnerabilities (3 moderate, 4 high) in aws-cdk-lib and its transitive dependencies (ajv, brace-expansion, fast-uri, fast-xml-builder, minimatch, yaml). All confined to AWS CDK infrastructure, none in code paths the app-development pipeline touches. Fix requires aws-cdk-lib upgrade to 2.254.0 which is outside current dependency range and could break CDK stacks. Re-evaluate when next touching CDK infra.


---

## Phase 3 — retry utility default behavior (2026-05-14)

Phase 1 retry utility (retry.ts) assumes all errors are retryable by default. Should be inverted: retry only known-transient error classes (network errors, HTTP 5xx, HTTP 429). Auth, validation, and permission errors should never retry. Currently each caller has to remember to pass a custom shouldRetry predicate. Re-evaluate during a future quality pass.


---

## Phase 3 — production-server as-any cast (2026-05-14)

production-server.ts → app-dev route registration uses `as any` to bypass type checking because the services package consumes the app package via compiled .d.ts files, not source. New fields on AppDevHandlerDeps won't fail compilation until something explicitly imports the type at source level. Re-evaluate when adjusting the monorepo build pipeline — consider using project references or TypeScript path mappings to share source types.
