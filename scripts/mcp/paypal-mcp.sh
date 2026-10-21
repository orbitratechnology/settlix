#!/usr/bin/env bash
# Launches the official PayPal MCP server (@paypal/mcp) against the PayPal SANDBOX.
#
# PayPal access tokens expire after a few hours, so instead of storing one we mint
# a fresh token at launch from PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET, read from
# the environment or from .env.local. Nothing is ever printed to stdout except the
# MCP protocol itself; diagnostics go to stderr and never include secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"

# Read a single KEY=value line from .env.local without sourcing (no code execution).
read_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//'
}

PAYPAL_CLIENT_ID="${PAYPAL_CLIENT_ID:-$(read_env PAYPAL_CLIENT_ID)}"
PAYPAL_CLIENT_SECRET="${PAYPAL_CLIENT_SECRET:-$(read_env PAYPAL_CLIENT_SECRET)}"
PAYPAL_BASE_URL="${PAYPAL_BASE_URL:-$(read_env PAYPAL_BASE_URL)}"
PAYPAL_BASE_URL="${PAYPAL_BASE_URL:-https://api-m.sandbox.paypal.com}"

if [[ "$PAYPAL_BASE_URL" != "https://api-m.sandbox.paypal.com" ]]; then
  echo "[paypal-mcp] Refusing to start: this project only allows the PayPal SANDBOX." >&2
  exit 1
fi

if [[ -z "$PAYPAL_CLIENT_ID" || -z "$PAYPAL_CLIENT_SECRET" ]]; then
  echo "[paypal-mcp] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set (env or .env.local)." >&2
  exit 1
fi

TOKEN_JSON="$(curl -sS --fail-with-body --max-time 20 \
  -u "${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}" \
  -H "Accept: application/json" \
  -d "grant_type=client_credentials" \
  "${PAYPAL_BASE_URL}/v1/oauth2/token")" || {
  echo "[paypal-mcp] Failed to obtain a sandbox access token (check credentials)." >&2
  exit 1
}

PAYPAL_ACCESS_TOKEN="$(printf '%s' "$TOKEN_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch{}})')"
if [[ -z "$PAYPAL_ACCESS_TOKEN" ]]; then
  echo "[paypal-mcp] Token response did not contain an access_token." >&2
  exit 1
fi

export PAYPAL_ACCESS_TOKEN
export PAYPAL_ENVIRONMENT="SANDBOX"
exec npx -y @paypal/mcp@1.8.1 --tools=all
