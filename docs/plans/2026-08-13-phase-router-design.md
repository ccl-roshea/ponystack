# Phase router: correct gstack routing, event-driven escalation, subagent reach

Date: 2026-08-13
Status: approved, not yet implemented

## Problem

`detectPhase` in `hooks/ponystack-hook.js` decides the turn's phase once, from the
user's prompt text, and never revisits it. Running the current router against every
gstack command found 22 misroutes in 40 probes. Four failure classes:

1. **The documented override is inverted.** `/ponystack understand` emits the
   *implement* rule. `understand` alone matches nothing in the understand regex
   (which only matches the phrase `understand the`), so it falls through to the
   default.
2. **Review commands read as implement:** `/devex-review`, `/canary`, `/benchmark`,
   `/codex`, `/cso`. `/devex-review` misses because the review pattern anchors on
   `(^|\s)[/@]?review` and `-` is not whitespace.
3. **`/retro` reads as implement.** It is a retrospective.
4. **Fourteen phase-neutral ops commands get the code ladder:** `/browse`, `/freeze`,
   `/guard`, `/unfreeze`, `/learn`, `/context-save`, `/context-restore`,
   `/sync-gbrain`, `/gstack-upgrade`, `/document-release`, `/document-generate`,
   `/connect-chrome`, `/setup-gbrain`, `/setup-browser-cookies`.

Root cause on all 22: `detectPhase` returns `'implement'` for anything unmatched
(`ponystack-hook.js:43`). Every plain conversational question lands there too.

Two structural gaps sit underneath the routing bugs:

- **Phase never updates mid-turn.** A skill that plans and then writes code runs its
  second half under the wrong rule.
- **Subagents get no membrane at all.** `SessionStart` context is parent-thread only.
  Ponytail solved this with a `SubagentStart` hook (their issue #252); ponystack has
  none. During `/autoplan` the four review subagents run with ponytail's full lazy
  senior ladder and zero ponystack counterweight, so a CEO strategy review executes
  under "shortest working diff, YAGNI, no unrequested abstractions."

### On `/autoplan` specifically

`/autoplan` is a **review pipeline, not an implementation pipeline**
(`autoplan/SKILL.md:903-1181`). It runs CEO -> Design -> Eng -> DX sequentially via
subagents and Codex, in plan mode, ending at `ExitPlanMode`. It never writes code.
Its single file write is the plan markdown (`SKILL.md:805`: "Writing the plan file is
the one edit allowed in plan mode").

This has a sharp consequence: a naive `Edit|Write` escalation matcher would fire on
that plan write and escalate autoplan to the code ladder, wrong 100% of the time it
fired. The prose-path exemption below exists for this case.

## Decisions

| # | Decision | Chosen |
|---|---|---|
| 1 | Scope | Table fix **plus** event-driven re-routing |
| 2 | Escalation stickiness | Per-turn latch, `session_id`-keyed temp file |
| 3 | Escalation predicate | `Edit`/`Write` filtered by path; prose exempt |
| 4 | Subagents | Inherit the parent turn's phase |
| 5 | New default `neutral` | Emits one short line, not silence |
| 6 | Code structure | Extend the single file; lookup table replaces regex alternation |

Decision 5 rationale: silence does not mute ponytail, it only removes ponystack from
the conversation and leaves the ladder governing unopposed. The problem with
`/document-generate` under the ladder is not that ponystack is quiet, it is that
ponytail is loud.

## Architecture

`hooks/hooks.json` grows from two entries to four, all dispatching into the same file
on `argv[2]`:

| Event | Matcher | Mode | Output format |
|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear\|compact` | `session` | raw stdout |
| `UserPromptSubmit` | none | `prompt` | raw stdout |
| `PreToolUse` | `Edit\|Write\|NotebookEdit` | `pretool` | `hookSpecificOutput` + `permissionDecision: "defer"` |
| `SubagentStart` | none | `subagent` | `hookSpecificOutput` |

Output format is **not uniform per event**. Per `ponytail-runtime.js:67-74`: "Native
Claude: SessionStart accepts raw stdout, but SubagentStart needs the
`hookSpecificOutput` JSON form or the context is dropped." The two existing hooks may
keep raw stdout; the two new ones may not. gstack's `question-preference-hook.ts:95-103`
confirms the `PreToolUse` shape:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"defer","additionalContext":"..."}}
```

Phases go from three to four: `understand`, `implement`, `review`, `neutral`.
`neutral` is the new default.

### State

One file per session: `path.join(os.tmpdir(), 'ponystack-<sid>.json')`, holding
`{"phase":"understand","latched":false}`.

- `prompt` computes the phase, writes `{phase, latched: false}`, emits the rule.
- `pretool` reads it and applies the escalation predicate below.
- `subagent` reads it and emits `PHASE_RULE[phase]`.
- `session` emits the doctrine, writes nothing, cleans nothing. tmpdir is the OS's
  problem and the next prompt overwrites anyway.

Ponytail keys its state on a single global file (`~/.claude/.ponytail-active`). That
is fine for a sticky mode flag and wrong for a per-turn latch: two concurrent Claude
Code sessions would stomp each other. Hence `session_id` keying.

## Router

```js
const first = String(prompt).trim().split(/\s+/)[0] || '';
const cmd = first.replace(/^[/@$]/, '').split(':').pop().toLowerCase();
```

`/superpowers:brainstorming` -> `brainstorming`. `/ponystack:ponystack` -> `ponystack`.
`/plan-ceo-review` -> itself. The `/devex-review` hyphen bug cannot exist in a lookup.

Resolution order: **exact table hit -> suffix rules -> prose regex -> `neutral`**.

### Table

Derived from each gstack skill's own `description:` frontmatter.

- **understand:** `office-hours`, `spec`, `autoplan`, `plan-ceo-review`,
  `plan-design-review`, `plan-devex-review`, `plan-eng-review`,
  `design-consultation`, `design-shotgun`, `investigate`, `retro`, `brainstorm`,
  `brainstorming`, `writing-plans`
- **review:** `review`, `qa`, `qa-only`, `design-review`, `devex-review`, `canary`,
  `benchmark`, `benchmark-models`, `codex`, `cso`, `health`, `ios-design-review`,
  `ios-qa`, `ponystack-contract`, `ponytail-review`
- **implement:** `ship`, `land-and-deploy`, `setup-deploy`, `design-html`, `ios-fix`,
  `ios-clean`, `ios-sync`, `skillify`
- **neutral:** `browse`, `connect-chrome`, `open-gstack-browser`, `pair-agent`,
  `scrape`, `setup-browser-cookies`, `careful`, `freeze`, `guard`, `unfreeze`,
  `context-save`, `context-restore`, `learn`, `gstack-upgrade`, `sync-gbrain`,
  `setup-gbrain`, `document-generate`, `document-release`, `make-pdf`, `diagram`,
  `landing-report`, `plan-tune`, `ponystack-ratio`

Two entries are judgment, not transcription:

- `document-generate` / `document-release` -> **neutral**, not implement. They write
  prose, and the ladder governs code.
- `canary` / `benchmark` -> **review**, not implement. Both verify something that
  already shipped.

### Suffix rules

So new gstack skills route correctly without a table edit:

```
/^plan-.*-review$/  -> understand   (plan review, not code review)
/-review$/          -> review
```

Order matters exactly as the existing code comment already explains.

### Override

When `cmd === 'ponystack'`, the second token is checked against the four phase names
and forces that phase. This is what makes the documented override work.

### Prose fallback

The three existing regexes are kept unchanged. They work. Every bug was in the command
alternations, not the natural-language patterns.

### Drift behavior

An unknown command lands on `neutral` instead of `implement`. When gstack ships a new
skill, the failure mode goes from "code ladder applied to a strategy review" to "one
short line and no opinion." That property matters more than the table being complete
on day one.

## Escalation predicate

`pretool`, in order, exiting silently at the first stop:

1. No state file -> exit. Phase unknown, do not guess.
2. `phase === 'implement'` -> exit. Ladder already in context.
3. `latched` -> exit. Already fired this turn.
4. Target path matches prose -> exit. `/\.(md|markdown|txt|rst|adoc)$/i`, or a path
   under `docs/plans/`, `.gstack/`, `.claude/plans/`.
5. Otherwise set `latched: true` and inject the implement rule.

Escalation fires out of `understand`, `review`, **and** `neutral`. Only `implement` is
exempt. `/qa` is described as "QA test a web application **and fix bugs found**", so a
review turn that starts editing source has genuinely crossed into implementation.

Autoplan's plan-markdown write stops at rule 4 and never fires.

`ponystack:` The prose exemption is an extension and path heuristic. Upgrade path if
it proves too blunt: the Task 1 probe found `permission_mode` in the
`UserPromptSubmit` payload, so `prompt` mode can record it into the state file and
`pretool` can skip escalation whenever the turn began in plan mode. That is a real
signal, not the speculative one this note originally described. It is deliberately
not built now: it only captures plan mode as of the prompt, not plan mode entered
mid-turn, so it complements the path filter rather than replacing it.

## Subagent inheritance

Read state, emit `PHASE_RULE[phase]` wrapped in `hookSpecificOutput`. Missing state ->
inject nothing.

**RESOLVED by probe, 2026-08-13.** `SubagentStart` receives the *parent's*
`session_id`, byte-identical to the one `UserPromptSubmit` reports:

```
parent    e9374aad-5076-4243-b2fb-f145f9f15320
subagent  e9374aad-5076-4243-b2fb-f145f9f15320
```

No tmpdir-newest-file fallback is needed. A plain read of the session-keyed state
file works.

Observed payload keys, recorded because they are hard to discover and unlock the
follow-ups below:

- `SubagentStart`: `agent_id`, `agent_type`, `cwd`, `hook_event_name`, `prompt_id`,
  `session_id`, `transcript_path`
- `UserPromptSubmit`: `cwd`, `hook_event_name`, `permission_mode`, `prompt`,
  `prompt_id`, `session_id`, `transcript_path`

Two consequences worth carrying forward:

- `agent_type` is present, so per-agent-type routing (the rejected option C) can be
  built later without another probe.
- `permission_mode` is present. This design's escalation section claims the hook has
  no reliable read on plan-mode state; that is now known to be partly false. See the
  revised upgrade note there.

## Failure policy

A hook must never break the session. Every `fs` and `JSON.parse` call is wrapped and
degrades to exit 0 with no output. The existing 250ms unref'd stdin guard is reused.

`PreToolUse` is the highest-risk component here because it sits in front of every file
write in every session. It therefore never emits `deny`, never exits non-zero, and
always uses `permissionDecision: "defer"`. Worst case on a bug is a missing rule, never
a blocked edit.

`session_id` arrives from the hook payload and is interpolated into a filesystem path,
so it is a trust boundary. Sanitize to `[A-Za-z0-9_-]`, falling back to `default`. A
payload carrying `../../..` must not escape tmpdir.

## Tests

`node --test`, extending `tests/hooks.test.js`:

1. Data-driven loop asserting every command in the table maps to its expected phase.
   Regression net for the 22 bugs.
2. `/ponystack understand|implement|review|neutral` forces correctly. Direct
   regression for the inverted override.
3. Suffix rules: `plan-foo-review` -> understand, `foo-review` -> review.
4. Unknown -> neutral, empty -> neutral, existing prose probes unchanged.
5. `shouldEscalate(phase, latched, filePath)` exported as a pure function:
   implement -> false, latched -> false, `.md` -> false, `docs/plans/x.md` -> false,
   `src/x.js` from understand/review/neutral -> true.
6. State round-trip; an unreadable path returns null rather than throwing.
7. Path traversal: `session_id` of `../../etc/passwd` resolves inside tmpdir.
8. Manifest test extended to assert all four hook events are wired.

Extracting `shouldEscalate` as a pure function is what makes the risky hook testable
without spawning processes.

**Manual smoke test**, because payload shapes cannot be unit tested: run a live
session, confirm `PreToolUse` `additionalContext` actually reaches the model, and
confirm what `session_id` `SubagentStart` receives.

## Out of scope

- Bash-written files. Claude Code writes code through `Edit`/`Write` overwhelmingly;
  a write-pattern heuristic over arbitrary shell is speculative. Revisit if observed.
- Per-`agent_type` subagent routing. Ponytail's `PONYTAIL_SUBAGENT_MATCHER` shows the
  refinement is available later if phase inheritance proves too blunt.
- Persisted cross-turn phase. Rejected in decision 2: it reintroduces the stale-phase
  bug this change exists to remove.
- Codex/Copilot adapters. Claude Code only, as today.
