import { MUTE_ARGS, silence } from './silent.ts';
import { webkit, chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = 'http://127.0.0.1:8787', which = process.argv[2] || 'chromium';
const b = await (which === 'webkit' ? webkit : chromium).launch(which === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required', ...MUTE_ARGS] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await silence(ctx);
const p = await ctx.newPage();
const errs: string[] = []; p.on('pageerror', e => { if (!/access control|Load failed|Failed to fetch/.test(e.message)) errs.push(e.message); });
await p.addInitScript(() => { const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { (window as any).__a = this; return play.apply(this, arguments as any); }; });
const adminCtx = await b.newContext(); const ap = await adminCtx.newPage();
const J = (pg: any, path: string, body?: unknown, method = 'POST') => pg.evaluate(async ([path, body, method]: any) => { const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, ...(await r.json().catch(() => ({}))) }; }, [path, body, method]);
await ap.goto(BASE); await J(ap, '/api/auth/login', { email: 'admin', password: 'local-dev-pass' });
const f = join(mkdtempSync(join(tmpdir(), 'off-')), 's.wav');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=350:duration=45:sample_rate=48000', '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s24le', f]);
const src = readFileSync(f), srcSha = createHash('sha256').update(src).digest('hex');
assert.ok(src.length > 8 << 20, 'needs several chunks');
const id = await ap.evaluate(async b64 => {
  const body = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), j = { 'content-type': 'application/json' };
  const st = await (await fetch('/api/admin/uploads', { method: 'POST', headers: j, body: '{"kind":"audio"}' })).json();
  const part = await (await fetch(`/api/admin/uploads/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=1`, { method: 'PUT', body })).json();
  await fetch('/api/admin/uploads/complete', { method: 'POST', headers: j, body: JSON.stringify({ key: st.key, uploadId: st.uploadId, parts: [part] }) });
  return (await (await fetch('/api/admin/tracks', { method: 'POST', headers: j, body: JSON.stringify({ key: st.key, title: 'OflaynSinov', artist: 'OI' }) })).json()).id;
}, src.toString('base64'));
try {
  await p.goto(BASE);
  const mail = `dev${Date.now()}@test.uz`;
  await J(p, '/api/auth/register', { name: 'Dev', email: mail, password: 'parol12345' });
  const uid = (await J(p, '/api/me', undefined, 'GET')).user.id;
  await J(ap, `/api/admin/users/${uid}`, { grantPlanId: 'duet' }, 'PATCH');
  await J(ap, '/api/admin/settings', { ad_every: 0 }, 'PATCH');
  await p.waitForTimeout(32000);
  await p.goto(BASE + '/search'); await p.waitForSelector('.list .tr'); await p.waitForTimeout(800);
  await p.reload(); await p.waitForSelector('.list .tr');
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await p.locator(`.tr[data-id="${id}"] button[aria-label="Pleylistga qo'shish"]`).first().click();
  await p.getByRole('button', { name: 'Oflayn saqlash' }).click();

  const isDone = () => p.evaluate(async i => { const d: IDBDatabase = await new Promise(r => { const o = indexedDB.open('rythm-offline', 1); o.onsuccess = () => r(o.result); }); const s: any = await new Promise(r => { const g = d.transaction('songs').objectStore('songs').get(i); g.onsuccess = () => r(g.result); }); return s?.done === true; }, id).catch(() => false);
  for (let n = 0; n < 180 && !(await isDone()); n++) await p.waitForTimeout(500);
  assert.equal(await isDone(), true, 'download did not finish');
  console.log('  ok saved through the + menu');

  const inside = await p.evaluate(async i => {
    const d: IDBDatabase = await new Promise(r => { const o = indexedDB.open('rythm-offline', 1); o.onsuccess = () => r(o.result); });
    const get = (s: string, k: any): Promise<any> => new Promise(r => { const g = d.transaction(s).objectStore(s).get(k); g.onsuccess = () => r(g.result); });
    const dbg: any = await new Promise(r => { const c = d.transaction('chunks').objectStore('chunks').getAllKeys(); c.onsuccess = () => r(c.result); });
    const song: any = await get('songs', i);
    const first = await get('chunks', [i, 0]), key = await get('meta', 'key');
    if (!first) throw new Error(`no chunk 0: ${JSON.stringify({ keys: dbg.slice(0, 3), n: dbg.length, song: song && { size: song.size, have: song.have, done: song.done } })}`);
    const head = new TextDecoder('latin1').decode(new Uint8Array(first.data).slice(0, 4));
    let exported = false; try { await crypto.subtle.exportKey('raw', key); exported = true; } catch {  }
    const names = await caches.keys(); let plain = false;
    for (const n of names) for (const r of await (await caches.open(n)).keys()) if (r.url.includes(i)) plain = true;
    return { head, extractable: key.extractable, exported, plain };
  }, id);
  assert.notEqual(inside.head, 'RIFF', 'stored chunk must not be plain WAV');
  assert.equal(inside.extractable, false); assert.equal(inside.exported, false); assert.equal(inside.plain, false);
  console.log('  ok stored encrypted, key cannot be exported, no plain copy in caches');

  await ctx.setOffline(true);
  await p.goto(BASE + '/'); await p.waitForURL(/\/offline$/, { timeout: 15000 }); await p.waitForSelector('.offline-list .tr');
  const sha = await p.evaluate(async i => { const b = await (await fetch(`/off/${i}`)).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join(''); }, id);
  assert.equal(sha, srcSha, 'decrypted song must equal the source byte for byte');
  const mid = await p.evaluate(async i => { const r = await fetch(`/off/${i}`, { headers: { range: 'bytes=3000000-3000009' } }); return { s: r.status, n: (await r.arrayBuffer()).byteLength, cr: r.headers.get('content-range') }; }, id);
  assert.equal(mid.s, 206); assert.equal(mid.n, 10); assert.equal(mid.cr, `bytes 3000000-3000009/${src.length}`);
  await p.locator(`.offline-list .tr[data-id="${id}"] .hit`).click(); await p.waitForTimeout(4000);
  const a = await p.evaluate(() => { const x = (window as any).__a; return { t: x.currentTime, paused: x.paused, src: x.src }; });
  assert.ok(a.t > 1 && !a.paused && a.src.includes('/off/'), `offline playback failed: ${JSON.stringify(a)}`);
  await p.evaluate(() => (window as any).__a.pause());
  console.log('  ok played with no network, byte-identical, seeking works');
  await ctx.setOffline(false);

  await J(ap, `/api/admin/users/${uid}`, { revokePlan: true }, 'PATCH');
  await p.goto(BASE + '/offline'); await p.getByText('Oflayn yopiq').waitFor({ timeout: 15000 });
  assert.equal(await p.evaluate(async i => (await fetch(`/off/${i}`)).status, id), 403);
  assert.equal(await p.locator(`.offline-list .tr[data-id="${id}"] .hit`).isDisabled(), true);
  console.log('  ok a lapsed plan locks the song');
  await J(ap, `/api/admin/users/${uid}`, { grantPlanId: 'duet' }, 'PATCH');
  let downloads = 0; p.on('request', r => { if (r.url().includes('/media/stream/')) downloads++; });
  await p.goto(BASE + '/offline'); await p.waitForSelector(`.offline-list .tr[data-id="${id}"] .hit:not([disabled])`, { timeout: 15000 });
  assert.equal(await p.evaluate(async i => (await fetch(`/off/${i}`, { headers: { range: 'bytes=0-3' } })).status, id), 206);
  assert.equal(downloads, 0, 'paying must reopen without downloading again');
  console.log('  ok paying reopens it at once, no new download');

  await p.goto(BASE + '/account'); await p.getByRole('button', { name: 'Chiqish' }).click(); await p.getByRole('button', { name: 'Kirish', exact: true }).waitFor();
  await p.waitForTimeout(800);
  const gone = await p.evaluate(async i => { const d: IDBDatabase = await new Promise(r => { const o = indexedDB.open('rythm-offline', 1); o.onsuccess = () => r(o.result); }); return new Promise(r => { const g = d.transaction('chunks').objectStore('chunks').get([i, 0]); g.onsuccess = () => r(g.result === undefined); }); }, id);
  assert.equal(gone, true); console.log('  ok signing out wipes the device');
  assert.deepEqual(errs, []);
  console.log(which, 'offline checks passed');
} finally {
  await J(ap, `/api/admin/tracks/${id}`, undefined, 'DELETE');
  await J(ap, '/api/admin/settings', { ad_every: 3 }, 'PATCH');
  await b.close();
}
