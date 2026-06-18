# Benchmark run - 2026-06-15

Backend: Perplexity Agent API (`/v1/agent`). 1 run per cell (directional; use the
promptfoo path with `--repeat 10` for medians). 7 tasks, 3 arms, 2 models.

## Total code LOC (all 7 tasks, lower is leaner)

| arm | gpt-5.5 | claude-opus-4-7 |
|---|--:|--:|
| baseline | 333 | 351 |
| gstack (ETHOS) | 466 | 325 |
| ponistack | 156 | 63 |

## Correctness (share of tasks passing the gate)

| arm | gpt-5.5 | claude-opus-4-7 |
|---|--:|--:|
| baseline | 86% | 100% |
| gstack (ETHOS) | 71% | 71% |
| ponistack | 86% | 86% |

## Takeaways

- ponistack vs gstack: **67% less code on gpt-5.5** (156 vs 466), **81% less on
  opus** (63 vs 325), at **higher correctness** (86% vs 71% on both).
- gstack's correctness is the lowest of the three on both models (71%): more
  code, more ways to be wrong. It fails `debounce` and `countdown` on both.
- On gpt-5.5 gstack out-bloats even a no-skill baseline (466 vs 333), the
  "prefer +70 LOC" policy made literal.
- `debounce` fails across most arms - the async harness check is strict; it is
  applied identically to every arm, so the comparison stays fair.

## Reproduce

```bash
node benchmarks/run-local.js                       # Perplexity, both models
npx promptfoo@latest eval -c benchmarks/promptfooconfig.yaml --repeat 10
```
