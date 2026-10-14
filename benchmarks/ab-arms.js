// A/B arms for "ponystack running alongside the real ponytail plugin".
//   A  ponytail ruleset only          (ponytail SessionStart)
//   B  ponytail + ponystack           (what the deployed stack injects)
//   C  ponystack alone
//   D  nothing                        (baseline)
//
// Hook text is NOT re-typed here. ponystack's strings come from the hook's own
// exports; ponytail's is a verbatim capture of its v5.2.0 SessionStart output
// (ab/ponytail-v5.2.0-session.txt, MIT, Dietrich Gebert; steady state, mode
// full, no codebase map, no statusline nudge). A vendored capture, not a require,
// so the harness never executes third-party code.
//
// Delivery mimics Claude Code: hook context arrives as <system-reminder> blocks in
// the user turn, SessionStart before the prompt, UserPromptSubmit right before it.
// ponystack: single-shot, so no Claude Code system prompt, tools, or gstack skill
// body. Upgrade path: drive `claude -p` with the real plugins installed.

const fs = require('fs');
const path = require('path');
const ps = require('../hooks/ponystack-hook.js');

const PONYTAIL = fs.readFileSync(path.join(__dirname, 'ab', 'ponytail-v5.2.0-session.txt'), 'utf8');
const ARMS = {
  A: { ponytail: true },
  B: { ponytail: true, ponystack: true },
  C: { ponystack: true },
  D: {},
};

const wrap = (event, text) => `<system-reminder>\n${event} hook additional context: ${text}\n</system-reminder>`;

// What the hooks inject, split by event. The router is exercised for real:
// the phase is detectPhase(prompt), exactly as the UserPromptSubmit hook does.
function injected(arm, prompt) {
  const a = ARMS[arm];
  const session = [], turn = [];
  if (a.ponytail) session.push(PONYTAIL);
  let phase = null;
  if (a.ponystack) {
    session.push(ps.membraneDoctrine());
    phase = ps.detectPhase(prompt);
    turn.push(ps.PHASE_RULE[phase]);
  }
  return { session, turn, phase };
}

const len = (xs) => xs.reduce((n, t) => n + Buffer.byteLength(t), 0);

function build(arm, prompt) {
  const { session, turn } = injected(arm, prompt);
  const ctx = [...session.map((t) => wrap('SessionStart', t)), ...turn.map((t) => wrap('UserPromptSubmit', t))];
  return [{ role: 'user', content: [...ctx, prompt].join('\n\n') }];
}

// Raw hook-output bytes (no wrapper): once per session, and per prompt.
function bytes(arm, prompt) {
  const { session, turn, phase } = injected(arm, prompt);
  return { session: len(session), perPrompt: len(turn), phase };
}

module.exports = { ARMS, PONYTAIL, build, bytes, injected };
