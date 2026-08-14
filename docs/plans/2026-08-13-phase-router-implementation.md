# Phase Router Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 22 phase-routing bugs in ponystack, and make the phase follow what the model actually does instead of what the prompt looked like.

**Architecture:** `hooks/ponystack-hook.js` stays a single file dispatching on `argv[2]`, growing from two modes to four. A plain command-to-phase lookup replaces regex alternation. A `session_id`-keyed JSON file in tmpdir carries the turn's phase so `PreToolUse` can escalate to the implement rule the first time real code is written, and so `SubagentStart` can inherit the parent's phase.

**Tech Stack:** Node 24, zero dependencies, `node --test` (`npm test`), Claude Code plugin hooks.

**Design doc:** `docs/plans/2026-08-13-phase-router-design.md` (commit 095b9ab)

---

## Background for the implementer

You are editing a Claude Code plugin. It has no runtime; the "app" is four shell
commands that Claude Code invokes at lifecycle events, each piped a JSON payload on
stdin, each writing to stdout. Whatever a hook prints becomes context the model sees.

Three facts that are not obvious and will cost you an hour if you skip them:

1. **Output format differs per event.** `SessionStart` and `UserPromptSubmit` accept
   raw text on stdout. `PreToolUse` and `SubagentStart` do **not**; their context is
   silently dropped unless wrapped in `{"hookSpecificOutput":{...}}`. Source:
   `~/.claude/plugins/cache/ponytail/ponytail/4.8.4/hooks/ponytail-runtime.js:67-74`.
2. **A hook must never break the session.** Every filesystem and JSON operation is
   wrapped and degrades to exit 0 with no output. `PreToolUse` sits in front of every
   file write in every session; it always uses `permissionDecision: "defer"` and never
   `deny`.
3. **`session_id` is a trust boundary.** It arrives from the payload and gets
   interpolated into a filesystem path. Sanitize it or a crafted id escapes tmpdir.

Read `docs/plans/2026-08-13-phase-router-design.md` before starting. Do not deviate
from it without asking; the four judgment calls in the phase table were decided
deliberately.

---

## Task 0: Branch

**Step 1: Create the working branch**

The design doc was committed to `master`. Implementation goes on a branch.

```bash
cd ~/repos/ponystack
git checkout -b feat/phase-router
```

**Step 2: Confirm the baseline is green**

Run: `npm test`
Expected: all 5 tests pass. If they do not, stop and report; nothing below assumes a
broken baseline.

---

## Task 1: Probe the SubagentStart payload

The design has one open question: does `SubagentStart` receive the **parent's**
`session_id`, or its own? Ponytail sidestepped it with a global state file, so their
code is no evidence. If subagents carry a different id, Task 8's hook reads a file
that does not exist and silently injects nothing.

Answer it empirically before writing code that depends on it. This task creates a
disposable probe and deletes it.

**Files:**
- Create (temporary, deleted in Step 6): `tools/probe-subagent.js`
- Modify (temporary, reverted in Step 6): `hooks/hooks.json`

**Step 1: Write the probe**

```javascript
#!/usr/bin/env node
// Disposable. Appends the raw SubagentStart payload to /tmp/ponystack-probe.jsonl
// so we can see whether session_id matches the parent's. Delete after reading.
const fs = require('fs');
let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try { fs.appendFileSync('/tmp/ponystack-probe.jsonl', input + '\n'); } catch (e) {}
  process.stdout.write('{}');
});
setTimeout(() => process.exit(0), 1000).unref();
```

**Step 2: Wire it temporarily**

Add to `hooks/hooks.json` inside the `"hooks"` object, alongside the existing
`SessionStart` and `UserPromptSubmit` keys:

```json
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "command -v node >/dev/null 2>&1 && node \"${CLAUDE_PLUGIN_ROOT}/tools/probe-subagent.js\" || exit 0",
            "timeout": 5
          }
        ]
      }
    ]
```

**Step 3: Reinstall the plugin so Claude Code picks up the new hook**

The installed copy lives at `~/.claude/plugins/cache/ponystack/ponystack/0.1.0/`, which
is separate from this repo. Sync it:

```bash
cp hooks/hooks.json ~/.claude/plugins/cache/ponystack/ponystack/0.1.0/hooks/hooks.json
mkdir -p ~/.claude/plugins/cache/ponystack/ponystack/0.1.0/tools
cp tools/probe-subagent.js ~/.claude/plugins/cache/ponystack/ponystack/0.1.0/tools/
```

**Step 4: Trigger one subagent in a fresh Claude Code session**

Start a new session (hooks load at session start) and ask it to run any trivial
subagent task, for example: "use the Explore agent to find the README in this repo".

**Step 5: Read the answer**

Run: `cat /tmp/ponystack-probe.jsonl | head -1`
Expected: a JSON object containing `agent_type` and `session_id`.

Compare that `session_id` against the parent session's. You can get the parent's from
any `ponystack-*.json` that Task 6 will later write, or from the transcript path in
the payload.

Record the result in the design doc under "Subagent inheritance":
- **Match** → Task 8 needs no fallback. Delete the "Open question" paragraph.
- **Differ** → Task 8 adds the newest-file fallback described there.

**Step 6: Remove the probe**

```bash
rm tools/probe-subagent.js
rm -rf ~/.claude/plugins/cache/ponystack/ponystack/0.1.0/tools
git checkout hooks/hooks.json
```

**Step 7: Commit the recorded finding**

```bash
git add docs/plans/2026-08-13-phase-router-design.md
git commit -m "docs: record SubagentStart session_id probe result"
```

---

## Task 2: Command lookup table and normalization

**Files:**
- Modify: `hooks/ponystack-hook.js:19-44` (replaces `PHASE_RULES` / `detectPhase`)
- Test: `tests/hooks.test.js`

**Step 1: Write the failing test**

Append to `tests/hooks.test.js`:

```javascript
test('phase router: every gstack command maps to its designed phase', () => {
  const expected = {
    understand: ['office-hours', 'spec', 'autoplan', 'plan-ceo-review',
      'plan-design-review', 'plan-devex-review', 'plan-eng-review',
      'design-consultation', 'design-shotgun', 'investigate', 'retro',
      'brainstorm', 'brainstorming', 'writing-plans'],
    review: ['review', 'qa', 'qa-only', 'design-review', 'devex-review', 'canary',
      'benchmark', 'benchmark-models', 'codex', 'cso', 'health',
      'ios-design-review', 'ios-qa', 'ponystack-contract', 'ponytail-review'],
    implement: ['ship', 'land-and-deploy', 'setup-deploy', 'design-html', 'ios-fix',
      'ios-clean', 'ios-sync', 'skillify'],
    neutral: ['browse', 'connect-chrome', 'open-gstack-browser', 'pair-agent',
      'scrape', 'setup-browser-cookies', 'careful', 'freeze', 'guard', 'unfreeze',
      'context-save', 'context-restore', 'learn', 'gstack-upgrade', 'sync-gbrain',
      'setup-gbrain', 'document-generate', 'document-release', 'make-pdf', 'diagram',
      'landing-report', 'plan-tune', 'ponystack-ratio'],
  };
  for (const [phase, cmds] of Object.entries(expected)) {
    for (const c of cmds) {
      assert.equal(detectPhase('/' + c), phase, `/${c}`);
      assert.equal(detectPhase('/' + c + ' with some args'), phase, `/${c} + args`);
    }
  }
});

test('phase router: normalization strips prefixes and plugin namespaces', () => {
  assert.equal(detectPhase('/superpowers:brainstorming an idea'), 'understand');
  assert.equal(detectPhase('@office-hours'), 'understand');
  assert.equal(detectPhase('$ship'), 'implement');
  assert.equal(detectPhase('/QA-ONLY'), 'review');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, first on `/autoplan` or `/devex-review` depending on order, reporting
`implement` where `review`/`understand` was expected.

**Step 3: Write the implementation**

In `hooks/ponystack-hook.js`, replace the `PHASE_RULES` array and `detectPhase`
function (lines 19-44) with:

```javascript
// --- Seam 1: phase detection -------------------------------------------------
// Resolution order: exact command lookup -> suffix rules -> prose regex -> neutral.
// The lookup replaces regex alternation because alternation is what produced the
// bugs: /devex-review missed on a hyphen, /ponystack understand inverted itself.

const COMMAND_PHASE = {
  // understand: plan, design, research, diagnose. No code yet.
  'office-hours': 'understand',
  spec: 'understand',
  autoplan: 'understand',
  'plan-ceo-review': 'understand',
  'plan-design-review': 'understand',
  'plan-devex-review': 'understand',
  'plan-eng-review': 'understand',
  'design-consultation': 'understand',
  'design-shotgun': 'understand',
  investigate: 'understand',
  retro: 'understand',
  brainstorm: 'understand',
  brainstorming: 'understand',
  'writing-plans': 'understand',

  // review: critique something that already exists.
  review: 'review',
  qa: 'review',
  'qa-only': 'review',
  'design-review': 'review',
  'devex-review': 'review',
  canary: 'review',           // post-deploy monitoring: verifies what shipped
  benchmark: 'review',        // perf regression detection: verifies what shipped
  'benchmark-models': 'review',
  codex: 'review',
  cso: 'review',
  health: 'review',
  'ios-design-review': 'review',
  'ios-qa': 'review',
  'ponystack-contract': 'review',
  'ponytail-review': 'review',

  // implement: writes code.
  ship: 'implement',
  'land-and-deploy': 'implement',
  'setup-deploy': 'implement',
  'design-html': 'implement',
  'ios-fix': 'implement',
  'ios-clean': 'implement',
  'ios-sync': 'implement',
  skillify: 'implement',

  // neutral: ops, tooling, prose. The ladder governs code, not these.
  browse: 'neutral',
  'connect-chrome': 'neutral',
  'open-gstack-browser': 'neutral',
  'pair-agent': 'neutral',
  scrape: 'neutral',
  'setup-browser-cookies': 'neutral',
  careful: 'neutral',
  freeze: 'neutral',
  guard: 'neutral',
  unfreeze: 'neutral',
  'context-save': 'neutral',
  'context-restore': 'neutral',
  learn: 'neutral',
  'gstack-upgrade': 'neutral',
  'sync-gbrain': 'neutral',
  'setup-gbrain': 'neutral',
  'document-generate': 'neutral',  // prose, not code
  'document-release': 'neutral',   // prose, not code
  'make-pdf': 'neutral',
  diagram: 'neutral',
  'landing-report': 'neutral',
  'plan-tune': 'neutral',
  'ponystack-ratio': 'neutral',
};

// Prose fallback. Unchanged from the original router: every bug was in the
// command alternations, not these natural-language patterns.
const PROSE_RULES = [
  {
    phase: 'understand',
    re: /(^|\s)[/@]?(office-hours|spec|plan|plan-[a-z-]+|autoplan|design-consultation|design-shotgun|design-html|investigate|brainstorm)\b|\b(how should (i|we)|let'?s (plan|design|think|explore|brainstorm)|research this|architect this|trade-?offs?|figure out|root cause|understand the)\b/i,
  },
  {
    phase: 'review',
    re: /(^|\s)[/@]?(review|qa|qa-only|code-review|design-review|ponystack-contract|ponystack-review|ponytail-review)\b|\b(review (this|the|my)\s?\w*\s?(diff|code|pr|change|branch)|what (can|should) (we|i) (delete|cut|remove|simplify)|is this over-?engineered|over-?engineering|delete-?list)\b/i,
  },
  {
    phase: 'implement',
    re: /(^|\s)[/@]?(ship|land-and-deploy)\b|\b(implement|build|add|write|create|fix|refactor|make it|wire up|hook up|code (this|it) up)\b/i,
  },
];

// "/superpowers:brainstorming" -> "brainstorming". "@office-hours" -> "office-hours".
function normalizeCommand(prompt) {
  const first = String(prompt || '').trim().split(/\s+/)[0] || '';
  return first.replace(/^[/@$]/, '').split(':').pop().toLowerCase();
}

function detectPhase(prompt) {
  const p = String(prompt || '');
  const cmd = normalizeCommand(p);

  if (COMMAND_PHASE[cmd]) return COMMAND_PHASE[cmd];

  // Suffix rules so new gstack skills route without a table edit. plan-*-review
  // is a PLAN review (understand), everything else ending in -review is a code
  // review. Order matters, same reason the original comment gave.
  if (/^plan-.*-review$/.test(cmd)) return 'understand';
  if (/-review$/.test(cmd)) return 'review';

  for (const { phase, re } of PROSE_RULES) if (re.test(p)) return phase;

  // Unknown lands on neutral, not implement. When gstack ships a new skill the
  // failure mode is "one short line and no opinion", not "code ladder applied to
  // a strategy review".
  return 'neutral';
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: the two new tests PASS. The pre-existing `implement (and default)` test
still FAILS on its last two assertions; Task 4 fixes those. Do not touch it yet.

**Step 5: Commit**

```bash
git add hooks/ponystack-hook.js tests/hooks.test.js
git commit -m "feat: replace regex alternation with a command lookup table

Alternation is what produced the bugs: /devex-review missed on a hyphen
because the review pattern anchors on (^|\\s)[/@]?review. A lookup cannot
have that class of bug. Adds all 60 gstack commands, normalization that
strips /@\$ and plugin namespaces, and suffix rules so new skills route
without a table edit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The `/ponystack <phase>` override

Today `/ponystack understand` emits the **implement** rule. `understand` alone matches
nothing in the understand regex, which only matches the phrase `understand the`, so it
falls through to the default. The documented escape hatch does the opposite of what it
says.

**Files:**
- Modify: `hooks/ponystack-hook.js` (`detectPhase`)
- Test: `tests/hooks.test.js`

**Step 1: Write the failing test**

```javascript
test('phase router: /ponystack <phase> forces that phase', () => {
  for (const phase of ['understand', 'implement', 'review', 'neutral']) {
    assert.equal(detectPhase('/ponystack ' + phase), phase, phase);
    assert.equal(detectPhase('/ponystack:ponystack ' + phase), phase, 'namespaced ' + phase);
    assert.equal(detectPhase('/ponystack ' + phase.toUpperCase()), phase, 'uppercase ' + phase);
  }
  // A bare invocation reports, it does not force.
  assert.equal(detectPhase('/ponystack'), 'neutral');
  // A junk argument must not become a phase.
  assert.equal(detectPhase('/ponystack banana'), 'neutral');
  // The contract and ratio commands are not the override.
  assert.equal(detectPhase('/ponystack-contract'), 'review');
  assert.equal(detectPhase('/ponystack-ratio'), 'neutral');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL on `/ponystack understand`, got `implement`.

**Step 3: Write the implementation**

Add the phase-name set next to `COMMAND_PHASE`:

```javascript
const PHASE_NAMES = new Set(['understand', 'implement', 'review', 'neutral']);
```

Insert this block in `detectPhase`, immediately after the `const cmd = ...` line and
**before** the `COMMAND_PHASE` lookup:

```javascript
  // The documented override. Must precede the table so it is not shadowed.
  if (cmd === 'ponystack') {
    const arg = String(p).trim().split(/\s+/)[1];
    if (arg && PHASE_NAMES.has(arg.toLowerCase())) return arg.toLowerCase();
  }
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: the override test PASSES.

**Step 5: Commit**

```bash
git add hooks/ponystack-hook.js tests/hooks.test.js
git commit -m "fix: make /ponystack <phase> actually force the phase

It emitted the implement rule for every argument, including
'/ponystack understand', because bare 'understand' matched no pattern
and fell through to the implement default.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The neutral phase

**Files:**
- Modify: `hooks/ponystack-hook.js` (`PHASE_RULE`)
- Modify: `tests/hooks.test.js:26-33` and `:35-40`

**Step 1: Update the two stale default assertions**

In the existing `phase router: implement (and default)` test, change the last two
lines from `implement` to `neutral` and rename the test:

```javascript
test('phase router: implement (prose) and neutral default', () => {
  for (const p of ['/ship', 'implement the parser', 'add a logout button', 'fix the null deref',
    'refactor this module', 'write a function that sorts', 'create the migration']) {
    assert.equal(detectPhase(p), 'implement', `expected implement for: ${p}`);
  }
  assert.equal(detectPhase(''), 'neutral', 'empty defaults to neutral');
  assert.equal(detectPhase('tell me a joke'), 'neutral', 'unknown defaults to neutral');
  assert.equal(detectPhase('what about ponytail?'), 'neutral', 'plain question is neutral');
});
```

In `every phase has a rule and the doctrine names the membrane`, add `'neutral'` to
the phase array on line 36.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL. `PHASE_RULE.neutral` is undefined.

**Step 3: Write the implementation**

Add to the `PHASE_RULE` object in `hooks/ponystack-hook.js`:

```javascript
  neutral:
    'PONYSTACK PHASE: neutral - no phase rule this turn. The ladder governs ' +
    'code, not prose or ops.',
```

Silence was the alternative and was rejected: it would not mute ponytail, it would
only remove ponystack and leave the ladder governing unopposed. The problem with
`/document-generate` under the ladder is not that ponystack is quiet, it is that
ponytail is loud.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS. This is the first fully green point since Task 2.

**Step 5: Commit**

```bash
git add hooks/ponystack-hook.js tests/hooks.test.js
git commit -m "feat: add neutral phase and make it the default

The old default was implement, which is why 22 commands and every plain
question got the code ladder. Neutral emits one line that scopes ponytail
rather than abandoning the field.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: State helpers

**Files:**
- Modify: `hooks/ponystack-hook.js` (new block, and the `module.exports` on line 124)
- Test: `tests/hooks.test.js`

**Step 1: Write the failing test**

```javascript
const os = require('os');

test('state: round-trips, and a missing file returns null not a throw', () => {
  const sid = 'test-session-' + process.pid;
  assert.equal(readState('no-such-session-' + process.pid), null);
  writeState(sid, { phase: 'understand', latched: false });
  assert.deepEqual(readState(sid), { phase: 'understand', latched: false });
  writeState(sid, { phase: 'understand', latched: true });
  assert.equal(readState(sid).latched, true);
  fs.unlinkSync(statePath(sid));
});

test('state: session_id is a trust boundary and cannot escape tmpdir', () => {
  for (const evil of ['../../etc/passwd', '../../../root/.ssh/authorized_keys',
    '/etc/shadow', 'a/b/c', '..', '']) {
    const p = statePath(evil);
    assert.ok(p.startsWith(os.tmpdir() + path.sep), `escaped tmpdir: ${evil} -> ${p}`);
    assert.ok(!p.includes('..'), `traversal survived: ${evil} -> ${p}`);
  }
});
```

Add `os` and `path` to the test file's requires if not present.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `readState is not a function`.

**Step 3: Write the implementation**

At the top of `hooks/ponystack-hook.js`, after the header comment:

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');
```

Add this block before `// --- main ---`:

```javascript
// --- per-turn state ----------------------------------------------------------
// One file per session so two concurrent Claude Code sessions cannot stomp each
// other's latch. Ponytail uses a single global flag file, which is fine for a
// sticky mode and wrong for per-turn state.

function statePath(sessionId) {
  // Trust boundary: session_id arrives from the hook payload and is interpolated
  // into a filesystem path. Without this sanitize, a crafted id escapes tmpdir.
  const sid = String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  return path.join(os.tmpdir(), `ponystack-${sid}.json`);
}

function readState(sessionId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeState(sessionId, state) {
  // ponystack: best-effort. A hook must never break the session, so a failed
  // write degrades to "no escalation this turn" rather than throwing.
  try {
    fs.writeFileSync(statePath(sessionId), JSON.stringify(state));
  } catch (e) { /* intentionally silent */ }
}
```

Extend `module.exports` (line 124) to include `statePath`, `readState`, `writeState`.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, including all six traversal probes.

**Step 5: Commit**

```bash
git add hooks/ponystack-hook.js tests/hooks.test.js
git commit -m "feat: session-keyed phase state in tmpdir

session_id is sanitized to [A-Za-z0-9_-] before it reaches a path; a
payload carrying ../.. must not escape tmpdir. Tested.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The escalation predicate

Pulled out as a pure function so the riskiest hook in the plugin is testable without
spawning a process.

**Files:**
- Modify: `hooks/ponystack-hook.js`
- Test: `tests/hooks.test.js`

**Step 1: Write the failing test**

```javascript
test('escalation: fires once, on code, out of any phase but implement', () => {
  // Fires: real code, first write, wrong phase.
  for (const phase of ['understand', 'review', 'neutral']) {
    assert.equal(shouldEscalate(phase, false, 'src/index.js'), true, phase);
    assert.equal(shouldEscalate(phase, false, '/abs/path/main.py'), true, phase + ' abs');
  }
  // Already in implement: ladder is in context, say nothing.
  assert.equal(shouldEscalate('implement', false, 'src/index.js'), false);
  // Already latched this turn: say nothing.
  assert.equal(shouldEscalate('understand', true, 'src/index.js'), false);
  // Prose is not code. This is what keeps /autoplan's plan write from misfiring.
  for (const f of ['docs/plans/2026-08-13-design.md', 'README.md', 'NOTES.txt',
    'a/b/c.markdown', 'guide.rst', 'page.adoc',
    '/home/ro/.gstack/projects/x/plan.json',
    '.claude/plans/current.json']) {
    assert.equal(shouldEscalate('understand', false, f), false, f);
  }
  // No path, no judgement.
  assert.equal(shouldEscalate('understand', false, ''), false);
  assert.equal(shouldEscalate('understand', false, undefined), false);
  // No state means no phase means no guess.
  assert.equal(shouldEscalate(null, false, 'src/index.js'), false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `shouldEscalate is not a function`.

**Step 3: Write the implementation**

```javascript
// --- Seam 1b: mid-turn escalation --------------------------------------------
// The phase is routed from prompt text, which is a guess. This is the correction:
// when the model actually writes code, the ladder applies regardless of what the
// prompt looked like.

const PROSE_FILE = /\.(md|markdown|txt|rst|adoc)$/i;
const PROSE_DIR = /(^|[\\/])(docs[\\/]plans|\.gstack|\.claude[\\/]plans)([\\/]|$)/;

function shouldEscalate(phase, latched, filePath) {
  if (!phase || phase === 'implement') return false;  // ladder already in context
  if (latched) return false;                          // already fired this turn
  const f = String(filePath || '');
  if (!f) return false;                               // no path, no judgement
  // ponystack: extension + path heuristic. /autoplan is a review pipeline whose
  // only write is the plan markdown, so escalating on prose would be wrong 100%
  // of the time it fired there. Upgrade path: key on plan-mode state instead of
  // filename if a future Claude Code release exposes CLAUDE_PLAN_FILE to hooks.
  if (PROSE_FILE.test(f) || PROSE_DIR.test(f)) return false;
  return true;
}
```

Note this escalates out of `review` too. `/qa` is described as "QA test a web
application **and fix bugs found**", so a review turn that starts editing source has
genuinely crossed into implementation.

Add `shouldEscalate` to `module.exports`.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add hooks/ponystack-hook.js tests/hooks.test.js
git commit -m "feat: shouldEscalate predicate, prose paths exempt

Pure function so the PreToolUse path is testable without spawning a
process. Prose exemption exists because /autoplan's only file write is
its plan markdown; a bare Edit|Write matcher would misfire there every
time.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Output helpers and the two new dispatch modes

**Files:**
- Modify: `hooks/ponystack-hook.js:106-120` (`main`)

**Step 1: Add the output helpers**

Before `main`:

```javascript
// --- output ------------------------------------------------------------------
// Native Claude accepts raw stdout on SessionStart and UserPromptSubmit, but
// DROPS context on PreToolUse and SubagentStart unless it is wrapped in
// hookSpecificOutput. Source: ponytail-runtime.js:67-74.
function emitContext(event, text, extra) {
  const out = { hookEventName: event, additionalContext: text };
  if (extra) Object.assign(out, extra);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
}
```

**Step 2: Replace `main` with the four-mode dispatcher**

```javascript
async function readPayload() {
  try {
    const raw = (await readStdin()).replace(/^﻿/, '');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};  // ponystack: bad/empty stdin degrades to no-op, never a throw
  }
}

async function main() {
  const mode = process.argv[2];

  if (mode === 'session') {
    process.stdout.write(membraneDoctrine());
    return;
  }

  const payload = await readPayload();

  if (mode === 'prompt') {
    const phase = detectPhase(payload.prompt || '');
    writeState(payload.session_id, { phase, latched: false });
    process.stdout.write(PHASE_RULE[phase]);
    return;
  }

  if (mode === 'pretool') {
    const st = readState(payload.session_id);
    if (!st) return;
    const file = (payload.tool_input && payload.tool_input.file_path) || '';
    if (!shouldEscalate(st.phase, st.latched, file)) return;
    writeState(payload.session_id, { phase: st.phase, latched: true });
    // Never 'deny'. This hook sits in front of every file write in every
    // session; the worst case on a bug must be a missing rule, not a blocked edit.
    emitContext('PreToolUse', PHASE_RULE.implement, { permissionDecision: 'defer' });
    return;
  }

  if (mode === 'subagent') {
    const st = readState(payload.session_id);
    if (!st || !PHASE_RULE[st.phase]) return;
    emitContext('SubagentStart', PHASE_RULE[st.phase]);
  }
}
```

If Task 1's probe showed subagents carry a **different** `session_id`, add the
fallback inside the `subagent` branch before giving up:

```javascript
    // ponystack: SubagentStart carries its own session_id, so fall back to the
    // newest parent state file. Upgrade path: drop this if the payload ever
    // exposes parent_session_id.
    if (!st) {
      try {
        const dir = os.tmpdir();
        const newest = fs.readdirSync(dir)
          .filter((f) => /^ponystack-.*\.json$/.test(f))
          .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
          .filter((x) => Date.now() - x.m < 5 * 60 * 1000)
          .sort((a, b) => b.m - a.m)[0];
        if (newest) st = JSON.parse(fs.readFileSync(path.join(dir, newest.f), 'utf8'));
      } catch (e) { return; }
    }
```

(Change `const st` to `let st` in that branch if you add this.)

**Step 3: Verify nothing regressed**

Run: `npm test`
Expected: PASS. `main` is not unit tested; the pure functions under it are.

**Step 4: Manual sanity check of each mode**

```bash
cd ~/repos/ponystack
echo '{"prompt":"/office-hours","session_id":"smoke1"}' | node hooks/ponystack-hook.js prompt
echo ""
cat "$(node -e 'console.log(require("os").tmpdir())')/ponystack-smoke1.json"
echo ""
echo '{"session_id":"smoke1","tool_input":{"file_path":"src/a.js"}}' | node hooks/ponystack-hook.js pretool
echo ""
echo '{"session_id":"smoke1","agent_type":"Explore"}' | node hooks/ponystack-hook.js subagent
```

Expected, in order:
1. The understand rule as raw text.
2. `{"phase":"understand","latched":false}`
3. A JSON object containing `"permissionDecision":"defer"` and the implement rule.
4. A JSON object containing the **understand** rule, because the phase is inherited
   from the parent turn and the latch does not change it.

Then confirm the latch holds:

```bash
echo '{"session_id":"smoke1","tool_input":{"file_path":"src/b.js"}}' | node hooks/ponystack-hook.js pretool
```
Expected: **no output at all**. Already latched.

And confirm prose is exempt:

```bash
echo '{"prompt":"/autoplan","session_id":"smoke2"}' | node hooks/ponystack-hook.js prompt >/dev/null
echo '{"session_id":"smoke2","tool_input":{"file_path":"docs/plans/x.md"}}' | node hooks/ponystack-hook.js pretool
```
Expected: **no output**. This is the autoplan case.

Clean up: `rm -f "$(node -e 'console.log(require("os").tmpdir())')"/ponystack-smoke*.json`

**Step 5: Commit**

```bash
git add hooks/ponystack-hook.js
git commit -m "feat: pretool and subagent dispatch modes

PreToolUse escalates to the implement rule the first time real code is
written in a turn the router sent elsewhere. SubagentStart hands the
parent turn's phase to Task-spawned agents, which currently get ponytail's
ladder and no ponystack counterweight at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire the hooks

**Files:**
- Modify: `hooks/hooks.json`
- Test: `tests/hooks.test.js:42-48`

**Step 1: Write the failing test**

Replace the assertion on line 47:

```javascript
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'SubagentStart']) {
    assert.ok(hooks.hooks[ev], `${ev} wired`);
  }
  const pre = hooks.hooks.PreToolUse[0];
  assert.equal(pre.matcher, 'Edit|Write|NotebookEdit', 'PreToolUse is scoped to writes');
  const cmds = JSON.stringify(hooks.hooks);
  for (const m of ['session', 'prompt', 'pretool', 'subagent']) {
    assert.ok(cmds.includes(`ponystack-hook.js\\" ${m}`), `${m} mode dispatched`);
  }
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `PreToolUse wired`.

**Step 3: Add the two entries**

Add to `hooks/hooks.json` inside `"hooks"`, following the existing entries' shape
exactly (the `command -v node` guard and `commandWindows` variant are not optional):

```json
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "command -v node >/dev/null 2>&1 && node \"${CLAUDE_PLUGIN_ROOT}/hooks/ponystack-hook.js\" pretool || exit 0",
            "commandWindows": "if (Get-Command node -ErrorAction SilentlyContinue) { node \"$env:CLAUDE_PLUGIN_ROOT\\hooks\\ponystack-hook.js\" pretool }",
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "command -v node >/dev/null 2>&1 && node \"${CLAUDE_PLUGIN_ROOT}/hooks/ponystack-hook.js\" subagent || exit 0",
            "commandWindows": "if (Get-Command node -ErrorAction SilentlyContinue) { node \"$env:CLAUDE_PLUGIN_ROOT\\hooks\\ponystack-hook.js\" subagent }",
            "timeout": 5
          }
        ]
      }
    ]
```

No `statusMessage` on these two. The existing hooks have one because they run once per
turn; `PreToolUse` runs before every file write and a spinner message on each would be
noise.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all PASS.

**Step 5: Commit**

```bash
git add hooks/hooks.json tests/hooks.test.js
git commit -m "feat: wire PreToolUse and SubagentStart hooks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Live smoke test

Payload shapes and context delivery cannot be unit tested. This is the only way to
know the feature works.

**Step 1: Install the branch into the plugin cache**

```bash
cd ~/repos/ponystack
cp hooks/ponystack-hook.js hooks/hooks.json \
   ~/.claude/plugins/cache/ponystack/ponystack/0.1.0/hooks/
```

**Step 2: Start a fresh Claude Code session** (hooks load at session start).

**Step 3: Verify the neutral default**

Type: `what is 2 + 2?`
Expected: the `UserPromptSubmit` hook line reads
`PONYSTACK PHASE: neutral`. Before this change it read `implement`.

**Step 4: Verify escalation**

Type: `/office-hours` and let it route to understand, then in the same session ask it
to make a small edit to a real source file.
Expected: the understand rule on the prompt, then the implement ladder appearing as
`PreToolUse` context at the first `Edit`. A second edit in the same turn produces
nothing.

**Step 5: Verify the autoplan case**

Trigger any turn that routes to understand and writes only a `.md` file.
Expected: no escalation.

**Step 6: Verify subagent inheritance**

In an understand-routed turn, have it dispatch a subagent.
Expected: the subagent receives the understand rule. Confirm against Task 1's finding.

**Step 7: Record results**

If anything fails, stop and report which step. Do not proceed to Task 10.

---

## Task 10: Documentation

**Files:**
- Modify: `README.md`, `SPEC.md`, `commands/ponystack.toml`

**Step 1: Update the phase table in `README.md` and `SPEC.md`**

Both describe a three-phase router. Add `neutral`, and document that the phase now
escalates mid-turn on a code write and is inherited by subagents.

**Step 2: Fix `commands/ponystack.toml`**

Its prompt lists three phases. Add neutral and state that the argument now genuinely
forces the phase, which it did not before.

**Step 3: Run the full suite one last time**

Run: `npm test`
Expected: all PASS.

**Step 4: Commit and push**

```bash
git add README.md SPEC.md commands/ponystack.toml
git commit -m "docs: four-phase router, mid-turn escalation, subagent inheritance

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/phase-router
```

---

## Known follow-ups, deliberately not in this plan

- **The prose regexes still contain command alternations.** They are now dead weight
  since the table resolves first, and they carry a pre-existing bug: "add a review
  button" routes to review, not implement. Stripping the command names from
  `PROSE_RULES` is a separate, testable change. The design said keep them unchanged;
  this is the note that says why you might not want to forever.
- **Bash-written files do not escalate.** Claude Code writes code through
  `Edit`/`Write` overwhelmingly. A write-pattern heuristic over arbitrary shell is
  speculative until observed failing.
- **Per-`agent_type` subagent routing.** Ponytail's `PONYTAIL_SUBAGENT_MATCHER` shows
  the refinement is available if phase inheritance proves too blunt.
- **Codex and Copilot adapters.** Claude Code only, as today.
