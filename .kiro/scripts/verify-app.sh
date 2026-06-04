#!/usr/bin/env bash
# verify-app.sh — SEQUENTIAL, BLOCKING quality gate.
#
# Gates run in priority order, cheapest/most-deterministic first. The script
# STOPS at the first failure: a later gate never runs until the earlier one
# passes 100%. Nothing "aggregates at the end" anymore — fail gate N and gates
# N+1.. are reported as NOT RUN.
#
# This script is the DETERMINISTIC floor (compiles? real data? structure? builds?).
# The visual gate is judgment, not determinism, so it is NOT scored here — it is
# enforced by the capture pipeline (which must run against a router-preserving
# runtime with frame-diff dedup, see frame-diff.ts). Trust this script at 100%;
# treat the visual score as a signal with a sanity floor.
#
# Mode: auto-detects app vs host monorepo. Override with QG_MODE=app|host.

set -uo pipefail
ROOT="$(pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- mode detection ----------
detect_mode() {
  case "${QG_MODE:-auto}" in
    app)  echo app;  return ;;
    host) echo host; return ;;
  esac
  [ -n "${QG_HOST:-}" ] && { echo host; return; }
  [ -f .kiro/host-monorepo ] && { echo host; return; }
  # A generated Expo app has an app manifest; the host monorepo does not.
  if [ -f app.json ] || [ -f app.config.js ] || [ -f app.config.ts ]; then echo app; else echo host; fi
}
MODE="$(detect_mode)"

GATE_NUM=0
gate()    { GATE_NUM=$((GATE_NUM+1)); printf '\n[gate %s] %s\n' "$GATE_NUM" "$1"; }
passln()  { echo "  [pass] $1"; }
warnln()  { echo "  [warn] $1"; }
block()   {
  echo "  [FAIL] $1"
  echo ""
  echo "=== GATE $GATE_NUM FAILED — STOPPING HERE. ==="
  echo "    Sequential gating: every gate after this one was NOT run."
  echo "    Fix this gate to 100%, then re-run. Nothing advances until it passes."
  echo ""
  exit 1
}

echo "=== Quality gate: $(basename "$ROOT")  (mode: $MODE) ==="

# ---------- Gate 1: typecheck (always; deterministic) ----------
gate "typecheck"
if [ -f tsconfig.json ]; then
  if npx --no-install tsc --noEmit >/tmp/qg_tsc.log 2>&1; then
    passln "typecheck"
  else
    tail -n 30 /tmp/qg_tsc.log | sed 's/^/        /'
    block "typecheck — code does not compile (see errors above)"
  fi
else
  warnln "no tsconfig.json — typecheck skipped"
fi

# ---------- Gate 2: no static data (always; deterministic) ----------
gate "no-static-data"
if node "$HERE/check-no-static-data.mjs"; then
  passln "no-static-data"
else
  block "no-static-data — hardcoded data found (see above)"
fi

# ---------- host monorepo stops here ----------
if [ "$MODE" = "host" ]; then
  echo ""
  warnln "host monorepo — app-specific gates (lint/data/onboarding/build) skipped"
  echo ""
  echo "=== Deterministic gates passed (host mode). ==="
  exit 0
fi

# ---------- Gate 3: lint (app mode; blocking only if a config exists) ----------
gate "lint"
if compgen -G ".eslintrc*" >/dev/null 2>&1 || compgen -G "eslint.config.*" >/dev/null 2>&1; then
  if npx --no-install eslint . >/tmp/qg_lint.log 2>&1; then
    passln "lint"
  else
    tail -n 30 /tmp/qg_lint.log | sed 's/^/        /'
    block "lint — errors found (see above)"
  fi
else
  warnln "no eslint config — lint skipped"
fi

# ---------- Gate 4: persistence / data layer present ----------
gate "persistence (data layer present)"
if find . -type d \( -name node_modules -prune \) -o -type d -name data -print 2>/dev/null \
   | grep -qE "(^|/)src/data$|(^|/)data$"; then
  passln "data layer present (src/data/)"
else
  block "persistence — no src/data/ data-access layer (see steering 20-persistence.md)"
fi

# ---------- Gate 5: onboarding present ----------
gate "onboarding present"
if find src -type f -iname "OnboardingFlow.*" 2>/dev/null | grep -q .; then
  passln "onboarding component present"
else
  block "onboarding — src/onboarding/OnboardingFlow.* not found (see steering 30-onboarding.md)"
fi

# ---------- Gate 6: build ----------
gate "build"
if [ -f package.json ] && grep -q '"build"' package.json; then
  if npm run build >/tmp/qg_build.log 2>&1; then
    passln "build"
  else
    tail -n 30 /tmp/qg_build.log | sed 's/^/        /'
    block "build — see errors above"
  fi
else
  warnln "no build script — build skipped"
fi

echo ""
echo "=== All deterministic gates passed (app mode). ==="
echo "    NEXT (enforced by the capture pipeline, not this script):"
echo "    the VISUAL gate must run against a router-preserving runtime (real Expo,"
echo "    NOT the Snack web bypass) with frame-diff dedup. A run of identical frames"
echo "    is a FAIL there, not a pass."
echo ""
exit 0
