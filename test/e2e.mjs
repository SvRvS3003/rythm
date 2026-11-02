// JavaScript, test/e2e.mjs, node: API checks against a running `npm run dev`. Usage: node test/e2e.mjs [base] [adminPassword]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const BASE = process.argv[2] || 'http://127.0.0.1:8787', PASS = process.argv[3] || 'local-dev-pass';
const tmp = mkdtempSync(join(tmpdir(), 'rythm-'));
const client = () => {
  let cookie = '';
  return async (path, { method = 'GET', body, raw, headers = {} } = {}) => {
    const r = await fetch(BASE + path, { method, redirect: 'manual', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return r;
  };
};
const J = async p => { const r = await p; const d = await r.json().catch(() => ({})); return { s: r.status, ...d }; };
const ff = (name, args) => { const f = join(tmp, name); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, f]); return readFileSync(f); };
let n = 0; const ok = m => console.log(`  ok ${++n} ${m}`);

const admin = client(), user = client(), anon = client();
assert.equal((await J(admin('/api/auth/login', { method: 'POST', body: { email: 'admin', password: 'wrong' } }))).s, 401);
assert.equal((await J(admin('/api/auth/login', { method: 'POST', body: { email: 'admin', password: PASS } }))).s, 200); ok('admin login, wrong password refused');
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
const png = await J(admin('/api/admin/images', { method: 'POST', raw: readFileSync('public/icon-512.png') })); assert.equal(png.s, 201); ok('svg refused, png stored');
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
const P = () => J(user('/api/play', { method: 'POST', body: { trackId: T.id } }));
assert.ok((await P()).url); assert.ok((await P()).url);
const adr = await P(); assert.ok(adr.ad && !adr.url); ok('4th play returns an ad and no stream URL');
const early = await J(user(`/api/ads/${adr.ad.viewId}/complete`, { method: 'POST' })); assert.ok(early.s === 409 || adr.ad.duration <= 2, 'early');
ok('ad cannot be completed instantly');
await new Promise(r => setTimeout(r, 3200));
assert.equal((await J(user(`/api/ads/${adr.ad.viewId}/complete`, { method: 'POST' }))).s, 200);
assert.ok((await P()).url); ok('after waiting, ad completes and playback resumes');
// Plan toggle & exempt list
assert.ok((await P()).url); assert.ok((await P()).url); assert.ok((await P()).ad);
await J(admin('/api/admin/settings', { method: 'PATCH', body: { plans_enabled: false } }));
assert.ok((await P()).url); assert.equal((await J(user('/api/me'))).user.entitlement.reason, 'plans_off'); ok('one toggle off: nobody gets ads');
await J(admin('/api/admin/settings', { method: 'PATCH', body: { plans_enabled: true } }));
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
// Family seats
const friend = client(), fm = `f${Date.now()}@test.uz`;
await friend('/api/auth/register', { method: 'POST', body: { name: 'Vali', email: fm, password: 'parol12345' } });
assert.equal((await J(user('/api/family', { method: 'POST', body: { email: fm } }))).s, 409); ok('single-seat plan cannot add members');
await J(admin(`/api/admin/users/${(await J(friend('/api/me'))).user.id}`, { method: 'PATCH', body: { banned: true } }));
assert.equal((await J(friend('/api/me'))).user, null); ok('ban ends the session');
// Stats, install, releases
const stats = await J(admin('/api/admin/stats')); assert.ok(stats.users >= 2); assert.ok(stats.storage.bytes >= big.length);
const mc = await anon('/dl/ios.mobileconfig'); assert.equal(mc.headers.get('content-type'), 'application/x-apple-aspen-config'); assert.match(await mc.text(), /com\.apple\.webClip\.managed/); ok('stats and iOS web clip profile');
assert.equal((await J(admin('/api/admin/releases?versionCode=1&versionName=x', { method: 'POST', raw: 'not apk' }))).s, 415);
const apk = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(100)]), code = Math.floor(Date.now() / 1000);
assert.equal((await J(admin(`/api/admin/releases?versionCode=${code}&versionName=9.9`, { method: 'POST', raw: apk }))).s, 201);
assert.equal((await J(admin(`/api/admin/releases?versionCode=${code}&versionName=9.9`, { method: 'POST', raw: apk }))).s, 409);
const latest = (await J(anon('/api/app/latest'))).release; assert.equal(latest.versionCode, code);
assert.equal((await anon('/dl/android')).status, 302);
await J(admin(`/api/admin/releases/${latest.id}`, { method: 'DELETE' })); ok('APK release: magic checked, version must grow, public latest works');
// Delete removes the R2 object
assert.equal((await J(admin(`/api/admin/tracks/${T.id}`, { method: 'DELETE' }))).s, 200);
assert.equal((await anon(play.url)).status, 404); ok('deleting a track removes it');
console.log(`all ${n} checks passed`);
