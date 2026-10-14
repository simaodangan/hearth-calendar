import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const rows = new Map();
mock.module('../src/config.js', { namedExports: { config: { appSecret: 'test-only-secret' } } });
mock.module('../src/db.js', { namedExports: {
  many: async (sql, [owner]) => [...rows.values()].filter(row => row.user_id === owner),
  query: async () => { throw new Error('Unexpected query'); },
  one: async (sql, params) => {
    if (sql.startsWith('INSERT')) {
      const row = { id: 'new', user_id: params[0], name: params[1], token_hash: params[2], settings: params[3], token_encrypted: params[4] };
      rows.set(row.id, row); return row;
    }
    if (sql.startsWith('UPDATE displays SET token_hash')) {
      const row = rows.get(params[1]);
      if (!row || row.user_id !== params[2]) return null;
      Object.assign(row, { token_hash: params[0], token_encrypted: params[3] }); return row;
    }
    const row = rows.get(params[0]);
    return row?.user_id === params[1] ? row : null;
  },
} });
mock.module('../src/lib/access.js', { namedExports: { assertUuid: value => value, cleanText: value => value } });
const requireAuth = (req, res, next) => req.user ? next() : res.sendStatus(401);
const requireUser = (req, res, next) => !req.user ? res.sendStatus(401) : req.display ? res.sendStatus(403) : next();
mock.module('../src/lib/auth.js', { namedExports: { requireAuth, requireUser } });
const { decrypt, encrypt, sha256 } = await import('../src/lib/security.js');
const { default: router } = await import('../src/routes/displays.js');

test('display tokens are encrypted, owner-only, uncached, and atomically rotated', async () => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-user']) req.user = { id: req.headers['x-user'] };
    if (req.headers['x-display']) req.display = {};
    next();
  });
  app.use(router); app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = { 'x-user': 'owner', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(`${base}/displays`, { method: 'POST', headers: owner, body: JSON.stringify({ name: 'Kitchen' }) });
    assert.equal(created.status, 201);
    const { token, display } = await created.json();
    assert.equal(display.hasSavedLink, true);
    assert.equal(display.token_encrypted, undefined);
    const row = rows.get('new');
    assert.notEqual(row.token_encrypted, token);
    assert.equal(decrypt(row.token_encrypted), token);
    assert.equal(row.token_hash, sha256(token));
    assert.notEqual(encrypt(token), row.token_encrypted); // independent random IV
    const read = await fetch(`${base}/displays/new/token`, { headers: owner });
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.equal((await read.json()).token, token);
    assert.equal(row.token_hash, sha256(token));
    assert.equal((await fetch(`${base}/displays/new/token`)).status, 401);
    assert.equal((await fetch(`${base}/displays/new/token`, { headers: { 'x-user': 'other' } })).status, 404);
    assert.equal((await fetch(`${base}/displays/new/token`, { headers: { ...owner, 'x-display': '1' } })).status, 403);
    rows.set('legacy', { id: 'legacy', user_id: 'owner', token_hash: sha256('old-token') });
    assert.equal((await fetch(`${base}/displays/legacy/token`, { headers: owner })).status, 409);
    assert.equal(rows.get('legacy').token_hash, sha256('old-token'));
    const rotated = await fetch(`${base}/displays/new/token`, { method: 'POST', headers: owner });
    const replacement = (await rotated.json()).token;
    assert.notEqual(replacement, token);
    assert.equal(decrypt(row.token_encrypted), replacement);
    assert.equal(row.token_hash, sha256(replacement));
    row.token_encrypted = 'invalid';
    assert.equal((await fetch(`${base}/displays/new/token`, { headers: owner })).status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
