// Functional correctness gate: proves "less code" is not "broken code".
// Executes generated code where feasible (email/debounce/csv spawn python/node);
// structural checks where runtime needs a bundler/server (react/fastapi/cache).
// Metric: `correct` (1 = pass, 0 = fail). Adapted from ponytail (MIT).

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function extractBlocks(text) {
  const matches = [...String(text || '').matchAll(/```(\w*)\n([\s\S]*?)```/g)];
  return matches.map((m) => ({ lang: (m[1] || '').toLowerCase(), code: m[2] }));
}

function identifyTask(task) {
  const t = String(task || '').toLowerCase();
  if (t.includes('email') && t.includes('valid') && !t.includes('endpoint')) return 'email';
  if (t.includes('debounce')) return 'debounce';
  if (t.includes('csv') && t.includes('sum')) return 'csv';
  if (t.includes('countdown') && t.includes('react')) return 'countdown';
  if (t.includes('rate limit') || t.includes('rate-limit')) return 'ratelimit';
  if (t.includes('memoize') || (t.includes('cache') && t.includes('ttl'))) return 'lrucache';
  if (t.includes('fastapi') && t.includes('age')) return 'userendpoint';
  return null;
}

function exec(cmd, opts = {}) {
  try {
    execSync(cmd, { timeout: 10_000, encoding: 'utf8', stdio: 'pipe', ...opts });
    return { ok: true, stderr: '' };
  } catch (e) {
    return { ok: false, stderr: (e.stderr || e.message || '').slice(0, 500) };
  }
}

let pythonCmd;
function python() {
  if (pythonCmd) return pythonCmd;
  for (const cmd of ['python3', 'python']) if (exec(`${cmd} -c "import sys"`).ok) { pythonCmd = cmd; return pythonCmd; }
  pythonCmd = 'python3';
  return pythonCmd;
}

function tmpFile(ext, content) {
  const p = path.join(os.tmpdir(), `ponystack-bench-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content);
  return p;
}

const CHECKS = {
  email(blocks) {
    const code = blocks.find((b) => b.lang === 'python' || b.lang === 'py' || (!b.lang && b.code.includes('def ')));
    if (!code) return { pass: false, reason: 'No Python code block found' };
    const harness = `
${code.code}

import sys, inspect
fn = None
for name in ['validate_email','is_valid_email','email_validator','is_valid','validate']:
    if name in dir() and callable(eval(name)):
        fn = eval(name); break
if fn is None:
    for name, obj in list(globals().items()):
        if callable(obj) and not name.startswith('_'):
            try:
                if len(inspect.signature(obj).parameters) == 1: fn = obj; break
            except (ValueError, TypeError): pass
if fn is None: print("FAIL: no validator"); sys.exit(1)
f = []
if not fn("user@example.com"): f.append("rejected user@example.com")
if not fn("a@b.co"): f.append("rejected a@b.co")
if fn("no-at-sign"): f.append("accepted no-at-sign")
if fn(""): f.append("accepted empty")
if fn("@missing-local.com"): f.append("accepted @missing-local.com")
if f: print("FAIL: " + "; ".join(f)); sys.exit(1)
print("PASS")
`;
    const fp = tmpFile('.py', harness);
    const r = exec(`${python()} "${fp}"`);
    fs.unlinkSync(fp);
    return r.ok ? { pass: true, reason: 'email validator passes' } : { pass: false, reason: r.stderr || 'email failed' };
  },

  debounce(blocks) {
    const code = blocks.find((b) => b.lang === 'javascript' || b.lang === 'js' || (!b.lang && b.code.includes('function')));
    if (!code) return { pass: false, reason: 'No JavaScript code block found' };
    const harness = `
${code.code}

const fn = typeof debounce === 'function' ? debounce
  : typeof module !== 'undefined' && typeof module.exports === 'function' ? module.exports : null;
if (!fn) { console.error("FAIL: no debounce"); process.exit(1); }
let n = 0;
const d = fn(() => { n++; }, 50);
d(); d(); d();
if (n > 0) { console.error("FAIL: fired immediately"); process.exit(1); }
setTimeout(() => {
  if (n !== 1) { console.error("FAIL: expected 1 got " + n); process.exit(1); }
  console.log("PASS");
}, 120);
`;
    const fp = tmpFile('.mjs', harness);
    const r = exec(`node "${fp}"`);
    fs.unlinkSync(fp);
    return r.ok ? { pass: true, reason: 'debounce passes' } : { pass: false, reason: r.stderr || 'debounce failed' };
  },

  csv(blocks) {
    const code = blocks.find((b) => b.lang === 'python' || b.lang === 'py' || (!b.lang && b.code.includes('csv') && b.code.includes('sum')));
    if (!code) return { pass: false, reason: 'No Python code block found' };
    const csvPath = tmpFile('.csv', 'name,amount\nAlice,100.5\nBob,200.0\nCharlie,50.5\n').replace(/\\/g, '/');
    let patched = code.code.replace(/['"]sales\.csv['"]/g, `'${csvPath}'`).replace(/open\(\s*['"]sales\.csv['"]/g, `open('${csvPath}'`);
    const harness = `
import sys, os, io, re
os.chdir(r"${path.dirname(csvPath)}")
_o = sys.stdout; sys.stdout = io.StringIO()
try:
${patched.split('\n').map((l) => '    ' + l).join('\n')}
except Exception:
    sys.stdout = _o
out = sys.stdout.getvalue() if sys.stdout is not _o else ""
sys.stdout = _o
if re.search(r'(?<![\\d])351(?:\\.0)?(?![\\d])', out): print("PASS")
else: print("FAIL: " + repr(out[:200])); sys.exit(1)
`;
    const fp = tmpFile('.py', harness);
    const r = exec(`${python()} "${fp}"`);
    try { fs.unlinkSync(fp); } catch (e) {}
    try { fs.unlinkSync(csvPath); } catch (e) {}
    return r.ok ? { pass: true, reason: 'csv sum = 351' } : { pass: false, reason: r.stderr || 'csv failed' };
  },

  countdown(blocks) {
    const code = blocks.find((b) => b.code.includes('ount') || b.code.includes('timer') || b.code.includes('Timer'));
    if (!code) return { pass: false, reason: 'No countdown component found' };
    const s = code.code;
    const f = [];
    if (!/useState|useReducer|this\.state/.test(s)) f.push('no state');
    if (!/useEffect|componentDidMount|setInterval|setTimeout/.test(s)) f.push('no timer');
    if (!/- 1|-= 1|prev - 1|count - 1|seconds - 1|time - 1/.test(s)) f.push('no decrement');
    return f.length ? { pass: false, reason: 'Missing: ' + f.join(', ') } : { pass: true, reason: 'countdown structure ok' };
  },

  ratelimit(blocks) {
    const code = blocks.find((b) => b.lang === 'python' || b.lang === 'py' || (!b.lang && (b.code.includes('rate') || b.code.includes('limit'))));
    if (!code) return { pass: false, reason: 'No Python code block found' };
    const s = code.code;
    const f = [];
    if (!/limit|max_requests|rate|429|Too Many|HTTPException|RateLimiter/.test(s)) f.push('no limit logic');
    if (!/fastapi|FastAPI|app\s*=|@app\./.test(s)) f.push('no FastAPI');
    return f.length ? { pass: false, reason: 'Missing: ' + f.join(', ') } : { pass: true, reason: 'rate limiter structure ok' };
  },

  // production: structural (a hand-rolled class and a one-liner both pass the
  // gate; the LOC metric is what separates them).
  lrucache(blocks) {
    const code = blocks.find((b) => b.lang === 'python' || b.lang === 'py' || (!b.lang && b.code.includes('def ')));
    if (!code) return { pass: false, reason: 'No Python code block found' };
    const s = code.code;
    const f = [];
    if (!/lru_cache|cache|memo/i.test(s)) f.push('no cache');
    if (!/maxsize|max_size|maxlen|capacity|max cache|maximum/i.test(s)) f.push('no size bound');
    if (!/ttl|expire|expir|time\.|monotonic|timestamp|perf_counter/i.test(s)) f.push('no TTL');
    return f.length ? { pass: false, reason: 'Missing: ' + f.join(', ') } : { pass: true, reason: 'lru+ttl structure ok' };
  },

  userendpoint(blocks) {
    const code = blocks.find((b) => b.lang === 'python' || b.lang === 'py' || (!b.lang && (b.code.includes('FastAPI') || b.code.includes('@app'))));
    if (!code) return { pass: false, reason: 'No Python code block found' };
    const s = code.code;
    const f = [];
    if (!/fastapi|FastAPI|APIRouter|@app\.|@router\./.test(s)) f.push('no FastAPI');
    if (!/email/i.test(s)) f.push('no email field');
    if (!/age/i.test(s)) f.push('no age field');
    if (!/422|400|HTTPException|ValidationError|pydantic|BaseModel|raise/.test(s)) f.push('no validation/error');
    return f.length ? { pass: false, reason: 'Missing: ' + f.join(', ') } : { pass: true, reason: 'user endpoint structure ok' };
  },
};

module.exports = (output, context) => {
  const task = identifyTask(context && context.vars && context.vars.task);
  if (!task) return { pass: true, score: 1, reason: 'Unknown task, skipped' };
  const blocks = extractBlocks(output);
  if (!blocks.length) return { pass: false, score: 0, reason: 'No code blocks' };
  const r = CHECKS[task](blocks);
  return { pass: r.pass, score: r.pass ? 1 : 0, reason: r.reason };
};
