// Checks for the A/B harness. The metric tests are the mutation-check subject:
// they must FAIL against a detector that cannot see the ladder (see the results
// file for the recorded run). Run: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { ladder, verdict, lengthVerdict } = require('../benchmarks/ab-metrics.js');
const { ARMS, PONYTAIL, build, bytes } = require('../benchmarks/ab-arms.js');
const { UNDERSTAND, HARD } = require('../benchmarks/run-ab.js');
const hook = path.join(__dirname, '..', 'hooks', 'ponystack-hook.js');

// Synthetic: a plan review that applies the ponytail ladder to a PLAN. This is the conflict.
const LADDER_HEAVY = `Verdict: this plan is over-built. YAGNI applies to most of it.
1. Does the admin UI need to exist? No - cut it from v1; replay failed deliveries with a one-line SQL update.
2. Use the standard library retry loop instead of a custom backoff framework; skip the schema registry entirely.
3. The shortest working diff is HMAC signing plus a single retry. No speculative abstractions, no config options.
net: -1400 lines possible.`;

// Synthetic: a thorough plan review that boils the lake and cuts nothing.
const LAKE_BOILED = `Architecture: events flow producer -> outbox table -> dispatcher -> HTTP client. Failure modes:
receiver 5xx, slow receiver holding a worker, clock skew breaking HMAC timestamps, duplicate delivery after a crash.
Each needs idempotency keys and a test. Riskiest part: the dispatcher's at-least-once guarantee under restarts.
Sequencing: outbox first, then signing, then retries, then the replay tooling. Test plan: a chaos test per failure mode.`;

test('metric: ladder-heavy understand reply scores as ladder applied', () => {
  const r = ladder(LADDER_HEAVY);
  assert.equal(r.applied, true, `hits: ${r.hits}`);
  assert.ok(r.score >= 4, `expected >= 4 families, got ${r.score}: ${r.hits}`);
});

// Excerpt in the style of a real arm-A reply from the first live run (paraphrase, no stock phrases).
test('metric: plain-words scope cut is detected (post-hoc recall fix)', () => {
  const r = ladder("The plan is sound, but it's about 40% too big for 300 customers. Cut the schema registry, and build the rest in stages.");
  assert.equal(r.applied, true, `hits: ${r.hits}`);
});

test('metric: a thorough reply with no cuts is NOT ladder applied', () => {
  assert.equal(ladder(LAKE_BOILED).applied, false);
});

test('metric: a single ordinary "defer" is below the threshold', () => {
  assert.equal(ladder('Defer the dashboard for now; everything else stays.').applied, false);
});

test('verdict: B like C and implement not worse -> keep', () => {
  const v = verdict({ A: 3, B: 0.5, C: 0.4 }, { A: { loc: 100, ok: 0.9 }, B: { loc: 105, ok: 0.9 } });
  assert.deepEqual([v.understand, v.keep], ['like-C', true]);
});
test('verdict: B like A -> not keep; A~C -> inconclusive', () => {
  assert.equal(verdict({ A: 3, B: 2.8, C: 0.4 }, { A: { loc: 100, ok: 1 }, B: { loc: 90, ok: 1 } }).understand, 'like-A');
  assert.equal(verdict({ A: 0.6, B: 0.5, C: 0.4 }, { A: { loc: 1, ok: 1 }, B: { loc: 1, ok: 1 } }).understand, 'inconclusive');
  assert.equal(verdict({ A: 3, B: 0.5, C: 0.4 }, { A: { loc: 100, ok: 1 }, B: { loc: 120, ok: 1 } }).keep, false);
});

test('verdict: understand-only run (no implement data) does not crash and does not claim keep', () => {
  const v = verdict({ A: 3, B: 0.5, C: 0.4 }, null);
  assert.deepEqual([v.understand, v.implementNotWorse, v.keep], ['like-C', null, null]);
});

test('lengthVerdict: recovered share maps to like-C / partial / like-A, and needs a real gap', () => {
  assert.equal(lengthVerdict({ A: 4000, B: 6500, C: 7000 }).position, 'like-C');
  assert.equal(lengthVerdict({ A: 4000, B: 5500, C: 7000 }).position, 'partial');
  assert.equal(lengthVerdict({ A: 4000, B: 4400, C: 7000 }).position, 'like-A');
  assert.equal(lengthVerdict({ A: 6500, B: 7000, C: 7000 }).position, 'inconclusive');  // ladder barely compressed
});

test('arms: each arm injects exactly its parts, and the router sees understand prompts as understand', () => {
  const p = UNDERSTAND[0].prompt;
  const has = (arm, s) => build(arm, p)[0].content.includes(s);
  assert.deepEqual(['A', 'B', 'C', 'D'].map((a) => has(a, 'PONYTAIL MODE ACTIVE')), [true, true, false, false]);
  assert.deepEqual(['A', 'B', 'C', 'D'].map((a) => has(a, 'PONYSTACK ACTIVE')), [false, true, true, false]);
  for (const u of [...UNDERSTAND, ...HARD]) assert.equal(bytes('C', u.prompt).phase, 'understand', u.id);
  assert.equal(bytes('D', p).session, 0);
  assert.equal(Object.keys(ARMS).length, 4);
});

test('arms: ponystack text equals what the real hook prints (no drift)', () => {
  const p = UNDERSTAND[0].prompt;
  const sess = execFileSync('node', [hook, 'session']).toString();
  const turn = execFileSync('node', [hook, 'prompt'], { input: JSON.stringify({ prompt: p, session_id: 'ab-test' }) }).toString();
  const msg = build('C', p)[0].content;
  assert.ok(msg.includes(sess) && msg.includes(turn));
  assert.equal(bytes('C', p).session, Buffer.byteLength(sess));
  assert.equal(bytes('A', p).session, Buffer.byteLength(PONYTAIL));
  try { require('fs').unlinkSync(require('../hooks/ponystack-hook.js').statePath('ab-test')); } catch (e) { /* none */ }
});
