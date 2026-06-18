---
name: ponistack-ratio
description: >
  Thinking-to-diff ratio (Seam 3): reasoning spent divided by net code shipped.
  The membrane's scoreboard - a high ratio means the thinking went into the plan,
  not the line count. Use when the user says "ratio", "thinking-to-diff",
  "score this session", or invokes /ponistack-ratio.
license: MIT
---

# Thinking-to-diff ratio

Report the membrane's scoreboard for the work just done:

```
thinking : diff  =  <reasoning tokens>  :  <net code LOC>
ratio            =  <reasoning tokens / net code LOC>
```

- **Reasoning** = tokens of thinking/planning spent this session (estimate from
  the conversation if exact counts are unavailable).
- **Net code LOC** = non-blank, non-comment lines added inside code blocks /
  the diff. (Same counter the benchmark uses: `benchmarks/loc.js`.)

A **high** ratio is the champion: deep understanding, narrow output. Example to
celebrate: `9,000 : 11  →  ratio 818`. A **low** ratio is the warning sign:
lots of code, little thought - the lake got poured into the diff.

One line of verdict, then stop. This is a scoreboard, not an essay.
