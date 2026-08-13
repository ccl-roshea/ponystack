// The one runnable check the ladder demands: the phase router routes, and every
// manifest is valid JSON. Run: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectPhase, membraneDoctrine, PHASE_RULE,
  statePath, readState, writeState } = require('../hooks/ponystack-hook.js');

const root = path.join(__dirname, '..');

test('phase router: understand/plan/design/research', () => {
  for (const p of ['/plan-ceo-review the auth flow', '/office-hours', '/spec a billing system',
    '/investigate the 500s', '/design-consultation', 'how should we structure this?',
    "let's plan the migration", 'what are the trade-offs here']) {
    assert.equal(detectPhase(p), 'understand', `expected understand for: ${p}`);
  }
});

test('phase router: review (code review, not plan review)', () => {
  for (const p of ['/review', '/qa the checkout', '/code-review', '/design-review',
    '/ponystack-contract', 'review this diff', 'what can we delete here', 'is this over-engineered?']) {
    assert.equal(detectPhase(p), 'review', `expected review for: ${p}`);
  }
});

test('phase router: implement (prose) and neutral default', () => {
  for (const p of ['/ship', 'implement the parser', 'add a logout button', 'fix the null deref',
    'refactor this module', 'write a function that sorts', 'create the migration']) {
    assert.equal(detectPhase(p), 'implement', `expected implement for: ${p}`);
  }
  assert.equal(detectPhase(''), 'neutral', 'empty defaults to neutral');
  assert.equal(detectPhase('tell me a joke'), 'neutral', 'unknown defaults to neutral');
  assert.equal(detectPhase('what about ponytail?'), 'neutral', 'plain question is neutral');
});

test('every phase has a rule and the doctrine names the membrane', () => {
  for (const phase of ['understand', 'implement', 'review', 'neutral']) {
    assert.ok(PHASE_RULE[phase] && PHASE_RULE[phase].includes('PONYSTACK PHASE'), phase);
  }
  assert.ok(membraneDoctrine().includes('Boil the lake to understand it'));
});

test('manifests and hooks are valid JSON', () => {
  for (const f of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'hooks/hooks.json']) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')), f);
  }
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8'));
  assert.ok(hooks.hooks.SessionStart && hooks.hooks.UserPromptSubmit, 'both hook events wired');
});

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

test('phase router: prototype keys are not phases', () => {
  for (const evil of ['constructor', '__proto__', 'toString', 'valueOf',
    'hasOwnProperty', 'isPrototypeOf']) {
    const got = detectPhase('/' + evil);
    assert.equal(typeof got, 'string', `/${evil} returned ${typeof got}`);
    assert.ok(['understand', 'implement', 'review', 'neutral'].includes(got),
      `/${evil} -> ${got}`);
  }
});

test('phase router: suffix rules catch commands absent from the table', () => {
  // Reached only when the table misses, which is the whole point of them.
  assert.equal(detectPhase('/plan-foo-review'), 'understand');  // rule 1 wins
  assert.equal(detectPhase('/plan-review'), 'understand');      // no middle segment
  assert.equal(detectPhase('/foo-review'), 'review');           // rule 2
  assert.equal(detectPhase('/security-review'), 'review');
  assert.equal(detectPhase('/some-brand-new-skill'), 'neutral');
});

test('phase router: bare prose is not looked up as a command', () => {
  assert.equal(detectPhase('learn how to add a logout button'), 'implement');
  assert.equal(detectPhase('freeze the schema and add a migration'), 'implement');
  assert.equal(detectPhase('scrape that page and write a parser'), 'implement');
  assert.equal(detectPhase('browse the docs then implement the client'), 'implement');
  // Prose carrying no verb the implement regex covers lands on neutral. That is
  // the new default doing its job, not the sigil gate failing: under the old
  // router these reached implement via the old implement DEFAULT, not by match.
  // Task 6's escalation still hands them the ladder on the first code edit.
  assert.equal(detectPhase('guard against null in the parser'), 'neutral');
  assert.equal(detectPhase('careful now, delete the old module'), 'neutral');
  // Prose that legitimately reads as review still routes there.
  assert.equal(detectPhase('review this diff'), 'review');
  // A bare command name still works via the prose alternations.
  assert.equal(detectPhase('office-hours'), 'understand');
});

test('phase router: trailing punctuation does not defeat the lookup', () => {
  assert.equal(detectPhase('/devex-review?'), 'review');
  assert.equal(detectPhase('/ios-qa,'), 'review');
  assert.equal(detectPhase('/office-hours.'), 'understand');
  assert.equal(detectPhase('/superpowers:brainstorming!'), 'understand');
});

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
  // The sibling commands are not the override.
  assert.equal(detectPhase('/ponystack-contract'), 'review');
  assert.equal(detectPhase('/ponystack-ratio'), 'neutral');
  // Ordering: the override must beat the PROSE rules, not just the table. This
  // is the only assertion here that fails if the block is moved down.
  assert.equal(detectPhase('/ponystack understand how to build the parser'), 'understand');
  assert.equal(detectPhase('/ponystack understand, then implement the fix'), 'understand');
  assert.equal(detectPhase('/ponystack neutral fix the crash and ship it'), 'neutral');
});

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
    '/etc/shadow', 'a/b/c', '..', '', null, undefined]) {
    const p = statePath(evil);
    assert.ok(p.startsWith(os.tmpdir() + path.sep), `escaped tmpdir: ${evil} -> ${p}`);
    assert.ok(!p.includes('..'), `traversal survived: ${evil} -> ${p}`);
  }
});

test('state: a corrupt state file reads as null, not a throw', () => {
  const sid = 'corrupt-' + process.pid;
  fs.writeFileSync(statePath(sid), 'not json at all {{{');
  assert.equal(readState(sid), null);
  fs.writeFileSync(statePath(sid), 'null');
  assert.equal(readState(sid), null, 'literal null is not an object');
  fs.writeFileSync(statePath(sid), '"a string"');
  assert.equal(readState(sid), null, 'a bare string is not state');
  fs.unlinkSync(statePath(sid));
});

test('hook: every phase emits its rule without crashing', () => {
  const { execFileSync } = require('child_process');
  const hook = path.join(root, 'hooks/ponystack-hook.js');
  for (const [prompt, phase] of [['/office-hours', 'understand'], ['/ship', 'implement'],
    ['/review', 'review'], ['tell me a joke', 'neutral'], ['', 'neutral']]) {
    // execFileSync throws on a non-zero exit, so a crashing hook fails here.
    const out = execFileSync('node', [hook, 'prompt'],
      { input: JSON.stringify({ prompt, session_id: 'test' }), encoding: 'utf8' });
    assert.ok(out.includes('PONYSTACK PHASE: ' + phase),
      `${JSON.stringify(prompt)} -> ${JSON.stringify(out.slice(0, 60))}`);
  }
});
