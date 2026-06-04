---
inclusion: always
---

# Persistence (no static data, ever)

Every app ships with a real, persistent data layer. "No static data" is the rule
that regresses most often, so it is enforced both here and by an automated scan
(`.kiro/scripts/check-no-static-data.mjs`).

## Hard rules

- **No hardcoded data in shipped screens.** No `const items = [ {...}, {...} ]`
  driving a list, no `mockData`, `sampleData`, `dummy`, `lorem`, or fixture arrays
  imported into UI. Data comes from the data layer at runtime.
- **Full CRUD.** Anything the user creates, edits, or deletes must persist and
  survive an app reload and a cold start.
- **Single data-access layer.** All reads/writes go through one module (e.g.
  `src/data/`), never fetched ad-hoc inside components.
- **Optimistic UI + cache.** Writes update the UI immediately and reconcile;
  reads cache for offline. Show real loading and error states, not blank screens.

## Where data lives (this project's stack)

This is an Expo / React Native app on AWS. Use a real backend, not local-only arrays:

- Default: a hosted API backed by **DynamoDB** (single-table or per-entity), with
  the API layer already wired in the golden scaffold.
- Local persistence/cache: a typed store (e.g. SQLite via `expo-sqlite`, or
  `react-native-mmkv`, or zustand persist + AsyncStorage) behind the same data-
  access module — used as cache and for offline, not as the source of truth
  substitute for the backend.
- Seeding: seed via an API call or a migration script. NEVER seed by importing a
  literal array into a component. Seeds named `SEED_*`, `INITIAL_*`, `DEFAULT_*`
  inside the data layer are allowed for first-launch only.

## Credentials — Secrets Manager first

Any backend, API, or third-party integration credential is resolved from AWS
Secrets Manager under `seraphim/<service>` BEFORE reporting any "missing key /
unknown credential / missing data" error. This is mandatory (see
`00-quality-bar.md` for the full secret list). Do not hardcode keys, do not put
them in `.env` committed to git, do not prompt the user before the Secrets
Manager check has run.

## Data-layer checklist (must all be true)

- [ ] A `src/data/` (or equivalent) module is the only place that reads/writes.
- [ ] Types are defined for every entity.
- [ ] Create / read / update / delete all implemented and wired to UI.
- [ ] State survives reload and cold start (verified by the round-trip smoke test).
- [ ] Loading, empty, and error states are designed (see design system).
- [ ] No literal data arrays in any screen/component (scanner passes).
