---
name: code-review
description: Load when reviewing generated code for engineering quality. Type safety, error handling, dead code, naming, complexity. Returns a JSON severity-ranked report.
---

# Code review (subagent skill)

Engineering quality reviewer. Style/design quality is `frontend-app-design`'s
job, NOT this one. Security is `security-review`'s job. Persistence rules are
`zustand-persistence`'s job. This skill catches:

- Type safety
- Error handling
- Dead code
- Naming
- Complexity / organization

## Output

```json
{
  "passed": true,
  "findings": [
    { "severity": "warn", "file": "app/(tabs)/index.tsx", "line": 42, "rule": "any-cast", "message": "(habit as any).color — should narrow the type" }
  ]
}
```

Severity legend: `block` (fail build) / `warn` (surface) / `info` (log).

## Rules

### Type safety (warn → block on repeat)

- ⚠ `as any` cast outside test files.
- ⚠ `// @ts-ignore` / `// @ts-expect-error` without an explanatory comment.
- ⚠ `any` in a function signature.
- ⚠ Non-null assertion `!` used to silence type errors.
- ✗ `tsconfig.json` with `"strict": false` (block).

### Error handling (warn)

- ⚠ Empty `catch` block.
- ⚠ `throw 'string'` (use `throw new Error(...)`).
- ⚠ `Promise` returned without `.catch` and not `await`ed.
- ⚠ User-facing error rendered as raw `error.message` (should be a designed
  state — see `frontend-app-design`).

### Dead / unused code (warn)

- ⚠ Imports that aren't used.
- ⚠ Variables / functions defined but never referenced.
- ⚠ `console.log` left in non-test code.
- ⚠ Commented-out blocks > 5 lines.

### Naming (info)

- ℹ Single-letter variable names (except loop counters).
- ℹ Boolean variables not prefixed with `is/has/should/can`.
- ℹ Functions named `handle*` that don't take an event.

### Complexity (warn)

- ⚠ Function > 80 lines.
- ⚠ JSX block > 100 lines (extract a component).
- ⚠ Cyclomatic complexity > 12 in a single function.
- ⚠ Deeply nested ternaries (> 2 levels).

### React / RN specifics (warn)

- ⚠ `useEffect` with empty deps but referencing changing values.
- ⚠ `useState` updater not using the functional form when state is read in
  the update.
- ⚠ Missing `key` on a list `.map()`.
- ⚠ Inline object/function in props that breaks `React.memo` (only a `warn`,
  not a `block`).
- ⚠ `useCallback`/`useMemo` overused for primitives.

### Imports (info)

- ℹ Relative imports going `../../../` (suggest a path alias).
- ℹ Mixed default + named imports from the same module.

## Self-check

- [ ] Zero `as any` outside tests.
- [ ] Every async function either `await`ed or has `.catch`.
- [ ] No `console.log` in shipped code.
- [ ] No function > 80 lines.
- [ ] Every list `.map()` has a stable `key`.
- [ ] Tsconfig strict.
