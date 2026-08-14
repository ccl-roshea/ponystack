// Routing corpus: the ground truth for what phase a prompt SHOULD get.
//
// Read this before trusting a number out of routing.js:
//
// The `commands` section encodes the same intended mapping as COMMAND_PHASE in
// the hook. The current implementation therefore scores near-100% on it BY
// CONSTRUCTION, and that number is not evidence the design is right. What it
// does measure honestly is the OLD router, which had no such table — that score
// is the size of the bug, and the delta is the point.
//
// The `prose`, `robustness`, and `override` sections are not circular. They are
// written from what a developer would expect, not from the implementation.
//
// `expectMiss: true` marks a case the CURRENT implementation gets wrong on
// purpose. Do not delete them to make the score prettier. A benchmark you
// always score 100% on has stopped measuring anything.
//
// This list is deliberately an INDEPENDENT transcription from the one in
// tests/hooks.test.js. Two hand-written lists cross-check each other; a typo in
// either shows up as a disagreement rather than as silent agreement.

// Section 1: gstack commands. Circular for the new hook, diagnostic for the old.
const commands = [
  // understand — plan, design, research, diagnose. No code yet.
  ['/office-hours', 'understand'], ['/spec', 'understand'], ['/autoplan', 'understand'],
  ['/plan-ceo-review', 'understand'], ['/plan-design-review', 'understand'],
  ['/plan-devex-review', 'understand'], ['/plan-eng-review', 'understand'],
  ['/design-consultation', 'understand'], ['/design-shotgun', 'understand'],
  ['/investigate', 'understand'], ['/retro', 'understand'], ['/writing-plans', 'understand'],
  // review — critique something that already exists.
  ['/review', 'review'], ['/qa', 'review'], ['/qa-only', 'review'],
  ['/design-review', 'review'], ['/devex-review', 'review'], ['/canary', 'review'],
  ['/benchmark', 'review'], ['/codex', 'review'], ['/cso', 'review'], ['/health', 'review'],
  ['/ios-design-review', 'review'], ['/ios-qa', 'review'], ['/ponystack-contract', 'review'],
  // implement — writes code.
  ['/ship', 'implement'], ['/land-and-deploy', 'implement'], ['/setup-deploy', 'implement'],
  ['/design-html', 'implement'], ['/ios-fix', 'implement'], ['/ios-clean', 'implement'],
  ['/ios-sync', 'implement'], ['/skillify', 'implement'],
  // neutral — ops, tooling, prose. The ladder governs code, not these.
  ['/browse', 'neutral'], ['/connect-chrome', 'neutral'], ['/scrape', 'neutral'],
  ['/careful', 'neutral'], ['/freeze', 'neutral'], ['/guard', 'neutral'],
  ['/unfreeze', 'neutral'], ['/context-save', 'neutral'], ['/context-restore', 'neutral'],
  ['/learn', 'neutral'], ['/gstack-upgrade', 'neutral'], ['/sync-gbrain', 'neutral'],
  ['/setup-gbrain', 'neutral'], ['/document-generate', 'neutral'],
  ['/document-release', 'neutral'], ['/make-pdf', 'neutral'], ['/diagram', 'neutral'],
  ['/landing-report', 'neutral'], ['/ponystack-ratio', 'neutral'],
].map(([prompt, expect]) => ({ prompt, expect }));

// Section 2: natural language. Written from developer intent, not from the code.
const prose = [
  { prompt: 'how should we structure the auth flow', expect: 'understand' },
  { prompt: 'what are the trade-offs between redis and postgres here', expect: 'understand' },
  { prompt: "let's plan the migration", expect: 'understand' },
  { prompt: 'figure out why the build got slow', expect: 'understand' },
  { prompt: 'root cause the 500s on checkout', expect: 'understand' },

  { prompt: 'implement the parser', expect: 'implement' },
  { prompt: 'add a logout button', expect: 'implement' },
  { prompt: 'fix the null deref in the session handler', expect: 'implement' },
  { prompt: 'refactor this module', expect: 'implement' },
  { prompt: 'write a function that sorts by date', expect: 'implement' },

  { prompt: 'review this diff', expect: 'review' },
  { prompt: 'what can we delete here', expect: 'review' },
  { prompt: 'is this over-engineered?', expect: 'review' },

  // The class the old default got wrong: ordinary conversation. Under the old
  // router every one of these fell through to implement and got the ladder.
  { prompt: 'tell me a joke', expect: 'neutral' },
  { prompt: 'what time is it', expect: 'neutral' },
  { prompt: 'what about ponytail?', expect: 'neutral' },
  { prompt: 'does ponystack run automatically when installed?', expect: 'neutral' },
  { prompt: 'I restarted claude', expect: 'neutral' },
  { prompt: 'thanks, that worked', expect: 'neutral' },
  { prompt: 'which one do you recommend', expect: 'neutral' },
];

// Section 3: the shapes that actually broke. Not circular — these are the bug
// reports, written as cases.
const robustness = [
  { prompt: '/devex-review', expect: 'review', why: 'hyphen defeated the old anchored regex' },
  { prompt: '/devex-review?', expect: 'review', why: 'trailing punctuation' },
  { prompt: '/ios-qa,', expect: 'review', why: 'trailing comma' },
  { prompt: '/QA-ONLY', expect: 'review', why: 'casing' },
  { prompt: '@office-hours', expect: 'understand', why: 'alternate sigil' },
  { prompt: '$ship', expect: 'implement', why: 'alternate sigil' },
  { prompt: '/superpowers:brainstorming an idea', expect: 'understand', why: 'plugin namespace' },
  { prompt: '/plan-foo-review', expect: 'understand', why: 'suffix rule: plan review' },
  { prompt: '/plan-review', expect: 'understand', why: 'suffix rule: no middle segment' },
  { prompt: '/foo-review', expect: 'review', why: 'suffix rule: code review' },
  { prompt: '/some-brand-new-skill', expect: 'neutral', why: 'unknown degrades to no opinion' },
  { prompt: '/constructor', expect: 'neutral', why: 'prototype key must not be a phase' },
  { prompt: '/__proto__', expect: 'neutral', why: 'prototype key must not be a phase' },
  // The sigil gate: 21 table keys are ordinary English words.
  { prompt: 'learn how to add a logout button', expect: 'implement', why: 'bare prose, not /learn' },
  { prompt: 'browse the docs then implement the client', expect: 'implement', why: 'bare prose, not /browse' },
  { prompt: 'scrape that page and write a parser', expect: 'implement', why: 'bare prose, not /scrape' },

  // Known misses. Kept deliberately; see the header.
  { prompt: 'please run /design-html now', expect: 'implement', expectMiss: true,
    why: 'command not first token, so the table is never consulted' },
  { prompt: 'plan-tune the question sensitivity', expect: 'neutral', expectMiss: true,
    why: 'caught by the generic plan- pattern; accepted, narrowing it would break "what is the plan"' },
];

// Section 4: the documented override, which never worked before this branch.
const override = [
  { prompt: '/ponystack understand', expect: 'understand' },
  { prompt: '/ponystack implement', expect: 'implement' },
  { prompt: '/ponystack review', expect: 'review' },
  { prompt: '/ponystack neutral', expect: 'neutral' },
  { prompt: '/ponystack UNDERSTAND', expect: 'understand', why: 'casing' },
  { prompt: '/ponystack:ponystack review', expect: 'review', why: 'namespaced' },
  { prompt: '/ponystack understand, then implement the fix', expect: 'understand',
    why: 'punctuation used to invert this to implement off the user own words' },
  { prompt: '/ponystack banana', expect: 'neutral', why: 'junk argument is not a phase' },
  { prompt: '/ponystack', expect: 'neutral', why: 'bare invocation reports, does not force' },
];

// Escalation corpus, scored against shouldEscalate. A router that only reads the
// prompt cannot do this at all, which is the point: the old hook scores 0 by
// absence, not by being wrong.
const escalation = [
  { phase: 'understand', latched: false, file: 'src/api.js', expect: true,
    why: 'the guess was wrong; real code is being written' },
  { phase: 'review', latched: false, file: 'src/api.js', expect: true,
    why: '/qa is "QA and fix bugs found"' },
  { phase: 'neutral', latched: false, file: 'Makefile', expect: true,
    why: 'build config is code' },
  { phase: 'neutral', latched: false, file: '.env', expect: true },
  { phase: 'implement', latched: false, file: 'src/api.js', expect: false,
    why: 'ladder already in context' },
  { phase: 'understand', latched: true, file: 'src/api.js', expect: false,
    why: 'fires once per turn, not per edit' },
  { phase: 'understand', latched: false, file: 'docs/plans/2026-08-13-design.md', expect: false,
    why: 'THE autoplan case: its only write is the plan markdown' },
  { phase: 'understand', latched: false, file: 'README.md', expect: false },
  { phase: 'understand', latched: false, file: 'NOTES.txt', expect: false },
  { phase: 'understand', latched: false, file: 'guide.rst', expect: false },
  { phase: 'understand', latched: false, file: '/home/x/.gstack/projects/p/plan.json', expect: false },
  { phase: 'understand', latched: false, file: '.claude/plans/current.json', expect: false },
  { phase: 'understand', latched: false, file: '', expect: false, why: 'no path, no judgement' },
  { phase: null, latched: false, file: 'src/api.js', expect: false, why: 'no state, no guess' },
];

module.exports = {
  routing: [
    { name: 'commands', circular: true, cases: commands },
    { name: 'prose', circular: false, cases: prose },
    { name: 'robustness', circular: false, cases: robustness },
    { name: 'override', circular: false, cases: override },
  ],
  escalation,
};
