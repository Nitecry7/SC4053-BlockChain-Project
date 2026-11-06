# Issue P2-004: The ticket's "Switch to Anvil" showed no pending-wallet guidance

- **Date:** 2026-11-05
- **Phase:** P2-5, front end
- **Found by:** The browser test, step "wrong network".
- **Severity:** Low. It is the exact "request pending with no explanation" problem the phase was meant to remove, in one of the four required places (network switching).

## 1. Why the AI made the mistake
The pending-wallet guidance was added to the banner's Switch button, which owns its own `useSwitchChain` instance. The ticket added a second Switch button with another `useSwitchChain` instance. wagmi mutation state is per hook instance, so the banner could not see the ticket's pending request. The AI treated "network switching" as one place when there were two.

## 2. Why it is problematic
A user who pressed Switch in the ticket saw only a disabled "Waiting for wallet…" button. If the MetaMask popup was hidden, nothing told them where to look.

## 3. How we fixed it
`web/components/trade/order-ticket.tsx` renders the same waiting notice (and the rejected/error variants) for its own switch request, with Try again.

## 4. Evidence the fix works
**Before the fix:**
```
  FAIL  wrong network: the banner and the ticket offer Switch to Anvil, with the pending-wallet guidance and recovery
        locator.waitFor: Timeout 5000ms exceeded.
```
**After the fix:** the step passes (`13 passed, 0 failed`, mock wallet). Switching from the header's own chain dialog is handled by RainbowKit and cannot be observed by this app; that limit is documented.
