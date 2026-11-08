#!/usr/bin/env bash
# Prepares and checks a DISPOSABLE local chain for the manual stop-limit (Bonus 3) test in docs/TESTING.md, Test 14.
# MetaMask accounts of that test: the stop owner is Anvil account 5 and the keeper (who triggers) is Anvil account 6.
#
#   scripts/seed-stop-orders.sh [status|prepare|move-price <price>|add-bid <price> <amount>|verify-after] [--rpc-url URL]
#
#   status        read-only: last trade price, how many stops a trigger call WOULD activate (an eth_call), balances
#   prepare       checks the chain is clean, gives account 5 (the stop owner) 100 NTU and 100 SGDx, then makes ONE trade at 2 so
#                 the market has a last trade price
#   move-price P  a matched trade at P (tick-aligned) between accounts 3 and 2: moves the last trade price. Use it after
#                 you have placed a stop in the app, to make the stop ELIGIBLE (or to leave it waiting for price)
#   add-bid P N   account 2 places a resting BUY of N NTU at P, so that a sell stop that is later triggered can fill
#   verify-after  read-only: after the keeper's trigger transaction, checks the stops, the keeper, the sender and solvency
#
# It NEVER sends triggerStopOrders and never places a stop: those are done in MetaMask. The only transactions it sends
# are plain trades and bids between Anvil's public dev accounts, which are unlocked on the node, so no private key is
# used or printed. It refuses port 8545 (the developer's own chain) and any chain id other than 31337, reads the
# addresses from web/lib/contracts/deployments.ts and writes only a small record of public values outside the repository.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${RPC_URL:-http://127.0.0.1:8547}"
MODE="status"
ARGS=()
DEPLOYMENTS_TS="$ROOT/web/lib/contracts/deployments.ts"
export PATH="$HOME/.foundry/bin:$PATH"

while [ $# -gt 0 ]; do
  case "$1" in
    status|prepare|move-price|add-bid|verify-after) MODE="$1"; shift ;;
    --rpc-url) RPC="${2:?--rpc-url needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   # buyer in the price-moving trades and the add-bid orders
A3=0x90F79bf6EB2c4f870365E785982E1f101E93b906   # seller in the price-moving trades
A4=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
# The two MetaMask accounts of the manual test are Anvil accounts 5 and 6. They have never sent a transaction on any
# local chain (nonce 0 everywhere), so MetaMask's per-network nonce cache cannot be stale for them even though every
# local Anvil shares chain id 31337. (Accounts 1 and 4 were used on other scratch chains in earlier tests.)
OWNER=0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc   # account 5, "Alice" of this test: receives 100 NTU and 100 SGDx from `prepare`, places the stops
KEEPER=0x976EA74026E726554dB657fA54763abd0C3a0aa9  # account 6: holds NO NTU and NO SGDx, sends the trigger transaction

fail() { printf 'FAIL  %s\n' "$*"; }
pass() { printf 'PASS  %s\n' "$*"; }
info() { printf '      %s\n' "$*"; }
die() { printf 'ABORT %s\n' "$*" >&2; exit 1; }

command -v cast >/dev/null 2>&1 || die "cast not found (export PATH=\"\$HOME/.foundry/bin:\$PATH\")"
command -v node >/dev/null 2>&1 || die "node not found (needed for exact big-number arithmetic)"

PORT="$(printf '%s' "$RPC" | sed -E 's#^[a-z]+://[^:/]+:([0-9]+).*#\1#')"
HOST="$(printf '%s' "$RPC" | sed -E 's#^[a-z]+://([^:/]+).*#\1#')"
[ "$PORT" != "8545" ] || die "refusing port 8545: that is the developer's own chain. Use a scratch Anvil (for example port 8547)."
case "$HOST" in 127.0.0.1|localhost) ;; *) die "refusing host '$HOST': only a local node is accepted" ;; esac

MKT="$(sed -nE 's/^[[:space:]]*market: "(0x[0-9a-fA-F]{40})".*/\1/p' "$DEPLOYMENTS_TS" | head -1)"
NTU="$(sed -nE 's/^[[:space:]]*baseToken: \{ address: "(0x[0-9a-fA-F]{40})".*/\1/p' "$DEPLOYMENTS_TS" | head -1)"
SGDX="$(sed -nE 's/^[[:space:]]*quoteToken: \{ address: "(0x[0-9a-fA-F]{40})".*/\1/p' "$DEPLOYMENTS_TS" | head -1)"
[ -n "$MKT" ] && [ -n "$NTU" ] && [ -n "$SGDX" ] || die "could not read the market and token addresses from $DEPLOYMENTS_TS"

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/sc4053"
STATE_FILE="$STATE_DIR/stop-orders-$PORT.env"

num() { awk '{print $1}'; }
call() { cast call "$@" --rpc-url "$RPC" 2>/dev/null | num; }
bal() { call "$1" "balanceOf(address)(uint256)" "$2"; }
allow() { call "$1" "allowance(address,address)(uint256)" "$2" "$MKT"; }
wei() { cast to-wei "$1" ether; }
eth_whole() { V="$1" node -e 'let v=BigInt(process.env.V);const neg=v<0n;if(neg)v=-v;const f=(v%(10n**18n)).toString().padStart(18,"0").replace(/0+$/,"");console.log((neg?"-":"")+(v/(10n**18n)).toString()+(f?"."+f:""))'; }
head_block() { cast block-number --rpc-url "$RPC" 2>/dev/null; }
best_ids() { printf '%s %s' "$(call "$MKT" "getBestBid()(uint256,uint256)")" "$(call "$MKT" "getBestAsk()(uint256,uint256)")"; }
user_ids() { cast call "$MKT" "getUserOrderIds(address)(uint256[])" "$1" --rpc-url "$RPC" 2>/dev/null | tr -d '[],'; }
order_line() { cast call "$MKT" "getOrder(uint256)((uint256,address,uint8,uint256,uint256,uint256,uint256,uint256,uint64,uint8))" "$1" --rpc-url "$RPC" 2>/dev/null | sed -E 's/ \[[^]]*\]//g; s/[(),]//g'; }
# fields: id trader side price trigger amount filled locked createdAt status
order_field() { order_line "$1" | awk -v n="$2" '{print $n}'; }
last_price() { call "$MKT" "lastTradePrice()(uint256)"; }
has_trade() { call "$MKT" "hasTradePrice()(bool)"; }
sim_trigger() { cast call "$MKT" "triggerStopOrders(uint256)(uint256)" 10 --from "$KEEPER" --rpc-url "$RPC" 2>/dev/null | num; }
bigcmp_ge() { [ "$(node -e 'console.log(BigInt(process.argv[1])>=BigInt(process.argv[2])?"1":"0")' "$1" "$2")" = 1 ]; }
send() { local from="$1" to="$2"; shift 2; local out; out="$(cast send "$to" "$@" --from "$from" --unlocked --rpc-url "$RPC" 2>&1)" || { echo "$out" | tail -3; die "a transaction failed ($*)."; }; }

chain_checks() {
  PROBLEMS=()
  [ "$(cast chain-id --rpc-url "$RPC" 2>/dev/null)" = "31337" ] || { PROBLEMS+=("no chain 31337 answers at $RPC"); return; }
  for c in "$MKT" "$NTU" "$SGDX"; do
    [ -n "$(cast code "$c" --rpc-url "$RPC" 2>/dev/null)" ] && [ "$(cast code "$c" --rpc-url "$RPC" 2>/dev/null)" != "0x" ] || PROBLEMS+=("no contract code at $c: deploy to this chain first (docs/DEPLOYMENT.md)")
  done
  [ "${#PROBLEMS[@]}" -eq 0 ] || return
  [ -n "$(sim_trigger)" ] || PROBLEMS+=("triggerStopOrders did not simulate: the deployed engine may not implement stop-limit orders")
}

print_balances() {
  printf '      %-12s %22s NTU %22s SGDx\n' "account" "" ""
  for pair in "0:$A0" "2:$A2" "3:$A3" "5 (stop owner):$OWNER" "6 (keeper):$KEEPER" "market:$MKT"; do
    local name="${pair%%:*}" addr="${pair#*:}"
    printf '      %-12s %26s %26s\n' "$name" "$(eth_whole "$(bal "$NTU" "$addr")")" "$(eth_whole "$(bal "$SGDX" "$addr")")"
  done
}

# Solvency: the market holds exactly what its orders still owe (read-only; walks the five accounts' orders).
solvency() {
  local base=0 quote=0 id st side amt filled locked
  for a in "$A0" "$A1" "$A2" "$A3" "$A4" "$OWNER" "$KEEPER"; do
    for id in $(user_ids "$a"); do
      read -r _ _ side _ _ amt filled locked _ st <<<"$(order_line "$id")"
      if [ "$st" = 0 ] || [ "$st" = 1 ] || [ "$st" = 4 ]; then
        if [ "$side" = 1 ]; then base="$(V1="$base" V2="$amt" V3="$filled" node -e 'console.log((BigInt(process.env.V1)+BigInt(process.env.V2)-BigInt(process.env.V3)).toString())')"; fi
        if [ "$side" = 0 ]; then quote="$(V1="$quote" V2="$locked" node -e 'console.log((BigInt(process.env.V1)+BigInt(process.env.V2)).toString())')"; fi
      fi
    done
  done
  SOLV_BASE="$base"; SOLV_QUOTE="$quote"
}

# ============================== status ==============================
if [ "$MODE" = status ]; then
  chain_checks
  [ "${#PROBLEMS[@]}" -eq 0 ] || { for p in "${PROBLEMS[@]}"; do fail "$p"; done; exit 1; }
  echo "SC4053 stop-order status (read-only) at $RPC, block $(head_block)"
  info "market $MKT"
  if [ "$(has_trade)" = true ]; then info "last trade price: $(eth_whole "$(last_price)") SGDx per NTU"; else info "no trade yet: no stop can trigger until the first trade"; fi
  info "a triggerStopOrders(10) from the keeper would currently activate: $(sim_trigger) stop(s) (an eth_call; nothing was sent)"
  info "best bid / best ask (order id, price): $(call "$MKT" "getBestBid()(uint256,uint256)" | tr '\n' ' ') / $(call "$MKT" "getBestAsk()(uint256,uint256)" | tr '\n' ' ')"
  print_balances
  exit 0
fi

# ============================== verify-after ==============================
if [ "$MODE" = verify-after ]; then
  [ -f "$STATE_FILE" ] || die "no record at $STATE_FILE: run 'prepare' first"
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  [ "$SEED_RPC" = "$RPC" ] || die "the record is for $SEED_RPC, not $RPC"
  chain_checks
  [ "${#PROBLEMS[@]}" -eq 0 ] || { for p in "${PROBLEMS[@]}"; do fail "$p"; done; exit 1; }
  echo "SC4053 trigger check (read-only) at $RPC, block $(head_block)"
  bad=0
  LOGS="$(cast logs --from-block "$SEED_START_BLOCK" --address "$MKT" "StopOrderTriggered(uint256,uint256)" --json --rpc-url "$RPC" 2>/dev/null)"
  count="$(printf '%s' "$LOGS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s||"[]").length))')"
  [ "${count:-0}" -ge 1 ] && pass "$count StopOrderTriggered event(s) since the preparation" || { fail "no StopOrderTriggered event since the preparation: nothing was triggered yet"; bad=$((bad+1)); }
  last_tx="$(printf '%s' "$LOGS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s||"[]");console.log(l.length?l[l.length-1].transactionHash:"")})')"
  if [ -n "$last_tx" ]; then
    from="$(cast tx "$last_tx" from --rpc-url "$RPC" 2>/dev/null)"; to="$(cast tx "$last_tx" to --rpc-url "$RPC" 2>/dev/null)"; input="$(cast tx "$last_tx" input --rpc-url "$RPC" 2>/dev/null)"
    sel="$(cast sig "triggerStopOrders(uint256)")"
    [ "$(printf '%s' "$from" | tr 'A-F' 'a-f')" = "$(printf '%s' "$KEEPER" | tr 'A-F' 'a-f')" ] && pass "the last activation came from a transaction FROM the keeper (${last_tx:0:10}…${last_tx: -6})" || { fail "the last activation's transaction was sent by $from, not the keeper"; bad=$((bad+1)); }
    [ "$(printf '%s' "$to" | tr 'A-F' 'a-f')" = "$(printf '%s' "$MKT" | tr 'A-F' 'a-f')" ] && [ "${input:0:10}" = "$sel" ] && pass "...to the market, calling triggerStopOrders" || { fail "...not a triggerStopOrders call to the market"; bad=$((bad+1)); }
    for id in $(printf '%s' "$LOGS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s||"[]").map(l=>BigInt(l.topics[1]).toString()).join(" ")))'); do
      st="$(order_field "$id" 10)"
      case "$st" in
        0) pass "order #$id: activated and resting (status Open): activation is not a fill" ;;
        1) pass "order #$id: activated, partly filled, the rest resting" ;;
        2) pass "order #$id: activated and filled" ;;
        3) pass "order #$id: activated, then cancelled and refunded (by the engine, or later by you)" ;;
        *) fail "order #$id still reads status $st (PendingTrigger = 4) although an activation was logged for it"; bad=$((bad+1)) ;;
      esac
    done
  fi
  [ "$(bal "$NTU" "$KEEPER")" = "0" ] && [ "$(bal "$SGDX" "$KEEPER")" = "0" ] && pass "the keeper still holds no NTU and no SGDx" || { fail "the keeper holds trading tokens"; bad=$((bad+1)); }
  solvency
  [ "$(bal "$NTU" "$MKT")" = "$SOLV_BASE" ] && [ "$(bal "$SGDX" "$MKT")" = "$SOLV_QUOTE" ] && pass "solvent: the market holds exactly what its orders still owe ($(eth_whole "$SOLV_BASE") NTU, $(eth_whole "$SOLV_QUOTE") SGDx)" || { fail "the market's balances differ from what its orders owe"; bad=$((bad+1)); }
  echo; [ "$bad" -eq 0 ] && { echo "Result: every check passed"; exit 0; } || { echo "Result: $bad check(s) failed"; exit 1; }
fi

# ============================== trades (prepare, move-price, add-bid) ==============================
chain_checks
if [ "${#PROBLEMS[@]}" -eq 0 ]; then
  read -r bb_id _ ba_id _ <<<"$(best_ids | tr '\n' ' ')"
  [ "$(cast nonce "$A2" --rpc-url "$RPC")" = "$(cast nonce "$A2" --block pending --rpc-url "$RPC")" ] && [ "$(cast nonce "$A3" --rpc-url "$RPC")" = "$(cast nonce "$A3" --block pending --rpc-url "$RPC")" ] || PROBLEMS+=("a transaction is waiting in the pool for account 2 or 3 (pending nonce differs)")
  [ "$(bal "$NTU" "$KEEPER")" = "0" ] && [ "$(bal "$SGDX" "$KEEPER")" = "0" ] || PROBLEMS+=("the keeper (account 6) holds NTU or SGDx: it must hold none")
  for who in "$OWNER" "$KEEPER"; do
    [ "$(cast nonce "$who" --rpc-url "$RPC")" = "$(cast nonce "$who" --block pending --rpc-url "$RPC")" ] || PROBLEMS+=("a transaction is waiting in the pool for the stop owner or the keeper (pending nonce differs)")
  done
  [ "$(allow "$NTU" "$A3")" = "0" ] && [ "$(allow "$SGDX" "$A2")" = "0" ] || PROBLEMS+=("account 2 or 3 has a leftover allowance for the market")
  if [ "$MODE" = prepare ]; then
    [ "$(has_trade)" = false ] || PROBLEMS+=("the market already has a trade price: 'prepare' needs a clean chain (use 'move-price' to change the price)")
    [ "${bb_id:-x}" = 0 ] && [ "${ba_id:-x}" = 0 ] || PROBLEMS+=("the book is not empty")
  fi
fi
if [ "${#PROBLEMS[@]}" -ne 0 ]; then
  echo "SC4053 stop-order $MODE: the chain at $RPC is NOT ready. Nothing was changed."
  for p in "${PROBLEMS[@]}"; do fail "$p"; done
  exit 1
fi

trade_at() { # price: account 3 sells 1 NTU, account 2 buys it
  local price="$1"
  case "$price" in ''|*[!0-9.]*) die "the price must be a positive decimal number, got '$price'" ;; esac
  read -r bb ba <<<"$(call "$MKT" "getBestBid()(uint256,uint256)" | head -1) $(call "$MKT" "getBestAsk()(uint256,uint256)" | head -1)"
  [ "${bb:-x}" = 0 ] && [ "${ba:-x}" = 0 ] || die "the book is not empty: a price-moving trade would match other orders. Clear or settle it first."
  local p; p="$(wei "$price")"
  send "$A3" "$NTU" "approve(address,uint256)" "$MKT" "$(wei 1)"
  send "$A3" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 1 "$p" "$(wei 1)"
  send "$A2" "$SGDX" "approve(address,uint256)" "$MKT" "$(cast call "$MKT" "requiredQuote(uint256,uint256)(uint256)" "$(wei 1)" "$p" --rpc-url "$RPC" | num)"
  send "$A2" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 0 "$p" "$(wei 1)"
  [ "$(last_price)" = "$p" ] && pass "last trade price is now $(eth_whole "$(last_price)") SGDx per NTU" || { fail "the last trade price did not become $price"; exit 1; }
}

case "$MODE" in
  prepare)
    echo "SC4053 stop-order prepare at $RPC (block $(head_block)); market $MKT"
    pass "chain 31337, contracts present, no trade price yet, empty book, keeper holds no trading tokens, no stuck transactions"
    mkdir -p "$STATE_DIR"
    START="$(( $(head_block) + 1 ))"
    if bigcmp_ge "$(bal "$NTU" "$OWNER")" "$(wei 100)" && bigcmp_ge "$(bal "$SGDX" "$OWNER")" "$(wei 100)"; then
      info "account 5 already holds at least 100 NTU and 100 SGDx"
    else
      send "$A0" "$NTU" "transfer(address,uint256)" "$OWNER" "$(wei 100)"
      send "$A0" "$SGDX" "transfer(address,uint256)" "$OWNER" "$(wei 100)"
      pass "account 5 (the stop owner) was given 100 NTU and 100 SGDx by the deployer"
    fi
    trade_at 2
    { echo "# Written by scripts/seed-stop-orders.sh. Public values only."; echo "SEED_RPC=$RPC"; echo "SEED_START_BLOCK=$START"; } > "$STATE_FILE"
    info "record for 'verify-after': $STATE_FILE"
    echo; echo "Result: ready. The market has a last trade price of 2. Place a stop in the app as the stop owner (account 5), then use move-price (docs/TESTING.md, Test 14)."
    ;;
  move-price)
    [ "$(has_trade)" = true ] || die "run 'prepare' first"
    [ "${#ARGS[@]}" -eq 1 ] || die "usage: move-price <price>"
    echo "SC4053 stop-order move-price at $RPC (block $(head_block))"
    trade_at "${ARGS[0]}"
    info "a triggerStopOrders(10) from the keeper would now activate: $(sim_trigger) stop(s) (an eth_call; nothing was sent)"
    ;;
  add-bid)
    [ "${#ARGS[@]}" -eq 2 ] || die "usage: add-bid <price> <amount>"
    price="${ARGS[0]}"; amount="${ARGS[1]}"
    case "$price$amount" in *[!0-9.]*|'') die "price and amount must be positive decimal numbers" ;; esac
    ba_price="$(call "$MKT" "getBestAsk()(uint256,uint256)" | tail -1)"
    [ "${ba_id:-0}" = 0 ] || { bigcmp_ge "$(wei "$price")" "$ba_price" && die "a buy at $price would match a resting sell now: it would trade instead of resting"; }
    p="$(wei "$price")"; a="$(wei "$amount")"
    send "$A2" "$SGDX" "approve(address,uint256)" "$MKT" "$(cast call "$MKT" "requiredQuote(uint256,uint256)(uint256)" "$a" "$p" --rpc-url "$RPC" | num)"
    send "$A2" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 0 "$p" "$a"
    pass "account 2 now has a resting buy of $amount NTU at $price (best bid: $(call "$MKT" "getBestBid()(uint256,uint256)" | tr '\n' ' '))"
    ;;
esac
