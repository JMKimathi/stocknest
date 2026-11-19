const crypto = require('crypto');

// One rule for every password in the app
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain letters and numbers';
  if (password.length > 128) return 'Password is too long';
  return null;
}

// Readable temporary password for admin resets, e.g. "Kite-4827-Moss"
function temporaryPassword() {
  const words = ['Kite', 'Moss', 'Reef', 'Dune', 'Fern', 'Hawk', 'Lake', 'Palm', 'Ruby', 'Sage', 'Tide', 'Wren'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${crypto.randomInt(1000, 10000)}-${pick()}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { passwordProblem, temporaryPassword, EMAIL_RE };
