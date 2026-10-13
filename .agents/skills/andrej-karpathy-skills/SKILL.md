---
name: andrej-karpathy-skills
description: Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations. Use when writing, reviewing, planning, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks (simple typo fixes, obvious one-liners), use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- **State assumptions explicitly** — If uncertain, ask rather than guess.
- **Present multiple interpretations** — If multiple interpretations exist, present them; don't pick silently.
- **Push back when warranted** — If a simpler approach exists, say so.
- **Stop when confused** — If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

**The Test:** Would a senior engineer say this is overcomplicated? If yes, simplify.
*Good code is code that solves today's problem simply, not tomorrow's problem prematurely.*

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The Test:** Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
`
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
`

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Anti-Patterns & Reference Examples

Detailed before-and-after examples for each principle are documented in:
- [references/examples.md](references/examples.md) — Real-world code anti-patterns and surgical fixes for Python, JS/TS, refactoring, and tests.
- [references/claude.md](references/claude.md) — The standalone single-file ruleset.
