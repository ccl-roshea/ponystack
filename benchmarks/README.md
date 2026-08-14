# Benchmark

There are two, and they measure different halves of ponystack. Do not quote one
for the other's claim.

| Benchmark | Measures | Cost |
|-----------|----------|------|
| **doctrine** (this file, `promptfooconfig.yaml` / `run-local.js`) | Does the implement-phase doctrine produce less code without breaking correctness? | API calls |
| **routing** (`routing.js`) | Given a prompt, does the router pick the phase a developer would? Does escalation fire on code and stay quiet on prose? | free, milliseconds |

The doctrine benchmark **bypasses the router entirely** — it injects
`skills/ponystack/SKILL.md` as a system prompt for single-shot completions, so
there is no turn, no hook, and no phase to route. That is deliberate and stated
in `arms/ponystack.js`. It means a change to the router is invisible here, and a
change to `SKILL.md` shows up here whether or not you intended it to.

## Routing benchmark

```bash
npm run bench:routing         # this branch vs git master, before/after
node benchmarks/routing.js    # score the working tree only
node benchmarks/routing.js path/to/some-hook.js
```

Ground truth is `routing-corpus.js`, in four sections plus an escalation corpus.
**Quote the NON-CIRCULAR number.** The `commands` section encodes the same
intended mapping as the hook's own table, so any hook that has that table scores
~100% on it by construction; its honest use is scoring a hook that does not.

The corpus deliberately contains cases the current implementation FAILS, marked
`expectMiss`. Do not delete them to make the score prettier — a benchmark you
always score 100% on has stopped measuring anything. Exit code is non-zero only
on an *unexpected* miss, so it is usable in CI.

Result for the four-phase router (`node benchmarks/routing.js --compare`):

```
NON-CIRCULAR:  39% -> 97%  (+57 points, 35 more of 61 correct)
escalation:    absent -> 14/14
```

The before number is not a strawman: the old router got ordinary conversation
("tell me a joke", "I restarted claude") wrong because its default was
`implement`, and `/ponystack understand` emitted the *implement* rule.

## Doctrine benchmark

Three arms, same model, same tasks: a no-skill **baseline**, **gstack** (its own
`ETHOS.md` as the system prompt), and **ponystack**. We measure code size
(deterministic) and correctness (a gate). The claim is simple: ponystack writes
less code than gstack on gstack's home turf, without breaking correctness.

## Arms

| Arm | System prompt |
|-----|---------------|
| `baseline` | none - just the task |
| `gstack` | `gstack-ETHOS.md`, vendored verbatim (MIT, Garry Tan / YC) |
| `ponystack` | `skills/ponystack/SKILL.md` - the implement-phase doctrine |

The gstack arm uses gstack's real builder ethos so the head-to-head is honest,
not a strawman. On single-shot completions there are no workflow commands to run,
so this measures the *doctrine's* effect on output - which is exactly where the
"boil the lake" line lives.

## Tasks

Five everyday tasks (email validator, JS debounce, CSV sum, React countdown,
FastAPI rate-limit) plus two production-grade tasks where a process framework
unfolds into a class hierarchy: a Python LRU+TTL cache decorator and a validated
FastAPI POST endpoint. Single source of truth: `tasks.js`.

## Metrics

| File | Metric | Behavior |
|------|--------|----------|
| `loc.js` | `code_loc` | Non-blank, non-comment lines in fenced code blocks. Measurement, always passes. |
| `correctness.js` | `correct` | Gate. 1 = passes, 0 = fails. |

`correctness.js` **executes** email/debounce/CSV (spawns python/node with the
generated code plus assertions). React, FastAPI, and the cache are **structural**
checks (a bundler/server/clock would be needed to run them) - they verify the
required pieces are present, not full runtime behavior. A hand-rolled 120-line
cache and a one-line `lru_cache` both pass the gate; the LOC metric is what
separates them. That is the point: same correctness, far less code.

## Reproduce

Stranger-reproducible path (matches the numbers in the README), needs
`ANTHROPIC_API_KEY`:

```bash
cp ../.env.example ../.env   # add your key
npx promptfoo@latest eval -c promptfooconfig.yaml --repeat 10
npx promptfoo@latest view
```

No Anthropic key? Run against any OpenAI-compatible gateway, or the Perplexity
Agent API (the default):

```bash
node run-local.js                                   # Perplexity, default models
node run-local.js openai/gpt-5.5 3                  # one model, 3 runs
BASE_URL=https://your-gateway/v1 API_KEY=sk-... node run-local.js gpt-5.5
```

Prerequisites for the executed checks: **Python 3** and **Node.js 18+** on PATH.

## Honest notes

- Single-shot calls re-send the skill every time. In a real session the ruleset
  is injected once and prompt-cached, so the cost gap widens further for
  ponystack.
- React / FastAPI / cache checks are structural, not executed (see above).
- `run-local.js` defaults to `--repeat 1` for speed; use the promptfoo path with
  `--repeat 10` for the median numbers a stranger should reproduce.
