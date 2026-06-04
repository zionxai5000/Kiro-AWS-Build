#!/usr/bin/env bash
# verify-app.sh - the quality gate. Run on Agent Stop.
# Aggregates all checks, prints a clear report, exits non-zero if ANY gate fails.
# Designed to be tolerant of missing optional tooling (warns) but to fail hard on
# real quality violations.

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

ROOT="$(pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
PASS="  [pass]"
FAIL="  [FAIL]"
WARN="  [warn]"

fail() { echo "$FAIL $1"; FAILED=1; }
pass() { echo "$PASS $1"; }
warn() { echo "$WARN $1"; }

# Detect if we're running on the host monorepo (Kiro-AWS-Build itself) rather
# than a generated app. If so, skip the app-specific gates because the host
# is a multi-package workspace with dashboard + backend + scripts — it does
# not itself have onboarding or a single src/data/ layer.
IS_HOST_MONOREPO=0
if [ -d "packages" ] && [ -f "packages/app/package.json" ] && [ -d ".kiro/agent-tasks" ]; then
  IS_HOST_MONOREPO=1
fi

echo ""
echo "=== Quality gate: $(basename "$ROOT") ==="
if [ "$IS_HOST_MONOREPO" -eq 1 ]; then
  echo "  (host monorepo detected — app-specific gates [onboarding/data/build] skipped)"
fi
echo ""

# 1. TypeScript typecheck (if a tsconfig exists)
if [ -f tsconfig.json ]; then
  if npx --no-install tsc --noEmit >/tmp/qg_tsc.log 2>&1; then
    pass "typecheck"
  else
    fail "typecheck - see errors below"
    tail -n 30 /tmp/qg_tsc.log | sed 's/^/        /'
  fi
else
  warn "typecheck skipped (no tsconfig.json)"
fi

# 2. Lint (only if an eslint config is present)
if ls .eslintrc* eslint.config.* >/dev/null 2>&1; then
  if npx --no-install eslint . >/tmp/qg_lint.log 2>&1; then
    pass "lint"
  else
    fail "lint - see errors below"
    tail -n 30 /tmp/qg_lint.log | sed 's/^/        /'
  fi
else
  warn "lint skipped (no eslint config)"
fi

# 3. No static data (hard gate)
if node "$HERE/check-no-static-data.mjs"; then
  pass "no-static-data"
else
  fail "no-static-data - hardcoded data found (see above)"
fi

# 4. Onboarding present (hard gate, but skipped on host monorepo)
if [ "$IS_HOST_MONOREPO" -eq 1 ]; then
  warn "onboarding skipped (host monorepo, not a generated app)"
elif find src -type f -iname "OnboardingFlow.*" 2>/dev/null | grep -q . ; then
  pass "onboarding component present"
elif find app -type d -iname "onboarding" 2>/dev/null | grep -q . ; then
  pass "onboarding directory present (app/onboarding/)"
else
  fail "onboarding - src/onboarding/OnboardingFlow.* or app/onboarding/ not found (see steering 30-onboarding.md)"
fi

# 5. Persistence layer present (hard gate, skipped on host monorepo)
if [ "$IS_HOST_MONOREPO" -eq 1 ]; then
  warn "data layer skipped (host monorepo)"
elif find . -type d \( -name node_modules -prune \) -o -type d \( -name data -o -name stores \) -print 2>/dev/null | grep -qE "(^|/)(src/)?(data|stores)$"; then
  pass "data layer present (src/data/ or stores/)"
else
  fail "persistence - no src/data/ or stores/ data-access layer found (see steering 20-persistence.md)"
fi

# 6. Build (if a build script exists). Non-fatal if absent for RN/Expo dev.
if [ "$IS_HOST_MONOREPO" -eq 1 ]; then
  warn "build skipped (host monorepo — CI handles dashboard build)"
elif [ -f package.json ] && grep -q '"build"' package.json; then
  if npm run build >/tmp/qg_build.log 2>&1; then
    pass "build"
  else
    fail "build - see errors below"
    tail -n 30 /tmp/qg_build.log | sed 's/^/        /'
  fi
else
  warn "build skipped (no build script)"
fi

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "=== GATE FAILED. The app is NOT done. Fix the [FAIL] items and re-run. ==="
  echo ""
  exit 1
fi
echo "=== All automated gates passed. Now do the manual reviews below. ==="
echo ""
exit 0
