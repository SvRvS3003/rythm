import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
const BASE = 'http://127.0.0.1:8787';
const client = () => { let cookie = ''; return async (path: string, body?: unknown, method = 'POST'): Promise<any> => { const r = await fetch(BASE + path, { method: body === undefined && method === 'POST' ? 'GET' : method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return { s: r.status, ...(await r.json().catch(() => ({}))) }; }; };
const hits: { path: string; auth: string }[] = []; let gone = false;
const srv = createServer((q, r) => { hits.push({ path: q.url || '', auth: String(q.headers.authorization || '') }); r.statusCode = gone && q.url === '/old' ? 410 : 201; r.end(); });
await new Promise<void>(res => srv.listen(9911, '127.0.0.1', () => res()));
const tick = async (cron = '* * * * *') => { await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(cron)}`); await new Promise(r => setTimeout(r, 700)); };
try {
  const admin = client(), u = client(), v = client();
  await admin('/api/auth/login', { email: 'admin', password: 'local-dev-pass' });
  const stamp = Date.now();
  await u('/api/auth/register', { name: 'U', email: `n${stamp}@test.uz`, password: 'parol12345' });
  await v('/api/auth/register', { name: 'V', email: `m${stamp}@test.uz`, password: 'parol12345' });
  const key = await u('/api/notices/key'); assert.equal(Buffer.from(key.key, 'base64url').length, 65);

  const ep = (p: string) => `https://push.example.test${p}`;
  assert.equal((await u('/api/notices/subscribe', { kind: 'web', endpoint: 'ftp://nope' })).s, 400);
  assert.equal((await u('/api/notices/subscribe', { kind: 'web', endpoint: 'http://127.0.0.1:9911/x' })).s, 400);
  assert.equal((await u('/api/notices/subscribe', { kind: 'web', endpoint: ep(`/u${stamp}`) })).s, 201);
  assert.equal((await v('/api/notices/subscribe', { kind: 'web', endpoint: ep('/old') })).s, 201);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'rythm', '--local', '--command', "UPDATE push_subs SET endpoint=replace(endpoint,'https://push.example.test','http://127.0.0.1:9911') WHERE endpoint LIKE 'https://push.example.test%'"], { stdio: 'ignore' });
  await tick(); assert.equal(hits.length, 0, 'a new device must not get old news');
  assert.equal((await u('/api/admin/notices', { title: 'x' })).s, 403);
  assert.equal((await admin('/api/admin/notices', { title: 'Yangi albom', body: 'Tinglang', url: '/search' })).s, 201);
  await tick();
  assert.equal(hits.filter(h => h.path === `/u${stamp}`).length, 1); assert.equal(hits.filter(h => h.path === '/old').length, 1);
  assert.match(hits[0].auth, /^vapid t=.+, k=.+$/); console.log('  ok a message reaches every device, signed');
  await tick(); assert.equal(hits.length, 2, 'each message is pushed once');
  const got = await u('/api/notices/next', { endpoint: ep(`/u${stamp}`) });
  assert.deepEqual(got.notice, { title: 'Yangi albom', body: 'Tinglang', url: '/search' });
  assert.equal((await u('/api/notices/next', { endpoint: ep(`/u${stamp}`) })).notice, null); console.log('  ok the device reads it once');
  assert.equal((await u('/api/notices/next', { endpoint: 'https://unknown.test/x' })).notice, null);
  gone = true; await admin('/api/admin/notices', { title: 'Ikkinchi' }); await tick();
  await admin('/api/admin/notices', { title: 'Uchinchi' }); const before = hits.filter(h => h.path === '/old').length; await tick();
  assert.equal(hits.filter(h => h.path === '/old').length, before, 'a device that left must be dropped'); console.log('  ok a device that left is removed');

  const tok = `${stamp}`.padEnd(32, 'a').replace(/[^0-9a-f]/g, 'a');
  assert.equal((await u('/api/notices/subscribe', { kind: 'android', endpoint: tok })).s, 201);
  await admin('/api/admin/notices', { title: 'Android xabar' });
  const hitsBefore = hits.length;
  const a1 = await fetch(`${BASE}/api/notices/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: tok }) }).then(r => r.json());
  assert.equal(a1.notice.title, 'Android xabar'); assert.equal(hits.slice(hitsBefore).some(h => h.path.includes(tok)), false); console.log('  ok Android polling works without a session');

  const uid = (await u('/api/me')).user.id;
  console.log(`AWAY_USER=${uid} TOKEN=${tok}`);
} finally { srv.close(); }
