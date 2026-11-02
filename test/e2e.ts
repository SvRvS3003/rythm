// JavaScript, test/e2e.ts, node: API checks against a running `npm run dev`. Usage: node test/e2e.ts [base] [adminPassword] [adminLogin]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';

const BASE = process.argv[2] || 'http://127.0.0.1:8787', PASS = process.argv[3] || 'local-dev-pass', LOGIN = process.argv[4] || 'admin';
const tmp = mkdtempSync(join(tmpdir(), 'rythm-'));
const client = () => {
  let cookie = '';
  return async (path, { method = 'GET', body, raw, headers = {} }: any = {}) => {
    const r = await fetch(BASE + path, { method, redirect: 'manual', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return r;
  };
};
const J = async (p: any): Promise<any> => { const r = await p; const d = await r.json().catch(() => ({})); return { s: r.status, ...d }; };
const ff = (name, args) => { const f = join(tmp, name); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, f]); return readFileSync(f); };
let n = 0; const ok = m => console.log(`  ok ${++n} ${m}`);

const admin = client(), user = client(), anon = client();
assert.equal((await J(admin('/api/auth/login', { method: 'POST', body: { email: LOGIN, password: 'wrong' } }))).s, 401);
assert.equal((await J(admin('/api/auth/login', { method: 'POST', body: { email: LOGIN, password: PASS } }))).s, 200); ok('admin login, wrong password refused');
const email = `u${Date.now()}@test.uz`;
assert.equal((await J(user('/api/auth/register', { method: 'POST', body: { name: 'Ali', email, password: 'parol12345' } }))).s, 201);
assert.equal((await J(user('/api/admin/stats'))).s, 403);
assert.equal((await J(anon('/api/home'))).s, 401); ok('role guards hold');

async function upload(buf, kind = 'audio') {
  const st = await J(admin('/api/admin/uploads', { method: 'POST', body: { kind } }));
  const parts = [];
  for (let i = 1, off = 0; off < buf.length; i++, off += st.partSize) {
    const r = await J(admin(`/api/admin/uploads/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=${i}`, { method: 'PUT', raw: buf.subarray(off, off + st.partSize) }));
    if (r.s !== 200) return r;
    parts.push({ partNumber: r.partNumber, etag: r.etag });
  }
  return J(admin('/api/admin/uploads/complete', { method: 'POST', body: { key: st.key, uploadId: st.uploadId, parts } }));
}
// Rejected formats
const mp3 = ff('a.mp3', ['-f', 'lavfi', '-i', 'sine=440:duration=2']);
assert.equal((await upload(mp3)).s, 415);
const flac = ff('a.flac', ['-f', 'lavfi', '-i', 'sine=440:duration=2']);
assert.equal((await upload(flac)).s, 415);
const mp3InWav = ff('b.wav', ['-f', 'lavfi', '-i', 'sine=440:duration=2', '-c:a', 'libmp3lame']);
assert.equal((await upload(mp3InWav)).s, 415);
ok('mp3, flac and mp3-inside-.wav rejected by the server');
// Real multipart upload over 20 MB, 24-bit/96k, must round-trip byte-identical.
const big = ff('big.wav', ['-f', 'lavfi', '-i', 'sine=330:duration=50:sample_rate=96000', '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s24le']);
const up = await upload(big);
assert.equal(up.s, 200); assert.equal(up.bitDepth, 24); assert.equal(up.sampleRate, 96000);
assert.ok(big.length > 25e6); ok(`multipart ${(big.length / 1e6).toFixed(1)} MB WAV accepted, metadata parsed`);
const svg = await J(admin('/api/admin/images', { method: 'POST', raw: '<svg onload=alert(1)>' })); assert.equal(svg.s, 415);
const png = await J(admin('/api/admin/images', { method: 'POST', raw: readFileSync('web/icon-512.png') })); assert.equal(png.s, 201); ok('svg refused, png stored');
const T = await J(admin('/api/admin/tracks', { method: 'POST', body: { key: up.key, title: 'Sinov <b>qo\'shig\'i</b>', artist: 'Test Ijrochi', album: 'Birinchi', genre: 'Pop', coverKey: png.key, lyrics: 'matn' } }));
assert.equal(T.s, 201);
// Streaming
const play = await J(user('/api/play', { method: 'POST', body: { trackId: T.id } }));
assert.ok(play.url); assert.ok(!play.url.includes('audio/'));
const full = await anon(play.url);
assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/wav');
assert.equal(createHash('sha256').update(Buffer.from(await full.arrayBuffer())).digest('hex'), createHash('sha256').update(big).digest('hex')); ok('stream is byte-identical to the uploaded WAV');
const probe = await anon(play.url, { headers: { range: 'bytes=0-1' } });
assert.equal(probe.status, 206); assert.equal(probe.headers.get('content-range'), `bytes 0-1/${big.length}`); assert.equal((await probe.arrayBuffer()).byteLength, 2);
const mid = await anon(play.url, { headers: { range: 'bytes=25000000-' } });
assert.equal(mid.status, 206); assert.deepEqual(Buffer.from(await mid.arrayBuffer()), big.subarray(25000000)); ok('Safari range probe and mid-file seek return correct 206');
assert.equal((await anon(play.url, { headers: { range: `bytes=${big.length}-` } })).status, 416);
assert.equal((await anon(play.url.replace(/s=[0-9a-f]+/, 's=' + '0'.repeat(64)))).status, 403);
assert.equal((await anon(play.url.replace(/e=\d+/, 'e=9999999999'))).status, 403);
assert.equal((await anon(`/media/${up.key}`)).status, 404); ok('tampered links refused, raw R2 key not public');
// Early count refused
const c1 = await J(user(`/api/plays/${play.playId}/counted`, { method: 'POST' })); assert.equal(c1.counted, false); ok('a play is not counted before listening time');
// Ads: ad_every=3, one play already made.
assert.equal((await J(admin('/api/admin/settings', { method: 'PATCH', body: { ad_every: 3, ad_seconds: 3, plans_enabled: true } }))).s, 200);
const settle = () => new Promise(r => setTimeout(r, 11000)); // settings cache TTL
await settle();
const P = () => J(user('/api/play', { method: 'POST', body: { trackId: T.id } }));
assert.ok((await P()).url); assert.ok((await P()).url);
const adr = await P(); assert.ok(adr.ad && !adr.url); ok('4th play returns an ad and no stream URL');
const bg = await J(user('/api/play', { method: 'POST', body: { trackId: T.id, hidden: true } })); assert.ok(bg.url && !bg.ad);
const adFresh = await P(); assert.ok(adFresh.ad); ok('locked screen with no audio ad keeps playing; the ad still waits for the foreground');
const early = await J(user(`/api/ads/${adFresh.ad.viewId}/complete`, { method: 'POST' })); assert.equal(early.s, 409, 'early');
ok('ad cannot be completed instantly');
await new Promise(r => setTimeout(r, 3200));
assert.equal((await J(user(`/api/ads/${adFresh.ad.viewId}/complete`, { method: 'POST' }))).s, 200);
assert.ok((await P()).url); ok('after waiting, ad completes and playback resumes');
// Plan toggle & exempt list
assert.ok((await P()).url); assert.ok((await P()).url); assert.ok((await P()).ad);
await J(admin('/api/admin/settings', { method: 'PATCH', body: { plans_enabled: false } }));
await settle();
assert.ok((await P()).url); assert.equal((await J(user('/api/me'))).user.entitlement.reason, 'plans_off'); ok('one toggle off: nobody gets ads');
await J(admin('/api/admin/settings', { method: 'PATCH', body: { plans_enabled: true } }));
await settle();
assert.ok((await P()).ad);
const me = (await J(user('/api/me'))).user;
await J(admin(`/api/admin/users/${me.id}`, { method: 'PATCH', body: { planExempt: true } }));
assert.ok((await P()).url); assert.equal((await J(user('/api/me'))).user.entitlement.reason, 'exempt'); ok('exempt list skips plan and ads');
await J(admin(`/api/admin/users/${me.id}`, { method: 'PATCH', body: { planExempt: false } }));
// Payments
assert.equal((await J(user('/api/payments', { method: 'POST', body: { planId: 'puls', reference: '1234' } }))).s, 201);
assert.equal((await J(user('/api/payments', { method: 'POST', body: { planId: 'puls', reference: '1234' } }))).s, 409);
const pay = (await J(admin('/api/admin/payments'))).payments.find(p => p.email === email);
assert.equal((await J(admin(`/api/admin/payments/${pay.id}/approve`, { method: 'POST' }))).s, 200);
const exp1 = (await J(user('/api/me'))).user.entitlement.expires;
assert.equal((await J(admin(`/api/admin/payments/${pay.id}/approve`, { method: 'POST' }))).s, 409);
assert.equal((await J(user('/api/me'))).user.entitlement.expires, exp1);
assert.ok((await P()).url); ok('approve activates plan once; double click cannot extend it');
// A listened play counts and reaches the stats.
const shortWav = ff('s.wav', ['-f', 'lavfi', '-i', 'sine=500:duration=4']);
const su = await upload(shortWav);
const ST = await J(admin('/api/admin/tracks', { method: 'POST', body: { key: su.key, title: 'Qisqa', artist: 'Test Ijrochi' } }));
const sp = await J(user('/api/play', { method: 'POST', body: { trackId: ST.id } }));
await new Promise(r => setTimeout(r, 1200));
assert.equal((await J(user(`/api/plays/${sp.playId}/counted`, { method: 'POST' }))).counted, true);
await J(user(`/api/plays/${sp.playId}/counted`, { method: 'POST' }));
const topNow = (await J(admin('/api/admin/stats'))).top7.find(t => t.id === ST.id);
assert.equal(topNow.plays, 1); ok('listened play counted exactly once and appears in top songs');
await J(admin(`/api/admin/tracks/${ST.id}`, { method: 'DELETE' }));
// Click: signed calls only, exact amount, idempotent, cancels honoured.
{
  const secret = 'test-secret-key', service = '101';
  assert.equal((await J(admin('/api/admin/settings', { method: 'PATCH', body: { click_service_id: service, click_merchant_id: '202', click_secret: secret } }))).s, 200);
  const shown = await J(admin('/api/admin/settings')); assert.equal(shown.click_secret, undefined); assert.equal(shown.click_secret_set, true);
  assert.equal((await J(admin('/api/payments/click', { method: 'POST', body: { planId: 'puls' } }))).s, 400); ok('admin never pays');
  const buyer = client();
  await buyer('/api/auth/register', { method: 'POST', body: { name: 'Xaridor', email: `b${Date.now()}@test.uz`, password: 'parol12345' } });
  const planPrice = (await J(buyer('/api/plans'))).plans.find((x: any) => x.id === 'puls').price;
  const link = await J(buyer('/api/payments/click', { method: 'POST', body: { planId: 'puls' } }));
  const url = new URL(link.url); const order = url.searchParams.get('transaction_param');
  assert.equal(url.host, 'my.click.uz'); assert.equal(url.searchParams.get('amount'), planPrice.toFixed(2));
  const md5 = (x: string) => createHash('md5').update(x).digest('hex');
  const call = async (action: number, { amount = planPrice.toFixed(2), prepare = '', trans = '777', error = '0', ord = order, bad = false } = {}) => {
    const time = '2026-11-02 12:00:00';
    const sign = bad ? '0'.repeat(32) : md5(trans + service + secret + ord + (action === 1 ? prepare : '') + amount + action + time);
    const form = new URLSearchParams({ click_trans_id: trans, service_id: service, click_paydoc_id: '1', merchant_trans_id: ord, merchant_prepare_id: prepare, amount, action: String(action), error, error_note: 'x', sign_time: time, sign_string: sign });
    return (await fetch(`${BASE}/api/click/callback`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })).json();
  };
  assert.equal((await call(0, { bad: true })).error, -1);
  assert.equal((await call(0, { amount: '1.00' })).error, -2);
  assert.equal((await call(0, { ord: 'nope' })).error, -5);
  assert.equal((await call(5)).error, -3);
  const pre = await call(0); assert.equal(pre.error, 0); assert.ok(pre.merchant_prepare_id);
  assert.equal((await J(buyer('/api/me'))).user.entitlement.premium, false);
  const prepare = String(pre.merchant_prepare_id);
  assert.equal((await call(1, { prepare: '999999' })).error, -6);
  const done = await call(1, { prepare }); assert.equal(done.error, 0); assert.ok(done.merchant_confirm_id);
  const exp1 = (await J(buyer('/api/me'))).user.entitlement.expires; assert.ok(exp1);
  assert.equal((await call(1, { prepare })).error, -4);
  assert.equal((await J(buyer('/api/me'))).user.entitlement.expires, exp1); ok('Click: bad sign, amount, order and action refused; repeat cannot extend the plan');
  const again = new URL((await J(buyer('/api/payments/click', { method: 'POST', body: { planId: 'puls' } }))).url).searchParams.get('transaction_param');
  const p2 = await call(0, { ord: again, trans: '888' });
  assert.equal((await call(1, { ord: again, trans: '888', prepare: String(p2.merchant_prepare_id), error: '-5017' })).error, -9);
  assert.equal((await call(0, { ord: again, trans: '888' })).error, -9);
  assert.equal((await J(buyer('/api/me'))).user.entitlement.expires, exp1); ok('Click: a failed payment grants nothing and stays cancelled');
  await J(admin('/api/admin/settings', { method: 'PATCH', body: { click_service_id: '', click_merchant_id: '' } }));
  assert.equal((await J(buyer('/api/plans'))).click, false);
}
// Email code: account exists only after the right code; tries are limited.
{
  const em = `code${Date.now()}@test.uz`, c1 = client();
  assert.equal((await J(admin('/api/admin/settings', { method: 'PATCH', body: { email_from: 'not-an-email' } }))).s, 400);
  assert.equal((await J(admin('/api/admin/settings', { method: 'PATCH', body: { smtp_user: 'bad' } }))).s, 400);
  assert.equal((await J(admin('/api/admin/settings', { method: 'PATCH', body: { email_from: 'no-reply@svrvs.uz' } }))).s, 200);
  const reg = await J(c1('/api/auth/register', { method: 'POST', body: { name: 'Kod', email: em, password: 'parol12345' } }));
  assert.equal(reg.s, 202); assert.equal(reg.verify, true);
  assert.equal((await J(c1('/api/me'))).user, null);
  assert.equal((await J(c1('/api/auth/login', { method: 'POST', body: { email: em, password: 'parol12345' } }))).s, 401);
  assert.equal((await J(c1('/api/auth/register', { method: 'POST', body: { name: 'Kod', email: em, password: 'parol12345' } }))).s, 429);
  assert.equal((await J(c1('/api/auth/verify', { method: 'POST', body: { email: em, code: '000000' } }))).s, 401); ok('email code: no account before the code, wrong code refused');
  const secret = readFileSync('.dev.vars', 'utf8').match(/SIGNING_SECRET=(.*)/)?.[1]?.trim();
  if (secret && BASE.includes('127.0.0.1')) {
    const known = createHmac('sha256', secret).update(`signup.${em}.123456`).digest('hex');
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'rythm', '--local', '--command', `UPDATE signups SET code_hash='${known}' WHERE email='${em}'`], { stdio: 'ignore' });
    assert.equal((await J(c1('/api/auth/verify', { method: 'POST', body: { email: em, code: '123456' } }))).s, 201);
    assert.equal((await J(c1('/api/me'))).user.email, em); ok('email code: the right code creates the account and signs in');
    assert.equal((await J(c1('/api/auth/verify', { method: 'POST', body: { email: em, code: '123456' } }))).s, 410);
  }
  await J(admin('/api/admin/settings', { method: 'PATCH', body: { email_from: '' } }));
}
// User list: total, paging, spreadsheet export, admin only.
{
  const evil = client(), evilMail = `csv${Date.now()}@test.uz`;
  await evil('/api/auth/register', { method: 'POST', body: { name: '=HYPERLINK("x")', email: evilMail, password: 'parol12345' } });
  const listed = await J(admin('/api/admin/users?q=&filter=&offset=0'));
  assert.ok(listed.total >= 2); assert.ok(listed.users.some((u: any) => u.email === evilMail)); assert.ok(listed.users[0].created_at);
  assert.equal((await J(admin(`/api/admin/users?q=&filter=&offset=${listed.total}`))).users.length, 0);
  assert.equal((await J(evil('/api/admin/users'))).s, 403); assert.equal((await evil('/api/admin/users.csv')).status, 403);
  const csv = await (await admin('/api/admin/users.csv')).text();
  assert.ok(csv.includes(evilMail)); assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`)); assert.ok(!csv.includes('pass_hash')); ok('user list: total, paging, safe export, admin only');
  const victim = listed.users.find((u: any) => u.email === evilMail).id;
  assert.equal((await J(evil(`/api/admin/users/${victim}`, { method: 'DELETE' }))).s, 403);
  assert.equal((await J(admin(`/api/admin/users/${victim}`, { method: 'DELETE' }))).s, 409);
  const adminId = (await J(admin('/api/me'))).user.id;
  assert.equal((await J(admin(`/api/admin/users/${adminId}`, { method: 'DELETE' }))).s, 400);
  await J(admin(`/api/admin/users/${victim}`, { method: 'PATCH', body: { banned: true } }));
  assert.equal((await J(admin(`/api/admin/users/${victim}`, { method: 'DELETE' }))).s, 200);
  assert.ok(!(await J(admin('/api/admin/users?q=&filter=&offset=0'))).users.some((u: any) => u.id === victim));
  assert.equal((await J(evil('/api/me'))).user, null); ok('delete: admin only, must be blocked first, admin account protected, session ends');
}
// Admin API keys: full admin access for scripts, shown once, revocable, cannot manage keys.
{
  const made = await J(admin('/api/admin/api-keys', { method: 'POST', body: { name: 'Skript' } }));
  assert.equal(made.s, 201); assert.match(made.key, /^rk_[0-9a-f]{64}$/);
  const bearer = { authorization: `Bearer ${made.key}` };
  const stats = await J(anon('/api/admin/stats', { headers: bearer })); assert.equal(stats.s, 200); assert.ok(stats.users >= 1);
  const patched = await J(anon('/api/admin/settings', { method: 'PATCH', headers: { ...bearer, 'content-type': 'application/json' }, raw: JSON.stringify({ hero_sub: 'API orqali' }) })); assert.equal(patched.s, 200);
  assert.equal((await J(admin('/api/admin/settings'))).hero_sub, 'API orqali');
  assert.equal((await J(anon('/api/admin/stats', { headers: { authorization: `Bearer rk_${'0'.repeat(64)}` } }))).s, 401);
  assert.equal((await J(anon('/api/admin/stats', { headers: { authorization: 'Bearer nonsense' } }))).s, 401);
  assert.equal((await J(anon('/api/admin/api-keys', { headers: bearer }))).s, 403);
  assert.equal((await J(anon('/api/admin/api-keys', { method: 'POST', headers: { ...bearer, 'content-type': 'application/json' }, raw: '{"name":"x"}' }))).s, 403);
  const docs = await J(anon('/api/admin/docs', { headers: bearer }));
  assert.ok(docs.endpoints.some((d: any) => d.path === '/api/admin/tracks' && d.method === 'POST')); assert.ok(!docs.endpoints.some((d: any) => d.path.includes('api-keys')));
  const listed2 = await J(admin('/api/admin/api-keys')); const mine = listed2.keys.find((k: any) => k.name === 'Skript');
  assert.equal(JSON.stringify(listed2).includes(made.key), false);
  assert.equal(mine.hint, made.key.slice(-6));
  assert.equal((await J(admin(`/api/admin/api-keys/${mine.id}`, { method: 'DELETE' }))).s, 200);
  assert.equal((await J(anon('/api/admin/stats', { headers: bearer }))).s, 401);
  await J(admin('/api/admin/settings', { method: 'PATCH', body: { hero_sub: "Har bir qo'shiq siqilmagan WAV formatida." } }));
  ok('API keys: admin access, shown once, revocable, cannot manage keys');
}
// Offline: follows the plan, enforces the song limit, keeps the listener's order.
{
  const o = client(), mail = `off${Date.now()}@test.uz`;
  await o('/api/auth/register', { method: 'POST', body: { name: 'Oflayn', email: mail, password: 'parol12345' } });
  const oid = (await J(o('/api/me'))).user.id;
  const wavs: string[] = [];
  const small = ff('o.wav', ['-f', 'lavfi', '-i', 'sine=400:duration=1']);
  for (let i = 0; i < 12; i++) { const u = await upload(small); wavs.push((await J(admin('/api/admin/tracks', { method: 'POST', body: { key: u.key, title: `Off${i}`, artist: 'OffIjrochi' } }))).id); }
  try {
    assert.equal((await J(o('/api/offline'))).limit, 0);
    assert.equal((await J(o('/api/offline', { method: 'POST', body: { trackId: wavs[0] } }))).s, 403); ok('offline closed without a plan');
    await J(admin(`/api/admin/users/${oid}`, { method: 'PATCH', body: { grantPlanId: 'duet' } }));
    const st1 = await J(o('/api/offline')); assert.equal(st1.limit, 10); assert.ok(st1.validUntil > Date.now() / 1000);
    assert.equal((await J(o(`/api/offline/${wavs[0]}/url`))).s, 404);
    for (let i = 0; i < 10; i++) assert.equal((await J(o('/api/offline', { method: 'POST', body: { trackId: wavs[i] } }))).s, 201);
    assert.equal((await J(o('/api/offline', { method: 'POST', body: { trackId: wavs[10] } }))).s, 409); ok('Boyvacha stops at 10 songs');
    assert.equal((await J(o(`/api/offline/${wavs[0]}`, { method: 'DELETE' }))).s, 200);
    assert.equal((await J(o('/api/offline', { method: 'POST', body: { trackId: wavs[10] } }))).s, 201); ok('removing a song frees its place');
    const ids = (await J(o('/api/offline'))).items.map((t: any) => t.id).reverse();
    assert.equal((await J(o('/api/offline/order', { method: 'PUT', body: { ids } }))).s, 200);
    assert.deepEqual((await J(o('/api/offline'))).items.map((t: any) => t.id), ids); ok('the listener chooses the order');
    const link = await J(o(`/api/offline/${ids[0]}/url`)); assert.ok(link.url);
    assert.equal((await anon(link.url, { headers: { range: 'bytes=0-3' } })).status, 206);
    await J(admin(`/api/admin/users/${oid}`, { method: 'PATCH', body: { revokePlan: true } }));
    const lapsed = await J(o('/api/offline')); assert.equal(lapsed.limit, 0); assert.equal(lapsed.items.length, 10); assert.ok(lapsed.items.every((t: any) => !t.allowed));
    assert.equal((await J(o(`/api/offline/${ids[0]}/url`))).s, 403); ok('a lapsed plan locks offline but keeps the list');
    await J(admin(`/api/admin/users/${oid}`, { method: 'PATCH', body: { grantPlanId: 'orkestr' } }));
    const open = await J(o('/api/offline')); assert.equal(open.limit, -1); assert.ok(open.items.every((t: any) => t.allowed));
    assert.equal((await J(o('/api/offline', { method: 'POST', body: { trackId: wavs[11] } }))).s, 201); ok('paying reopens it; Karanda has no limit');
    await J(admin(`/api/admin/users/${oid}`, { method: 'PATCH', body: { revokePlan: true } }));
    await J(admin(`/api/admin/users/${oid}`, { method: 'PATCH', body: { grantPlanId: 'duet' } }));
    const down = await J(o('/api/offline')); assert.equal(down.items.filter((t: any) => t.allowed).length, 10); assert.equal(down.items.length, 11); ok('a downgrade locks only the songs beyond the new limit');
    assert.equal((await J(admin('/api/offline'))).limit, -1); ok('admin has no offline limit');
  } finally { for (const id of wavs) await J(admin(`/api/admin/tracks/${id}`, { method: 'DELETE' })); }
}
// Family seats
const friend = client(), fm = `f${Date.now()}@test.uz`;
await friend('/api/auth/register', { method: 'POST', body: { name: 'Vali', email: fm, password: 'parol12345' } });
assert.equal((await J(user('/api/family', { method: 'POST', body: { email: fm } }))).s, 409); ok('single-seat plan cannot add members');
await J(admin(`/api/admin/users/${(await J(friend('/api/me'))).user.id}`, { method: 'PATCH', body: { banned: true } }));
assert.equal((await J(friend('/api/me'))).user, null); ok('ban ends the session');
// Stats, install, releases
const stats = await J(admin('/api/admin/stats')); assert.ok(stats.users >= 2); assert.ok(stats.storage.bytes >= big.length);
const mc = await anon('/dl/ios.mobileconfig'); assert.equal(mc.headers.get('content-type'), 'application/x-apple-aspen-config'); assert.match(await mc.text(), /com\.apple\.webClip\.managed/); ok('stats and iOS web clip profile');
const cur = (await J(anon('/api/app/latest'))).release?.versionCode || 0;
const apk = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(100)]);
assert.equal((await J(admin(`/api/admin/releases?versionCode=${cur + 1}&versionName=x`, { method: 'POST', raw: 'not apk' }))).s, 415);
if (cur) assert.equal((await J(admin(`/api/admin/releases?versionCode=${cur}&versionName=x`, { method: 'POST', raw: apk }))).s, 409);
else { // Never publish a fake build over a real release.
  assert.equal((await J(admin('/api/admin/releases?versionCode=1&versionName=9.9', { method: 'POST', raw: apk }))).s, 201);
  const l = (await J(anon('/api/app/latest'))).release; assert.equal((await anon('/dl/android')).status, 302);
  await J(admin(`/api/admin/releases/${l.id}`, { method: 'DELETE' }));
}
ok('APK release: magic checked, version must grow');
// Beat map: admin only, must match the song's length, then served publicly with the track.
const frames = Math.round(up.duration * 20), map = Buffer.alloc(frames * 16, 7);
assert.equal((await J(user(`/api/admin/tracks/${T.id}/rhythm`, { method: 'PUT', raw: map }))).s, 403);
assert.equal((await J(admin(`/api/admin/tracks/${T.id}/rhythm`, { method: 'PUT', raw: Buffer.alloc(160) }))).s, 400);
assert.equal((await J(admin(`/api/admin/tracks/${T.id}/rhythm`, { method: 'PUT', raw: map }))).s, 200);
const withMap = await J(admin(`/api/tracks/${T.id}`)); assert.ok(withMap.rhythm);
assert.equal((await (await anon(withMap.rhythm)).arrayBuffer()).byteLength, map.length); ok('beat map: admin only, validated, served');
assert.equal((await anon(play.url)).headers.get('cache-control')?.includes('no-transform'), true); ok('stream forbids recompression');
const seenAt = withMap.createdAt;
assert.equal((await J(user('/api/me/seen', { method: 'POST', body: { at: seenAt } }))).s, 200);
assert.equal((await J(user('/api/me'))).user.seenTrackAt, seenAt);
await J(user('/api/me/seen', { method: 'POST', body: { at: seenAt - 100 } }));
assert.equal((await J(user('/api/me'))).user.seenTrackAt, seenAt); ok('new-song announcement stays seen and never moves backwards');
// Delete removes the R2 object
assert.equal((await J(admin(`/api/admin/tracks/${T.id}`, { method: 'DELETE' }))).s, 200);
assert.equal((await anon(play.url)).status, 404); ok('deleting a track removes it');
console.log(`all ${n} checks passed`);
