# Benchmark

Three arms, same model, same tasks: a no-skill **baseline**, **gstack** (its own
`ETHOS.md` as the system prompt), and **ponistack**. We measure code size
(deterministic) and correctness (a gate). The claim is simple: ponistack writes
less code than gstack on gstack's home turf, without breaking correctness.

## Arms

| Arm | System prompt |
|-----|---------------|
| `baseline` | none - just the task |
| `gstack` | `gstack-ETHOS.md`, vendored verbatim (MIT, Garry Tan / YC) |
| `ponistack` | `skills/ponistack/SKILL.md` - the implement-phase doctrine |

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
  ponistack.
- React / FastAPI / cache checks are structural, not executed (see above).
- `run-local.js` defaults to `--repeat 1` for speed; use the promptfoo path with
  `--repeat 10` for the median numbers a stranger should reproduce.
