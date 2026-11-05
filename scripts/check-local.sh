#!/usr/bin/env bash
# Read-only check of the local SC4053 DEX development environment.
#
#   scripts/check-local.sh [--rpc-url URL] [--web-url URL]
#
# It answers "do I need to deploy?" without changing anything. It only runs:
#   - `<tool> --version` for node, npm, forge, anvil and cast
#   - `cast chain-id`, `cast block-number` and `cast code` (read-only JSON-RPC calls)
#   - `node contracts/script/export-web.mjs --check` (reads; writes nothing in --check mode)
#   - one HTTP GET to the front end
# It never deploys, never sends a transaction, never starts or stops a process, and never reads a private key.
# Exit status: 0 when no FAIL line was printed, 1 otherwise.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
WEB="${WEB_URL:-http://localhost:3000}"
EXPECTED_CHAIN_ID=31337
DEPLOYMENTS_TS="$ROOT/web/lib/contracts/deployments.ts"

while [ $# -gt 0 ]; do
  case "$1" in
    --rpc-url) RPC="${2:?--rpc-url needs a value}"; shift 2 ;;
    --web-url) WEB="${2:?--web-url needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.foundry/bin:$PATH"

fails=0
warns=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }
warn() { printf 'WARN  %s\n' "$*"; warns=$((warns + 1)); }
info() { printf '      %s\n' "$*"; }

echo "SC4053 DEX local check (read-only)"
echo "  repo:  $ROOT"
echo "  rpc:   $RPC"
echo "  web:   $WEB"
echo

# 1. Tools ---------------------------------------------------------------------------------------------------------
for tool in node npm forge anvil cast; do
  if command -v "$tool" >/dev/null 2>&1; then
    pass "$tool: $("$tool" --version 2>&1 | head -n1)"
  else
    fail "$tool not found on PATH"
    case "$tool" in
      forge|anvil|cast) info "Install Foundry (https://getfoundry.sh), then: export PATH=\"\$HOME/.foundry/bin:\$PATH\"" ;;
      node|npm) info "Install Node.js 22.18 or newer (and npm)." ;;
    esac
  fi
done
if command -v node >/dev/null 2>&1; then
  node_version="$(node -p 'process.versions.node' 2>/dev/null)"
  if [ "$(printf '%s\n%s\n' "22.18.0" "$node_version" | sort -V | head -n1)" != "22.18.0" ]; then
    fail "node $node_version is older than 22.18 (see web/package.json engines)"
  fi
fi
if ! command -v cast >/dev/null 2>&1; then
  echo
  echo "Result: cannot check the chain without cast. $fails problem(s)."
  exit 1
fi

# 2. RPC and chain id ----------------------------------------------------------------------------------------------
echo
chain_id="$(timeout 8 cast chain-id --rpc-url "$RPC" 2>/dev/null)"
if [ -z "$chain_id" ]; then
  fail "no JSON-RPC answer from $RPC"
  info "Start Anvil in its own terminal:  anvil     (it listens on 127.0.0.1:8545)"
  info "Anvil keeps its state only while it runs: a restarted Anvil is a fresh chain with nothing deployed."
  echo
  echo "Result: the chain is unreachable, so nothing else can be checked. $fails problem(s)."
  exit 1
fi
if [ "$chain_id" != "$EXPECTED_CHAIN_ID" ]; then
  fail "chain id is $chain_id, this project expects $EXPECTED_CHAIN_ID (Anvil's default)"
  info "Is $RPC a different network? Nothing else is checked, so no deployment is ever attempted against it."
  echo
  echo "Result: wrong chain. $fails problem(s)."
  exit 1
fi
pass "chain id $chain_id at $RPC"
pass "latest block: $(timeout 8 cast block-number --rpc-url "$RPC" 2>/dev/null || echo unknown)"

# 3. Is the exported deployment on THIS chain? ----------------------------------------------------------------------
echo
if [ ! -f "$DEPLOYMENTS_TS" ]; then
  fail "web/lib/contracts/deployments.ts is missing (nothing has been exported yet)"
  info "Deploy and export once: see README.md, \"Deploy\"."
else
  addr() { grep -E "^[[:space:]]*$1:" "$DEPLOYMENTS_TS" | grep -oE '0x[0-9a-fA-F]{40}' | head -n1; }
  missing=0
  present=0
  for name in tokenFactory marketFactory market baseToken quoteToken; do
    a="$(addr "$name")"
    if [ -z "$a" ]; then
      fail "$name: no address found in deployments.ts"
      missing=$((missing + 1))
      continue
    fi
    code="$(timeout 8 cast code "$a" --rpc-url "$RPC" 2>/dev/null)"
    if [ -n "$code" ] && [ "$code" != "0x" ]; then
      pass "$name has contract code at $a"
      present=$((present + 1))
    else
      fail "$name has NO contract code at $a on this chain"
      missing=$((missing + 1))
    fi
  done
  if [ "$missing" -gt 0 ] && [ "$present" -eq 0 ]; then
    info "None of the exported contracts exist on this chain. This is what a fresh or restarted Anvil looks like."
    info "Only now is a deployment needed: see README.md, \"Deploy\" (docs/DEPLOYMENT.md has the details)."
  elif [ "$missing" -gt 0 ]; then
    info "Only some exported contracts exist. That is unexpected: do not deploy over it. Read docs/TESTING.md, \"Troubleshooting\"."
  else
    # 4. Does the export still match the deployment record and the build? -------------------------------------------
    export_out="$(cd "$ROOT" && node contracts/script/export-web.mjs --check --rpc-url "$RPC" 2>&1)"
    export_status=$?
    if [ "$export_status" -eq 0 ]; then
      pass "export is current: $(printf '%s' "$export_out" | head -n1)"
    else
      fail "export check failed: $(printf '%s' "$export_out" | head -n1 | cut -c1-200)"
      info "The contracts exist, so this chain is NOT empty. Do not redeploy just to clear this."
      info "It usually means contracts/broadcast/Deploy.s.sol/31337/run-latest.json belongs to another chain or run."
      info "See docs/TESTING.md, \"Troubleshooting\" (stale deployments)."
    fi
  fi
fi

# 5. Front end -----------------------------------------------------------------------------------------------------
echo
status="$(curl -s -o /dev/null -m 6 -w '%{http_code}' "$WEB" 2>/dev/null)"
if [ "$status" = "200" ]; then
  pass "front end answers at $WEB (HTTP 200)"
else
  warn "front end not reachable at $WEB (got: ${status:-no answer})"
  info "Start it in its own terminal:  cd web && npm run dev"
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "Result: ready. $warns warning(s). No deployment is needed."
  exit 0
fi
echo "Result: $fails problem(s), $warns warning(s)."
exit 1
