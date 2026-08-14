#!/usr/bin/env node
// Routing accuracy benchmark. Deterministic, zero API calls, milliseconds.
//
//   node benchmarks/routing.js                      # score the current hook
//   node benchmarks/routing.js path/to/other-hook.js
//   node benchmarks/routing.js --compare            # this branch vs git master
//
// The LOC benchmark next door measures the DOCTRINE's effect on generated code
// and bypasses the router entirely (see benchmarks/arms/ponystack.js). This one
// measures the ROUTER: given a prompt, does it pick the phase a developer would?
//
// Read routing-corpus.js before quoting a number. The `commands` section is
// circular for any hook that has the table; its honest use is scoring a hook
// that does NOT, which is what --compare does.

const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const { routing, escalation } = require('./routing-corpus.js');

const PHASES = ['understand', 'implement', 'review', 'neutral'];

function scoreHook(hookPath) {
  const hook = require(hookPath);
  const sections = routing.map(({ name, circular, cases }) => {
    const misses = [];
    let pass = 0;
    for (const c of cases) {
      let got;
      try {
        got = hook.detectPhase(c.prompt);
      } catch (e) {
        got = `THREW: ${e.message}`;
      }
      // A hook predating `neutral` cannot say it. Record what it actually said;
      // do not translate, or the comparison flatters the old one.
      if (got === c.expect) pass++;
      else misses.push({ ...c, got });
    }
    return { name, circular, total: cases.length, pass, misses };
  });

  // Escalation is a capability, not just an answer. A hook without
  // shouldEscalate scores zero by absence, which is the honest reading.
  let esc;
  if (typeof hook.shouldEscalate !== 'function') {
    esc = { supported: false, total: escalation.length, pass: 0, misses: [] };
  } else {
    const misses = [];
    let pass = 0;
    for (const c of escalation) {
      let got;
      try {
        got = hook.shouldEscalate(c.phase, c.latched, c.file);
      } catch (e) {
        got = `THREW: ${e.message}`;
      }
      if (got === c.expect) pass++;
      else misses.push({ ...c, got });
    }
    esc = { supported: true, total: escalation.length, pass, misses };
  }
  return { sections, esc };
}

function pct(pass, total) {
  return total === 0 ? '  n/a' : `${String(Math.round((pass / total) * 100)).padStart(3)}%`;
}

function report(label, r) {
  console.log(`\n=== ${label} ===`);
  let tp = 0, tt = 0, np = 0, nt = 0;
  for (const s of r.sections) {
    tp += s.pass; tt += s.total;
    if (!s.circular) { np += s.pass; nt += s.total; }
    const tag = s.circular ? '  (circular — see corpus header)' : '';
    console.log(`  ${s.name.padEnd(12)} ${String(s.pass).padStart(3)}/${String(s.total).padEnd(3)} ${pct(s.pass, s.total)}${tag}`);
  }
  const e = r.esc;
  np += e.pass; nt += e.total;  // escalation is not circular
  console.log(`  ${'escalation'.padEnd(12)} ${String(e.pass).padStart(3)}/${String(e.total).padEnd(3)} ${pct(e.pass, e.total)}` +
    (e.supported ? '' : '  (not implemented — feature absent)'));
  console.log(`  ${'-'.repeat(34)}`);
  console.log(`  ${'ALL'.padEnd(12)} ${String(tp + e.pass).padStart(3)}/${String(tt + e.total).padEnd(3)} ${pct(tp + e.pass, tt + e.total)}`);
  console.log(`  ${'NON-CIRCULAR'.padEnd(12)} ${String(np).padStart(3)}/${String(nt).padEnd(3)} ${pct(np, nt)}  <- quote this one`);
  return { pass: tp, total: tt, nc: { pass: np, total: nt }, esc: e };
}

function listMisses(r) {
  const expected = [];
  const real = [];
  for (const s of r.sections) {
    for (const m of s.misses) (m.expectMiss ? expected : real).push({ ...m, section: s.name });
  }
  if (real.length) {
    console.log('\n  misroutes:');
    for (const m of real) {
      console.log(`    ${String(m.got).padEnd(11)} (want ${String(m.expect).padEnd(10)}) ${JSON.stringify(m.prompt)}`);
    }
  }
  if (expected.length) {
    console.log('\n  known, accepted (expectMiss in the corpus):');
    for (const m of expected) {
      console.log(`    ${String(m.got).padEnd(11)} (want ${String(m.expect).padEnd(10)}) ${JSON.stringify(m.prompt)}`);
      if (m.why) console.log(`                ${m.why}`);
    }
  }
  for (const m of r.esc.misses) {
    console.log(`    escalation: got ${m.got}, want ${m.expect} for ${JSON.stringify(m.file)} in ${m.phase}`);
  }
  return real.length;
}

const args = process.argv.slice(2);

if (args[0] === '--compare') {
  // Extract the hook as of git master into a temp file and score both.
  const repo = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponystack-bench-'));
  const oldPath = path.join(tmp, 'old-hook.js');
  try {
    const src = execFileSync('git', ['show', 'master:hooks/ponystack-hook.js'],
      { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    fs.writeFileSync(oldPath, src);
  } catch (e) {
    console.error('cannot read master:hooks/ponystack-hook.js —', e.message);
    process.exit(1);
  }
  const before = scoreHook(oldPath);
  const after = scoreHook(path.join(repo, 'hooks', 'ponystack-hook.js'));
  const b = report('BEFORE (git master)', before);
  listMisses(before);
  const a = report('AFTER (working tree)', after);
  const realMisses = listMisses(after);
  const ncDelta = (a.nc.pass / a.nc.total) - (b.nc.pass / b.nc.total);
  console.log(`\n  NON-CIRCULAR:  ${pct(b.nc.pass, b.nc.total).trim()} -> ${pct(a.nc.pass, a.nc.total).trim()}` +
    `  (${ncDelta >= 0 ? '+' : ''}${Math.round(ncDelta * 100)} points, ${a.nc.pass - b.nc.pass} more of ${a.nc.total} correct)`);
  console.log(`  all sections:  ${pct(b.pass + b.esc.pass, b.total + b.esc.total).trim()} -> ${pct(a.pass + a.esc.pass, a.total + a.esc.total).trim()}`);
  console.log(`  escalation:    ${b.esc.supported ? `${b.esc.pass}/${b.esc.total}` : 'absent'} -> ${a.esc.pass}/${a.esc.total}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  // Non-zero only on an UNEXPECTED miss, so this is usable in CI.
  process.exit(realMisses > 0 ? 1 : 0);
}

const target = args[0] ? path.resolve(args[0]) : path.join(__dirname, '..', 'hooks', 'ponystack-hook.js');
const r = scoreHook(target);
report(path.relative(process.cwd(), target) || target, r);
const misses = listMisses(r);
console.log();
process.exit(misses > 0 ? 1 : 0);
