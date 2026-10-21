#!/bin/bash
# SessionStart hook for Claude Code cloud sessions.
# - Ensures Bun matches package.json "packageManager" (bun@x.y.z), or the latest release if unpinned.
# - Installs JS dependencies with Bun when package.json exists.
# - Installs agent-browser (used by the next-dev-loop skill) when missing.
# Idempotent and non-interactive; does nothing outside cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

log() { echo "[session-start] $*" >&2; }

# --- Bun ---------------------------------------------------------------------
target_bun=""
if [ -f "$PROJECT_DIR/package.json" ]; then
  target_bun="$(node -e 'try{const p=require(process.argv[1]).packageManager||"";const m=p.match(/^bun@(\d+\.\d+\.\d+)/);process.stdout.write(m?m[1]:"")}catch{}' "$PROJECT_DIR/package.json")"
fi
if [ -z "$target_bun" ]; then
  target_bun="$(npm view bun version 2>/dev/null || true)"
fi

current_bun="$(bun --version 2>/dev/null || true)"
if [ -n "$target_bun" ] && [ "$current_bun" != "$target_bun" ]; then
  log "Installing Bun $target_bun (current: ${current_bun:-none})"
  installer="$(mktemp)"
  curl -fsSL https://bun.sh/install -o "$installer"
  bash "$installer" "bun-v$target_bun" >/dev/null
  rm -f "$installer"
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qs "BUN_INSTALL=" "$CLAUDE_ENV_FILE"; then
  echo "export BUN_INSTALL=\"$BUN_INSTALL\"" >> "$CLAUDE_ENV_FILE"
  echo "export PATH=\"$BUN_INSTALL/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# --- Dependencies -------------------------------------------------------------
if [ -f "$PROJECT_DIR/package.json" ]; then
  log "Installing dependencies with bun $(bun --version)"
  (cd "$PROJECT_DIR" && bun install)
else
  log "No package.json yet; skipping bun install"
fi

# --- agent-browser (next-dev-loop skill) --------------------------------------
if ! command -v agent-browser >/dev/null 2>&1; then
  log "Installing agent-browser"
  npm install -g agent-browser@latest >/dev/null 2>&1 || log "agent-browser install failed (non-fatal)"
fi

log "Done (bun $(bun --version))"
