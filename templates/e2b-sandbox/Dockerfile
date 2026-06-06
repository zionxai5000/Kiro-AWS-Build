# zionx-expo-base — custom E2B sandbox template for the agent harness.
#
# Phases 4.10 / 4.11 / 4.12.
#
# Why a custom template:
#   • cold-start time — the `base` image takes ~3-5s to provision a fresh
#     sandbox. Pre-warming Expo + node_modules into the image gets us to
#     <1s for the agent to start running tools.
#   • egress hardening — the agent runs untrusted LLM-generated code. The
#     iptables OUTPUT chain restricts outbound traffic to a known-good
#     allowlist (npm, Expo, jsdelivr, Anthropic, Sentry, GitHub).
#   • predictability — pinning the runtime versions makes builds reproducible
#     and protects against upstream image churn.
#
# Build:
#   e2b template build templates/e2b-sandbox/
#
# After publish, swap `services/sandbox-client.ts:DEFAULT_TEMPLATE` from
# `'base'` to `'zionx-expo-base'` and redeploy. See PHASE-4-RUNBOOK.md.

FROM e2bdev/base:latest

# ---------------------------------------------------------------------------
# Apt deps — git + curl + iptables (for egress allowlist), python3 (for the
# trivial http.server fallback used by the e2e probe).
# ---------------------------------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git curl ca-certificates iptables python3 \
 && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Node 20 (matches the version probed by harness-sandbox-probe.mjs — v20.9.0).
# E2B base already ships node, but we pin to 20.x explicitly.
# ---------------------------------------------------------------------------
RUN node --version | grep -E '^v20\.' || (echo "expected node 20.x in base image" && exit 1)

# ---------------------------------------------------------------------------
# Expo + EAS CLIs — global so the agent's run_command tool can reach them
# without bundle-resolution overhead.
# ---------------------------------------------------------------------------
RUN npm install -g expo@latest eas-cli@latest

# ---------------------------------------------------------------------------
# Pre-cache the golden starter into /workspace/template.
# When a project is provisioned, the sandbox-client copies this into the
# project's workdir so npm install is a near-no-op (everything is already
# resolved against the on-image cache).
# ---------------------------------------------------------------------------
COPY golden-starter /workspace/template
WORKDIR /workspace/template
RUN if [ -f package.json ]; then npm ci --omit=optional --no-audit --no-fund || npm install --no-audit --no-fund ; fi
WORKDIR /

# ---------------------------------------------------------------------------
# Egress allowlist (Phase 4.11).
# Default-deny for OUTPUT, then explicit ACCEPT for the LLM/build/Expo hosts
# the agent legitimately needs to reach. Run on container boot so the
# allowlist applies before any agent code runs.
# ---------------------------------------------------------------------------
COPY egress.sh /usr/local/bin/zionx-egress.sh
RUN chmod +x /usr/local/bin/zionx-egress.sh

# ---------------------------------------------------------------------------
# CPU/network watchdog (Phase 4.12).
# Polls /proc/stat + /proc/net/dev once a second; if CPU stays >90% for 120s
# OR outbound bytes exceed 100MB/min, the watchdog kills the user-visible
# process tree. The sandbox itself is left alive so the agent can read the
# kill reason and decide whether to retry.
# ---------------------------------------------------------------------------
COPY watchdog.sh /usr/local/bin/zionx-watchdog.sh
RUN chmod +x /usr/local/bin/zionx-watchdog.sh

# ---------------------------------------------------------------------------
# Default workdir for projects.
# sandbox-client.ts auto-mkdir's this on every provision; pre-creating it
# eliminates one round-trip on the cold path.
# ---------------------------------------------------------------------------
RUN mkdir -p /home/user/project
WORKDIR /home/user/project

# Open Metro + Expo + the trivial http.server fallback ports.
EXPOSE 8081 8082 19000 19001 19002

# Kick off egress + watchdog in the background, then idle.
# E2B runs commands via its own exec channel (the agent's run_command tool),
# so the entrypoint just needs to keep PID 1 alive.
CMD bash -c "/usr/local/bin/zionx-egress.sh & /usr/local/bin/zionx-watchdog.sh & sleep infinity"
