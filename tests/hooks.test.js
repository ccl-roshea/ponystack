// The one runnable check the ladder demands: the phase router routes, and every
// manifest is valid JSON. Run: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { detectPhase, membraneDoctrine, PHASE_RULE } = require('../hooks/ponistack-hook.js');

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
    '/ponistack-contract', 'review this diff', 'what can we delete here', 'is this over-engineered?']) {
    assert.equal(detectPhase(p), 'review', `expected review for: ${p}`);
  }
});

test('phase router: implement (and default)', () => {
  for (const p of ['/ship', 'implement the parser', 'add a logout button', 'fix the null deref',
    'refactor this module', 'write a function that sorts', 'create the migration']) {
    assert.equal(detectPhase(p), 'implement', `expected implement for: ${p}`);
  }
  assert.equal(detectPhase(''), 'implement', 'empty defaults to implement');
  assert.equal(detectPhase('tell me a joke'), 'implement', 'unknown defaults to implement');
});

test('every phase has a rule and the doctrine names the membrane', () => {
  for (const phase of ['understand', 'implement', 'review']) {
    assert.ok(PHASE_RULE[phase] && PHASE_RULE[phase].includes('PONISTACK PHASE'), phase);
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
