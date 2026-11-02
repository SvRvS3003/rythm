// TypeScript, test/lockscreen.ts, node + playwright: while hidden, a song without a cover hands the OS changing logo frames.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs: string[] = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { (window as any).__a = this; return play.apply(this, arguments as any); }; let hide = false; Object.defineProperty(document, 'hidden', { get: () => hide }); (window as any).__hide = (v: boolean) => { hide = v; document.dispatchEvent(new Event('visibilitychange')); }; const M = window.MediaMetadata; (window as any).__frames = 0; (window as any).MediaMetadata = class extends M { constructor(o: any) { super(o); (window as any).__frames++; } }; });
await p.goto('http://127.0.0.1:8787');
await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'local-dev-pass' }) }));
const f = join(mkdtempSync(join(tmpdir(), 'ls-')), 'a.wav');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=300:duration=40', f]);
const id = await p.evaluate(async b64 => {
  const body = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const j = { 'content-type': 'application/json' };
  const st = await (await fetch('/api/admin/uploads', { method: 'POST', headers: j, body: '{"kind":"audio"}' })).json();
  const part = await (await fetch(`/api/admin/uploads/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=1`, { method: 'PUT', body })).json();
  await fetch('/api/admin/uploads/complete', { method: 'POST', headers: j, body: JSON.stringify({ key: st.key, uploadId: st.uploadId, parts: [part] }) });
  return (await (await fetch('/api/admin/tracks', { method: 'POST', headers: j, body: JSON.stringify({ key: st.key, title: 'QulfSinov', artist: 'LS' }) })).json()).id;
}, readFileSync(f).toString('base64'));
try {
  // A beat map loud in even seconds and silent in odd ones: the picture must pulse exactly with it.
  await p.evaluate(async i => {
    const map = new Uint8Array(40 * 20 * 16);
    for (let f = 0; f < 800; f++) if (Math.floor(f / 20) % 2 === 0) map.fill(255, f * 16, (f + 1) * 16);
    await fetch(`/api/admin/tracks/${i}/rhythm`, { method: 'PUT', body: map });
  }, id);
  await p.goto('http://127.0.0.1:8787'); await p.waitForSelector('.card');
  await p.locator('.card', { hasText: 'QulfSinov' }).first().click(); await p.waitForSelector('.player.show'); await p.waitForTimeout(2500);
  const art = () => p.evaluate(() => navigator.mediaSession.metadata?.artwork[0]?.src || '');
  assert.ok(!(await art()).startsWith('data:'), 'visible page keeps the plain icon');
  await p.evaluate(() => (window as any).__hide(true));
  const f0 = await p.evaluate(() => (window as any).__frames), t0 = Date.now();
  const seen = new Set<string>();
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(500); seen.add(await art()); }
  assert.ok([...seen].every(s => s.startsWith('data:image/png') || !s.startsWith('data:')), 'frames are images');
  assert.ok(seen.size >= 4, `only ${seen.size} different frames`);
  const fps = (await p.evaluate(() => (window as any).__frames) - f0) / ((Date.now() - t0) / 1000);
  assert.ok(fps >= 15, `only ${fps.toFixed(1)} frames a second`);
  console.log(`ok lock screen clock runs at ${fps.toFixed(1)} frames a second`);
  const meta = await p.evaluate(() => ({ t: navigator.mediaSession.metadata?.title, a: navigator.mediaSession.metadata?.artist }));
  assert.deepEqual(meta, { t: 'QulfSinov', a: 'LS' });
  // Measure the middle bar in the frame the OS would show, against the song position.
  const sample = () => p.evaluate(async () => {
    const pos = (window as any).__a?.currentTime ?? 0, src = navigator.mediaSession.metadata?.artwork[0]?.src || '';
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const col = g.getImageData(129, 0, 1, 256).data; let h = 0;
    for (let y = 0; y < 256; y++) if (col[y * 4] > 120) h++;
    return { pos, h };
  });
  const loud: number[] = [], quiet: number[] = [];
  for (let i = 0; i < 28; i++) {
    await p.waitForTimeout(300);
    const s = await sample(), frac = s.pos % 2;
    if (frac > 0.5 && frac < 1) loud.push(s.h);
    if (frac > 1.6) quiet.push(s.h);
  }
  const avg = (l: number[]) => l.reduce((x, y) => x + y, 0) / l.length;
  assert.ok(loud.length && quiet.length, 'not enough samples');
  assert.ok(avg(loud) > avg(quiet) + 60, `picture does not follow the beat map: loud ${avg(loud).toFixed(0)} vs quiet ${avg(quiet).toFixed(0)}`);
  console.log(`ok bar follows the song: ${avg(loud).toFixed(0)} px on loud, ${avg(quiet).toFixed(0)} px on quiet`);
  await p.evaluate(() => (window as any).__hide(false)); await p.waitForTimeout(200);
  const kept = await p.evaluate(() => localStorage.getItem('lock-fps'));
  assert.ok(Number(kept) >= 15, `rate not recorded: ${kept}`);
  assert.deepEqual(errs, []);
  console.log(`ok hidden playback swapped ${seen.size} logo frames, title kept`);
} finally {
  await p.evaluate(i => fetch(`/api/admin/tracks/${i}`, { method: 'DELETE' }), id);
  await b.close();
}
