#!/usr/bin/env bash
# Mutation check for contracts/src/OrderBook.sol.
#
# Run from the repo root (Git Bash or any bash with GNU sed):
#   bash docs/ai-audit/test-evidence/mutants.sh "^(P5|G |Z |S1)"   # per phase: that phase's mutants + smoke set
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
  out=$(forge test --no-match-test "testFuzz" 2>&1)
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
  's/if (order.status != Status.Open \&\& order.status != Status.PartiallyFilled) revert OrderNotActive();//'
run "C2  PartiallyFilled not cancellable" \
  's/ \&\& order.status != Status.PartiallyFilled) revert OrderNotActive/) revert OrderNotActive/'
run "C3  cancel skips _unlink" \
  's/^        _unlink(orderId);$//'
run "C4  cancel does not zero lockedQuote" \
  's/^        order.lockedQuote = 0;$//'
run "C5  cancel does not set Cancelled" \
  's/^        order.status = Status.Cancelled;$//'
run "C6  cancel transfers before state (CEI broken)" \
  '/if (refundBase != 0) IERC20(baseToken).safeTransfer(msg.sender, refundBase);/d; /if (refundQuote != 0) IERC20(quoteToken).safeTransfer(msg.sender, refundQuote);/d; s/^        _unlink(orderId);$/        if (refundBase != 0) IERC20(baseToken).safeTransfer(msg.sender, refundBase);\n        if (refundQuote != 0) IERC20(quoteToken).safeTransfer(msg.sender, refundQuote);\n        _unlink(orderId);/'
run "N1  sell refund ignores filled" \
  's/order.amount - order.filled : 0;/order.amount : 0;/'
run "N2  base refund sent to tx.origin" \
  's/safeTransfer(msg.sender, refundBase)/safeTransfer(tx.origin, refundBase)/'
run "N3  OrderCancelled reports refundQuote as 0" \
  's/emit OrderCancelled(orderId, msg.sender, refundBase, refundQuote);/emit OrderCancelled(orderId, msg.sender, refundBase, 0);/'
run "N4  buy cancel also refunds base" \
  's/order.side == Side.Sell ? order.amount - order.filled : 0;/order.amount - order.filled;/'
run "R1  quote refund skipped at 1 wei" \
  's/if (refundQuote != 0) IERC20(quoteToken)/if (refundQuote > 1) IERC20(quoteToken)/'
run "R2  base refund skipped at one lot" \
  's/if (refundBase != 0) IERC20(baseToken)/if (refundBase > 1e9) IERC20(baseToken)/'
run "R3  cancel status check weakened to Cancelled only" \
  's/if (order.status != Status.Open \&\& order.status != Status.PartiallyFilled) revert OrderNotActive();/if (order.status == Status.Cancelled) revert OrderNotActive();/'
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

echo "---"
echo "caught=$caught survived=$survived other=$other"
