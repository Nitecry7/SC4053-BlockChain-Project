# Issue P2-001: A failed token transfer was reported as an unnamed error

- **Date:** 2026-11-05
- **Phase:** P2-5 (limit orders and transaction lifecycle), front end
- **Found by:** The real-chain integration test (`web/lib/trading.integration.test.ts`) against a scratch Anvil. The unit tests had passed.
- **Severity:** Medium for usability. The simulation still failed and nothing was sent, but the user got a generic message instead of "allowance too low" or "balance too low".

## 1. Why the AI made the mistake
`describeTxError` maps contract errors by name, and the unit test for the token errors (`ERC20InsufficientAllowance`, `ERC20InsufficientBalance`) passed. That test built the error object by hand with `data.errorName` already set, so it only proved the mapping table. The AI assumed viem would decode any revert from a simulation, without checking which ABI viem decodes against. The order book re-raises the token's own errors through SafeERC20, and the simulation was given only the order book's ABI, which does not contain them.

## 2. Why it is problematic
For the two most common user mistakes (order without approval, order without enough balance) the UI showed a generic "The contract rejected this transaction" with no name, so the recovery steps the app is meant to give were missing. A passing unit test gave false confidence about behaviour that only the real chain exercises.

## 3. How we fixed it
`viemDeps.simulate` in `web/lib/order-runner.ts` now adds the token ABI's error definitions to the ABI used for simulation:

```ts
const TOKEN_ERRORS = demoTokenAbi.filter((item) => item.type === "error");
// ...
abi: [...call.abi, ...TOKEN_ERRORS],
```
A regression test (`web/lib/order-runner.viem.test.ts`) replays the exact revert data the chain returned (selector `0xfb8f41b2`) through a real viem client, so the decoding path is real and only the RPC is synthetic.

## 4. Evidence the fix works
Raw revert from the scratch chain (`cast call`, no transaction sent): `Error: execution reverted: ERC20InsufficientAllowance(0xCafac3dD18aC6c6e92c921884f9E4176737C052c, 0, 2000000000000000000 [2e18])`.

**Before the fix** (regression test written first, run red):
```
     × names ERC20InsufficientAllowance 15ms
     × names ERC20InsufficientBalance 2ms
 FAIL  lib/order-runner.viem.test.ts > viemDeps.simulate decodes token errors re-raised by the order book > names ERC20InsufficientAllowance
AssertionError: expected { kind: 'reverted', …(3) } to match object { kind: 'reverted', …(1) }
```
and on the real chain: `Tests  3 failed | 15 passed (18)` with `→ expected [ 'ERC20InsufficientAllowance', …(1) ] to include undefined`.

**After the fix:**
```
 Test Files  3 passed (3)
      Tests  39 passed (39)
```
and on the real chain: `Test Files  1 passed (1)   Tests  18 passed (18)`. A mutation check that removes `...TOKEN_ERRORS` from the simulation ABI is caught (see the P2-5 evidence file).
