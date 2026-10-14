
model claude-sonnet-5-5, 3 samples per cell

### UNDERSTAND: did the reply apply the ladder?

| arm | n | applied | mean families hit | yagni | shortestDiff | cutScope | stdlibFirst | deletion | noAbstraction | mean input tok |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| A | 9 | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 1092 |
| B | 9 | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 1606 |
| C | 9 | 0 | 0.78 | 0 | 5 | 0 | 0 | 2 | 0 | 654 |
| D | 9 | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 140 |

### IMPLEMENT: code size and correctness (7 tasks)

| arm | n | LOC per 7-task pass | correct | mean input tok |
|---|--:|--:|--:|--:|
| A | 21 | 133 | 76% | 993 |
| B | 13 | 84 | 77% | 1626 |
| C | 21 | 158 | 71% | 669 |
| D | 21 | 403 | 86% | 41 |

### Verdict (pre-registered thresholds in ab-metrics.js)

```
{
 "understand": "inconclusive",
 "pos": null,
 "implementNotWorse": true,
 "keep": false
}
```
