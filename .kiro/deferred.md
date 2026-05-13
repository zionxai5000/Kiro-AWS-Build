# Deferred Items

Items identified during development that are intentionally deferred. Review periodically.

---

## Phase 2 — npm audit vulnerabilities (2026-05-13)

7 npm audit vulnerabilities (3 moderate, 4 high) in aws-cdk-lib and its transitive dependencies (ajv, brace-expansion, fast-uri, fast-xml-builder, minimatch, yaml). All confined to AWS CDK infrastructure, none in code paths the app-development pipeline touches. Fix requires aws-cdk-lib upgrade to 2.254.0 which is outside current dependency range and could break CDK stacks. Re-evaluate when next touching CDK infra.
