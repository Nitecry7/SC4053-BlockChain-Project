#!/usr/bin/env bash
# Builds a CROSSED order book on a DISPOSABLE local chain, for the manual Match orders (Bonus 2) test in docs/TESTING.md, Test 13.
#
#   scripts/seed-crossed-book.sh [seed|status|verify-after] [--rpc-url URL]
#
#   seed          (default) checks the chain, places the orders, then checks the crossed book independently
#   status        read-only: chain, book heads, balances, and what matchOrders(10) WOULD do (an eth_call, nothing is sent)
#   verify-after  read-only: after the keeper's matching transaction, checks balances, orders, Trade events and the sender
#
# What `seed` does (the engine's real fill cap is read from the market, 10 today):
#   - Anvil accounts 1 and 3 alternate 2*cap+2 = 22 sell orders of 1 NTU at 2
#   - account 2 bids cap+1 = 11 NTU at 3, and account 0 bids 11 NTU at 2.5
#   - each bid fills `cap` asks, hits the engine's per-transaction fill cap, and rests 1 NTU still crossing the book
#   It NEVER sends matchOrders: that is the keeper's job in MetaMask. It only simulates it with eth_call to verify.
#
# Safety: Anvil's accounts are unlocked on the node, so no private key is used or printed. The script refuses port 8545
# (the developer's own chain) and any chain id other than 31337. It reads web/lib/contracts/deployments.ts and writes
# nothing in the repository. Run it on a scratch Anvil (for example `anvil --port 8546`) that was freshly deployed.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${RPC_URL:-http://127.0.0.1:8546}"
MODE="seed"
DEPLOYMENTS_TS="$ROOT/web/lib/contracts/deployments.ts"
export PATH="$HOME/.foundry/bin:$PATH"

while [ $# -gt 0 ]; do
  case "$1" in
    seed|status|verify-after) MODE="$1"; shift ;;
    --rpc-url) RPC="${2:?--rpc-url needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done

# Public Anvil development addresses (accounts 0 to 4). Public addresses only: no key is involved.
A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   # deployer, holds the token supply
A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8   # seller
A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   # bidder at 3
A3=0x90F79bf6EB2c4f870365E785982E1f101E93b906   # seller
KEEPER=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 # account 4: holds NO NTU and NO SGDx

fail() { printf 'FAIL  %s\n' "$*"; }
pass() { printf 'PASS  %s\n' "$*"; }
info() { printf '      %s\n' "$*"; }
die() { printf 'ABORT %s\n' "$*" >&2; exit 1; }

command -v cast >/dev/null 2>&1 || die "cast not found (export PATH=\"\$HOME/.foundry/bin:\$PATH\")"
command -v node >/dev/null 2>&1 || die "node not found (needed for exact big-number arithmetic)"

PORT="$(printf '%s' "$RPC" | sed -E 's#^[a-z]+://[^:/]+:([0-9]+).*#\1#')"
HOST="$(printf '%s' "$RPC" | sed -E 's#^[a-z]+://([^:/]+).*#\1#')"
[ "$PORT" != "8545" ] || die "refusing port 8545: that is the developer's own chain. Use a scratch Anvil (for example port 8546)."
case "$HOST" in 127.0.0.1|localhost) ;; *) die "refusing host '$HOST': only a local node is accepted" ;; esac

# --- the deployed addresses, from the front end's own export (read-only) ---
MKT="$(sed -nE 's/^[[:space:]]*market: "(0x[0-9a-fA-F]{40})".*/\1/p' "$DEPLOYMENTS_TS" | head -1)"
NTU="$(sed -nE 's/^[[:space:]]*baseToken: \{ address: "(0x[0-9a-fA-F]{40})".*/\1/p' "$DEPLOYMENTS_TS" | head -1)"
SGDX="$(sed -nE 's/^[[:space:]]*quoteToken: \{ address: "(0x[0-9a-fA-F]{40})".*/\1/p' "$DEPLOYMENTS_TS" | head -1)"
[ -n "$MKT" ] && [ -n "$NTU" ] && [ -n "$SGDX" ] || die "could not read the market and token addresses from $DEPLOYMENTS_TS"

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/sc4053"
STATE_FILE="$STATE_DIR/crossed-book-$PORT.env"

num() { awk '{print $1}'; }
call() { cast call "$@" --rpc-url "$RPC" 2>/dev/null | num; }
call2() { cast call "$@" --rpc-url "$RPC" 2>/dev/null | sed -E 's/ \[[^]]*\]//' | tr '\n' ' '; }
bal() { call "$1" "balanceOf(address)(uint256)" "$2"; }
allow() { call "$1" "allowance(address,address)(uint256)" "$2" "$MKT"; }
big() { OP="$1" X="$2" Y="$3" node -e 'const a=BigInt(process.env.X),b=BigInt(process.env.Y);console.log((process.env.OP==="sub"?a-b:a+b).toString())'; }
eth_whole() { V="$1" node -e 'let v=BigInt(process.env.V);const neg=v<0n;if(neg)v=-v;const f=(v%(10n**18n)).toString().padStart(18,"0").replace(/0+$/,"");console.log((neg?"-":"")+(v/(10n**18n)).toString()+(f?"."+f:""))'; }
wei() { cast to-wei "$1" ether; }

head_block() { cast block-number --rpc-url "$RPC" 2>/dev/null; }
best() { # id price of the best bid (side 0) or ask (side 1)
  if [ "$1" = bid ]; then call2 "$MKT" "getBestBid()(uint256,uint256)"; else call2 "$MKT" "getBestAsk()(uint256,uint256)"; fi
}
order_line() { cast call "$MKT" "getOrder(uint256)((uint256,address,uint8,uint256,uint256,uint256,uint256,uint256,uint64,uint8))" "$1" --rpc-url "$RPC" 2>/dev/null | sed -E 's/ \[[^]]*\]//g; s/[(),]//g'; }
# fields of order_line: id trader side price trigger amount filled locked createdAt status
order_field() { order_line "$1" | awk -v n="$2" '{print $n}'; }
user_ids() { cast call "$MKT" "getUserOrderIds(address)(uint256[])" "$1" --rpc-url "$RPC" 2>/dev/null | tr -d '[],' ; }

chain_checks() { # sets PROBLEMS; read-only
  PROBLEMS=()
  [ "$(cast chain-id --rpc-url "$RPC" 2>/dev/null)" = "31337" ] || { PROBLEMS+=("no chain 31337 answers at $RPC"); return; }
  for c in "$MKT" "$NTU" "$SGDX"; do
    [ "$(cast code "$c" --rpc-url "$RPC" 2>/dev/null)" != "0x" ] && [ -n "$(cast code "$c" --rpc-url "$RPC" 2>/dev/null)" ] || PROBLEMS+=("no contract code at $c: deploy to this chain and export first (docs/DEPLOYMENT.md)")
  done
  [ "${#PROBLEMS[@]}" -eq 0 ] || return
  CAP="$(call "$MKT" "MAX_MATCHES_PER_TX()(uint256)")"
  case "$CAP" in ''|*[!0-9]*) PROBLEMS+=("could not read MAX_MATCHES_PER_TX from the market"); return ;; esac
  [ "$CAP" -ge 1 ] && [ "$CAP" -le 50 ] || PROBLEMS+=("MAX_MATCHES_PER_TX is $CAP: this script supports 1 to 50")
}

simulate_match() { cast call "$MKT" "matchOrders(uint256)(uint256)" "$CAP" --from "$KEEPER" --rpc-url "$RPC" 2>/dev/null | num; }

crossed_now() { # prints "yes <bidId> <bidPrice> <askId> <askPrice>" or "no ..."; read-only
  local b a
  read -r bid_id bid_price <<<"$(best bid)"
  read -r ask_id ask_price <<<"$(best ask)"
  if [ "${bid_id:-0}" != "0" ] && [ "${ask_id:-0}" != "0" ] && [ "$(node -e 'console.log(BigInt(process.argv[1])>=BigInt(process.argv[2])?"1":"0")' "$bid_price" "$ask_price")" = "1" ]; then echo yes; else echo no; fi
}

print_balances() { # label, uses globals; read-only
  printf '      %-10s %22s NTU %22s SGDx\n' "account" "" ""
  for pair in "0:$A0" "1:$A1" "2:$A2" "3:$A3" "4 (keeper):$KEEPER" "market:$MKT"; do
    local name="${pair%%:*}" addr="${pair#*:}"
    printf '      %-10s %26s %26s\n' "$name" "$(eth_whole "$(bal "$NTU" "$addr")")" "$(eth_whole "$(bal "$SGDX" "$addr")")"
  done
}

# ============================== status ==============================
if [ "$MODE" = status ]; then
  chain_checks
  [ "${#PROBLEMS[@]}" -eq 0 ] || { for p in "${PROBLEMS[@]}"; do fail "$p"; done; exit 1; }
  echo "SC4053 crossed-book status (read-only) at $RPC, block $(head_block)"
  info "market $MKT, per-transaction fill cap $CAP"
  info "best bid: $(best bid)  (order id, price in wei)"
  info "best ask: $(best ask)"
  if [ "$(crossed_now)" = yes ]; then pass "the book is CROSSED"; else info "the book is not crossed"; fi
  sim="$(simulate_match)"; info "a matchOrders($CAP) from the keeper would currently settle: ${sim:-n/a} fills (an eth_call; nothing was sent)"
  print_balances
  [ -f "$STATE_FILE" ] && info "seed record: $STATE_FILE"
  exit 0
fi

# ============================== verify-after ==============================
if [ "$MODE" = verify-after ]; then
  [ -f "$STATE_FILE" ] || die "no seed record at $STATE_FILE: run 'seed' first"
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  [ "$SEED_RPC" = "$RPC" ] || die "the seed record is for $SEED_RPC, not $RPC"
  chain_checks
  [ "${#PROBLEMS[@]}" -eq 0 ] || { for p in "${PROBLEMS[@]}"; do fail "$p"; done; exit 1; }
  echo "SC4053 matching check (read-only) at $RPC, block $(head_block)"
  bad=0
  check() { if [ "$2" = "$3" ]; then pass "$1: $(eth_whole "$2")"; else fail "$1: got $(eth_whole "$2"), expected $(eth_whole "$3")"; bad=$((bad+1)); fi; }
  d() { big sub "$1" "$2"; }
  E1=$(wei 1); E2=$(wei 2); E05=$(wei 0.5); E55=$(wei 5.5)
  exp() { # label addr beforeNTU beforeSGD expNTU expSGD
    check "$1 NTU change" "$(d "$(bal "$NTU" "$2")" "$3")" "$5"
    check "$1 SGDx change" "$(d "$(bal "$SGDX" "$2")" "$4")" "$6"
  }
  exp "account 1 (sold 1 NTU at 2)" "$A1" "$B1_NTU" "$B1_SGD" 0 "$E2"
  exp "account 3 (sold 1 NTU at 2)" "$A3" "$B3_NTU" "$B3_SGD" 0 "$E2"
  exp "account 2 (bought 1 NTU, 1 SGDx price improvement back)" "$A2" "$B2_NTU" "$B2_SGD" "$E1" "$E1"
  exp "account 0 (bought 1 NTU, 0.5 SGDx price improvement back)" "$A0" "$B0_NTU" "$B0_SGD" "$E1" "$E05"
  exp "keeper (account 4: must be UNCHANGED in trading tokens)" "$KEEPER" "$BK_NTU" "$BK_SGD" 0 0
  check "market NTU change" "$(d "$(bal "$NTU" "$MKT")" "$BM_NTU")" "-$E2"
  check "market SGDx change" "$(d "$(bal "$SGDX" "$MKT")" "$BM_SGD")" "-$E55"
  [ "$(crossed_now)" = no ] && pass "the book is no longer crossed" || { fail "the book is still crossed"; bad=$((bad+1)); }
  for id in $REST_IDS; do
    [ "$(order_field "$id" 10)" = "2" ] && pass "order #$id reads Filled" || { fail "order #$id does not read Filled (status $(order_field "$id" 10))"; bad=$((bad+1)); }
  done
  # The Trade events since the seed started: the cap made 2*cap, the keeper's transaction made 2 more.
  TRADES_JSON="$(cast logs --from-block "$SEED_START_BLOCK" --address "$MKT" "Trade(uint256,uint256,address,address,uint256,uint256,uint256)" --json --rpc-url "$RPC" 2>/dev/null)"
  count="$(printf '%s' "$TRADES_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s||"[]").length))')"
  [ "$count" = "$((2*CAP_SEED+2))" ] && pass "$count Trade events since the seed ($((2*CAP_SEED)) from the two capped placements, 2 from the match)" || { fail "$count Trade events since the seed, expected $((2*CAP_SEED+2))"; bad=$((bad+1)); }
  last_tx="$(printf '%s' "$TRADES_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s||"[]");console.log(l.length?l[l.length-1].transactionHash:"")})')"
  in_last="$(printf '%s' "$TRADES_JSON" | node -e 'const h=process.argv[1];let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s||"[]").filter(l=>l.transactionHash===h).length))' "$last_tx")"
  if [ -n "$last_tx" ]; then
    from="$(cast tx "$last_tx" from --rpc-url "$RPC" 2>/dev/null)"; to="$(cast tx "$last_tx" to --rpc-url "$RPC" 2>/dev/null)"; input="$(cast tx "$last_tx" input --rpc-url "$RPC" 2>/dev/null)"
    sel="$(cast sig "matchOrders(uint256)")"
    [ "$(printf '%s' "$from" | tr 'A-F' 'a-f')" = "$(printf '%s' "$KEEPER" | tr 'A-F' 'a-f')" ] && pass "the last trades were settled by a transaction FROM the keeper (${last_tx:0:10}…${last_tx: -6})" || { fail "the last trades' transaction was sent by $from, not the keeper"; bad=$((bad+1)); }
    [ "$(printf '%s' "$to" | tr 'A-F' 'a-f')" = "$(printf '%s' "$MKT" | tr 'A-F' 'a-f')" ] && [ "${input:0:10}" = "$sel" ] && pass "...to the market, calling matchOrders" || { fail "...not a matchOrders call to the market"; bad=$((bad+1)); }
    [ "$in_last" = "2" ] && pass "...with exactly 2 Trade events" || { fail "...with $in_last Trade events, expected 2"; bad=$((bad+1)); }
  else fail "no Trade events found"; bad=$((bad+1)); fi
  echo
  if [ "$bad" -eq 0 ]; then echo "Result: every check passed"; exit 0; else echo "Result: $bad check(s) failed"; exit 1; fi
fi

# ============================== seed ==============================
chain_checks
if [ "${#PROBLEMS[@]}" -eq 0 ]; then
  # the book must be empty, nothing may be approved or stuck, and the keeper must hold no trading tokens
  read -r bid_id _ <<<"$(best bid)"; read -r ask_id _ <<<"$(best ask)"
  [ "${bid_id:-x}" = "0" ] && [ "${ask_id:-x}" = "0" ] || PROBLEMS+=("the book is not empty (best bid id ${bid_id:-?}, best ask id ${ask_id:-?}): use a freshly deployed scratch chain, or finish matching first")
  for pair in "0:$A0" "1:$A1" "2:$A2" "3:$A3" "4:$KEEPER"; do
    n="${pair%%:*}"; a="${pair#*:}"
    [ "$(allow "$NTU" "$a")" = "0" ] || PROBLEMS+=("account $n has a leftover NTU allowance for the market")
    [ "$(allow "$SGDX" "$a")" = "0" ] || PROBLEMS+=("account $n has a leftover SGDx allowance for the market")
    [ "$(cast nonce "$a" --rpc-url "$RPC" 2>/dev/null)" = "$(cast nonce "$a" --block pending --rpc-url "$RPC" 2>/dev/null)" ] || PROBLEMS+=("account $n has a transaction waiting in the pool (pending nonce differs)")
  done
  [ "$(bal "$NTU" "$KEEPER")" = "0" ] && [ "$(bal "$SGDX" "$KEEPER")" = "0" ] || PROBLEMS+=("the keeper (account 4) holds NTU or SGDx: it must hold none")
  need_ntu="$(wei $((CAP+1)))"
  need_sgd2="$(wei "$(awk "BEGIN{print ($CAP+1)*3}")")"; need_sgd0="$(wei "$(awk "BEGIN{print ($CAP+1)*2.5}")")"
  [ "$(node -e 'console.log(BigInt(process.argv[1])>=BigInt(process.argv[2])?"1":"0")' "$(bal "$NTU" "$A1")" "$need_ntu")" = 1 ] || PROBLEMS+=("account 1 holds too little NTU")
  [ "$(node -e 'console.log(BigInt(process.argv[1])>=BigInt(process.argv[2])?"1":"0")' "$(bal "$NTU" "$A3")" "$need_ntu")" = 1 ] || PROBLEMS+=("account 3 holds too little NTU")
  [ "$(node -e 'console.log(BigInt(process.argv[1])>=BigInt(process.argv[2])?"1":"0")' "$(bal "$SGDX" "$A2")" "$need_sgd2")" = 1 ] || PROBLEMS+=("account 2 holds too little SGDx")
  [ "$(node -e 'console.log(BigInt(process.argv[1])>=BigInt(process.argv[2])?"1":"0")' "$(bal "$SGDX" "$A0")" "$need_sgd0")" = 1 ] || PROBLEMS+=("account 0 holds too little SGDx")
  if [ "${bid_id:-x}" = "0" ] && [ "${ask_id:-x}" = "0" ]; then
    [ "$(simulate_match)" = "0" ] || PROBLEMS+=("matchOrders did not simulate as 0 on the empty book: the deployed engine may not implement it")
  fi
fi
if [ "${#PROBLEMS[@]}" -ne 0 ]; then
  echo "SC4053 crossed-book seed: the chain at $RPC is NOT ready. Nothing was changed."
  for p in "${PROBLEMS[@]}"; do fail "$p"; done
  exit 1
fi

ASKS=$((2*CAP+2)); BID_N=$((CAP+1))
echo "SC4053 crossed-book seed at $RPC (block $(head_block)); market $MKT; engine fill cap $CAP"
pass "chain 31337, contracts present, book empty, no allowances, no stuck transactions, keeper holds no trading tokens, matchOrders simulates 0"
mkdir -p "$STATE_DIR"
START_BLOCK="$(( $(head_block) + 1 ))"
echo "      balances BEFORE the seed:"; print_balances

send() { # from, to, signature, args...
  local from="$1" to="$2"; shift 2
  local out
  out="$(cast send "$to" "$@" --from "$from" --unlocked --rpc-url "$RPC" 2>&1)" || { echo "$out" | tail -3; die "a transaction failed ($*). The book may be partly built; use a fresh scratch chain."; }
}

ONE="$(wei 1)"; TWO="$(wei 2)"; THREE="$(wei 3)"; TWOHALF="$(wei 2.5)"
printf '      approving and placing %s asks (1 NTU at 2, accounts 1 and 3 alternating)' "$ASKS"
send "$A1" "$NTU" "approve(address,uint256)" "$MKT" "$(wei $((ASKS/2)))"
send "$A3" "$NTU" "approve(address,uint256)" "$MKT" "$(wei $((ASKS/2)))"
for i in $(seq 1 "$ASKS"); do
  if [ $((i % 2)) -eq 1 ]; then who="$A1"; else who="$A3"; fi
  send "$who" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 1 "$TWO" "$ONE"
  printf '.'
done
echo
echo "      account 2 bids $BID_N NTU at 3 and account 0 bids $BID_N NTU at 2.5 (each fills $CAP asks, then the engine stops at its fill cap)"
send "$A2" "$SGDX" "approve(address,uint256)" "$MKT" "$need_sgd2"
send "$A2" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 0 "$THREE" "$(wei "$BID_N")"
send "$A0" "$SGDX" "approve(address,uint256)" "$MKT" "$need_sgd0"
send "$A0" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 0 "$TWOHALF" "$(wei "$BID_N")"

# --- independent verification of the crossed book (read-only) ---
echo "      verifying the crossed book from the chain:"
bad=0
read -r bid_id bid_price <<<"$(best bid)"; read -r ask_id ask_price <<<"$(best ask)"
[ "$(crossed_now)" = yes ] && pass "getBestBid (order #$bid_id at $(eth_whole "$bid_price")) is at or above getBestAsk (order #$ask_id at $(eth_whole "$ask_price")): the book is CROSSED" || { fail "the book is not crossed"; bad=$((bad+1)); }
REST_IDS=""; rest_bids=0; rest_asks=0
for a in "$A0" "$A1" "$A2" "$A3"; do
  for id in $(user_ids "$a"); do
    st="$(order_field "$id" 10)"
    if [ "$st" = "0" ] || [ "$st" = "1" ]; then
      REST_IDS="$REST_IDS $id"
      [ "$(order_field "$id" 3)" = "0" ] && rest_bids=$((rest_bids+1)) || rest_asks=$((rest_asks+1))
    fi
  done
done
[ "$rest_bids" = "2" ] && [ "$rest_asks" = "2" ] && pass "2 buy orders and 2 sell orders still rest (orders:$REST_IDS)" || { fail "expected 2 resting buys and 2 resting sells, found $rest_bids and $rest_asks"; bad=$((bad+1)); }
for id in $REST_IDS; do
  if [ "$(order_field "$id" 3)" = "0" ]; then
    [ "$(order_field "$id" 7)" = "$(wei "$CAP")" ] && pass "buy order #$id is filled $CAP of $BID_N NTU: the engine stopped at its fill cap" || { fail "buy order #$id filled $(eth_whole "$(order_field "$id" 7)"), expected $CAP"; bad=$((bad+1)); }
  fi
done
TRADES="$(cast logs --from-block "$START_BLOCK" --address "$MKT" "Trade(uint256,uint256,address,address,uint256,uint256,uint256)" --json --rpc-url "$RPC" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s||"[]").length))')"
[ "$TRADES" = "$((2*CAP))" ] && pass "$TRADES Trade events so far: $CAP from each capped placement, none from matchOrders" || { fail "$TRADES Trade events, expected $((2*CAP))"; bad=$((bad+1)); }
sim="$(simulate_match)"
[ "$sim" = "2" ] && pass "a matchOrders($CAP) from the keeper SIMULATES as 2 fills (an eth_call: this script sent no matchOrders)" || { fail "matchOrders simulates as ${sim:-n/a}, expected 2"; bad=$((bad+1)); }
[ "$(bal "$NTU" "$KEEPER")" = "0" ] && [ "$(bal "$SGDX" "$KEEPER")" = "0" ] && pass "the keeper still holds no NTU and no SGDx" || { fail "the keeper holds trading tokens"; bad=$((bad+1)); }
for pair in "0:$A0" "1:$A1" "2:$A2" "3:$A3" "4:$KEEPER"; do
  [ "$(allow "$NTU" "${pair#*:}")" = "0" ] && [ "$(allow "$SGDX" "${pair#*:}")" = "0" ] || { fail "account ${pair%%:*} has a leftover allowance after the seed"; bad=$((bad+1)); }
done
[ "$bad" -eq 0 ] && pass "no allowance is left over (each approval was exactly what its orders used)"
echo "      balances AFTER the seed, i.e. just BEFORE the match (these are what verify-after compares with):"; print_balances
B0_NTU=$(bal "$NTU" "$A0"); B0_SGD=$(bal "$SGDX" "$A0"); B1_NTU=$(bal "$NTU" "$A1"); B1_SGD=$(bal "$SGDX" "$A1")
B2_NTU=$(bal "$NTU" "$A2"); B2_SGD=$(bal "$SGDX" "$A2"); B3_NTU=$(bal "$NTU" "$A3"); B3_SGD=$(bal "$SGDX" "$A3")
BK_NTU=$(bal "$NTU" "$KEEPER"); BK_SGD=$(bal "$SGDX" "$KEEPER"); BM_NTU=$(bal "$NTU" "$MKT"); BM_SGD=$(bal "$SGDX" "$MKT")

{
  echo "# Written by scripts/seed-crossed-book.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Public addresses and balances only."
  echo "SEED_RPC=$RPC"; echo "SEED_START_BLOCK=$START_BLOCK"; echo "CAP_SEED=$CAP"; echo "REST_IDS=\"${REST_IDS# }\""
  echo "B0_NTU=$B0_NTU"; echo "B0_SGD=$B0_SGD"; echo "B1_NTU=$B1_NTU"; echo "B1_SGD=$B1_SGD"; echo "B2_NTU=$B2_NTU"; echo "B2_SGD=$B2_SGD"
  echo "B3_NTU=$B3_NTU"; echo "B3_SGD=$B3_SGD"; echo "BK_NTU=$BK_NTU"; echo "BK_SGD=$BK_SGD"; echo "BM_NTU=$BM_NTU"; echo "BM_SGD=$BM_SGD"
} > "$STATE_FILE"
info "record for 'verify-after': $STATE_FILE"
echo
if [ "$bad" -eq 0 ]; then
  echo "Result: the book is crossed and ready. Open the app as the keeper and press Match orders (docs/TESTING.md, Test 13)."
  exit 0
else
  echo "Result: $bad check(s) failed. Do not use this chain for the manual test."
  exit 1
fi
