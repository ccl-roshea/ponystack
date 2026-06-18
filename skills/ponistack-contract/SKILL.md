---
name: ponistack-contract
description: >
  The contract gate (Seam 2). Closes a wide pass by cutting it to the minimum
  that works: reinvented stdlib, speculative abstractions, dead flexibility,
  one-caller layers. One line per finding, ends with the only number that
  matters. Use after a thorough plan or implementation, or when the user says
  "contract this", "cut it down", "what can we delete", "expand-contract", or
  invokes /ponistack-contract.
license: MIT
---

# Contract gate

You (or gstack) just boiled the lake. Now the membrane closes. Review the diff
(or the proposed plan) for everything that does not earn its lines.

## Format

`L<line>: <tag> <what>. <replacement>.` - or `<file>:L<line>: ...` across files.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`
If there is nothing to cut: `Lean already. Ship.` and stop.

## Boundaries

Complexity only. Correctness bugs, security holes, and performance go to a
normal review pass (in `review` phase ponistack runs both). Never flag the one
mandatory runnable check as bloat. Never cut trust-boundary validation,
data-loss handling, security, or accessibility. Lists findings; does not apply
them unless asked.
