---
inclusion: always
---

# Quality bar (non-negotiable)

This file is the standing law for every app this project generates. It is loaded into every interaction. No generated app is "done" until every rule here is met. When a request conflicts with a rule here, the rule wins — say so and comply.

## The five gates

Every generated app MUST satisfy all five before it is considered complete:

1. **Persistence** — real data layer, full CRUD, survives reload. See
   `20-persistence.md`. Zero hardcoded/mock/sample data in shipped screens.
2. **Onboarding** — a first-run walkthrough plus a re-openable "How it works".
   See `30-onboarding.md`.
3. **Visual quality** — built only from the design system in `10-design-system.md`.
   Target: indistinguishable from a top-rated, 2026-modern App Store app.
4. **Accessibility & performance** — meets the budgets in `40-store-readiness.md`.
5. **Store readiness** — icon, splash, screenshots, metadata, no crashes.
   See `40-store-readiness.md`.

## Build order (always)

When asked to build or generate an app, follow this order. Do not skip ahead.

1. **Write a spec first.** Create `.kiro/specs/<app-name>/requirements.md`,
   `design.md`, and `tasks.md`. The spec MUST explicitly include: the persistence
   schema, the onboarding flow, and a statement that the design system is the only
   styling source. Do not write feature code before the spec exists.
2. **Scaffold from the golden template, never from zero.** If a starter template
   exists in the workspace (look for `templates/golden-starter/` or a documented
   starter), copy it. It already contains the design system, a wired persistence
   layer, and an onboarding shell. If no template exists, create those three
   foundations first, before any feature screen.
3. **Build features into the skeleton.**
4. **Self-verify against the five gates** before declaring done (the Agent Stop
   hook will also enforce this).

## Credentials — check AWS Secrets Manager FIRST

This is mandatory and has been a recurring failure. On ANY "unknown credential", "missing key", "missing data", auth, or integration error, the FIRST action is to read the secret from AWS Secrets Manager using the pattern `seraphim/<service>`. Do not report a blocker, do not prompt the user, and do not invent a placeholder until that check has been done and failed.

Known secrets (all live under this pattern):

| Service            | Secret name                 |
| ------------------ | --------------------------- |
| Anthropic          | `seraphim/anthropic`        |
| OpenAI             | `seraphim/openai`           |
| App Store Connect  | `seraphim/appstoreconnect`  |
| Expo               | `seraphim/expo`             |
| GitHub             | `seraphim/github-token`     |
| Google Play        | `seraphim/googleplay`       |

Resolve, for example, with: `aws secretsmanager get-secret-value --secret-id seraphim/<service> --query SecretString --output text`

## What "done" is not

- "Looks done" is not done. A screen full of hardcoded objects looks alive and is
  not. Wire the real data path before any UI polish.
- A passing build is not a passing quality bar. The Agent Stop verification script
  (`.kiro/scripts/verify-app.sh`) is the source of truth; if it exits non-zero,
  the app is not done — fix the specific failure and re-run.
