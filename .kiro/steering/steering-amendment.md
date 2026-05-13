# Steering Doc Amendment v2 — Backend Orchestration

This amendment supersedes any React Native, Expo, Zustand, MMKV, or mobile-runtime references in the original steering doc.

## Architecture

We are building a backend orchestration pipeline inside `packages/app/src/zionx/app-development/` — pure Node.js TypeScript, ES2022, Node16 modules.

## Location

`packages/app/src/zionx/app-development/`

## Siblings

`studio/`, `gtm/`, `ads/`, `design/` — this is ZionX domain logic, not system infrastructure.

## NO

React Native, Zustand, MMKV, Expo, browser APIs, UI components, mobile runtime dependencies.

## YES

Pure TypeScript modules, file system operations under a workspace abstraction, event bus integration, API endpoints via shaar, Claude API for code generation, child_process for sandboxed execution.

## Hook Implementation

The 10 hooks remain in intent; their implementation is backend pipeline stages, not React hooks or Kiro IDE hooks. They run as TypeScript modules triggered by:

- **API requests** (manual hooks: build-preparer, store-listing, submission-prep)
- **File system events via event-bus** (sanitizer, generator, validator, secret-scanner, preview-refresher, asset-generator)
- **External webhooks** (crash-watcher via Sentry)

## Phases

The 9 phases from the original spec are renamed per the backend orchestration revision in the conversation. Refer to that for current phase definitions.

## Unchanged Rules

All original hard constraints, idempotency rules, kill switches, dry-run-first policy, panic phrase, and phase discipline still apply unchanged.

## Precedence

The original `steering.md` is preserved as historical context. This amendment takes precedence wherever the two conflict.

## Session Start Protocol

On every future session, the first task is to read both `steering.md` AND this `steering-amendment.md`, with this amendment taking precedence.
