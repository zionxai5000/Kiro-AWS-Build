#!/bin/sh
# zionx-watchdog.sh — Phase 4.12 CPU + network anomaly monitoring.
#
# Polls /proc/stat (CPU) and /proc/net/dev (RX/TX bytes) once a second.
# Triggers when:
#   • CPU stays > CPU_THRESHOLD (default 90%) for CPU_WINDOW_S seconds (default 120),
#   • OR outbound bytes exceed NET_THRESHOLD_PER_MIN bytes/min (default 100MB).
#
# When triggered, the watchdog kills every process under /home/user/project
# (the agent's workdir) and writes a kill report to /var/log/zionx-watchdog.log.
# The sandbox itself is left alive so the agent loop can read the kill
# reason, surface it to the user, and decide whether to retry or escalate.
#
# Tunables via env vars (set on the E2B sandbox provision call):
#   ZIONX_CPU_THRESHOLD          default 90
#   ZIONX_CPU_WINDOW_S           default 120
#   ZIONX_NET_THRESHOLD_PER_MIN  default 104857600 (100 MB)
#
# This is best-effort observability — it's NOT a hard isolation boundary.
# That layer is the egress allowlist + E2B's own VM-level isolation.

set -u

CPU_THRESHOLD="${ZIONX_CPU_THRESHOLD:-90}"
CPU_WINDOW_S="${ZIONX_CPU_WINDOW_S:-120}"
NET_THRESHOLD_PER_MIN="${ZIONX_NET_THRESHOLD_PER_MIN:-104857600}"

LOG=/var/log/zionx-watchdog.log
mkdir -p /var/log
touch "$LOG"

prev_idle=0
prev_total=0
high_cpu_seconds=0
prev_tx=0
window_tx=0
window_start=$(date +%s)

read_cpu() {
  # First line of /proc/stat is `cpu  user nice system idle iowait irq softirq ...`
  cpu_line=$(awk '/^cpu / {print}' /proc/stat)
  user=$(echo "$cpu_line" | awk '{print $2}')
  nice=$(echo "$cpu_line" | awk '{print $3}')
  system=$(echo "$cpu_line" | awk '{print $4}')
  idle=$(echo "$cpu_line" | awk '{print $5}')
  iowait=$(echo "$cpu_line" | awk '{print $6}')
  total=$((user + nice + system + idle + iowait))
  echo "$idle $total"
}

read_tx_bytes() {
  # Sum TX bytes across all non-loopback interfaces.
  awk '/:/ && $1 !~ /^lo:/ {sum += $10} END {print sum+0}' /proc/net/dev
}

kill_user_procs() {
  reason="$1"
  echo "[watchdog] $(date -Is) KILL — reason=$reason" >> "$LOG"
  # Find every process whose CWD is under /home/user/project and SIGKILL it.
  for pid in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
    cwd_link=$(readlink "/proc/$pid/cwd" 2>/dev/null) || continue
    case "$cwd_link" in
      /home/user/project*)
        kill -9 "$pid" 2>/dev/null && echo "[watchdog]   killed pid=$pid cwd=$cwd_link" >> "$LOG"
        ;;
    esac
  done
}

while true; do
  # ---- CPU ----
  set -- $(read_cpu); idle=$1; total=$2
  if [ "$prev_total" -gt 0 ]; then
    diff_total=$((total - prev_total))
    diff_idle=$((idle - prev_idle))
    if [ "$diff_total" -gt 0 ]; then
      cpu_used=$(( (100 * (diff_total - diff_idle)) / diff_total ))
      if [ "$cpu_used" -ge "$CPU_THRESHOLD" ]; then
        high_cpu_seconds=$((high_cpu_seconds + 1))
        if [ "$high_cpu_seconds" -ge "$CPU_WINDOW_S" ]; then
          kill_user_procs "cpu_pegged_${cpu_used}pct_for_${high_cpu_seconds}s"
          high_cpu_seconds=0
        fi
      else
        high_cpu_seconds=0
      fi
    fi
  fi
  prev_idle=$idle
  prev_total=$total

  # ---- Network ----
  tx=$(read_tx_bytes)
  if [ "$prev_tx" -gt 0 ]; then
    delta=$((tx - prev_tx))
    [ "$delta" -lt 0 ] && delta=0
    window_tx=$((window_tx + delta))
  fi
  prev_tx=$tx
  now=$(date +%s)
  if [ $((now - window_start)) -ge 60 ]; then
    if [ "$window_tx" -gt "$NET_THRESHOLD_PER_MIN" ]; then
      kill_user_procs "outbound_${window_tx}_bytes_in_60s"
    fi
    window_tx=0
    window_start=$now
  fi

  sleep 1
done
