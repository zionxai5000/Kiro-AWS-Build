# Hooks setup (created via Kiro's Hook UI or programmatically)

The steering files do most of the enforcement automatically on every prompt.
These two hooks add the "spec it up front" and "verify before done" bookends.

The two hooks below are created automatically by Kiro via the `createHook` tool
when this kit is installed. To recreate them manually open the Hook UI with
`Cmd/Ctrl + Shift + P` → `Kiro: Open Kiro Hook UI` and paste the prompts below.

---

## Hook 1 — Spec the build to the quality bar

- **Trigger Type:** Prompt Submit
- **Action:** Ask Kiro (agent prompt)
- **Instructions (paste verbatim):**

```
If the user's prompt is a request to build, create, generate, or scaffold an
app or a new feature, do this BEFORE writing any feature code:

1. Resolve credentials first. If anything needs a key or backend, read it from
   AWS Secrets Manager using the pattern seraphim/<service> before reporting any
   missing-credential or missing-data blocker.
2. Write a spec under .kiro/specs/<app-name>/ (requirements.md, design.md,
   tasks.md). The spec MUST explicitly include: the persistence schema (no
   static data), the onboarding/walkthrough flow, and a statement that
   .kiro/steering/10-design-system.md tokens are the only styling source.
3. Scaffold from the golden starter template if one exists; otherwise create
   the three foundations first: the design-system token module, the src/data/
   data layer, and src/onboarding/OnboardingFlow.tsx.
4. Only then build features into that skeleton.

Follow .kiro/steering/00-quality-bar.md and its referenced files exactly.
Do not declare the work done until .kiro/scripts/verify-app.sh would pass.
```

---

## Hook 2 — Quality gate before "done"

- **Trigger Type:** Agent Stop
- **Action:** Ask Kiro (agent prompt)
- **Instructions (paste verbatim):**

```
Run the quality gate and do not consider the work finished until it passes.

1. Run the verification script:
      bash .kiro/scripts/verify-app.sh
2. If it exits non-zero, read the [FAIL] lines, fix ONLY the failing slice (do
   not rewrite working code), and run it again. Repeat up to 3 times.
3. When the script passes, do the two manual reviews it can't automate:
   a. Visual review: open the key screens (or screenshots) and grade them 1-5
      on hierarchy, spacing, typography, motion, and polish against
      .kiro/steering/10-design-system.md. Anything below 4.5 is a fail - fix
      the specific screens and re-check.
   b. Persistence round-trip: create a record, reload/cold-start the app, and
      confirm it is still there. If not, fix the data layer.
4. Report a short pass/fail summary of all five gates from
   .kiro/steering/00-quality-bar.md.
```

---

## Notes

- Hook 2 uses an agent prompt (not a bare Run Command) on purpose: the script
  is deterministic, but fixing failures and the visual/persistence reviews
  need the agent in the loop.
- On Windows the script can be invoked via Git Bash:
  `bash .kiro/scripts/verify-app.sh` (the agent will pick this automatically).
- Keep the scripts executable on Mac/Linux: `chmod +x .kiro/scripts/*.sh
  .kiro/scripts/*.mjs`.
