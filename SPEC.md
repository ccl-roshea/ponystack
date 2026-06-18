# SPEC - the prompt that builds ponistack

This is the master prompt. ponistack was built from it, and ponistack rebuilds
itself from it (see "The bootstrap" in the README). Hand this file to a capable
coding agent verbatim; the output should be this repository.

It is written in ponistack's own voice: the spec is the lake - read all of it,
think hard - then write the least code that satisfies it.

---

## Prompt

> You are building **ponistack**, a standalone Claude Code plugin (it lives
> beside any setup and overwrites nothing). It marries two real frameworks:
>
> - **gstack** (Garry Tan / YC): strong on PROCESS - decompose, plan, review,
>   ship. Its ethos is "Boil the Lake": *"AI makes the marginal cost of
>   completeness near-zero ... prefer the +70 LOC version, every time."* This
>   bloats output.
> - **ponytail** (Dietrich Gebert, MIT): a lazy senior dev that stops bloat -
>   the ladder YAGNI → stdlib → native feature → installed dep → one line →
>   minimum.
>
> They are a pair: generator + critic. gstack's one-line bug is conflating the
> cost of THINKING (near-zero, spend freely) with the cost of CODE (never zero).
> ponistack is the **membrane**: *Boil the lake to understand it. Don't pour it
> into your code. Think expensive, write cheap.*
>
> Build it with three seams:
>
> 1. **Phase router (core, always-on hook).** Detect the work phase each turn
>    and switch the lazy senior:
>    - understand / plan / design / research → senior **silent** (gstack rules).
>    - implement → senior at **max** (the ladder, YAGNI).
>    - review → **both** (correctness bugs + a delete-list).
>    Detect the phase primarily from which gstack command is running
>    (`/plan-*`, `/spec`, `/investigate`, `/design-*` → understand;
>    `/review`, `/qa`, `/code-review`, `/design-review` → review;
>    `/ship`, `/land-and-deploy` → implement) plus natural-language fallbacks.
>    A plan review (`/plan-ceo-review`) is understand, not review.
> 2. **Expand → contract conveyor.** A wide pass ends with a mandatory
>    lazy-senior gate that cuts breadth to the minimum that works. Output: one
>    line per finding, ending `net: -N lines possible.`
> 3. **Thinking-to-diff ratio.** Reasoning spent ÷ net code shipped. High is the
>    champion. A session skill + the headline metric of the bootstrap.
>
> Mirror ponytail's proven layout: `.claude-plugin/{plugin.json,marketplace.json}`,
> `hooks/` (SessionStart + UserPromptSubmit), `skills/`, `commands/`,
> `benchmarks/`, `README.md`, `LICENSE` (MIT), `AGENTS.md`.
>
> The benchmark must prove the claim with reproducible numbers: three arms
> (no-skill baseline, gstack = its ETHOS as system prompt, ponistack) over the
> same tasks, measuring code LOC (deterministic) and correctness (executed
> where feasible, structural otherwise). Correctness is a gate: "less code" must
> never mean "broken code."
>
> Constraints:
> - MIT. Credit both gstack (Garry Tan / YC) and ponytail (Dietrich Gebert) in
>   README and LICENSE.
> - Obey your own creed: minimum code, YAGNI, no needless abstractions. The
>   lazy senior's discipline applies to ponistack itself, especially to it.
> - Everything in the repo is in English. Overwrite nothing in the user's setup.
>
> Success: a stranger installs ponistack, sees reproducible numbers vs gstack in
> the README, runs the benchmark, and gets the same numbers.

---

## The bootstrap (why this file exists)

- **Gen 0** - this repo, built by a coding agent applying the membrane by hand.
- **Gen 1** - install ponistack, hand it this SPEC, let its phase router drive
  the build. Compare structure and benchmark numbers to Gen 0.
- **Convergence** - when Gen 1 reproduces Gen 0 (installs, hooks valid, tests
  green, bench runs), the framework is self-hosting. Like a compiler that
  compiles itself. Not infinite recursion - a fixed point.
