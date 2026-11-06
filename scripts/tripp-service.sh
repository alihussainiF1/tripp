#!/usr/bin/env bash
# Manage tripp as a systemd user service on Linux.
#   scripts/tripp-service.sh install|uninstall|status|restart|logs
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/tripp.service"
BASE_DIR="${TRIPP_HOME:-$HOME/.tripp/home}"
PORT="${TRIPP_PORT:-3901}"
NODE_BIN="${TRIPP_NODE:-$(command -v node)}"

resolve_host() {
  if [ -n "${TRIPP_HOST:-}" ]; then
    echo "$TRIPP_HOST"
  elif command -v tailscale >/dev/null 2>&1 && tailscale ip -4 >/dev/null 2>&1; then
    tailscale ip -4 | head -n1
  else
    echo "127.0.0.1"
  fi
}

install_unit() {
  local host
  host="$(resolve_host)"
  if [ ! -f "$REPO/apps/server/dist/bin.mjs" ]; then
    echo "Build first: cd $REPO && vp run build" >&2
    exit 1
  fi
  mkdir -p "$UNIT_DIR" "$BASE_DIR"
  cat >"$UNIT" <<EOF
[Unit]
Description=tripp (Bots on T3 Code)
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO/apps/server
Environment=T3CODE_TELEMETRY_ENABLED=false
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN $REPO/apps/server/dist/bin.mjs serve --base-dir $BASE_DIR --port $PORT --host $host --no-browser
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now tripp.service
  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$USER" 2>/dev/null || true
  fi
  echo "tripp is running on http://$host:$PORT"
  echo "Pair a device: cd $REPO/apps/server && node dist/bin.mjs pair --base-dir $BASE_DIR --ttl 1h"
}

case "${1:-}" in
  install) install_unit ;;
  uninstall)
    systemctl --user disable --now tripp.service 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload
    echo "tripp service removed. Data in $BASE_DIR and ~/.tripp/bots is kept."
    ;;
  status) systemctl --user status tripp.service --no-pager ;;
  restart) systemctl --user restart tripp.service && echo restarted ;;
  logs) journalctl --user -u tripp.service -f ;;
  *)
    echo "usage: $0 install|uninstall|status|restart|logs" >&2
    exit 2
    ;;
esac
