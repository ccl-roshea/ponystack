// gstack arm: gstack's own builder doctrine (ETHOS.md, MIT, Garry Tan / YC)
// as the system prompt. Vendored verbatim at benchmarks/gstack-ETHOS.md so the
// head-to-head measures gstack's actual "boil the lake" guidance, not a strawman.
const fs = require('fs');
const path = require('path');
const system = fs.readFileSync(path.join(__dirname, '..', 'gstack-ETHOS.md'), 'utf8');
module.exports = ({ vars }) => [
  { role: 'system', content: system },
  { role: 'user', content: vars.task },
];
