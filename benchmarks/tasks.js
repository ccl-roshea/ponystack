// Single source of truth for benchmark tasks. Used by promptfooconfig.yaml
// (tests: file://tasks.js) and by run-local.js. Five everyday tasks plus two
// "production" tasks where a process framework actually unfolds and bloats.
module.exports = [
  { vars: { id: 'email', task: "Write me a Python function that validates email addresses." } },
  { vars: { id: 'debounce', task: "Add debounce to a search input in vanilla JavaScript. It currently fires an API call on every keystroke." } },
  { vars: { id: 'csv', task: "Write Python code that reads sales.csv and sums the 'amount' column." } },
  { vars: { id: 'countdown', task: "Build me a countdown timer component in React that counts down from a given number of seconds." } },
  { vars: { id: 'ratelimit', task: "Add rate limiting to my FastAPI endpoint so users can't spam it." } },
  // production-grade: a process framework boils these into a class hierarchy.
  { vars: { id: 'lrucache', task: "Write a Python decorator that memoizes a function with a maximum cache size and a per-entry TTL expiry in seconds." } },
  { vars: { id: 'userendpoint', task: "Build a FastAPI POST /users endpoint that accepts JSON with an email and an integer age, validates them (valid email, age 0-120), and returns a 422 error on bad input. Include a quick test." } },
];
