Write a docs/ai-audit/issues/ entry for the bug we just fixed, in the brief's 4-part format:
1. Why the AI made the mistake: for example, lacked context on reentrancy, or misread the rounding direction.
2. Why it is problematic: the real-world impact, for example drainable funds, stuck tokens, or a wrong price.
3. How we fixed it: the specific code change, manual adjustment, re-prompt or spec update.
4. Evidence the fix works: the regression test name plus forge test output before and after, or Slither output.

Use only output actually produced in this session. If the before or after output is missing, say so instead of writing it from memory.
