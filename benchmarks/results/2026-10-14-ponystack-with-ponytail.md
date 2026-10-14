# ponystack alongside the real ponytail plugin: A/B

Date: 2026-10-14. Branch `ponystack-ab-eval`. Model: `claude-sonnet-5-5`, temperature 1.

**Status: run, with one pre-registered question left inconclusive.** The
implement-phase result is clean. The understand-phase pre-registered metric
could not separate the arms (see "Live results"), so the formal verdict is
*inconclusive*, not pass or fail. Run 1 was discarded as primary data for two
documented reasons; run 2 is the primary dataset.

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
  **Post-hoc change:** the first live run showed the original six families had
  near-zero recall on real replies (an arm A reply opened "about 40% too big ...
  Cut the schema registry" and scored 0). I added an `overBuilt` family and
  plain-words cut verbs inside `cutScope`, re-ran the mutation check, and
  collected fresh samples (run 2) so the revised metric is not scored only on
  replies it was tuned on. Re-scoring run 1 with it is NOT evidence.
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

After the post-hoc revision the check was repeated (M1 blind, M3 match-all) against
the new family set: both still fail the expected tests, and the new real-reply-style
fixture ("plain-words scope cut is detected") fails under M1. The revision itself was
caught by an existing test: merging in a separate `verbCut` family made "Defer the
dashboard for now" hit two families, and "single ordinary defer is below the
threshold" failed until the verbs were folded into `cutScope`.

Unmutated: all 29 repo tests pass (`node --test`).

Caveat on what this proves: the fixtures are synthetic, written by me. It shows the
metric *can* see a ladder-applied reply and *can* reject a lake-boiled one. It does
not show that real model replies are classified correctly; raw replies are saved to
`*.raw.json` so someone can audit a sample by hand.

## Run it

```bash
# key in .env (gitignored), ANTHROPIC_API_KEY=...
node --env-file=.env benchmarks/run-ab.js --repeat 3
node --env-file=.env benchmarks/run-ab.js --model claude-opus-5-5 --repeat 5
```

Prints the two tables and the verdict JSON; writes the raw replies to
`benchmarks/results/<date>-ponystack-with-ponytail.raw.json`. Network errors and
429/5xx are retried (4 tries).

## Live results

### Run 2 (primary): 120 calls, 3 samples per cell, no failed calls

UNDERSTAND (revised metric; `applied` = at least 2 families):

| arm | n | applied | mean families | mean reply chars (exploratory) | mean input tok |
|---|--:|--:|--:|--:|--:|
| A ponytail | 9 | 0 | 0.44 | 4,250 | 1,092 |
| B both | 9 | 0 | 0.67 | 5,712 | 1,606 |
| C ponystack | 9 | 0 | 0.56 | 6,859 | 654 |
| D none | 9 | 0 | 0.56 | 6,215 | 140 |

IMPLEMENT (7 tasks, 3 samples each; LOC = sum over tasks of per-task mean):

| arm | n | LOC per 7-task pass | correct | mean input tok |
|---|--:|--:|--:|--:|
| A ponytail | 21 | 124 | 81% (17/21) | 993 |
| B both | 21 | 122 | 81% (17/21) | 1,621 |
| C ponystack | 21 | 151 | 76% (16/21) | 669 |
| D none | 21 | 417 | 86% (18/21) | 41 |

Pre-registered verdict JSON: `understand: "inconclusive"`, `implementNotWorse: true`,
`keep: false`. Input-token means track the byte table (B - A is about 630 tokens for
about 1,017 B + a 255-558 B rule), which cross-checks the arm wiring.

Per-task LOC means (A / B / C / D): email 9.3/9.7/8.3/65, debounce 8.3/8.7/18.3/63,
csv 4.0/4.0/4.7/26, countdown 20.3/18.3/23.7/75, ratelimit 20.7/18.3/24/45,
lrucache 35.7/36.3/43/93, userendpoint 25.7/26.7/29/50. B is within 10% of A on
7/7 tasks; C exceeds A on 6/7. The same debounce and countdown tasks fail in A and
B (the failing set is identical in both).

### Run 1 (kept, not primary): `*.run1.raw.json`, `*.run1.tables.md`

Discarded as primary for two reasons. (1) The ladder metric had near-zero recall
(above). (2) Arm B lost 8 of 21 implement samples to `fetch failed` with no retry,
and the runner divided LOC by the nominal repeat, so its B figure (84) was
understated and meaningless. Both are fixed in the harness. Its length ordering
matched run 2 (A 4,182 / B 6,043 / C 6,487 / D 6,761 chars), which is why I treat
that pattern as replicated rather than as one lucky draw.

## What the data supports

1. **Implement phase: the deployed stack (B) is not worse than ponytail alone (A).**
   122 vs 124 LOC, identical correctness, B within 10% of A on every task. The
   router adds nothing harmful where the ladder is supposed to run. Both beat no
   plugin (D) by about 3.4x on LOC. This satisfies the "not worse" half of the
   decision rule.
2. **Understand phase, pre-registered metric: inconclusive.** Arm A (ladder only)
   did not cut more scope than the baseline D (0.44 vs 0.56 families), so there was
   no ladder effect for the router to silence. On this metric the conflict is
   neither shown nor excluded. Nobody should read "B is like C" into it.
3. **Exploratory, post-hoc, not pre-registered: reply length.** ponytail shortens
   plan reviews about 32% vs baseline (4,250 vs 6,215 chars in run 2, 4,182 vs
   6,761 in run 1), consistently across all 3 prompts. With ponystack added (B),
   length recovers by roughly 55-80% of that gap (run 2: 56%, run 1: 81%; B is 8-11%
   below D). C is about equal to D. Read cautiously: length is a proxy for
   "compressed by the ladder", it conflates style with substance, and I chose it
   after seeing run 1. It is consistent with the router partly overriding the
   ladder in understand turns, and with no more than that.
4. **Dropping ponytail is not free.** C (ponystack alone) writes 151 LOC vs A's 124
   (+22%, worse on 6 of 7 tasks) with one more failing sample (76% vs 81%). That
   is the measured cost of options (ii) and (iii): ponystack's condensed ladder is
   weaker than ponytail's full one on implement. Correctness gaps here are one
   run (n=21), well within noise; the LOC gap is more consistent.

## Recommendation against the decision criteria

**Do not deprecate. Keep ponystack alongside ponytail as deployed.** Be clear about
what carries this: the pre-registered rule did *not* return keep. It returned
inconclusive, because the understand-phase metric could not separate the arms. The
recommendation rests on (1) a measured implement result where B equals A, (2) the
measured cost of the alternatives that drop ponytail (+22% LOC), (3) an exploratory,
replicated length signal consistent with the router offsetting part of the ladder,
and (4) no evidence of harm anywhere. That is a judgement beyond the rule, and the
operator may weigh it differently.

Context cost of keeping both: +1,017 B per session and 94-558 B per prompt over
ponytail alone (see the byte table), about 630 extra input tokens per call in this
harness.

Facts from the code, unchanged:

- ponystack carries the ladder itself in condensed form: its implement and review
  phase rules inline all six rungs. What ponytail has that ponystack lacks: the
  end-of-reply "what I skipped / risk" line, the bug-fix "grep every caller" rule,
  the edge-case tie-break, the codebase map, and lite/full/ultra levels. Run 2
  suggests that gap shows up as about 20% more LOC.
- Option (iii), `PONYTAIL_DEFAULT_MODE=off`, gives arm C's context with zero code;
  a user typing `/ponytail` flips it back on. `PONYTAIL_SUBAGENT_MATCHER` only
  filters subagent injection and does not touch the main thread.
- Option (ii), uninstalling ponytail, is also arm C with zero code.

| situation | what to do |
|---|---|
| you accept run 2 as is | keep both, change nothing |
| you want the understand-phase conflict settled | harder understand prompts or an LLM judge validated against the fixtures, then rerun; the harness supports both |
| ponystack must stand alone (e.g. ponytail removed upstream) | C is viable: it still cut LOC about 64% vs D, at about 22% more than A |

## Limitations

- **One model, one run pair.** Sonnet 5.5 only; two independent runs of 3 samples.
  The implement result and the length ordering replicated across run 1 and run 2;
  nothing else was replicated. Opus and Haiku are untested.
- **Post-hoc metric change and a post-hoc exploratory metric.** Both disclosed above.
  The length finding in particular was not pre-registered.
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
- **Small n.** 3 understand prompts x 3 samples = 9 replies per arm; 21 per implement cell. Treat the
  position ratio as coarse; the thresholds in `verdict()` are a decision aid, not a
  significance test. One model, one temperature (1).
- **Implement family inherits the README benchmark's weaknesses:** React, FastAPI and
  cache correctness are structural checks, not executed.
- **Understand prompts are mine.** They contain cuttable scope on purpose, which
  gives the ladder maximal opportunity to bite. That is the point (a conflict shows
  up there if anywhere), but it overstates how often real reviews hit it.
- **Only the Anthropic Messages API path** is implemented in `run-ab.js`; the
  Perplexity / OpenAI-compatible paths of `run-local.js` are not wired in.
