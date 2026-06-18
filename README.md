<h1 align="center">ponystack</h1>

<p align="center">
  <em>Boil the lake to understand it. Don't pour it into your code.</em><br>
  <strong>Think expensive. Write cheap.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-111111?style=flat-square" alt="Claude Code plugin">
  <img src="https://img.shields.io/badge/stands%20on-gstack%20%2B%20ponytail-111111?style=flat-square" alt="gstack + ponytail">
</p>

---

## gstack from YC bloats your code. On purpose. Here is the quote.

[gstack](https://garryslist.org/posts/boil-the-ocean) (Garry Tan / Y Combinator) is a genuinely great
process framework: it decomposes, plans, reviews, ships. Its founding principle
is "Boil the Lake," and it says this, verbatim, in its own `ETHOS.md`:

> **AI-assisted coding makes the marginal cost of completeness near-zero. When
> the complete implementation costs minutes more than the shortcut - do the
> complete thing. Every time.**
>
> **Completeness is cheap.** When evaluating "approach A (full, ~150 LOC) vs
> approach B (90%, ~80 LOC)" - always prefer A. The 70-line delta costs seconds
> with AI coding.
>
> Anti-pattern: *"Choose B - it covers 90% with less code." (If A is 70 lines
> more, choose A.)*

Source: gstack `ETHOS.md`, and https://garryslist.org/posts/boil-the-ocean

Read it again. The rule is literally *"prefer the version with 70 more lines of
code, every time."* That is policy, not an accident. And it is a bug in exactly
one line.

## The bug

gstack conflates two different costs:

- The cost of **thinking** is near-zero. Spend it freely. gstack is right.
- The cost of **code** is never zero. Every line is bug surface, a tax on every
  future reader, and a thing someone deletes at 3am. gstack is blind here.

"Boil the lake" is the correct instinct applied to the wrong tank. Boil the lake
of *understanding*. Do not boil it into your *codebase*. gstack pours the steam
straight into your diff, and you pay for it in bugs and review time forever.

## The turn

What if you kept gstack's expensive brain, and put a membrane in front of its
hands?

That membrane already exists as a second framework:
[ponytail](https://github.com/DietrichGebert/ponytail) (Dietrich Gebert, MIT) -
a lazy senior dev that refuses to write a line that doesn't earn its place:
YAGNI, then stdlib, then a native feature, then a dep you already have, then one
line, then the minimum that works.

gstack is the generator. ponytail is the critic. Apart, each is half a brain:
gstack without a critic bloats; ponytail without a process is shallow. ponystack
is the membrane that joins them.

## How it works: one router, three seams

A small always-on hook reads the work phase every turn and gives the right
parent the wheel. This is the whole trick - it dissolves the contradiction by
letting each framework rule only where it is right:

| Phase | What you are doing | The lazy senior is |
|-------|--------------------|--------------------|
| understand / plan / design / research | decompose, research, weigh trade-offs | **silent** - boil the lake (gstack) |
| implement | write the code | **at max** - the ladder, YAGNI (ponytail) |
| review | check the diff | **both** - bugs + a delete-list |

It detects the phase from the gstack command you ran (`/plan-*`, `/spec`,
`/investigate`, `/design-*` -> understand; `/review`, `/qa`, `/code-review` ->
review; `/ship` -> implement) plus plain-language cues. A *plan* review stays in
understand; the lazy senior never deletes a plan.

Three seams hold it together:

1. **Phase router** (above) - the core. Generator and critic stop shouting over
   each other.
2. **Expand -> contract** - any wide pass ends with a mandatory gate
   (`/ponystack-contract`) that cuts breadth to the minimum that works. Producer
   and critic in one pipeline, ending with `net: -N lines possible.`
3. **Thinking-to-diff ratio** (`/ponystack-ratio`) - reasoning spent divided by
   net code shipped. High is the champion. `9,000 tokens of thought -> 11 lines`
   is the goal, and the screenshot.

What it never cuts: trust-boundary validation, error handling that prevents data
loss, security, accessibility. That floor is inherited from both parents.

## The proof

Same model, same tasks, three arms: a no-skill baseline, **gstack** (its real
`ETHOS.md` as the system prompt), and **ponystack**. We measure code size
(deterministic LOC) and correctness (executed where feasible, structural
otherwise). Correctness is a gate: less code that does not work is not a win, it
is a bug.

<!-- BENCH:START -->
**Total lines of code across all 7 tasks** (3 runs per cell, lower is leaner):

| arm | gpt-5.5 | claude-opus-4-7 | gemini-3.1-pro |
|---|--:|--:|--:|
| baseline (no skill) | 1018 | 1033 | 725 |
| gstack (its ETHOS) | 1424 | 780 | 1328 |
| **ponystack** | **545** | **197** | **238** |

**Correctness** (share of task-runs whose generated code passes the gate):

| arm | gpt-5.5 | claude-opus-4-7 | gemini-3.1-pro |
|---|--:|--:|--:|
| baseline (no skill) | 81% | 100% | 86% |
| gstack (its ETHOS) | 71% | 76% | 57% |
| **ponystack** | **86%** | **86%** | **76%** |

ponystack ships **62-82% less code than gstack** (545 vs 1424 on gpt-5.5; 197 vs
780 on opus; 238 vs 1328 on gemini) while being **more correct on every model**
(86/86/76% vs gstack's 71/76/57%). gstack is the least-correct arm of the three
on all three models, and on 2 of 3 it out-bloats a no-skill baseline (+40% on
gpt-5.5, +83% on gemini). Less code, fewer bugs, ~50-76% lower cost - the
membrane does exactly what it claims.

<sub>3 runs per cell via the Perplexity Agent API across three vendors (OpenAI,
Anthropic, Google), 7 tasks, $4.12 total - stable vs an earlier single-run pass.
The gstack arm is gstack's real <code>ETHOS.md</code> as the system prompt; the
ponystack arm is its implement-phase doctrine. Method + raw results:
<a href="benchmarks/results/">benchmarks/results/</a>.</sub>
<!-- BENCH:END -->

Reproduce it yourself - the entire point of this repo:

```bash
# stranger-reproducible path (needs ANTHROPIC_API_KEY):
npx promptfoo@latest eval -c benchmarks/promptfooconfig.yaml --repeat 10
npx promptfoo@latest view

# or against any OpenAI-compatible / Perplexity gateway:
node benchmarks/run-local.js
```

Method and tasks: [benchmarks/](benchmarks/).

## The bootstrap: ponystack built ponystack

This repo was built from a single prompt, [`SPEC.md`](SPEC.md). That prompt is
in the repo. Hand it to ponystack and it rebuilds itself - a compiler that
compiles itself. When the rebuild reproduces this one (installs, hooks valid,
tests green, bench runs), the framework is self-hosting. If a framework for
disciplined code can't build itself with discipline, why trust it with yours?

First run: a fresh agent with no memory of this repo rebuilt ponystack from
[`SPEC.md`](SPEC.md) alone, landing within 2.4% of this repo's code size with
tests green and the same architecture - details in [`BOOTSTRAP.md`](BOOTSTRAP.md).

## Install (Claude Code)

```
/plugin marketplace add AyanbekDos/ponystack
/plugin install ponystack@ponystack
```

Two tiny Node.js lifecycle hooks run on session start and on each prompt, so
`node` must be on your PATH. If it isn't, the skills still work; the always-on
router just stays quiet instead of erroring.

Nothing is overwritten. ponystack is a separate plugin that lives beside gstack,
ponytail, or a bare setup.

## Commands

| Command | What it does |
|---------|--------------|
| `/ponystack [understand\|implement\|review]` | Show the membrane, or force a phase. |
| `/ponystack-contract` | The contract gate: cut a wide pass to the minimum that works. |
| `/ponystack-ratio` | Score a session's thinking-to-diff ratio. |

## Credit

ponystack is homage and upgrade, not criticism of people. It exists because both
of these are excellent and incomplete on their own:

- **gstack** - Garry Tan / Y Combinator. The "boil the lake" process philosophy
  and the workflow vocabulary the router reads.
- **ponytail** - Dietrich Gebert (MIT). The lazy-senior ladder and the plugin +
  benchmark shape this repo mirrors.

All names and trademarks belong to their owners.

## License

[MIT](LICENSE). The shortest license that works.
