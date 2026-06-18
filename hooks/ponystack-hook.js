#!/usr/bin/env node
// ponystack - the membrane between an expensive brain and cheap hands.
//
// One file, two hook entries (dispatched by argv[2]):
//   session  → SessionStart: emit the membrane doctrine once.
//   prompt   → UserPromptSubmit: detect the work PHASE and emit the rule that
//              governs the lazy senior for this turn (Seam 1: PHASE-ROUTER).
//
// Phase routing is the whole trick: gstack and ponytail both want to inject
// rules every turn and would contradict each other. The router mutes whichever
// one is wrong for the current phase.
//   understand/plan/design/research → senior SILENT  (boil the lake; gstack)
//   implement                       → senior MAX     (the ladder; ponytail)
//   review                          → BOTH           (bugs + a delete-list)
//
// Claude Code only for now: the hook writes plain text to stdout, which Claude
// Code injects as context. ponystack: codex/copilot adapters are a later port.

// --- Seam 1: phase detection -------------------------------------------------
// Ordered, first match wins. understand BEFORE review so a plan review
// (/plan-ceo-review) routes to planning, not code review; review BEFORE
// implement so "review this diff" never reads as "implement".
const PHASE_RULES = [
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

function detectPhase(prompt) {
  const p = String(prompt || '');
  for (const { phase, re } of PHASE_RULES) if (re.test(p)) return phase;
  // ponystack: default to membrane-on. The ladder governs built CODE, not
  // prose, so a plain question in "implement" phase still answers freely.
  return 'implement';
}

// --- the rule emitted per phase ---------------------------------------------
const PHASE_RULE = {
  understand:
    'PONYSTACK PHASE: understand - boil the lake. Think wide and deep: ' +
    'decompose, plan, research, weigh trade-offs. The lazy senior is SILENT ' +
    'this turn. Spend reasoning freely; do NOT write production code yet. ' +
    'Understanding is the cheap lake - boil all of it.',
  implement:
    'PONYSTACK PHASE: implement - lazy senior at MAX. Before any code climb ' +
    'the ladder, stop at the first rung that holds: 1) does it need to exist ' +
    '(YAGNI) 2) stdlib 3) native platform feature 4) installed dependency ' +
    '5) one line 6) the minimum that works. No unrequested abstractions, no ' +
    'speculative scaffolding, fewest files, shortest working diff. Mark ' +
    'deliberate shortcuts with a `ponystack:` comment naming the upgrade path. ' +
    'Never cut: trust-boundary validation, data-loss handling, security, ' +
    'accessibility. Non-trivial logic leaves ONE runnable check behind.',
  review:
    'PONYSTACK PHASE: review - both critics run. 1) correctness/security/ ' +
    'perf bugs. 2) a delete-list (Seam 2 contract): every reinvented stdlib, ' +
    'speculative abstraction, dead flexibility, one-caller layer. One line per ' +
    'finding: location, what to cut, what replaces it. End with ' +
    '`net: -N lines possible.` This is the membrane closing on a wide pass.',
};

// --- the always-on doctrine (SessionStart) ----------------------------------
function membraneDoctrine() {
  return [
    'PONYSTACK ACTIVE - the membrane between an expensive brain and cheap hands.',
    '',
    'Central rule: Boil the lake to understand it. Do NOT pour it into your code.',
    'Think expensive, write cheap. Cost of THINKING is near-zero - spend it.',
    'Cost of CODE is never zero - every line is bug surface, read tax, future',
    'deletion. Maxing understanding is right; maxing output is the leak.',
    '',
    'A phase router (every turn) switches the lazy senior by work phase:',
    '  understand / plan / design / research → senior SILENT (boil the lake)',
    '  implement                             → senior MAX (the ladder, YAGNI)',
    '  review                                → BOTH (bugs + a delete-list)',
    'Each parent governs only the phase where it is right; the other is muted.',
    '',
    'Any thorough pass ends with a mandatory contract gate: you generated',
    'breadth, now cut it to the minimum that works (run /ponystack-contract).',
    'Never simplify away: trust-boundary validation, error handling that',
    'prevents data loss, security, accessibility. Those are the floor, not debt.',
  ].join('\n');
}

// --- main --------------------------------------------------------------------
function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.on('data', (c) => { input += c; });
    process.stdin.on('end', () => resolve(input));
    // ponystack: don't hang if nothing pipes in. unref so a normal end-of-input
    // exits now instead of waiting out this guard.
    setTimeout(() => resolve(input), 250).unref();
  });
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'session') {
    process.stdout.write(membraneDoctrine());
    return;
  }
  if (mode === 'prompt') {
    let prompt = '';
    try {
      const raw = (await readStdin()).replace(/^﻿/, '');
      prompt = raw ? (JSON.parse(raw).prompt || '') : '';
    } catch (e) { /* ponystack: bad/empty stdin → default phase */ }
    process.stdout.write(PHASE_RULE[detectPhase(prompt)]);
  }
}

if (require.main === module) main();

module.exports = { detectPhase, membraneDoctrine, PHASE_RULE };
