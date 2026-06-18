// ponystack arm: the implement-phase doctrine (skills/ponystack/SKILL.md) as the
// system prompt. These are single-shot coding tasks, so the router would land in
// the implement phase - lazy senior at MAX. Single source of truth: the skill.
const fs = require('fs');
const path = require('path');
const system = fs.readFileSync(path.join(__dirname, '..', '..', 'skills', 'ponystack', 'SKILL.md'), 'utf8');
module.exports = ({ vars }) => [
  { role: 'system', content: system },
  { role: 'user', content: vars.task },
];
