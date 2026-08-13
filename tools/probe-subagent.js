#!/usr/bin/env node
// DISPOSABLE. Task 1 of docs/plans/2026-08-13-phase-router-implementation.md.
//
// Answers one question: does SubagentStart receive the PARENT's session_id, or
// its own? Wired to both UserPromptSubmit and SubagentStart so the log contains
// both sides of the comparison and is self-answering.
//
// Writes NOTHING to stdout: UserPromptSubmit injects raw stdout as context, so
// any output here would pollute the conversation.
//
// Delete this file and revert hooks/hooks.json when the answer is recorded.
const fs = require('fs');

const label = process.argv[2] || 'unknown';
let input = '';

function finish() {
  let payload = {};
  try { payload = JSON.parse(input.replace(/^﻿/, '')); } catch (e) { /* keep {} */ }
  try {
    fs.appendFileSync('/tmp/ponystack-probe.jsonl', JSON.stringify({
      label,
      session_id: payload.session_id || null,
      agent_type: payload.agent_type || null,
      keys: Object.keys(payload).sort(),
    }) + '\n');
  } catch (e) { /* a probe must never break the session */ }
  process.exit(0);
}

process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1000).unref();
