# Bootstrap - the framework rebuilds itself (2026-06-18)

The claim from SPEC.md: ponystack is self-hosting. Hand its spec to a fresh agent
running under ponystack's discipline and it regenerates ponystack. Like a compiler
that compiles itself - a fixed point, not infinite recursion.

This is the first run of that test.

## Setup (clean room)

- A fresh general-purpose coding agent, **no memory of Gen 0**, was given only
  `SPEC.md` in an empty directory and the one permitted external file (gstack's
  real `ETHOS.md`, the legitimate source for the benchmark's gstack arm).
- It was explicitly forbidden to read, list, grep, or git-show the existing
  ponystack repo. It built Gen 1 from the spec and its own judgment.
- Every number below was re-verified by hand, not taken from the builder's report.

## Convergence

| | Gen 0 (built by hand) | Gen 1 (SPEC -> fresh agent) | verdict |
|---|--:|--:|---|
| Code LOC (js+json) | 580 | 594 | within 2.4% |
| Plugin manifests | 2, valid | 2, valid | match |
| Hook events | SessionStart + UserPromptSubmit | same | match |
| Hook logic | 1 file | router.js + thin CLI | same concept |
| Skills | 3 (membrane / contract / ratio) | same 3 | identical choice |
| Command shims | 3 (.toml) | 3 (.md) | format only |
| Benchmark | 3 arms + executing gate + LOC counter | same | match |
| Test | 5 tests, green | 14 tests, green | green both |

SPEC's convergence criteria (installs, hooks valid, tests green, bench runs) all met:
manifests parse, both hook events wired, `node --test` is 14/14, and the offline
harness demo runs (the correctness gate executed each reply and failed a broken one).

## Read

Two independent builds from one spec, both under the membrane's discipline, landed
within 14 lines of each other and made the same compression calls without being told
to: one hook script instead of four, three skills instead of four. The differences
that remain - file layout (router split out), arms in one file vs three, `.md` vs
`.toml` shims, Gen 1's extra tests - are the proof it was a reproduction, not a copy.
A copy is byte-identical; this is two disciplined engineers arriving at the same shape.

## Honest caveats

- One trial. One convergence point. Repeating it a few times would harden the claim;
  one clean reproduction is already strong.
- Gen 1 ran on the same model class as Gen 0 (fair, like-for-like).
- Isolation rests on instruction + a clean working dir; it is corroborated, not just
  asserted, by the structural divergences above (a peeking agent would have matched
  Gen 0's layout).

## Reproduce

```bash
mkdir -p /tmp/ponystack-gen1 && cp SPEC.md /tmp/ponystack-gen1/
# hand /tmp/ponystack-gen1/SPEC.md to a fresh capable agent, forbid it from reading
# any existing ponystack, let it build in that dir, then:
cd /tmp/ponystack-gen1 && node --test && node benchmarks/run-local.js
```
