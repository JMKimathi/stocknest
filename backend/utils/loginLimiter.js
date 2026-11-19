// Very small in-memory brute-force guard for the login route.
// After MAX_ATTEMPTS failed logins for the same email + IP within WINDOW_MS,
// further attempts are blocked until the window passes.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function keyFor(req) {
  const email = String((req.body && req.body.email) || '').toLowerCase();
  return `${req.ip}|${email}`;
}

function isBlocked(req) {
  const entry = attempts.get(keyFor(req));
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(keyFor(req));
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(req) {
  const key = keyFor(req);
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearFailures(req) {
  attempts.delete(keyFor(req));
}

module.exports = { isBlocked, recordFailure, clearFailures };
