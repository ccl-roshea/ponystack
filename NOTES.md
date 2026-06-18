# PONISTACK - Phase 0 research notes

> Boil the lake to understand it. Don't pour it into your code.
> Think expensive, write cheap.

This file is the marriage contract: what each parent is, where they join,
where they fight. Written before any plugin code.

---

## 1. The boil-the-lake quote (verbatim, with source)

From gstack's `ETHOS.md` (`~/.claude/skills/gstack/ETHOS.md`, §1 "Boil the Lake"),
also published at https://garryslist.org/posts/boil-the-ocean :

> **AI-assisted coding makes the marginal cost of completeness near-zero. When
> the complete implementation costs minutes more than the shortcut - do the
> complete thing. Every time.**
>
> **Completeness is cheap.** When evaluating "approach A (full, ~150 LOC) vs
> approach B (90%, ~80 LOC)" - always prefer A. The 70-line delta costs
> seconds with AI coding. "Ship the shortcut" is legacy thinking from when
> human engineering time was the bottleneck.
>
> Anti-patterns:
> - "Choose B - it covers 90% with less code." (If A is 70 lines more, choose A.)

The Golden Age preamble (same file) frames it: *"10,000+ usable lines of code
per day ... The last 10% of completeness that teams used to skip? It costs
seconds now."*

**The one-line bug.** gstack is right that *understanding* is cheap and you
should max it out. It then applies the same rule to *output* ("prefer the
+70 LOC version, every time"). That conflates two different things:

- Cost of **thinking** → near-zero → spend freely. (gstack correct)
- Cost of **code** → never zero. Every line is surface area: a bug host, a
  read tax, a maintenance liability, a thing to delete later. (gstack blind here)

gstack literally instructs: *"prefer A (150 LOC) over B (80 LOC)"* purely
because the delta is "cheap to write". That is the protective leak ponistack
patches. We keep gstack's expensive brain; we put a membrane before its hands.

---

## 2. What each parent uniquely is (mechanics, not vibes)

### gstack (Garry Tan / YC) - PROCESS, breadth, the generator
- Ships as a set of **workflow slash-commands / skills** in `~/.claude/skills/gstack/`:
  `/office-hours`, `/spec`, `/plan-ceo-review`, `/plan-eng-review`,
  `/plan-design-review`, `/design-*`, `/investigate`, `/review`, `/qa`,
  `/ship`, `/land-and-deploy`, `/canary`, `/autoplan`, `/retro`, ...
- `ETHOS.md` (4 principles: Golden Age, **Boil the Lake**, Search Before
  Building, Build for Yourself) is **injected into every workflow skill's
  preamble automatically** (`preamble-tier: 1` frontmatter + a per-skill
  `## Completeness Principle - Boil the Lake` section).
- A `LAKE_INTRO` flag (`~/.gstack/.completeness-intro-seen`) gates a one-time
  pitch of the boil-the-lake essay. Boil-the-lake is the *house ideology*.
- Strength: decomposition, planning, multi-persona review, QA, shipping
  discipline. It makes the agent **understand widely and act thoroughly**.
- Side effect (by its own doctrine): bloats output. "+70 LOC is free" is
  policy, not accident.

### ponytail (Dietrich Gebert, MIT) - CONSTRAINT, depth-of-cut, the critic
- Ships as a **Claude Code plugin** (`.claude-plugin/{plugin.json,marketplace.json}`)
  + portability files for ~13 agents (AGENTS.md, .cursor, .windsurf, .codex-plugin…).
- **Always-on via two hooks** (`hooks/hooks.json`):
  - `SessionStart` → `ponytail-activate.js`: writes a `.ponytail-active` flag
    and **emits the ladder ruleset as hidden session context**, filtered to
    the active intensity level.
  - `UserPromptSubmit` → `ponytail-mode-tracker.js`: parses `/ponytail
    lite|full|ultra|off` and `stop ponytail` / `normal mode`, persists mode.
- Mode resolution (`ponytail-config.js`): `PONYTAIL_DEFAULT_MODE` env →
  `~/.config/ponytail/config.json` → default `full`. Levels: `off / lite /
  full / ultra`, plus `review` (independent skill mode).
- The ruleset = **the ladder** (SKILL.md): YAGNI → stdlib → native feature →
  installed dep → one line → minimum code. Stop at first rung that holds.
- Skills: `/ponytail` (set level), `/ponytail-review` (diff delete-list,
  ends with `net: -N lines possible`), `/ponytail-audit` (whole repo),
  `/ponytail-debt` (harvest `ponytail:` shortcut comments into a ledger).
- **Benchmark harness** (`benchmarks/`, promptfoo): 3 arms (baseline / caveman
  / ponytail) × 3 models × 5 tasks, **10 runs, median**. Arms are JS files
  that inject a system prompt (`arms/ponytail.js` reads the SKILL.md verbatim).
  `loc.js` = deterministic LOC counter (measurement, always passes).
  `correctness.js` = **gate**: extracts fenced code, spawns python/node, runs
  real assertions (email/debounce/csv execute; react/fastapi structural).
  Result: ponytail writes 80-94% less code, 47-77% cheaper, 3-6x faster, with
  correctness held.
- Strength: kills bloat with a reflex. Weakness alone: it never plans,
  decomposes, or reviews for correctness - it only ever cuts. Shallow without
  a process feeding it breadth.

---

## 3. The three seams (mapped to real mechanics of both repos)

These are NOT new philosophy. Each seam is a small piece of glue wiring
gstack's existing command vocabulary to ponytail's existing hook+level system.

### SEAM 1 - PHASE-ROUTER (core, always-on)
A `UserPromptSubmit` hook (same slot ponytail uses for `mode-tracker`) reads
the prompt and routes the lazy senior's intensity by **work phase**, detected
primarily from **which gstack command is running** (free signal - gstack
already names the phase), plus NL fallbacks:

| Phase | Detected from | Lazy senior |
|-------|---------------|-------------|
| understand / plan / research / design | `/office-hours`,`/spec`,`/plan-*`,`/design-*`,`/investigate`,`/autoplan`; "plan", "research", "explore", "how should" | **SILENT** (boil the lake - gstack rules) |
| implement | `/ship`, `/land-and-deploy`; "implement","add","build","write","fix","refactor" | **MAX** (ladder enforced, YAGNI) |
| review | `/review`,`/qa`,`/code-review`,`/design-review`,`/ponistack-review`; "review","what can we delete","is this over-engineered" | **BOTH** (correctness bugs + delete-list) |

Mechanically: the hook resolves a phase, maps it to a ponytail runtime level
(silent=off-for-this-turn, implement=full/ultra, review=review), and emits the
matching hidden context. This *automatically de-conflicts the two
philosophies*: each parent governs only the phase where it is correct. No user
toggling. This is what ponytail's flat "always full" can't do and gstack's
"always boil" won't do.

### SEAM 2 - EXPAND → CONTRACT conveyor (gate)
Any thorough/expand pass ends with a **mandatory lazy-senior gate** before
work is considered done. gstack generates breadth (the expand); ponytail's
`review`-mode delete-list runs as the closing contract step in the same
pipeline. Producer and critic in one conveyor, not two separate sessions the
user has to remember to chain. Reuses `ponytail-review`'s exact output
contract (`net: -N lines possible`). Surfaces as a command (e.g.
`/ponistack-ship` or a `/contract` gate) and as an instruction the
phase-router injects at end-of-implementation.

### SEAM 3 - THINKING-TO-DIFF RATIO (metric + content)
Measure thinking tokens (or reasoning/turns) spent ÷ net code LOC emitted.
High ratio = champion ("9,000 tokens of thought → 11 lines"). Two uses:
1. **Feature**: a status/report line so the user sees the membrane working.
2. **Proof/content**: screenshot-ready number for the viral post. Reuses
   ponytail's `loc.js` counter for the denominator; numerator from session
   token telemetry. Ships in the benchmark as a 4th reported column.

---

## 4. Where they genuinely conflict (and the resolution)

| Conflict | gstack says | ponytail says | ponistack resolution |
|----------|-------------|---------------|----------------------|
| Output volume | "+70 LOC is free, prefer A" | "delete it, one line" | Split by phase (Seam 1): think wide, ship narrow. The +70 LOC of *understanding* is free; the +70 LOC of *code* is not. |
| Tests | "boil the lake: 100% coverage, tests are the cheapest lake" | "ONE runnable check; YAGNI applies to tests too" | Phase-aware: planning a test strategy = boil; *writing* tests = ladder. Both agree security/data-loss/trust-boundary checks are never cut. |
| Abstractions | completeness, full edge cases | "no interface with one impl, no factory for one product" | Implementation phase → ponytail wins. Design phase → gstack may *propose* the abstraction; the contract gate (Seam 2) deletes any that ship with one caller. |
| Tone/output | rich rationale, multi-persona | "code first, ≤3 lines, explanation longer than code = delete it" | Phase-router: verbose in plan/review reports (asked-for prose), terse in implement. |
| Always-on conflict | ETHOS injected every skill preamble | ladder injected every turn | They'd both fire and contradict. Phase-router is the arbiter that mutes one side per turn - the whole reason Seam 1 is core, not optional. |

**Agreement zone (do not touch):** both forbid cutting input validation at
trust boundaries, error handling that prevents data loss, security, and
accessibility. ponistack inherits this verbatim - it's the safety floor.

---

## 5. Repo structure plan + build order

Mirror ponytail's proven layout (separate plugin, overwrites nothing):

```
ponistack/
  .claude-plugin/
    plugin.json            # name, version, author, dual attribution
    marketplace.json       # one plugin entry
  hooks/
    hooks.json             # SessionStart + UserPromptSubmit wiring
    ponistack-activate.js  # SessionStart: emit membrane context + flag
    ponistack-router.js    # UserPromptSubmit: PHASE-ROUTER (Seam 1)
    ponistack-config.js    # phase/level resolution (fork ponytail-config)
    ponistack-instructions.js # build phase-appropriate ruleset
  skills/
    ponistack/SKILL.md         # the membrane doctrine + ladder, phase-aware
    ponistack-contract/SKILL.md # Seam 2: expand→contract gate / delete-list
    ponistack-review/SKILL.md   # review = correctness + delete-list
    ponistack-ratio/SKILL.md    # Seam 3: thinking-to-diff report
  commands/                  # toml command shims
  benchmarks/                # fork ponytail harness; add 4th arm = ponistack
    promptfooconfig.yaml     # arms: baseline / gstack / ponistack
    arms/{baseline,gstack,ponistack}.js
    loc.js  correctness.js  ratio.js
  README.md  README.ru.md(optional)  LICENSE(MIT)  AGENTS.md  NOTES.md
```

**Build order (each step shippable, each disciplined by our own ladder):**
1. Plugin skeleton: plugin.json + marketplace.json + LICENSE + dual attribution.
2. Seam 1 hooks: config → instructions → router → activate. The core.
3. `skills/ponistack/SKILL.md`: the membrane doctrine (think expensive / write
   cheap) + phase-aware ladder.
4. Seam 2: contract gate skill + command.
5. Benchmark: fork harness, add `gstack` arm (ETHOS as system prompt) and
   `ponistack` arm; keep `correctness.js` as the gate so "less code" can't
   become "broken code".
6. Seam 3: ratio metric wired into benchmark + a report line.
7. README (the viral narrative) last, once the numbers exist to quote.

**Success test:** a stranger installs ponistack, reads reproducible numbers vs
gstack in the README, runs the bench themselves, gets the same numbers.
