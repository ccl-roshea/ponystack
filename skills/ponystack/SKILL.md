---
name: ponystack
description: >
  The membrane between an expensive brain and cheap hands. Boil the lake to
  understand a problem; do not pour it into your code. Think expensive, write
  cheap. A phase router mutes the lazy senior while you plan and unleashes it
  while you implement. Use whenever the user says "ponystack", "membrane",
  "think expensive write cheap", complains that a process bloats the code, or
  wants gstack's thoroughness without gstack's line count.
license: MIT
---

# Ponystack

gstack (Garry Tan / YC) is right that understanding is cheap - so boil the
lake. It is wrong that *code* is cheap. ponytail (Dietrich Gebert) is right
that code is never free - so write the least of it. Both are half a brain.
ponystack is the membrane between them.

> **Boil the lake to understand it. Don't pour it into your code.**
> Think expensive, write cheap.

The bug ponystack patches lives in one line of gstack's ETHOS: *"prefer the
+70 LOC version, every time, the delta is cheap to write."* That conflates the
cost of **thinking** (near-zero, spend freely) with the cost of **code** (never
zero: every line is bug surface, a read tax, a thing to delete later).

## The phase router (always on)

Each turn, the work has a phase. The router gives the right parent the wheel
and mutes the other:

| Phase | What you do | Lazy senior |
|-------|-------------|-------------|
| **understand / plan / design / research** | decompose, research, weigh trade-offs | **SILENT** - boil the lake, gstack rules |
| **implement** | write the code | **MAX** - the ladder, YAGNI |
| **review** | check the diff | **BOTH** - bugs + a delete-list |

This is automatic via the SessionStart + UserPromptSubmit hooks. You can force
it: `/ponystack understand|implement|review`.

## The ladder (implement phase)

Stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative need = skip it. (YAGNI)
2. **Stdlib does it?** Use it.
3. **Native platform feature covers it?** `<input type="date">` over a lib, CSS over JS, a DB constraint over app code.
4. **Already-installed dependency solves it?** Use it. Never add one for what a few lines do.
5. **Can it be one line?** One line.
6. **Only then:** the minimum code that works.

The ladder is a reflex, not a research project. First lazy solution that works wins.

## Expand → contract (Seam 2)

A wide pass (a gstack plan, a thorough implementation) is not done until it has
been **contracted**. End it with the gate: `/ponystack-contract`. You generated
breadth; now cut it to the minimum that works. Producer and critic in one
pipeline, not two sessions you have to remember to chain.

## Thinking-to-diff ratio (Seam 3)

The membrane's scoreboard: reasoning spent ÷ net code shipped. High is the
champion ("9,000 tokens of thought → 11 lines"). Run `/ponystack-ratio` to
score a session. A high ratio means the thinking went into the *plan*, not the
*line count*.

## When NOT to be lazy

Never simplify away: trust-boundary input validation, error handling that
prevents data loss, security, accessibility, anything explicitly requested.
Non-trivial logic (a branch, a loop, a parser, a money/security path) leaves
ONE runnable check behind - the smallest thing that fails if the logic breaks.
Trivial one-liners need no test.

Mark deliberate shortcuts with a `ponystack:` comment that names the ceiling
and the upgrade path: `# ponystack: O(n) scan, index it if the list grows`.

## Output

In implement phase: code first, then at most three lines (what was skipped,
when to add it). If the explanation is longer than the code, delete the
explanation. In understand/review phase, prose the user asked for is not debt -
give the plan or the report in full.

The shortest path to done is the right path. Boil the lake. Keep the steam.
