import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.argv[2] || 'http://127.0.0.1:8787', PASS = process.argv[3] || 'local-dev-pass', LOGIN = process.argv[4] || 'admin';
const session = () => {
  let cookie = '';
  return async (path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}) => {
    const r = await fetch(BASE + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { s: r.status, ...(await r.json().catch(() => ({}))) };
  };
};
const bearer = (key: string) => async (path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, ...(await r.json().catch(() => ({}))) };
};
let n = 0; const ok = (m: string) => console.log(`  ok ${++n} ${m}`);

const a = session(), b = session(), admin = session();
for (const [s, who] of [[a, 'a'], [b, 'b']] as const) assert.equal((await s('/api/auth/register', { method: 'POST', body: { name: who, email: `${who}${Date.now()}@test.uz`, password: 'parol12345' } })).s, 201);
assert.equal((await admin('/api/auth/login', { method: 'POST', body: { email: LOGIN, password: PASS } })).s, 200);

const readKey = (await a('/api/me/tokens', { method: 'POST', body: { name: 'bot' } })).key;
const writeKey = (await a('/api/me/tokens', { method: 'POST', body: { name: 'bot2', write: true } })).key;
assert.match(readKey, /^ut_[0-9a-f]{64}$/); assert.match(writeKey, /^ut_[0-9a-f]{64}$/);
const R = bearer(readKey), W = bearer(writeKey);
assert.equal((await R('/api/library')).s, 200);
assert.equal((await R('/api/me')).user.role, 'user'); ok('a personal key reads its own account');

const track = (await R('/api/catalog')).tracks?.[0]?.id;
if (track) {
  assert.equal((await R(`/api/likes/${track}`, { method: 'PUT' })).s, 403);
  assert.equal((await W(`/api/likes/${track}`, { method: 'PUT' })).s, 200);
  assert.ok((await R('/api/likes')).tracks.some((t: { id: string }) => t.id === track)); ok('a read key cannot change anything, a write key can');
} else console.log('  skip like checks: no published track');

for (const [method, path] of [['GET', '/api/me/tokens'], ['POST', '/api/me/tokens'], ['POST', '/api/payments'], ['POST', '/api/family'], ['GET', '/api/offline'], ['GET', '/api/admin/stats'], ['GET', '/api/admin/users'], ['POST', '/api/auth/logout'], ['POST', '/api/notices/subscribe']])
  assert.equal((await W(path, { method, body: method === 'GET' ? undefined : {} })).s, 403, `${method} ${path}`);
ok('keys cannot reach tokens, payments, family, offline, notices, auth or admin');

const adminKey = (await admin('/api/me/tokens', { method: 'POST', body: { name: 'mine', write: true } })).key;
assert.match(adminKey ?? '', /^ut_/, 'the admin key was not made (20-key limit reached by earlier runs?)');
const AK = bearer(adminKey);
assert.equal((await AK('/api/admin/stats')).s, 403);
assert.equal((await AK('/api/me')).user.role, 'user'); ok('an admin\'s listener key has no admin power');
for (const t of (await admin('/api/me/tokens')).tokens.filter((t: { name: string }) => t.name === 'mine')) await admin(`/api/me/tokens/${t.id}`, { method: 'DELETE' });

const pl = (await b('/api/playlists', { method: 'POST', body: { name: 'B list' } })).id;
assert.equal((await W(`/api/playlists/${pl}`)).s, 404);
assert.equal((await W(`/api/playlists/${pl}`, { method: 'DELETE' })).s, 404);
assert.equal((await W(`/api/playlists/${pl}`, { method: 'PATCH', body: { name: 'x' } })).s, 404);
const bTok = (await b('/api/me/tokens', { method: 'POST', body: { name: 'b key' } })).key;
const bId = (await b('/api/me/tokens')).tokens[0].id;
assert.equal((await a(`/api/me/tokens/${bId}`, { method: 'DELETE' })).s, 404);
assert.equal((await bearer(bTok)('/api/library')).s, 200); ok('one listener cannot see or touch another\'s playlists or keys');

const verifier = randomBytes(48).toString('base64url'), challenge = createHash('sha256').update(verifier).digest('base64url');
const ask = { client_name: 'Test ilova', redirect_uri: 'https://app.example/cb', state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256', scope: 'read write' };
const info = await a('/api/oauth/approve', { method: 'POST', body: { ...ask, check: true } });
assert.deepEqual([info.client, info.host, info.scope], ['Test ilova', 'app.example', 'read write']);
for (const bad of ['javascript:alert(1)', 'http://evil.example/cb', 'https://u:p@app.example/cb', 'data:text/html,x'])
  assert.equal((await a('/api/oauth/approve', { method: 'POST', body: { ...ask, redirect_uri: bad } })).s, 400, bad);
assert.equal((await a('/api/oauth/approve', { method: 'POST', body: { ...ask, code_challenge_method: 'plain' } })).s, 400);
assert.equal((await a('/api/oauth/approve', { method: 'POST', body: { ...ask, scope: 'admin' } })).s, 400);
assert.equal((await W('/api/oauth/approve', { method: 'POST', body: ask })).s, 403);
assert.equal((await session()('/api/oauth/approve', { method: 'POST', body: ask })).s, 401); ok('the consent check refuses bad redirects, no PKCE, unknown scopes, tokens and strangers');

const denied = new URL((await a('/api/oauth/approve', { method: 'POST', body: { ...ask, deny: true } })).redirect);
assert.equal(denied.searchParams.get('error'), 'access_denied'); assert.equal(denied.searchParams.get('state'), 'xyz'); ok('deny returns access_denied with the state');

const code = async () => new URL((await a('/api/oauth/approve', { method: 'POST', body: ask })).redirect).searchParams.get('code')!;
const exchange = (c: string, v: string, uri = ask.redirect_uri) => fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: c, code_verifier: v, redirect_uri: uri }) }).then(async r => ({ s: r.status, ...(await r.json()) }));
assert.equal((await exchange(await code(), randomBytes(48).toString('base64url'))).error, 'invalid_grant');
assert.equal((await exchange(await code(), verifier, 'https://app.example/other')).error, 'invalid_grant');
const c1 = await code(), got = await exchange(c1, verifier);
assert.equal(got.s, 200); assert.equal(got.token_type, 'Bearer'); assert.equal(got.scope, 'read write');
assert.equal((await exchange(c1, verifier)).error, 'invalid_grant'); ok('a code works once, only with its verifier and redirect');
const App = bearer(got.access_token);
assert.equal((await App('/api/library')).s, 200);
const listed = (await a('/api/me/tokens')).tokens.find((t: { kind: string; name: string }) => t.kind === 'app');
assert.equal(listed.name, 'Test ilova'); ok('the approved app works and shows in the account list');

assert.equal((await a(`/api/me/tokens/${listed.id}`, { method: 'DELETE' })).s, 200);
assert.equal((await App('/api/library')).s, 401);
assert.equal((await bearer(`ut_${'0'.repeat(64)}`)('/api/library')).s, 401);
assert.equal((await bearer('ut_xato')('/api/likes/x', { method: 'PUT' })).s, 401);
console.log('user api checks passed');
