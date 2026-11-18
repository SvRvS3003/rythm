import { MUTE_ARGS, silence } from './silent.ts';
import { webkit, chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = 'http://127.0.0.1:8787', tmp = mkdtempSync(join(tmpdir(), 'pb-'));
const b = await (process.argv[2] === 'chromium' ? chromium : webkit).launch({ args: process.argv[2] === 'chromium' ? ['--autoplay-policy=no-user-gesture-required', ...MUTE_ARGS] : [] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await silence(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => {
  const log: any[] = (window as any).__log = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!(this as any).__w) { (this as any).__w = 1; (window as any).__a = this; for (const ev of ['ended', 'playing', 'waiting', 'error']) this.addEventListener(ev, () => log.push({ ev, t: performance.now(), src: this.src.slice(0, 40) })); }
    return play.apply(this, arguments as any);
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
  await p.evaluate(async id => { await fetch(`/api/admin/tracks/${id}/rhythm`, { method: 'PUT', body: new Uint8Array(24 * 20 * 16).fill(120) }); }, ids[ids.length - 1]);
}
let code = 0;
try {
  const mapHits: { id: string; t: number }[] = [];
  p.on('request', r => { const m = /\/media\/rhythm\/([0-9a-f]{32})/.exec(r.url()); if (m) mapHits.push({ id: m[1], t: Date.now() }); });
  const starts: Record<string, number> = {};
  await p.goto(BASE); await p.waitForSelector('.card');
  await p.waitForTimeout(1500);
  await p.locator('.card', { hasText: 'Ketma3' }).first().click();
  const seen = [];
  const end = Date.now() + 95000;
  while (Date.now() < end) {
    const t = await p.evaluate(() => document.querySelector('.player .info .clip')?.textContent);
    if (t && seen[seen.length - 1] !== t) { seen.push(t); starts[t] = Date.now(); console.log('  now:', t); }
    if (seen.length >= 4) break;
    await p.waitForTimeout(500);
  }
  const log = await p.evaluate(() => (window as any).__log);
  const gaps = [];
  log.forEach((e, n) => { if (e.ev === 'ended') { const pl = log.slice(n).find(x => x.ev === 'playing'); if (pl) gaps.push(Math.round(pl.t - e.t)); } });
  console.log('sequence:', seen.join(' -> '));
  console.log('switch gaps ms:', gaps.join(', ') || 'none', '| waiting events:', log.filter(e => e.ev === 'waiting').length, '| errors:', log.filter(e => e.ev === 'error').length);
  const cached = await p.evaluate(async () => { try { const c = await caches.open('rythm-audio'); return (await c.keys()).length; } catch { return -1; } });
  console.log('tracks in device cache:', cached);

  const next = mapHits.filter(h => h.id === ids[1]);
  if (next.length !== 1 || next[0].t >= starts.Ketma2) { console.log('FAIL: next beat map not preloaded', next.length); code = 1; } else console.log(`beat map preloaded ${((starts.Ketma2 - next[0].t) / 1000).toFixed(1)} s before the song, fetched once`);

  await p.evaluate(() => { const a = (window as any).__a; a.volume = 0; });
  const title = () => p.evaluate(() => document.querySelector('.player .info .clip')?.textContent);
  const toEnd = () => p.evaluate(() => { const a = (window as any).__a; a.currentTime = a.duration - 1; a.play(); });
  await p.locator('.player .info:not(.ghost)').click(); await p.waitForSelector('.now.show');
  const repeatBtn = p.locator('.now button[aria-label^="Takrorlash"]');
  await repeatBtn.click();
  if ((await repeatBtn.getAttribute('aria-label')) !== "Takrorlash: bitta qo'shiq") { console.log('FAIL: repeat order'); code = 1; }
  const iconOne = await repeatBtn.locator('path').getAttribute('d');
  const t1 = await title(); await toEnd(); await p.waitForTimeout(3500);
  const one = await p.evaluate(() => { const a = (window as any).__a; return { paused: a.paused, time: a.currentTime }; });
  if (await title() !== t1 || one.paused || one.time > 6) { console.log('FAIL: repeat one', one); code = 1; } else console.log('repeat one: same song restarted');
  await repeatBtn.click();
  const iconOff = await repeatBtn.locator('path').getAttribute('d');
  if (iconOne === iconOff) { console.log('FAIL: repeat-one icon is not distinct'); code = 1; }
  const t2 = await title(); await toEnd(); await p.waitForTimeout(3500);
  const off = await p.evaluate(() => (window as any).__a.paused);
  if (await title() !== t2 || !off) { console.log('FAIL: repeat off must stop', off); code = 1; } else console.log('repeat off: stopped after the song');
  await repeatBtn.click();
  await p.getByRole('button', { name: 'Yopish' }).click();

  await p.evaluate(() => Object.defineProperty(document, 'hidden', { value: true, configurable: true }));
  const src3 = await p.evaluate(() => (window as any).__a.src.split('?')[0]), endedBefore = await p.evaluate(() => (window as any).__log.filter((e: any) => e.ev === 'ended').length);
  await toEnd(); await p.waitForTimeout(3500);
  const endedAfter = await p.evaluate(() => (window as any).__log.filter((e: any) => e.ev === 'ended').length);
  const hiddenPlaying = await p.evaluate(() => !(window as any).__a.paused);
  if (await p.evaluate(() => (window as any).__a.src.split('?')[0]) === src3 || endedAfter !== endedBefore || !hiddenPlaying) { console.log('FAIL: hidden switch', { ended: endedAfter - endedBefore, hiddenPlaying }); code = 1; } else console.log('locked screen: next song started before the old one ended');

  const hold = await p.evaluate(async () => {
    const w = window as any, a = w.__a, wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const song = a.src, at = a.currentTime;
    w.__nativeCmd('pause'); await wait(800);
    const held = { silent: a.src.startsWith('data:'), loop: a.loop, paused: a.paused };
    w.__nativeCmd('play'); await wait(2500);
    const back = { same: a.src.split('?')[0] === song.split('?')[0], loop: a.loop, paused: a.paused, jump: Math.abs(a.currentTime - at) };
    w.__nativeCmd('pause'); await wait(800);
    w.__nativeCmd('pause'); await wait(2500);
    const again = { silent: a.src.startsWith('data:'), paused: a.paused };
    w.__nativeCmd('pause'); await wait(800);
    delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); await wait(300);
    const shown = { paused: a.paused, loop: a.loop };
    w.__nativeCmd('play'); await wait(2500);
    const after = { silent: a.src.startsWith('data:'), paused: a.paused };
    delete (navigator as any).standalone;
    return { held, back, again, shown, after };
  });
  const holdOk = hold.held.silent && hold.held.loop && !hold.held.paused && hold.back.same && !hold.back.loop && !hold.back.paused && hold.back.jump < 5 && !hold.again.silent && !hold.again.paused && hold.shown.paused && !hold.shown.loop && !hold.after.silent && !hold.after.paused;
  if (!holdOk) { console.log('FAIL: locked hold', JSON.stringify(hold)); code = 1; } else console.log(`locked screen: pause holds on silence, play returns at the same second (jump ${hold.back.jump.toFixed(1)} s)`);
  await p.evaluate(() => { delete (document as any).hidden; });

  const srcSha = createHash('sha256').update(readFileSync(join(tmp, '2.wav'))).digest('hex');
  const dev = await p.evaluate(async id => {
    const sha = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
    const hit = await (await caches.open('rythm-audio')).match(`/audio/${id}`);
    if (!hit) return null;
    const stored = await hit.arrayBuffer();
    const grant = await (await fetch('/api/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trackId: id }) })).json();
    const viaWorker = await (await fetch(grant.url)).arrayBuffer();
    const part = await fetch(grant.url, { headers: { range: 'bytes=1000-1999' } });
    return { stored: await sha(stored), viaWorker: await sha(viaWorker), partStatus: part.status, partLen: (await part.arrayBuffer()).byteLength };
  }, ids[1]);
  if (!dev || dev.stored !== srcSha || dev.viaWorker !== srcSha || dev.partStatus !== 206 || dev.partLen !== 1000) { console.log('FAIL: audio differs from source', dev); code = 1; } else console.log('quality: device copy and stream are byte-identical to the source WAV');
  if (seen.length < 4) { console.log('FAIL: did not advance through 3 songs into the next one'); code = 1; }
  if (cached < 1) { console.log('FAIL: nothing cached'); code = 1; }
} finally {
  await p.goto(BASE);
  for (const id of ids) await j(`/api/admin/tracks/${id}`, null, 'DELETE');
  await b.close();
}
process.exit(code);
