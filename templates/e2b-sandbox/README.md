# zionx-expo-base — Custom E2B sandbox template

Phases 4.10 / 4.11 / 4.12 of the agent harness.

## What this is

A custom E2B template that bakes in:

- **Node 20** + Expo + EAS CLIs (saves npm install on every project)
- **Pre-cached `templates/golden-starter/`** at `/workspace/template` (saves
  npm dep resolution when copying the starter into a fresh project)
- **iptables egress allowlist** (`egress.sh`) — default-deny + explicit accept
  for npm / Expo / GitHub / Anthropic / Sentry / Apple / Google
- **CPU + network watchdog** (`watchdog.sh`) — kills runaway processes if
  CPU stays ≥90% for 120s OR outbound exceeds 100 MB / minute

The default `base` template works for the agent harness today (verified
end-to-end Session 9 — agent fires `run_command`, sandbox returns real
stdout in 7.6s). This custom template optimizes for cold-start and adds
hardening; it's an upgrade, not a blocker.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | The image build instructions |
| `e2b.toml` | E2B template descriptor (cpu/memory/idle/start_dir) |
| `egress.sh` | iptables rules applied on boot |
| `watchdog.sh` | CPU + network anomaly monitor |

## Build + publish (one-time)

The E2B CLI requires interactive login. Run from this directory:

```bash
# 1. Install the CLI (first time only)
npm install -g @e2b/cli

# 2. Authenticate against the team account
e2b auth login

# 3. From the repo root, copy golden-starter next to this template so the
#    Dockerfile COPY line resolves (e2b template build runs Docker from cwd).
#    The COPY in the Dockerfile is `golden-starter`, not the full path —
#    that's intentional so the build context is just this directory.
cp -r templates/golden-starter templates/e2b-sandbox/golden-starter

# 4. Build + publish to your team's namespace
cd templates/e2b-sandbox
e2b template build

# 5. Tear down the copied directory once published.
cd ../..
rm -rf templates/e2b-sandbox/golden-starter
```

The CLI prints the published `template_name` (matches `e2b.toml`) and a
unique `template_id` UUID on success.

## Switch the sandbox client to use it

After publish, edit `packages/app/src/zionx/app-development/services/sandbox-client.ts`:

```ts
const DEFAULT_TEMPLATE = 'zionx-expo-base';  // was 'base'
```

Redeploy. The next time a project provisions a sandbox, the new template
is used. Existing live sandboxes keep running on the old template until
their idle timeout fires.

## Reverting

If a build of the custom template breaks production, revert the one-line
change above to `'base'` and redeploy. The `base` template stays available
indefinitely on E2B's side.

## Why a custom template was deferred initially

The trade-off:

- **base template**: ready immediately, well-supported by E2B, ~3-5s
  cold-start, no network hardening (open egress).
- **zionx-expo-base**: requires a one-time CLI publish per E2B team, ~1s
  cold-start once warm, hardened egress, watchdog.

For the Phase 4 verification we wanted the cheapest path to "real sandbox
runs real commands." Once the harness is in regular use, the savings on
cold-start + the hardening become worth the publish step.

## Verifying the egress allowlist

After publish, provision a sandbox using the new template and run:

```bash
# Should succeed (npm registry is allowlisted)
curl -sSI https://registry.npmjs.org/

# Should hang or fail (random host, not allowlisted)
curl -sSI --max-time 5 https://example.com/
```

If `example.com` returns a 200, the egress script didn't apply — check
`/var/log/zionx-watchdog.log` and `iptables -L OUTPUT -n` inside the
sandbox.

## Verifying the watchdog

Provision a sandbox and run a CPU-bound loop:

```bash
yes > /dev/null &
sleep 130  # past the CPU_WINDOW_S threshold of 120s
cat /var/log/zionx-watchdog.log
```

The log should show a kill entry for the `yes` process.

## Tunables (set as E2B sandbox env vars)

- `ZIONX_EGRESS_OFF=1` — skip iptables setup (one-off troubleshooting)
- `ZIONX_CPU_THRESHOLD` — CPU percent that counts as "high" (default 90)
- `ZIONX_CPU_WINDOW_S` — seconds of high CPU before kill (default 120)
- `ZIONX_NET_THRESHOLD_PER_MIN` — outbound bytes/min before kill (default 100MB)
