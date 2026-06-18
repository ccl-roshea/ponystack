// Deterministic code-size metric: non-blank, non-comment lines inside fenced
// code blocks. Recorded as code_loc per arm (always passes; a measurement, not
// a gate). Adapted from ponytail (MIT, Dietrich Gebert).
module.exports = (output) => {
  const text = String(output || '');
  const blocks = [...text.matchAll(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const code = blocks.join('\n');
  const loc = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('#') && l !== '*/' && !l.startsWith('/*') && !l.startsWith('*')).length;
  return { pass: true, score: loc, reason: loc + ' code LOC' };
};
