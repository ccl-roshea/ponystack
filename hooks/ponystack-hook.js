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
// Resolution order: exact command lookup -> suffix rules -> prose regex -> neutral.
// The lookup replaces regex alternation because alternation is what produced the
// bugs: /devex-review missed on a hyphen, since the review pattern anchored on
// (^|\s)[/@]?review. The /ponystack <phase> override is NOT handled here yet;
// it still inverts itself, and Task 3 owns that fix.

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
// The sigil is REQUIRED: 21 table keys are ordinary English words, so matching
// bare prose against the table would route "learn how to add X" to neutral and
// mute the ladder mid-implementation. Prose returns '' and falls to PROSE_RULES.
function normalizeCommand(prompt) {
  const first = String(prompt || '').trim().split(/\s+/)[0] || '';
  if (!/^[/@$]/.test(first)) return '';
  // ponystack: also strips trailing punctuation ("/devex-review?"), which
  // otherwise defeats the lookup for exactly the commands this change fixed.
  return first.slice(1).replace(/[^\w:-]+$/, '').split(':').pop().toLowerCase();
}

function detectPhase(prompt) {
  const p = String(prompt || '');
  const cmd = normalizeCommand(p);

  if (Object.hasOwn(COMMAND_PHASE, cmd)) return COMMAND_PHASE[cmd];

  // Suffix rules so new gstack skills route without a table edit. plan-*-review
  // is a PLAN review (understand), everything else ending in -review is a code
  // review. Order matters: understand before review so a plan review is not read
  // as a code review.
  // ponystack: naive heuristic. Ceiling: it only sees names ending in -review, so
  // a new skill named anything else is invisible and falls through to neutral.
  // Upgrade path: add that skill to COMMAND_PHASE.
  if (/^plan-(.*-)?review$/.test(cmd)) return 'understand';
  if (/-review$/.test(cmd)) return 'review';

  for (const { phase, re } of PROSE_RULES) if (re.test(p)) return phase;

  // Unknown lands on neutral, not implement. When gstack ships a new skill the
  // failure mode is "one short line and no opinion", not "code ladder applied to
  // a strategy review".
  return 'neutral';
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
