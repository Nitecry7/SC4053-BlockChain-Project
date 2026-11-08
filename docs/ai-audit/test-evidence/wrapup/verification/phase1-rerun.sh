#!/usr/bin/env bash
# Phase 1 re-run of the Phase 8 evidence commands, sequential (slither runs forge clean).
set -u
export PATH="$HOME/.foundry/bin:$PATH"
OUT="${1:-$(cd "$(dirname "$0")" && pwd)}"  # output folder (default: next to this script)
cd "$(git -C "$OUT" rev-parse --show-toplevel)/contracts"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }
echo "start $(stamp) HEAD $(git rev-parse --short HEAD)" > "$OUT/progress.txt"

echo "# slither $(stamp)" > "$OUT/slither.txt"
slither . --filter-paths "(lib/|test/|script/|src/MarketFactory|src/TokenFactory|src/DemoToken)" >> "$OUT/slither.txt" 2>&1
echo "slither exit $? $(stamp)" >> "$OUT/progress.txt"

echo "# forge lint $(stamp)" > "$OUT/lint.txt"
forge lint src/OrderBook.sol >> "$OUT/lint.txt" 2>&1
echo "lint exit $? $(stamp)" >> "$OUT/progress.txt"

echo "# forge build --sizes $(stamp)" > "$OUT/sizes.txt"
forge build --sizes >> "$OUT/sizes.txt" 2>&1
echo "sizes exit $? $(stamp)" >> "$OUT/progress.txt"

echo "# forge coverage $(stamp)" > "$OUT/coverage.txt"
forge coverage --report summary --no-match-path 'test/invariant/*' >> "$OUT/coverage.txt" 2>&1
echo "coverage exit $? $(stamp)" >> "$OUT/progress.txt"

echo "# forge test --gas-report (no invariant, no fuzz) $(stamp)" > "$OUT/gas.txt"
forge test --gas-report --no-match-path 'test/invariant/*' --no-match-test 'testFuzz' >> "$OUT/gas.txt" 2>&1
echo "gas exit $? $(stamp)" >> "$OUT/progress.txt"

echo "# forge test (default profile, full) $(stamp)" > "$OUT/test.txt"
forge test >> "$OUT/test.txt" 2>&1
echo "test exit $? $(stamp)" >> "$OUT/progress.txt"
echo "done $(stamp)" >> "$OUT/progress.txt"
