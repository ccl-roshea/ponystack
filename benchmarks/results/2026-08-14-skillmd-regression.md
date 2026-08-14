# SKILL.md regression slice — 2026-08-14

**Question.** `feat/phase-router` edited `skills/ponystack/SKILL.md` (+6/−2: a
`neutral` row in the phase table and a rewritten routing paragraph). That file
*is* the ponystack arm's system prompt in the doctrine benchmark. Did the edit
make the doctrine worse at producing short, correct code?

**Answer: no detectable change.**

## Setup

Two arms, identical except for the six-line prose delta:

| Arm | System prompt |
|-----|---------------|
| `SKILL.md @ master` | `git show master:skills/ponystack/SKILL.md` |
| `SKILL.md @ branch` | working tree |

Same model, same seven tasks (`tasks.js`), same metrics (`loc.js`,
`correctness.js`), `--repeat 3 --no-cache`. 42 completions per run.

## Result — gpt-4.1

| arm | n | unfenced | median LOC | mean LOC | correct |
|-----|---|----------|-----------|----------|---------|
| master | 21 | 0 | 14 | 15.7 | 86% |
| branch | 21 | 0 | 15 | 15.3 | 86% |

Per-task median LOC (branch / master): countdown 15/13, csv 7/7, debounce 8/11,
email 3/4, lrucache 34/31, ratelimit 19/22, userendpoint 22/19.

Correctness is identical (18/21 both arms). The median moves +1 LOC and the mean
moves −0.4 LOC — opposite directions. A sign flip between median and mean at
this sample size is noise, not effect.

## What this does and does not show

- It does **not** prove the absence of a regression. It fails to detect one, at
  21 samples per arm. Small effects would not survive this test.
- It is **not** a reproduction of the headline numbers in `../README.md`. Those
  use Anthropic models at `--repeat 10` across three arms. This is a two-arm
  A/B on one model, run to answer one narrow question cheaply.
- It says nothing about the phase router. The doctrine benchmark bypasses the
  router by construction (see `arms/ponystack.js`). For the router, see
  `npm run bench:routing`.

## Discarded run — gpt-5-mini

A first attempt on `gpt-5-mini` is recorded here because the failure is worth
knowing, not because the numbers are usable:

- 8 of 21 responses **per arm** emitted no fenced code block at all, so 38% of
  samples were unscoreable by `loc.js`, which only counts lines inside fences.
- Correctness was 48% on both arms.
- 43,200 of 61,201 completion tokens went to reasoning against
  `max_tokens: 8192`.

`loc.js` assumes fenced output. A reasoning model that answers with bare code
scores 0 and looks like a catastrophic win. **Use a non-reasoning model with
this harness, or raise `max_tokens` well above the reasoning budget.**

## Reproduce

The Anthropic path needs an API key (`sk-ant-api03-…`) from the Console. A
Claude Code subscription token (`sk-ant-oat01-…`) is a different credential and
returns 401 against the Messages API, regardless of subscription credits.
