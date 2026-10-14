// Conflict metric for UNDERSTAND-phase replies: did the model apply the ladder
// (YAGNI / shortest diff / cut scope) to a plan review? Deterministic regex
// families; a reply "applies the ladder" when >= THRESHOLD distinct families hit.
// NOTE: overBuilt and the plain-words cutScope alternation were added post-hoc after the first live run showed the original
// six families had near-zero recall on real replies; see the results file.
// One hit is ordinary plan-review vocabulary ("defer the admin UI"); the arm D
// baseline measures that floor, so compare arms, never read the score absolutely.
//
// Meta-mentions ("the lazy senior is silent") are deliberately NOT matched: only
// substantive recommendations count. ponystack: regex, not a judge. It misses
// paraphrase and can over-count a rebuttal ("YAGNI does not apply here"); raw
// replies are saved by run-ab.js for audit. Upgrade path: an LLM judge, validated
// against these same fixtures.

const FAMILIES = {
  yagni: /\bYAGNI\b|you aren'?t gonna need|nobody asked for|not needed (yet|for now|in v?1)/i,
  shortestDiff: /shortest (working )?diff|smallest (complete )?(change|version|diff|slice)|minimum (that works|viable)|minimal (version|implementation|diff)/i,
  cutScope: /\b(cut|drop|skip|defer|punt|descope|remove)\b[^.\n]{0,60}\b(for now|from (v1|the (first|initial) (version|release))|entirely|from scope|from the plan)|out of scope for (v1|now|the first)|do(es)?n'?t need to exist|\b(cut|drop|defer|descope|punt on|postpone) (the|this|that|these|those|it|all)\b|\bship(ping)? (a )?thinner\b|\bthin(ner)? (slice|version|form)s?\b/i,
  stdlibFirst: /\b(use|prefer|reach for)\b[^.\n]{0,30}\b(stdlib|standard library|built-?in|native)\b|\b(stdlib|standard library|built-?in|native)\b[^.\n]{0,40}\b(instead of|rather than)\b/i,
  deletion: /delete rather than add|deletion beats|net: -?\d+ lines|delete-?list|(fewer|less) (lines|code)\b/i,
  // Added after the first live run (post-hoc): real replies cut scope in plain words
  // ("about 40% too big ... Cut the schema registry") that the stock phrasings above miss;
  // plain-words verbs live in cutScope (one family: cutting is one signal, not two).
  overBuilt: /\b(too (big|large|much)|over-?(built|engineered|scoped|ambitious)|bigger than .{0,40}need|more than .{0,40}need)\b/i,
  noAbstraction: /\b(no|avoid|skip|without)\b (unrequested |speculative |premature )?(abstractions?|wrappers?|config(uration)? options?|flexibility)\b/i,
};
const THRESHOLD = 2;

function ladder(text) {
  const t = String(text || '');
  const hits = Object.keys(FAMILIES).filter((k) => FAMILIES[k].test(t));
  return { score: hits.length, applied: hits.length >= THRESHOLD, hits };
}

// Verdict against the operator's decision criteria. Thresholds are fixed here,
// before any data: understand position = how far B sits from C toward A.
//   u: mean ladder score per arm on understand prompts, {A,B,C}
//   i: implement results per arm, {A:{loc,ok}, B:{loc,ok}}  (loc per 7-task pass, ok in 0..1)
function verdict(u, i) {
  const gap = u.A - u.C;
  let understand, pos = null;
  if (gap < 0.5) understand = 'inconclusive';  // A ~ C: the ladder does not bite on these prompts
  else {
    pos = (u.B - u.C) / gap;
    understand = pos <= 1 / 3 ? 'like-C' : pos >= 2 / 3 ? 'like-A' : 'partial';
  }
  const implementNotWorse = i.B.loc <= 1.10 * i.A.loc && i.B.ok >= i.A.ok - 0.05;
  const keep = understand === 'like-C' && implementNotWorse;
  return { understand, pos, implementNotWorse, keep };
}

module.exports = { ladder, verdict, FAMILIES, THRESHOLD };
