# Deferred Items

Items identified during development that are intentionally deferred. Review periodically.

---

## Phase 2 — npm audit vulnerabilities (2026-05-13)

7 npm audit vulnerabilities (3 moderate, 4 high) in aws-cdk-lib and its transitive dependencies (ajv, brace-expansion, fast-uri, fast-xml-builder, minimatch, yaml). All confined to AWS CDK infrastructure, none in code paths the app-development pipeline touches. Fix requires aws-cdk-lib upgrade to 2.254.0 which is outside current dependency range and could break CDK stacks. Re-evaluate when next touching CDK infra.


---

## Phase 3 — retry utility default behavior (2026-05-14)

STATUS: RESOLVED in commit 42e8868 on 2026-05-15. See commit for details.

Phase 1 retry utility (retry.ts) assumes all errors are retryable by default. Should be inverted: retry only known-transient error classes (network errors, HTTP 5xx, HTTP 429). Auth, validation, and permission errors should never retry. Currently each caller has to remember to pass a custom shouldRetry predicate. Re-evaluate during a future quality pass.

UPDATE FROM PHASE 5: The retry utility's RetryExhaustedError wrapping behavior is incorrect. When shouldRetry returns false on the first attempt (signaling a terminal error), the utility still wraps the error in RetryExhaustedError with a misleading "Retry exhausted after N attempts" message. The underlying error is preserved as lastError but tests must either catch RetryExhaustedError or unwrap to assert on the actual cause. The 500 server error test in Phase 5 ran for 4 seconds going through full exponential backoff because the utility didn't short-circuit on non-retryable errors. Correct behavior: shouldRetry returning false on attempt 1 should throw the original error immediately, NOT wrap in RetryExhaustedError. The "exhausted" framing should only apply when all retries were actually attempted.

PRIORITY: Bump from "future quality pass" to "fix before Phase 6 if Phase 6 adds any retry-using code paths." Phase 6 will introduce build retries; this needs to be solid before then.


---

## Phase 3 — production-server as-any cast (2026-05-14)

production-server.ts → app-dev route registration uses `as any` to bypass type checking because the services package consumes the app package via compiled .d.ts files, not source. New fields on AppDevHandlerDeps won't fail compilation until something explicitly imports the type at source level. Re-evaluate when adjusting the monorepo build pipeline — consider using project references or TypeScript path mappings to share source types.


---

## Phase 4 — Workspace class module-load-time root resolution (2026-05-14)

Workspace class resolves WORKSPACE_ROOT at module load time from process.env.SERAPHIM_WORKSPACE_ROOT. This caused test friction in Phase 1 and again in Phase 4 hook-subscribers tests. Each test that wants its own root must use workspace.getProjectPath() to discover the actual configured root. Consider making the root a constructor parameter (with env var as default) for cleaner test isolation. Re-evaluate during a future quality pass.


---

## Phase 4 — InMemoryEventBusService tenantId inconsistency (2026-05-14)

InMemoryEventBusService casts SystemEvent to SeraphimEvent without transforming metadata.tenantId → tenantId. Production EventBusServiceImpl likely converts properly via EventBridge, so local dev and production may behave differently. Currently code that needs tenantId must check both locations: event.tenantId ?? event.metadata?.tenantId. Re-evaluate during a future consistency pass — either fix InMemoryEventBusService to transform on dispatch, or normalize the SystemEvent/SeraphimEvent type relationship.


---

## Phase 5 — Hook 3 halt without enforcer (2026-05-15)

Phase 5 implements Hook 3 with halt severity but no enforcer. Hook 3 emits appdev.hook.completed with success: false on validation failure. Phase 6 (Build Pipeline) is responsible for reading Hook 3's last completion event for a project and refusing to build if success was false. Until Phase 6 lands, bad dependencies are detected and reported but do not block any downstream action.
