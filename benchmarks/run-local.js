#!/usr/bin/env node
// Local benchmark runner - fills real numbers without an Anthropic key. The
// shipped, stranger-reproducible path is promptfooconfig.yaml; this is the
// convenience runner. Two backends, picked by BASE_URL:
//   - *perplexity*  → Agent API (POST /v1/agent, {instructions,input})
//   - anything else → OpenAI-compatible chat (POST /chat/completions, messages)
//
//   node run-local.js [model[,model]] [repeat]
//
// Creds: env API_KEY/BASE_URL, else ~/.env.master (PERPLEXITY_API_KEY by
// default; set BASE_URL + API_KEY for an OpenAI-compatible gateway like Clodex).
// Reuses the exact loc.js + correctness.js the promptfoo path uses.

const fs = require('fs');
const os = require('os');
const path = require('path');
const loc = require('./loc.js');
const correctness = require('./correctness.js');
const tasks = require('./tasks.js');
const ARMS = {
  baseline: require('./arms/baseline.js'),
  gstack: require('./arms/gstack.js'),
  ponystack: require('./arms/ponystack.js'),
};

function fromEnvMaster(key) {
  try {
    const m = fs.readFileSync(path.join(os.homedir(), '.env.master'), 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}
const BASE_URL = (process.env.BASE_URL || 'https://api.perplexity.ai').replace(/\/$/, '');
const isPplx = /perplexity/.test(BASE_URL);
const API_KEY = process.env.API_KEY || (isPplx ? fromEnvMaster('PERPLEXITY_API_KEY') : fromEnvMaster('CLODEX_API_KEY'));
const MODELS = (process.argv[2] || (isPplx ? 'openai/gpt-5.5,anthropic/claude-opus-4-7' : 'gpt-5.5,claude-opus-4-8')).split(',').map((s) => s.trim());
const REPEAT = parseInt(process.argv[3] || '1', 10);

async function call(model, messages) {
  let url, body;
  if (isPplx) {
    // Agent API takes a single instructions + input string, not a messages array.
    const sys = messages.find((m) => m.role === 'system');
    const user = messages.find((m) => m.role === 'user');
    url = `${BASE_URL}/v1/agent`;
    // ponystack: 8000 output cap - reasoning models eat budget; small caps truncate code.
    body = { model, instructions: sys ? sys.content : '', input: user ? user.content : '', max_output_tokens: 8000 };
  } else {
    url = `${BASE_URL}/chat/completions`;
    body = { model, messages, max_tokens: 8192, temperature: 1 };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  if (isPplx) {
    const msg = (j.output || []).find((o) => o.type === 'message');
    const text = msg ? (msg.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('') : '';
    return { text, cost: j.usage?.cost?.total_cost || 0 };
  }
  return { text: j.choices?.[0]?.message?.content || '', cost: 0 };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function main() {
  if (!API_KEY) { console.error('No API key (env API_KEY, or PERPLEXITY_API_KEY/CLODEX_API_KEY in ~/.env.master)'); process.exit(1); }
  console.error(`backend=${isPplx ? 'perplexity-agent' : 'openai-compatible'} url=${BASE_URL} models=${MODELS.join(',')} repeat=${REPEAT} tasks=${tasks.length}`);
  const rows = {};
  for (const model of MODELS) {
    for (const arm of Object.keys(ARMS)) {
      const locs = [], oks = [], fails = []; let cost = 0;
      for (const t of tasks) {
        for (let r = 0; r < REPEAT; r++) {
          try {
            const { text, cost: c } = await call(model, ARMS[arm]({ vars: t.vars }));
            cost += c;
            locs.push(loc(text).score);
            const ok = correctness(text, { vars: t.vars }).score;
            oks.push(ok);
            if (!ok) fails.push(t.vars.id);
            process.stderr.write(ok ? '.' : 'x');
          } catch (e) { console.error(`\n  ${model}/${arm}/${t.vars.id}: ${e.message}`); }
        }
      }
      rows[`${model}|${arm}`] = {
        loc: locs.length ? median(locs) : NaN,
        locTotal: locs.reduce((a, b) => a + b, 0),
        correct: oks.length ? oks.reduce((a, b) => a + b, 0) / oks.length : NaN,
        cost, n: oks.length, fails,
      };
      const x = rows[`${model}|${arm}`];
      console.error(`\n${model} / ${arm}: medianLOC ${x.loc} totalLOC ${x.locTotal} correct ${(x.correct * 100).toFixed(0)}% cost $${x.cost.toFixed(4)} (n=${x.n})${x.fails.length ? ' fails:' + x.fails.join(',') : ''}`);
    }
  }
  const arms = Object.keys(ARMS);
  const out = ['', '### Total code LOC across all tasks (lower is leaner)', '', '| arm | ' + MODELS.join(' | ') + ' |', '|---|' + MODELS.map(() => '--:').join('|') + '|'];
  for (const arm of arms) out.push(`| ${arm} | ` + MODELS.map((m) => rows[`${m}|${arm}`].locTotal).join(' | ') + ' |');
  out.push('', '### Correctness (share of tasks whose code passes the gate)', '', '| arm | ' + MODELS.join(' | ') + ' |', '|---|' + MODELS.map(() => '--:').join('|') + '|');
  for (const arm of arms) out.push(`| ${arm} | ` + MODELS.map((m) => (rows[`${m}|${arm}`].correct * 100).toFixed(0) + '%').join(' | ') + ' |');
  console.log(out.join('\n'));
}

main();
