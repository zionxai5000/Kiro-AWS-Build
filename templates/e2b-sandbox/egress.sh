#!/bin/sh
# zionx-egress.sh — Phase 4.11 egress allowlist.
#
# Default-deny on the OUTPUT chain, then explicit ACCEPT rules for the hosts
# the agent legitimately needs. Runs once on sandbox boot.
#
# Allowed buckets:
#   • npm + jsdelivr               package install / runtime
#   • Expo / EAS                   build + bundle hosting
#   • GitHub                       template + npm package metadata
#   • Anthropic                    Claude API for in-sandbox tool calls
#                                  (NOTE: the agent loop itself runs OUTSIDE
#                                  the sandbox, but the sandbox may need to
#                                  call into Claude for code review during
#                                  EAS build steps)
#   • Sentry                       crash telemetry
#   • Apple/Google                 app-store metadata for `eas submit`
#
# Why permissive on common DNS (Cloudflare, Google) too:
#   the resolver inside the sandbox will fail otherwise and every tool
#   call returns DNS errors. We accept this trade-off.
#
# Bypass: if `ZIONX_EGRESS_OFF=1` is in the environment (set via E2B's
# environment variable injection), the script returns 0 without applying
# rules — useful for one-off troubleshooting sandboxes.

set -e

if [ "${ZIONX_EGRESS_OFF:-0}" = "1" ]; then
  echo "[egress] ZIONX_EGRESS_OFF=1 — skipping firewall setup"
  exit 0
fi

# Loopback always allowed.
iptables -A OUTPUT -o lo -j ACCEPT

# Established + related — outbound replies to inbound requests.
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# DNS — UDP 53 to common public resolvers.
iptables -A OUTPUT -p udp --dport 53 -d 1.1.1.1 -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -d 8.8.8.8 -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -d 8.8.4.4 -j ACCEPT

# Allowed hostnames (resolved via getent → IP rules — Linux iptables is
# IP-based, so we resolve once at boot and accept those addresses).
ALLOWED="
registry.npmjs.org
cdn.jsdelivr.net
unpkg.com
expo.dev
api.expo.dev
exp.host
github.com
api.github.com
codeload.github.com
api.anthropic.com
o4505031751893504.ingest.sentry.io
sentry.io
api.appstoreconnect.apple.com
androidpublisher.googleapis.com
"

for host in $ALLOWED; do
  for ip in $(getent ahosts "$host" 2>/dev/null | awk '{print $1}' | sort -u); do
    iptables -A OUTPUT -d "$ip" -j ACCEPT 2>/dev/null || true
  done
done

# Default-deny everything else outbound.
iptables -A OUTPUT -j DROP

echo "[egress] iptables OUTPUT chain configured: default-deny + allowlist applied"
