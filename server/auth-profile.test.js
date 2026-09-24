const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require('node:path').join(__dirname, 'server.js'), 'utf8');

test('login response exposes a per-user profile id and the dashboard fetch route exists', () => {
  assert.match(
    source,
    /id:\s*(user\._id\s*\?\s*user\._id\.toString\(\)\s*:\s*user\.id|user\._id\.toString\(\))/,
    'publicUser should include a stable user id'
  );
  assert.match(source, /app\.get\(['"]\/me['"]/, 'dashboard should fetch the authenticated user profile via /me');
});
