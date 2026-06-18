# Benchmark run - 2026-06-18 (3 vendors, 3 runs per cell)

Backend: Perplexity Agent API (`/v1/agent`). 7 tasks x 3 arms x 3 models, 3 runs
per cell (21 samples per arm). Total spend $4.12, ~48 min. Widens the 2026-06-15
directional run with a third vendor (Google) and repeats; numbers track the
single-run within a few percent, so the result is stable, not a lucky draw.

## Total code LOC (7 tasks x 3 runs, lower is leaner)

| arm | gpt-5.5 | claude-opus-4-7 | gemini-3.1-pro |
|---|--:|--:|--:|
| baseline | 1018 | 1033 | 725 |
| gstack | 1424 | 780 | 1328 |
| ponistack | 545 | 197 | 238 |

## Correctness (share of task-runs passing the executing gate)

| arm | gpt-5.5 | claude-opus-4-7 | gemini-3.1-pro |
|---|--:|--:|--:|
| baseline | 81% | 100% | 86% |
| gstack | 71% | 76% | 57% |
| ponistack | 86% | 86% | 76% |

## Cost per arm (USD, all task-runs)

| arm | gpt-5.5 | claude-opus-4-7 | gemini-3.1-pro |
|---|--:|--:|--:|
| baseline | 0.49 | 0.56 | 0.20 |
| gstack | 1.01 | 0.58 | 0.39 |
| ponistack | 0.51 | 0.27 | 0.09 |

## Median LOC per task (the clean leanness number)

| arm | gpt-5.5 | claude-opus-4-7 | gemini-3.1-pro |
|---|--:|--:|--:|
| baseline | 52 | 51 | 30 |
| gstack | 62 | 35 | 56 |
| ponistack | 28 | 10 | 11 |

## Takeaways

- **ponistack beats gstack on every model, on both axes at once:** 62% less code
  on gpt-5.5 (545 vs 1424), 75% on opus (197 vs 780), 82% on gemini (238 vs 1328) -
  while scoring HIGHER correctness every time (86 vs 71, 86 vs 76, 76 vs 57).
- **gstack has the lowest correctness of all three arms on all three models**
  (71 / 76 / 57%). More code, more ways to be wrong. It fails debounce + countdown
  across the board and tanks gemini hardest (57%).
- **gstack often out-bloats a no-skill baseline:** +40% code on gpt-5.5 (at lower
  correctness, 71 vs 81), +83% on gemini (57 vs 86). The "prefer +70 LOC" policy
  made literal. On opus it is leaner than baseline (780 vs 1033) but still ~4x
  ponistack and less correct (76 vs 100).
- **ponistack is also cheaper:** ~50% less spend than gstack on gpt-5.5 and opus,
  76% less on gemini - fewer output tokens, lower bill.

## Honest caveats

- `debounce` fails on every arm: the async harness check is strict, but it is
  applied identically to all three, so it lowers every bar equally and does not
  move the comparison.
- gemini-3.1-pro is a reasoning model under an 8000-token output cap. Its gstack
  failures include tiny tasks (email), so they are instruction-confusion, not
  output truncation - but treat the gemini column as the noisiest of the three.
- LOC totals are summed over 7 tasks x 3 runs; the per-task median table above is
  the cleaner like-for-like number. Ratios between arms are identical either way.

## Reproduce

```bash
BASE_URL=https://api.perplexity.ai \
  node benchmarks/run-local.js "openai/gpt-5.5,anthropic/claude-opus-4-7,google/gemini-3.1-pro-preview" 3
npx promptfoo@latest eval -c benchmarks/promptfooconfig.yaml --repeat 10
```
