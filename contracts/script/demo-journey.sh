#!/usr/bin/env bash
# Demo journey on a FRESH, private Anvil: a reproducible backup for the video and a full engine smoke test.
#
#   bash contracts/script/demo-journey.sh            # from the repo root; uses port 8546
#   DEMO_PORT=8547 bash contracts/script/demo-journey.sh
#
# What it does:
#   1. Starts its own Anvil on DEMO_PORT, and REFUSES to run if anything already answers there, so it never touches
#      your own chain (8545 by default).
#   2. Deploys with Person 2's contracts/script/Deploy.s.sol, unchanged. Forge's broadcast and cache output is
#      redirected to a temporary folder, so contracts/broadcast/ (the exporter's record of your chain) is not touched.
#   3. Replays the journey with `cast`, printing balances after every step and checking each against expected values:
#        limit order and partial fill with price improvement, cancel of the remainder (Bonus 1), multi-party batch
#        matching in one transaction (Bonus 2), and a stop-limit order triggered by a keeper (Bonus 3).
#   4. Stops its Anvil on exit.
# No private key is used: Anvil's default accounts are unlocked, and every send uses --unlocked.
# Needs Foundry (forge, anvil, cast) on PATH.
set -u
export PATH="$HOME/.foundry/bin:$PATH"

PORT="${DEMO_PORT:-8546}"
RPC="http://127.0.0.1:$PORT"
E=000000000000000000 # 18 zeros: whole tokens to wei
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
FAIL=0
ANVIL_PID=""

cleanup() {
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null; wait "$ANVIL_PID" 2>/dev/null; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Something already answers on port $PORT. Refusing to touch it: pick another port with DEMO_PORT."
  exit 1
fi

echo "== Starting a private Anvil on port $PORT"
anvil --port "$PORT" --silent &
ANVIL_PID=$!
for _ in $(seq 1 30); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
[ "$(cast chain-id --rpc-url "$RPC" 2>/dev/null)" = "31337" ] || { echo "Anvil did not start"; exit 1; }
[ "$(cast block-number --rpc-url "$RPC")" = "0" ] || { echo "Not a fresh chain"; exit 1; }

DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 # Anvil account 0 (public address); trades as "Dan"
ALICE=0x70997970C51812dc3A010C7d01b50e0d17dc79C8   # account 1
BOB=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC     # account 2
CAROL=0x90F79bf6EB2c4f870365E785982E1f101E93b906   # account 3
KEEPER=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  # account 4: holds no tokens, only calls matchOrders and trigger

echo "== Deploying with contracts/script/Deploy.s.sol (output redirected to a temp folder)"
OUT=$(cd "$REPO/contracts" && FOUNDRY_BROADCAST="$WORK/broadcast" FOUNDRY_CACHE_PATH="$WORK/cache" \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" 2>&1)
echo "$OUT" | grep -q "ONCHAIN EXECUTION COMPLETE & SUCCESSFUL" || { echo "$OUT" | tail -20; echo "Deploy failed"; exit 1; }
NTU=$(echo "$OUT" | awk '/NTU \(base\)/{print $NF}')
SGDX=$(echo "$OUT" | awk '/SGDx \(quote\)/{print $NF}')
MKT=$(echo "$OUT" | awk '/NTU\/SGDx market/{print $NF}')
echo "   NTU  $NTU"
echo "   SGDx $SGDX"
echo "   market (OrderBook via MarketFactory) $MKT"

# ---------------------------------------------------------------- helpers
send() { # label, from, to, signature, args...
  local label="$1" from="$2" to="$3"; shift 3
  local out status
  out=$(cast send "$to" "$@" --from "$from" --unlocked --rpc-url "$RPC" 2>&1)
  status=$(echo "$out" | awk '/^status/{print $2}')
  if [ "$status" = "1" ]; then
    printf '   %-52s ok   tx %s\n' "$label" "$(echo "$out" | awk '/^transactionHash/{print $2}')"
  else
    printf '   %-52s FAILED\n' "$label"; echo "$out" | tail -3; FAIL=1
  fi
}
bal() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url "$RPC" | cut -d' ' -f1; }
fmt() { cast from-wei "$1"; }
row() { printf '   %-8s %14s NTU %14s SGDx\n' "$1" "$(fmt "$(bal "$NTU" "$2")")" "$(fmt "$(bal "$SGDX" "$2")")"; }
table() {
  echo "   ---- balances after: $1"
  row Alice "$ALICE"; row Bob "$BOB"; row Carol "$CAROL"; row Dan "$DEPLOYER"; row Keeper "$KEEPER"; row Market "$MKT"
}
expect() { # who-label, address, ntu (whole), sgdx (whole, decimals allowed)
  local n s
  n=$(bal "$NTU" "$2"); s=$(bal "$SGDX" "$2")
  if [ "$n" = "$(cast to-wei "$3")" ] && [ "$s" = "$(cast to-wei "$4")" ]; then
    printf '   check %-7s %s NTU, %s SGDx: ok\n' "$1" "$3" "$4"
  else
    printf '   check %-7s expected %s NTU, %s SGDx; got %s, %s: FAIL\n' "$1" "$3" "$4" "$(fmt "$n")" "$(fmt "$s")"
    FAIL=1
  fi
}
status_of() {
  cast call "$MKT" "getOrder(uint256)((uint256,address,uint8,uint256,uint256,uint256,uint256,uint256,uint64,uint8))" "$1" \
    --rpc-url "$RPC" | tr -d '()' | awk -F', ' '{print $NF}'
}
STATUS_NAMES=(Open PartiallyFilled Filled Cancelled PendingTrigger)
show_status() { printf '   order %-3s %s\n' "$1" "${STATUS_NAMES[$(status_of "$1")]}"; }

table "deployment (Deploy.s.sol funds accounts 1 to 3 with 10,000 of each)"

# ---------------------------------------------------------------- 1. limit order, partial fill, price improvement
echo
echo "== 1. Alice sells 100 NTU at 2. Bob buys 40 with a limit of 2.2: he trades at Alice's 2 and gets the difference back"
send "Alice approve 100 NTU"                       "$ALICE" "$NTU"  "approve(address,uint256)" "$MKT" "100$E"
send "Alice placeLimitOrder(Sell, 2, 100)"         "$ALICE" "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 1 "2$E" "100$E"
REQ=$(cast call "$MKT" "requiredQuote(uint256,uint256)(uint256)" "40$E" 2200000000000000000 --rpc-url "$RPC" | cut -d' ' -f1)
send "Bob approve requiredQuote(40, 2.2) = $(fmt "$REQ") SGDx" "$BOB" "$SGDX" "approve(address,uint256)" "$MKT" "$REQ"
send "Bob placeLimitOrder(Buy, 2.2, 40)"           "$BOB"   "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 0 2200000000000000000 "40$E"
show_status 1; show_status 2
table "partial fill"
expect Alice "$ALICE" 9900 10080
expect Bob "$BOB" 10040 9920
expect Market "$MKT" 60 0

# ---------------------------------------------------------------- 2. cancel the remainder (Bonus 1)
echo
echo "== 2. Alice cancels the unfilled 60 (Bonus 1). Bob cannot cancel her order"
OUT=$(cast send "$MKT" "cancelOrder(uint256)" 1 --from "$BOB" --unlocked --rpc-url "$RPC" 2>&1)
echo "$OUT" | grep -q "0xf6412b5a" && echo "   Bob cancelOrder(1)                                   reverted NotOrderOwner (as expected)" \
  || { echo "   Bob cancelOrder(1) did not revert with NotOrderOwner"; FAIL=1; }
send "Alice cancelOrder(1)"                        "$ALICE" "$MKT" "cancelOrder(uint256)" 1
show_status 1
table "cancel"
expect Alice "$ALICE" 9960 10080
expect Market "$MKT" 0 0

# ---------------------------------------------------------------- 3. multi-party batch matching (Bonus 2)
echo
echo "== 3. Batch matching (Bonus 2). Alice and Carol post 22 asks of 1 NTU at 2. Bob (limit 3) and Dan (limit 2.5)"
echo "      each buy 11: each order fills the 10-fill cap and rests 1 NTU crossed. One keeper call settles all four"
send "Alice approve 11 NTU"                        "$ALICE" "$NTU" "approve(address,uint256)" "$MKT" "11$E"
send "Carol approve 11 NTU"                        "$CAROL" "$NTU" "approve(address,uint256)" "$MKT" "11$E"
for _ in $(seq 1 11); do
  cast send "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 1 "2$E" "1$E" --from "$ALICE" --unlocked --rpc-url "$RPC" >/dev/null
  cast send "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 1 "2$E" "1$E" --from "$CAROL" --unlocked --rpc-url "$RPC" >/dev/null
done
echo "   22 asks placed (orders 3 to 24)"
send "Bob approve 33 SGDx"                         "$BOB"      "$SGDX" "approve(address,uint256)" "$MKT" "33$E"
send "Bob placeLimitOrder(Buy, 3, 11): 10 fills, cap" "$BOB"   "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 0 "3$E" "11$E"
send "Dan approve 27.5 SGDx"                       "$DEPLOYER" "$SGDX" "approve(address,uint256)" "$MKT" 27500000000000000000
send "Dan placeLimitOrder(Buy, 2.5, 11): 10 fills, cap" "$DEPLOYER" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 0 2500000000000000000 "11$E"
echo "   best bid $(cast call "$MKT" 'getBestBid()(uint256,uint256)' --rpc-url "$RPC" | tail -1)  best ask $(cast call "$MKT" 'getBestAsk()(uint256,uint256)' --rpc-url "$RPC" | tail -1): crossed"
echo "   keeper simulates matchOrders(10): $(cast call "$MKT" 'matchOrders(uint256)(uint256)' 10 --from "$KEEPER" --rpc-url "$RPC") fills"
send "Keeper matchOrders(10): one transaction"     "$KEEPER" "$MKT" "matchOrders(uint256)" 10
for id in 23 24 25 26; do show_status "$id"; done
table "batch"
expect Alice "$ALICE" 9949 10102
expect Carol "$CAROL" 9989 10022
expect Bob "$BOB" 10051 9898
expect Dan "$DEPLOYER" 970011 969978
expect Keeper "$KEEPER" 0 0
expect Market "$MKT" 0 0

# ---------------------------------------------------------------- 4. stop-limit (Bonus 3)
echo
echo "== 4. Stop-limit (Bonus 3). Alice protects 10 NTU: sell stop, trigger 1.8, limit 1.7. A trade at 1.8 drops the price;"
echo "      a keeper triggers the stop and it sells into Bob's bid at 1.75"
send "Alice approve 10 NTU"                        "$ALICE" "$NTU" "approve(address,uint256)" "$MKT" "10$E"
send "Alice placeStopLimitOrder(Sell, 1.8, 1.7, 10)" "$ALICE" "$MKT" "placeStopLimitOrder(uint8,uint256,uint256,uint256)" 1 1800000000000000000 1700000000000000000 "10$E"
show_status 27
echo "   keeper simulates triggerStopOrders(10) at price 2: $(cast call "$MKT" 'triggerStopOrders(uint256)(uint256)' 10 --from "$KEEPER" --rpc-url "$RPC") triggered (not eligible yet)"
send "Bob approve 19.3 SGDx"                       "$BOB"   "$SGDX" "approve(address,uint256)" "$MKT" 19300000000000000000
send "Bob placeLimitOrder(Buy, 1.75, 10)"          "$BOB"   "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 0 1750000000000000000 "10$E"
send "Bob placeLimitOrder(Buy, 1.8, 1)"            "$BOB"   "$MKT"  "placeLimitOrder(uint8,uint256,uint256)" 0 1800000000000000000 "1$E"
send "Carol approve 1 NTU"                         "$CAROL" "$NTU"  "approve(address,uint256)" "$MKT" "1$E"
send "Carol placeLimitOrder(Sell, 1.8, 1): trade at 1.8" "$CAROL" "$MKT" "placeLimitOrder(uint8,uint256,uint256)" 1 1800000000000000000 "1$E"
echo "   lastTradePrice $(cast from-wei "$(cast call "$MKT" 'lastTradePrice()(uint256)' --rpc-url "$RPC" | cut -d' ' -f1)")"
echo "   keeper simulates triggerStopOrders(10): $(cast call "$MKT" 'triggerStopOrders(uint256)(uint256)' 10 --from "$KEEPER" --rpc-url "$RPC") triggered"
send "Keeper triggerStopOrders(10)"                "$KEEPER" "$MKT" "triggerStopOrders(uint256)" 10
show_status 27; show_status 28
table "stop-limit"
expect Alice "$ALICE" 9939 10119.5
expect Bob "$BOB" 10062 9878.7
expect Carol "$CAROL" 9988 10023.8
expect Keeper "$KEEPER" 0 0
expect Market "$MKT" 0 0

echo
if [ "$FAIL" = 0 ]; then echo "DEMO COMPLETE: every check passed"; else echo "DEMO FINISHED WITH FAILURES (see FAIL lines above)"; fi
exit "$FAIL"
