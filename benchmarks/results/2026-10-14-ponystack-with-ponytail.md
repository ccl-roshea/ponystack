# ponystack alongside the real ponytail plugin: A/B (harness ready, live cells NOT RUN)

Date: 2026-10-14. Branch `ponystack-ab-eval`.

**Status: the model-dependent half of this test has not been run.** No
`ANTHROPIC_API_KEY` was available (checked env, `~/.env.master`, `.env`). Nothing
below is a behavioural result. What *is* measured: arm construction, injected
bytes, router wiring, and the metric's ability to detect a known conflict. The live
cells are one command away (see "Run it").

## Question

ponytail's SessionStart hook puts the full lazy-senior ladder in context for every
session, and its SubagentStart hook does the same for every subagent. It has no
notion of phase. ponystack can only *add* "the lazy senior is SILENT this turn" on
top. Does the router actually overcome the ladder when the two are installed
together? The existing README benchmark never tests this: its ponystack arm injects
`skills/ponystack/SKILL.md` as a system prompt, with no ponytail present and the
router bypassed.

## Method

Single-shot Claude Messages API calls, same model and prompts across arms.

| arm | what is injected | source |
|---|---|---|
| A | ponytail ruleset | verbatim capture of ponytail v5.2.0 SessionStart output, `benchmarks/ab/ponytail-v5.2.0-session.txt` |
| B | ponytail ruleset + ponystack session doctrine + per-prompt phase rule | A + `membraneDoctrine()` + `PHASE_RULE[detectPhase(prompt)]` from `hooks/ponystack-hook.js` |
| C | ponystack doctrine + phase rule | as above, no ponytail |
| D | nothing | baseline |

Hook context is delivered as `<system-reminder>` blocks in the user turn (what
Claude Code does), SessionStart before the prompt, per-prompt rule right before it.
The router is exercised for real: the phase is `detectPhase(prompt)`. A test
(`tests/ab.test.js`) asserts the arm text equals what the real hook prints.

ponytail's capture was taken by running its real `ponytail-activate.js` (mode
`full`) in an isolated `CLAUDE_CONFIG_DIR`, after the one-time statusline nudge had
been consumed. It is vendored as data so the harness never executes third-party code.

Two task families:

- **UNDERSTAND** (3 prompts, `run-ab.js` `UNDERSTAND`): `/plan-eng-review` x2 and
  `/plan-ceo-review` on plans with obviously cuttable scope. Metric
  (`ab-metrics.js`): count of six regex families (YAGNI, shortest-diff, cut-scope,
  stdlib-first, deletion, no-abstraction) a reply hits; **applied** = at least 2
  distinct families. All three prompts route to `understand` (verified).
- **IMPLEMENT** (the existing 7 tasks, `tasks.js`): LOC via `loc.js`, correctness
  via `correctness.js`, unchanged from the README benchmark. All 7 route to
  `implement` (verified).

Samples: `--repeat 3` default (120 calls: 4 arms x 10 prompts x 3), `--repeat 5` =
200 calls. Input tokens per arm are logged from the API response, which also
cross-checks the byte counts below.

### Pre-registered decision rules (fixed in `ab-metrics.js` `verdict()` before any data)

- Understand position = (mean_B - mean_C) / (mean_A - mean_C) on mean families hit.
  `<= 1/3` -> **like C** (ladder silenced); `>= 2/3` -> **like A** (router loses);
  between -> **partial**. If mean_A - mean_C < 0.5 the ladder does not bite on these
  prompts at all and the result is **inconclusive**, not a pass.
- Implement "B not worse than A": LOC per 7-task pass within +10% AND correctness
  not more than 5 points lower.
- **Keep ponystack** iff understand is like-C AND implement not worse.

These thresholds are my choice, not the operator's. Change them in `verdict()` if
you disagree, but change them before running.

## Measured now: injected context per arm

Raw hook-output bytes (no `<system-reminder>` wrappers), from `node benchmarks/run-ab.js --dry`.

| arm | SessionStart | per prompt: understand / implement / review / neutral | subagent start (inherits) |
|---|--:|--:|--:|
| A | 2,861 (+ map, see below) | 0 | 2,861 |
| B | 3,878 | 255 / 558 / 344 / 94 | 2,861 + same per-prompt rule |
| C | 1,017 | 255 / 558 / 344 / 94 | per-prompt rule only |
| D | 0 | 0 | 0 |

- The brief estimated ~3.5 KB for ponytail's ruleset plus ~2 KB map. Measured: the
  ruleset is 2,861 B. The map is a separate, codebase-dependent block capped at
  `PONYTAIL_MAP_CHARS` (default 2,000): 1 B in this repo, 156 B in `~/rs/config`
  (I ran the map script there read-only to size it; nothing was modified). It is
  excluded from arm A/B because the single-shot tasks have no codebase.
- ponystack adds **+1,017 B once and 94-558 B per prompt** on top of ponytail, a 36%
  increase to session context. It does not remove any ponytail bytes.
- Subagents: ponytail's hook injects the 2,861 B ruleset unconditionally;
  ponystack additionally injects the parent turn's phase rule (255 B in an
  understand turn). So a subagent in an understand turn receives both texts.

## Measured now: does the conflict exist on paper?

Yes. In arm B the model receives, in the same message: ponytail's "Active for the
whole session ... Take the first option that fully works: 1. Does it need to exist?
Skip features ... nobody asked for" and ponystack's "The lazy senior is SILENT this
turn ... boil all of it." Nothing in either text says which wins. ponystack's text
does not mention ponytail's ruleset or tell the model to disregard it. This is
exactly the "present is not silent" concern; whether the model resolves it toward
the later, turn-local instruction is an empirical question this harness answers and
I have not answered.

## Measured now: the metric detects a known conflict (mutation check)

Fixture: a synthetic ladder-heavy plan-review reply ("YAGNI applies... cut it from
v1... standard library... shortest working diff... `net: -1400 lines possible.`").
It scores 6/6 families, applied. A synthetic thorough no-cuts reply scores below
threshold. Then the detector was deliberately broken in scratch copies and
`node --test tests/ab.test.js` watched failing:

| mutant | expected | observed |
|---|---|---|
| M1 every regex family blind (`/(?!)/`) | ladder-heavy fixture no longer detected | FAIL: "ladder-heavy understand reply scores as ladder applied" |
| M2 threshold 7 (unreachable) | same | same test FAILS |
| M3 every family matches everything | no-cuts and single-"defer" fixtures flagged | FAIL: "thorough reply ... NOT ladder applied" and "single ordinary defer is below the threshold" |
| M4 arm B silently drops ponytail | experiment invalid | FAIL: "each arm injects exactly its parts" |

Unmutated: all 28 repo tests pass (`node --test`).

Caveat on what this proves: the fixtures are synthetic, written by me. It shows the
metric *can* see a ladder-applied reply and *can* reject a lake-boiled one. It does
not show that real model replies are classified correctly; raw replies are saved to
`*.raw.json` so someone can audit a sample by hand.

## Run it

```bash
export ANTHROPIC_API_KEY=...
node benchmarks/run-ab.js --repeat 3                     # default claude-sonnet-5-5
node benchmarks/run-ab.js --model claude-opus-5-5 --repeat 5
```

Prints the two tables and the verdict JSON; writes
`benchmarks/results/<date>-ponystack-with-ponytail.raw.json` (all replies). Paste
the tables into the "Live results" section below and commit with the raw file.

## Live results

_Not run._ Table slots, to be filled from `run-ab.js` output:

| arm | n | applied | mean families | LOC / 7-task pass | correct | mean input tok |
|---|--:|--:|--:|--:|--:|--:|
| A | | | | | | |
| B | | | | | | |
| C | | | | | | |
| D | | | | | | |

## How to read the result, and which option follows

Answered from the code, not from data (these are facts about the two plugins):

- **Does ponystack carry the ladder itself?** Yes, in condensed form. Its session
  doctrine (1,017 B) only *references* "the ladder, YAGNI", but the implement and
  review phase rules (558 B / 344 B) inline all six rungs, the "no unrequested
  abstractions / shortest diff" lines, the `ponystack:` shortcut comment, and the
  never-cut floor. So with ponytail removed (arm C), implement and review still get
  the ladder. What ponytail has that ponystack lacks: the end-of-reply "what I
  skipped / risk" line, the bug-fix "grep every caller" rule, the "equal size, pick
  the edge-case-correct one" rule, the codebase map, and lite/full/ultra levels.
  Whether those matter for outcomes is not measured here.
- **Option (iii), `PONYTAIL_DEFAULT_MODE=off` or `defaultMode: "off"`:** ponytail's
  SessionStart then calls `clearMode()` and emits nothing, and its SubagentStart
  hook exits when the flag is absent. Context = arm C, with the plugin still
  installed. Zero code. Caveat: a user typing `/ponytail` flips it back on.
  `PONYTAIL_SUBAGENT_MATCHER` does **not** help the main thread: it only filters
  subagent injection by `agent_type`, so on its own it leaves the parent session's
  ruleset in place.
- **Option (ii), uninstall ponytail:** also arm C, also zero code, no way to
  re-enable by accident, loses `/ponytail` levels and the map.
- **Option (i), deprecate ponystack:** removes the router and the three seams.
  The README's 39% -> 97% routing result and the contract/ratio commands go with it.

| live outcome | verdict | least code |
|---|---|---|
| B like C (understand) and implement not worse | keep both as deployed | none |
| B like A, and C implement not worse than A | router fails alongside ponytail, but ponystack alone is fine | (iii) config only, or (ii) uninstall: both zero code; (iii) if you want `/ponytail` available on demand |
| B like A, and C implement worse than A | ponystack's condensed ladder is a real loss vs ponytail's | (i) deprecate, or keep ponytail alone |
| partial | ladder partly overridden | rerun at `--repeat 5` on a second model before deciding |
| inconclusive (A ~ C) | prompts too easy to cut nothing | harder understand prompts, then rerun |

## Limitations

- **No live data.** Everything behavioural above is conditional.
- **Single-shot, not Claude Code.** No Claude Code system prompt, no tools, no
  multi-turn history, no real hook ordering or wrapper text. Hook context placement
  is an approximation. A faithful version drives `claude -p` with both plugins
  installed (upgrade path; not built because it needs plugin install state and a
  non-API auth path).
- **No gstack skill body.** `/plan-eng-review` here is the slash string plus a plan,
  not gstack's real skill text, which itself argues for thoroughness. That favours
  ponystack in production and disfavours it here, so a "B like A" result is the
  worst case for ponystack. gstack is also only installed on work-class machines.
- **Subagents untested.** Only SubagentStart byte cost is reported. The claim that a
  Task-spawned review inherits the ladder uncountered is not exercised.
- **Metric is regex.** It can over-count a rebuttal ("YAGNI does not apply here")
  and miss paraphrase. The arm D floor and the saved raw replies are the guard.
- **Small n.** 3 understand prompts x 3-5 samples = 9-15 replies per arm. Treat the
  position ratio as coarse; the thresholds in `verdict()` are a decision aid, not a
  significance test. One model, one temperature (1).
- **Implement family inherits the README benchmark's weaknesses:** React, FastAPI and
  cache correctness are structural checks, not executed.
- **Understand prompts are mine.** They contain cuttable scope on purpose, which
  gives the ladder maximal opportunity to bite. That is the point (a conflict shows
  up there if anywhere), but it overstates how often real reviews hit it.
- **Only the Anthropic Messages API path** is implemented in `run-ab.js`; the
  Perplexity / OpenAI-compatible paths of `run-local.js` are not wired in.
