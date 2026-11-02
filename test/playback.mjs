// JavaScript, test/playback.mjs, node + playwright: auto-advance and switch delay against local dev. Usage: node test/playback.mjs [webkit|chromium]
import { webkit, chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = 'http://127.0.0.1:8787', tmp = mkdtempSync(join(tmpdir(), 'pb-'));
const b = await (process.argv[2] === 'chromium' ? chromium : webkit).launch({ args: process.argv[2] === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.addInitScript(() => {
  const log = window.__log = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!this.__w) { this.__w = 1; window.__a = this; for (const ev of ['ended', 'playing', 'waiting', 'error']) this.addEventListener(ev, () => log.push({ ev, t: performance.now(), src: this.src.slice(0, 40) })); }
    return play.apply(this, arguments);
  };
});
const j = (path, body, method = 'POST') => p.evaluate(async ([path, body, method]) => { const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, ...(await r.json().catch(() => ({}))) }; }, [path, body, method]);
await p.goto(BASE);
await j('/api/auth/login', { email: 'admin', password: 'local-dev-pass' });
await j('/api/admin/settings', { ad_every: 0, plans_enabled: true }, 'PATCH');
const ids = [];
for (const i of [1, 2, 3]) {
  const f = join(tmp, `${i}.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=${300 + i * 90}:duration=24:sample_rate=48000`, '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s24le', f]);
  const b64 = readFileSync(f).toString('base64');
  const up = await p.evaluate(async b64 => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const st = await (await fetch('/api/admin/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"kind":"audio"}' })).json();
    const part = await (await fetch(`/api/admin/uploads/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=1`, { method: 'PUT', body: buf })).json();
    return (await fetch('/api/admin/uploads/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: st.key, uploadId: st.uploadId, parts: [part] }) })).json();
  }, b64);
  ids.push((await j('/api/admin/tracks', { key: up.key, title: `Ketma${i}`, artist: 'PB' })).id);
}
let code = 0;
try {
  await p.goto(BASE); await p.waitForSelector('.card');
  await p.waitForTimeout(1500);
  await p.locator('.card', { hasText: 'Ketma3' }).first().click();
  const seen = [];
  const end = Date.now() + 95000;
  while (Date.now() < end) {
    const t = await p.evaluate(() => document.querySelector('.player .info .clip')?.textContent);
    if (t && seen[seen.length - 1] !== t) { seen.push(t); console.log('  now:', t); }
    if (seen.length >= 4) break;
    await p.waitForTimeout(500);
  }
  const log = await p.evaluate(() => window.__log);
  const gaps = [];
  log.forEach((e, n) => { if (e.ev === 'ended') { const pl = log.slice(n).find(x => x.ev === 'playing'); if (pl) gaps.push(Math.round(pl.t - e.t)); } });
  console.log('sequence:', seen.join(' -> '));
  console.log('switch gaps ms:', gaps.join(', ') || 'none', '| waiting events:', log.filter(e => e.ev === 'waiting').length, '| errors:', log.filter(e => e.ev === 'error').length);
  const cached = await p.evaluate(async () => { try { const c = await caches.open('rythm-audio'); return (await c.keys()).length; } catch { return -1; } });
  console.log('tracks in device cache:', cached);
  if (seen.length < 4) { console.log('FAIL: did not advance through 3 songs into the next one'); code = 1; }
  if (cached < 1) { console.log('FAIL: nothing cached'); code = 1; }
} finally {
  await p.goto(BASE);
  for (const id of ids) await j(`/api/admin/tracks/${id}`, null, 'DELETE');
  await b.close();
}
process.exit(code);
