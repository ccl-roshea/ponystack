#!/usr/bin/env node
// A/B: ponystack running ALONGSIDE the real ponytail plugin. See
// results/*-ponystack-with-ponytail.md for the question and decision criteria.
//
//   node benchmarks/run-ab.js --dry                    # arms + injected bytes, no API
//   ANTHROPIC_API_KEY=... node benchmarks/run-ab.js [--model claude-sonnet-5-5] [--repeat 3]
//
// Writes raw replies next to the results as <out>.raw.json (default
// results/<date>-ponystack-with-ponytail.raw.json) and prints markdown tables.
// Reuses tasks.js, loc.js and correctness.js from the doctrine benchmark.

const fs = require('fs');
const path = require('path');
const loc = require('./loc.js');
const correctness = require('./correctness.js');
const tasks = require('./tasks.js');
const { ARMS, build, bytes } = require('./ab-arms.js');
const { ladder, verdict, lengthVerdict, FAMILIES } = require('./ab-metrics.js');

// UNDERSTAND family: plan reviews in gstack's /plan-*-review style, each with
// scope a lazy senior would be tempted to cut. The router must read all three as
// understand (checked below, and again by --dry).
const UNDERSTAND = [
  { id: 'webhooks', prompt: '/plan-eng-review\n\nPlan: add outbound webhooks to our SaaS (8 engineers, ~300 customers). Scope: per-endpoint HMAC signing, exponential-backoff retries with a dead-letter queue, per-tenant rate limiting, an admin UI to replay failed deliveries, delivery metrics in Grafana, and a public event-schema registry. Review the architecture, failure modes, test coverage and sequencing.' },
  { id: 'sessions', prompt: '/plan-eng-review\n\nPlan: move our session store from in-process memory to Redis. Scope: multi-region active-active replication, a pluggable store interface so we can swap backends later, a feature flag with gradual rollout, sliding-expiry with per-route TTL config, and a migration tool that drains live sessions. Review the plan: what breaks, what is the riskiest part, what order to build it.' },
  { id: 'sso', prompt: '/plan-ceo-review\n\nPlan: we are a 12-person startup with 40 paying customers. Next quarter we want enterprise SSO (SAML + OIDC), SCIM provisioning, custom RBAC with per-resource policies, and an exportable audit log with 7-year retention. Is this the right scope and ambition? Challenge the premises and lay out the options.' },
];

// HARD set: prompts where applying the ladder is the WRONG move. Each invites
// breadth, ambition or exhaustive enumeration (and says the cost of thoroughness
// is accepted), so a baseline reviewer expands while a ladder-bound one trims
// ("does it need to exist?"). If ponytail's always-on ladder leaks into understand
// turns, it shows here; this is the set built to make the conflict bite.
// All six must route to understand (tests/ab.test.js).
const HARD = [
  { id: 'finapp', prompt: '/office-hours\n\nI want to build a personal finance app. I have six months, no deadline pressure, and I would rather be thorough than fast. Map the full space: who it is for, the wedge, three very different product directions including a bold one, and what each would take.' },
  { id: 'aiassist', prompt: '/plan-ceo-review\n\nPlan: our 40-person B2B company wants an AI assistant in the product. We can fund four engineers for a year. Think big: what is the 10x version, what are the options from conservative to ambitious, and what would make this category-defining?' },
  { id: 'billing', prompt: '/spec a billing system for a usage-based API product. I want the complete picture: metering, invoicing, proration, dunning, tax, revenue recognition, a customer portal and audit. Enumerate requirements and open questions exhaustively. We will decide what to cut later.' },
  { id: 'notify', prompt: '/plan-eng-review\n\nPlan: rebuild our notification system as an event-driven platform: email, SMS, push and in-app channels, templates, preferences, digests, per-user rate limits, delivery analytics and a pluggable provider layer. We want to do this once and do it right. Propose the full target design and enumerate every failure mode, scaling cliff and migration risk.' },
  { id: 'latency', prompt: '/investigate Our checkout p99 latency doubled last week. Do not propose fixes yet. Lay out every hypothesis across app, database, network, third parties and infrastructure, how to test each, and what evidence would tell them apart.' },
  { id: 'onboarding', prompt: '/plan-design-review\n\nPlan: redesign onboarding for a project-management tool: interactive tour, templates gallery, sample data, role-based paths, a progress checklist, in-app video and a success-metrics dashboard. Review it thoroughly: explore alternatives for each part and think through edge cases and accessibility.' },
];

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SET = arg('--set', 'default');
const FAMILY = arg('--family', 'both');              // understand | implement | both
const IDS = arg('--ids', '') ? arg('--ids', '').split(',') : null;
const PROMPTS = (SET === 'hard' ? HARD : UNDERSTAND).filter((u) => !IDS || IDS.includes(u.id));
const IDS_SUBSET = arg('--subset', '');   // report the length verdict for these ids as well
const ARM_LIST = arg('--arms', 'A,B,C,D').split(',');
const MODEL = arg('--model', 'claude-sonnet-5-5');
const REPEAT = parseInt(arg('--repeat', '3'), 10);
const DATE = new Date().toISOString().slice(0, 10);
const OUT = arg('--out', path.join(__dirname, 'results', `${DATE}-ponystack-with-ponytail${SET === 'hard' ? '.hard' : ''}.raw.json`));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

async function call(messages, tries = 4) {
  for (let k = 1; ; k++) {
    try { return await once(messages); } catch (e) {
      if (k >= tries || /^4(?!29)/.test(e.message)) throw e;  // retry network errors, 429, 5xx
      await new Promise((r) => setTimeout(r, 2000 * k));
    }
  }
}

async function once(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8192, temperature: 1, messages }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''), inTok: j.usage?.input_tokens || 0 };
}

function dry() {
  console.log('### Injected context per arm (raw hook-output bytes; excludes <system-reminder> wrappers)\n');
  console.log('| arm | prompt | phase routed | SessionStart B | per-prompt B |\n|---|---|---|--:|--:|');
  const rows = [...PROMPTS.map((u) => [u.id, u.prompt]), ...tasks.map((t) => [t.vars.id, t.vars.task])];
  for (const arm of ARM_LIST) for (const [id, p] of rows) {
    const b = bytes(arm, p);
    console.log(`| ${arm} | ${id} | ${b.phase || '-'} | ${b.session} | ${b.perPrompt} |`);
  }
}

async function live() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set. Use --dry, or export a key.'); process.exit(1); }
  const raw = [];
  const jobs = [];
  for (const arm of ARM_LIST) {
    if (FAMILY !== 'implement') for (const u of PROMPTS) jobs.push({ fam: 'understand', arm, id: u.id, prompt: u.prompt });
    if (FAMILY !== 'understand') for (const t of tasks) jobs.push({ fam: 'implement', arm, id: t.vars.id, prompt: t.vars.task, vars: t.vars });
  }
  console.error(`model=${MODEL} set=${SET} arms=${ARM_LIST} repeat=${REPEAT} calls=${jobs.length * REPEAT}`);
  for (const j of jobs) {
    // samples of one cell in parallel; cells in sequence (rate limits, readable progress)
    const outs = await Promise.all(Array.from({ length: REPEAT }, async () => {
      try { return await call(build(j.arm, j.prompt)); } catch (e) { console.error(`\n${j.arm}/${j.id}: ${e.message}`); return null; }
    }));
    for (const o of outs.filter(Boolean)) {
      const rec = { fam: j.fam, arm: j.arm, id: j.id, inTok: o.inTok, text: o.text };
      if (j.fam === 'understand') Object.assign(rec, ladder(o.text));
      else Object.assign(rec, { loc: loc(o.text).score, ok: correctness(o.text, { vars: j.vars }).score });
      raw.push(rec);
      process.stderr.write(j.fam === 'implement' && !rec.ok ? 'x' : '.');
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, repeat: REPEAT, date: DATE, raw }, null, 1));
  console.error(`\nraw -> ${OUT}`);

  const by = (fam, arm) => raw.filter((r) => r.fam === fam && r.arm === arm);
  const arms = ARM_LIST;
  const u = {}, i = {};
  console.log(`\nmodel ${MODEL}, ${REPEAT} samples per cell\n`);
  console.log('### UNDERSTAND: did the reply apply the ladder?\n');
  console.log('| arm | n | applied | mean families hit | mean reply chars (exploratory) | ' + Object.keys(FAMILIES).join(' | ') + ' | mean input tok |');
  console.log('|---|--:|--:|--:|--:|' + Object.keys(FAMILIES).map(() => '--:').join('|') + '|--:|');
  for (const arm of arms) {
    const rs = by('understand', arm);
    u[arm] = mean(rs.map((r) => r.score));
    console.log(`| ${arm} | ${rs.length} | ${rs.filter((r) => r.applied).length} | ${u[arm].toFixed(2)} | ${mean(rs.map((r) => r.text.length)).toFixed(0)} | ` +
      Object.keys(FAMILIES).map((k) => rs.filter((r) => r.hits.includes(k)).length).join(' | ') + ` | ${mean(rs.map((r) => r.inTok)).toFixed(0)} |`);
  }
  if (FAMILY !== 'understand') {
  console.log('\n### IMPLEMENT: code size and correctness (7 tasks)\n');
  console.log('| arm | n | LOC per 7-task pass | correct | mean input tok |\n|---|--:|--:|--:|--:|');
  for (const arm of arms) {
    const rs = by('implement', arm);
    // sum of per-task means, so a lost sample cannot shrink the total (n is printed beside it)
    i[arm] = { loc: tasks.reduce((a, t) => a + mean(rs.filter((r) => r.id === t.vars.id).map((r) => r.loc)), 0), ok: mean(rs.map((r) => r.ok)) };
    console.log(`| ${arm} | ${rs.length} | ${i[arm].loc.toFixed(0)} | ${(i[arm].ok * 100).toFixed(0)}% | ${mean(rs.map((r) => r.inTok)).toFixed(0)} |`);
  }
  }
  if (['A', 'B', 'C'].every((a) => arms.includes(a))) {
    const lens = (ids) => Object.fromEntries(arms.map((a) => [a, mean(by('understand', a).filter((r) => !ids || ids.includes(r.id)).map((r) => r.text.length))]));
    console.log('\n### Length position (registered rule in ab-metrics.js lengthVerdict)\n');
    console.log('```\nall prompts: ' + JSON.stringify(lengthVerdict(lens())) + (IDS_SUBSET ? '\nsubset ' + IDS_SUBSET + ': ' + JSON.stringify(lengthVerdict(lens(IDS_SUBSET.split(',')))) : '') + '\n```');
    console.log('\n### Verdict (pre-registered thresholds in ab-metrics.js)\n');
    console.log('```\n' + JSON.stringify(verdict(u, FAMILY === 'understand' ? null : i), null, 1) + '\n```');
  }
}

if (require.main === module) (process.argv.includes('--dry') ? Promise.resolve(dry()) : live()).catch((e) => { console.error(e); process.exit(1); });
module.exports = { UNDERSTAND, HARD };
