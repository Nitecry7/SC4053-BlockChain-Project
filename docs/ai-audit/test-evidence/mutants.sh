#!/usr/bin/env bash
# Mutation check for contracts/src/OrderBook.sol.
#
# Run from the repo root (Git Bash or any bash with GNU sed):
#   bash docs/ai-audit/test-evidence/mutants.sh "^(P6|G |Z |S1)"   # per phase: that phase's mutants + smoke set
#   bash docs/ai-audit/test-evidence/mutants.sh                    # every mutant (slow, ~1 compile per mutant;
#                                                                  # run the full set once, in Phase 8)
# The argument is a bash regex matched against each mutant's name. Smoke set: G (cancel guard), Z (issue 005),
# S1 (settlement refund guard).
#
# Each mutant is one sed edit, matched on code text (not line numbers). The script backs up OrderBook.sol,
# applies one mutant, runs `forge test` with fuzz tests excluded (for speed), reports CAUGHT, SURVIVED,
# COMPILE ERROR or NOT APPLIED (the pattern no longer matches the source, so update the mutant), then
# restores the file. The original is restored on exit, even after Ctrl+C.
#
# A mutant that SURVIVES means no test notices that bug: add a test, or explain why it is equivalent.
set -u
set -f # no glob expansion: MUTANT_FORGE_ARGS may contain test/invariant/*

# Default: unit tests only (no fuzz, no invariant suite), for speed. Override to aim mutants at another suite, e.g.
#   MUTANT_FORGE_ARGS='--match-path test/invariant/*' FOUNDRY_INVARIANT_RUNS=32 bash .../mutants.sh "^C4"
MUTANT_FORGE_ARGS="${MUTANT_FORGE_ARGS:---no-match-test testFuzz --no-match-path test/invariant/*}"

FILTER="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS="$SCRIPT_DIR/../../../contracts"
export PATH="$HOME/.foundry/bin:$PATH"
cd "$CONTRACTS" || { echo "contracts/ not found from $SCRIPT_DIR"; exit 1; }

SRC=src/OrderBook.sol
BAK=$(mktemp)
cp "$SRC" "$BAK"
restore() { cp "$BAK" "$SRC"; rm -f "$BAK"; }
trap restore EXIT
trap 'exit 130' INT TERM

caught=0; survived=0; other=0

run() {
  local name="$1" expr="$2"
  [[ "$name" =~ $FILTER ]] || return 0
  cp "$BAK" "$SRC"
  sed -i "$expr" "$SRC"
  if cmp -s "$BAK" "$SRC"; then echo "$name: NOT APPLIED (pattern missing)"; other=$((other + 1)); return; fi
  local out summary failed
  # shellcheck disable=SC2086 # word splitting of MUTANT_FORGE_ARGS is intended
  out=$(forge test $MUTANT_FORGE_ARGS 2>&1)
  summary=$(echo "$out" | grep -E "tests passed" | tail -1)
  failed=$(echo "$out" | grep -E "^\[FAIL" | sed -E 's/^\[FAIL.*\] ([A-Za-z0-9_]+)\(.*/\1/' | sort -u | head -5 | tr '\n' ' ')
  if echo "$out" | grep -q "Compiler run failed"; then
    echo "$name: COMPILE ERROR"; other=$((other + 1))
  elif echo "$summary" | grep -q " 0 failed"; then
    echo "$name: SURVIVED | $summary"; survived=$((survived + 1))
  else
    echo "$name: CAUGHT | $summary | e.g. $failed"; caught=$((caught + 1))
  fi
}

# --- Phase 3 / 4: settlement and cancel ---
run "G   cancelOrder nonReentrant removed" \
  's/function cancelOrder(uint256 orderId) external nonReentrant {/function cancelOrder(uint256 orderId) external {/'
run "Z   zero-address owner check removed (issue 005)" \
  's/if (order.trader == address(0) || order.trader != msg.sender)/if (order.trader != msg.sender)/'
run "S1  zero-value refund guard in _settleFill removed" \
  's/if (refund != 0) IERC20(quoteToken).safeTransfer(buyOrder.trader, refund);/IERC20(quoteToken).safeTransfer(buyOrder.trader, refund);/'
run "C1  cancel status check removed" \
  's/^        ) revert OrderNotActive();$/        ) {}/'
run "C2  PartiallyFilled not cancellable" \
  's/order.status != Status.Open \&\& order.status != Status.PartiallyFilled$/order.status != Status.Open/'
run "C3  cancel skips _unlink" \
  's/^        _unlink(orderId);$//'
run "C4  cancel does not zero lockedQuote" \
  's/^        order.lockedQuote = 0;$//'
run "C5  cancel does not set Cancelled" \
  's/^        order.status = Status.Cancelled;$//'
run "C6  cancel transfers before state (CEI broken)" \
  '/^        if (refundBase != 0) IERC20(baseToken).safeTransfer(trader, refundBase);$/d; /^        if (refundQuote != 0) IERC20(quoteToken).safeTransfer(trader, refundQuote);$/d; s/^        order.status = Status.Cancelled;$/        if (refundBase != 0) IERC20(baseToken).safeTransfer(trader, refundBase);\n        if (refundQuote != 0) IERC20(quoteToken).safeTransfer(trader, refundQuote);\n        order.status = Status.Cancelled;/'
run "N1  sell refund ignores filled" \
  's/order.amount - order.filled : 0;/order.amount : 0;/'
run "N2  base refund sent to tx.origin" \
  's/safeTransfer(trader, refundBase)/safeTransfer(tx.origin, refundBase)/'
run "N3  OrderCancelled reports refundQuote as 0" \
  's/emit OrderCancelled(orderId, trader, refundBase, refundQuote);/emit OrderCancelled(orderId, trader, refundBase, 0);/'
run "N4  buy cancel also refunds base" \
  's/order.side == Side.Sell ? order.amount - order.filled : 0;/order.amount - order.filled;/'
run "R1  quote refund skipped at 1 wei" \
  's/if (refundQuote != 0) IERC20(quoteToken)/if (refundQuote > 1) IERC20(quoteToken)/'
run "R2  base refund skipped at one lot" \
  's/if (refundBase != 0) IERC20(baseToken)/if (refundBase > 1e9) IERC20(baseToken)/'
run "R3  cancel status check weakened to Cancelled only" \
  's/order.status != Status.Open \&\& order.status != Status.PartiallyFilled$/order.status == Status.Cancelled/; s/^                \&\& order.status != Status.PendingTrigger$/                \&\& true/'
run "R4  buy refund recomputed from price (EQUIVALENT: expected to survive)" \
  's/uint256 refundQuote = order.lockedQuote;/uint256 refundQuote = order.side == Side.Buy ? (order.amount - order.filled) * order.price \/ PRICE_SCALE : 0;/'

# --- Phase 5: matchOrders ---
run "P5a matchOrders nonReentrant removed" \
  's/function matchOrders(uint256 maxMatches) external nonReentrant returns/function matchOrders(uint256 maxMatches) external returns/'
run "P5b maxMatches 0 accepted" \
  's/if (maxMatches == 0 || maxMatches > MAX_MATCHES_PER_TX)/if (maxMatches > MAX_MATCHES_PER_TX)/'
run "P5c cap check off by one (rejects the cap itself)" \
  's/maxMatches > MAX_MATCHES_PER_TX) revert InvalidMaxCount/maxMatches >= MAX_MATCHES_PER_TX) revert InvalidMaxCount/'
run "P5d cap check off by one (accepts cap + 1)" \
  's/maxMatches > MAX_MATCHES_PER_TX) revert InvalidMaxCount/maxMatches > MAX_MATCHES_PER_TX + 1) revert InvalidMaxCount/'
run "P5e loop ignores maxMatches (uses the global cap)" \
  's/while (matchesDone < maxMatches) {/while (matchesDone < MAX_MATCHES_PER_TX) {/'
run "P5f equal prices treated as not crossed" \
  's/if (bid.price < ask.price) break;/if (bid.price <= ask.price) break;/'
run "P5g maker chosen by order ID, not bookSeq" \
  's/_bookSeq\[bidId\] < _bookSeq\[askId\] ? (bidId, askId)/bidId < askId ? (bidId, askId)/'
run "P5h maker is always the ask" \
  's/? (bidId, askId) : (askId, bidId);/? (askId, bidId) : (askId, bidId);/'
run "P5i maker is always the bid" \
  's/? (bidId, askId) : (askId, bidId);/? (bidId, askId) : (bidId, askId);/'
run "P5j filled taker in the book not unlinked" \
  's/^        if (takerInBook \&\& taker.status == Status.Filled) _unlink(takerId);$//'
run "P5k filled taker unlinked after the transfers (CEI broken)" \
  '/^        if (takerInBook \&\& taker.status == Status.Filled) _unlink(takerId);$/d; s/^\(        if (refund != 0) IERC20(quoteToken).safeTransfer(buyOrder.trader, refund);\)$/\1\n        if (takerInBook \&\& taker.status == Status.Filled) _unlink(takerId);/'
run "P5l matchOrders passes takerInBook = false" \
  's/ask.amount - ask.filled), true);/ask.amount - ask.filled), false);/'
run "P5m fill count not incremented" \
  's/^            matchesDone++;$//'
run "P5n fill size ignores the ask remainder" \
  's/Math.min(bid.amount - bid.filled, ask.amount - ask.filled)/(bid.amount - bid.filled)/'
run "P5o empty ask side not detected (Phase 5 review M1)" \
  's/if (bidId == 0 || askId == 0) break;/if (bidId == 0) break;/'
run "P5p empty-side check needs both sides empty (Phase 5 review M1)" \
  's/if (bidId == 0 || askId == 0) break;/if (bidId == 0 \&\& askId == 0) break;/'
run "P5q empty bid side not detected (EQUIVALENT: price 0 never crosses)" \
  's/if (bidId == 0 || askId == 0) break;/if (askId == 0) break;/'

# --- Phase 6: stop-limit ---
run "P6a placeStopLimitOrder nonReentrant removed" \
  's/^        nonReentrant$//'
run "P6b triggerStopOrders nonReentrant removed" \
  's/function triggerStopOrders(uint256 maxCount) external nonReentrant returns/function triggerStopOrders(uint256 maxCount) external returns/'
run "P6c zero trigger price accepted" \
  's/if (price == 0 || (isStop \&\& triggerPrice == 0)) revert ZeroPrice();/if (price == 0) revert ZeroPrice();/'
run "P6d trigger price tick not checked" \
  's/if (price % TICK_SIZE != 0 || triggerPrice % TICK_SIZE != 0) revert InvalidTickSize();/if (price % TICK_SIZE != 0) revert InvalidTickSize();/'
run "P6e stop escrowed but never listed" \
  's/^        _insert(orderId);$//'
run "P6f escrow taken at the trigger price, not the limit" \
  's/lockedQuote: side == Side.Buy ? requiredQuote(amount, price) : 0,/lockedQuote: side == Side.Buy ? requiredQuote(amount, triggerPrice == 0 ? price : triggerPrice) : 0,/'
run "P6g cancel rejects PendingTrigger" \
  's/^                \&\& order.status != Status.PendingTrigger$/                \&\& true/'
run "P6h no hasTradePrice guard" \
  's/^        if (!hasTradePrice) return 0;$//'
run "P6i buy stop needs a strictly higher price" \
  's/lastTradePrice >= _orders\[buyId\].triggerPrice/lastTradePrice > _orders[buyId].triggerPrice/'
run "P6j sell stop needs a strictly lower price" \
  's/lastTradePrice <= _orders\[sellId\].triggerPrice/lastTradePrice < _orders[sellId].triggerPrice/'
run "P6k buy eligibility inverted" \
  's/lastTradePrice >= _orders\[buyId\].triggerPrice/lastTradePrice <= _orders[buyId].triggerPrice/'
run "P6l no fresh bookSeq on activation" \
  's/^            _stampBookSeq(orderId);$//'
run "P6m budget per activation, not shared" \
  's/budget -= _matchTaker(orderId, budget);/_matchTaker(orderId, MAX_MATCHES_PER_TX);/'
run "P6n activated remainder neither rested nor refunded" \
  's/^            if (_orders\[orderId\].status != Status.Filled \&\& !_tryInsert(orderId)) _closeAndRefund(orderId);$//'
run "P6o maxCount ignored" \
  's/while (triggered < maxCount) {/while (triggered < MAX_MATCHES_PER_TX) {/'
run "P6p status not set Open on activation" \
  's/^            _orders\[orderId\].status = Status.Open;$//'
run "P6q equal triggers: new stop jumps ahead" \
  's/return side == Side.Buy ? triggerA < triggerB : triggerA > triggerB;/return side == Side.Buy ? triggerA <= triggerB : triggerA >= triggerB;/'
run "P6r sell stops sorted ascending" \
  's/return side == Side.Buy ? triggerA < triggerB : triggerA > triggerB;/return side == Side.Buy ? triggerA < triggerB : triggerA < triggerB;/'
run "P6s stop lists ignored (everything uses the book list)" \
  's/^        if (_orders\[orderId\].status == Status.PendingTrigger) return _stopHead;$//'
run "P6t StopOrderTriggered reports price 0" \
  's/emit StopOrderTriggered(orderId, lastTradePrice);/emit StopOrderTriggered(orderId, 0);/'
run "P6u triggered count not incremented" \
  's/^            triggered++;$//'

run "P6v StopOrderTriggered reports the trigger price (Phase 6 review L1)" \
  's/emit StopOrderTriggered(orderId, lastTradePrice);/emit StopOrderTriggered(orderId, _orders[orderId].triggerPrice);/'
run "P6w ineligible buy head hides an eligible sell head (Phase 6 review L2)" \
  's/if (buyId != 0 \&\& lastTradePrice >= _orders\[buyId\].triggerPrice) return buyId;/if (buyId != 0) return lastTradePrice >= _orders[buyId].triggerPrice ? buyId : 0;/'
run "P6x unplaceable activated stop reverts the call (issue 006, pre-fix code)" \
  's/if (_orders\[orderId\].status != Status.Filled \&\& !_tryInsert(orderId)) _closeAndRefund(orderId);/if (_orders[orderId].status != Status.Filled) _insert(orderId);/'
run "P6y unplaceable activated stop silently dropped (no refund)" \
  's/\&\& !_tryInsert(orderId)) _closeAndRefund(orderId);/\&\& !_tryInsert(orderId)) {}/'
# --- Phase 7: trade-price bookkeeping (aimed at the invariant suite as well as the unit suite) ---
run "P7a hasTradePrice never set" \
  's/^        hasTradePrice = true;$//'
run "P7b lastTradePrice set to the taker's limit, not the execution price" \
  's/^        lastTradePrice = price;$/        lastTradePrice = taker.price;/'
run "P7c payouts swapped: base to the seller, quote to the buyer (Phase 7 review H1)" \
  's/IERC20(baseToken).safeTransfer(buyOrder.trader, qty);/IERC20(baseToken).safeTransfer(sellOrder.trader, qty);/; s/IERC20(quoteToken).safeTransfer(sellOrder.trader, cost);/IERC20(quoteToken).safeTransfer(buyOrder.trader, cost);/'
run "P7d price-improvement refund paid to the seller (Phase 7 review H1)" \
  's/if (refund != 0) IERC20(quoteToken).safeTransfer(buyOrder.trader, refund);/if (refund != 0) IERC20(quoteToken).safeTransfer(sellOrder.trader, refund);/'
run "P7e cancel and auto-cancel refunds paid to msg.sender (Phase 7 review H1)" \
  's/safeTransfer(trader, refundBase)/safeTransfer(msg.sender, refundBase)/; s/safeTransfer(trader, refundQuote)/safeTransfer(msg.sender, refundQuote)/'
run "P7f placement treats an equal price as not crossing (Phase 7 review M1)" \
  's/taker.price >= maker.price : taker.price <= maker.price/taker.price > maker.price : taker.price < maker.price/'
run "P7g every activated stop is auto-cancelled (Phase 7 review M2)" \
  's/\&\& !_tryInsert(orderId)) _closeAndRefund(orderId);/\&\& (!_tryInsert(orderId) || true)) _closeAndRefund(orderId);/'
run "P7h insert scan limit 10 instead of MAX_INSERT_SCAN (Phase 7 review M2)" \
  's/if (steps == MAX_INSERT_SCAN) return false;/if (steps == 10) return false;/'
echo "---"
echo "caught=$caught survived=$survived other=$other"
