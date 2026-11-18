import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { MUTE_ARGS, silence } from './silent.ts';
const BASE = 'http://127.0.0.1:8787';
const onWebkit = process.argv[3] === 'webkit';
const b = onWebkit ? await webkit.launch() : await chromium.launch({ args: [...MUTE_ARGS, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...(onWebkit ? { userAgent: IOS } : {}) });
await silence(ctx);
const p = await ctx.newPage();
const errors: string[] = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext as (...a: unknown[]) => unknown;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, o?: object) { return get.call(this, type, type === 'webgl' ? { ...o, preserveDrawingBuffer: true } : o); } as never;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { (window as unknown as { __a: HTMLMediaElement }).__a = this; return play.call(this); };
});

const fps = 20, bands = 16, map = new Uint8Array(600 * fps * bands);
for (let f = 0; f < 600 * fps; f++) if (Math.floor(f / fps) % 2) map.fill(f % 4 < 2 ? 255 : 90, f * bands, (f + 1) * bands);
await p.route('**/api/home', async r => { const res = await r.fetch(); const d = await res.json(); for (const k of ['fresh', 'popular', 'promoted']) for (const t of d[k]) t.rhythm = '/fake-beat.bin'; await r.fulfill({ response: res, json: d }); });
await p.route('**/fake-beat.bin', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(map) }));
await p.goto(BASE);
await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'local-dev-pass' }) }));
await p.goto(BASE); await p.waitForSelector('.tr .hit');

const sample = () => p.evaluate(() => {
  const c = document.querySelector<HTMLCanvasElement>('.player .tide')!, x = document.createElement('canvas').getContext('2d')!;
  x.canvas.width = c.width; x.canvas.height = c.height; x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, row = (c.height >> 1) * c.width * 4;
  let shore = 0, r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < c.width; i++) { const a = d[row + i * 4 + 3]; if (a > 150) { shore = i; r += d[row + i * 4]; g += d[row + i * 4 + 1]; bl += d[row + i * 4 + 2]; n++; } }
  return { w: c.width, shore: shore / c.width, color: n ? [r / n, g / n, bl / n].map(Math.round) : [0, 0, 0] };
});
const seek = (f: number) => p.evaluate(v => { const a = (window as unknown as { __a: HTMLMediaElement }).__a; a.currentTime = a.duration * v; }, f);
await p.locator('.tr .hit').first().dispatchEvent('click'); await p.waitForSelector('.player.show'); await p.waitForTimeout(2500);
const box = await p.evaluate(() => { const a = document.querySelector('.player')!.getBoundingClientRect(), c = document.querySelector('.player .tide')!.getBoundingClientRect(); return { same: Math.abs(a.width - c.width) < 3 && Math.abs(a.height - c.height) < 3, thin: !!document.querySelector('.player .thin') }; });
assert.ok(box.same, 'water covers the whole bar'); assert.equal(box.thin, false, 'the old line is gone'); console.log('ok water covers the whole bar');
const mid = 0.5; await seek(mid); await p.waitForTimeout(1200);
const half = await sample();
assert.ok(half.shore > 0.25 && half.shore < 0.8, `water reaches the middle, got ${half.shore}`); console.log(`ok at 50% the shore is at ${half.shore.toFixed(2)}`);
if (process.argv[2]) await p.screenshot({ path: `${process.argv[2]}/tide-half.png` });
await seek(0.9); await p.waitForTimeout(1200);
const far = await sample(); assert.ok(far.shore > half.shore + 0.15, 'water follows the song'); console.log(`ok at 90% it has moved to ${far.shore.toFixed(2)}`);

await seek(mid);
const quiet: number[] = [], loud: number[] = [];
for (let i = 0; i < 80; i++) { const s = await sample(), at = await p.evaluate(() => (window as unknown as { __a: HTMLMediaElement }).__a.currentTime); ((Math.floor(at) % 2 ? loud : quiet)).push(s.shore); await p.waitForTimeout(60); }
const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
console.log(`shore travel loud ${spread(loud).toFixed(3)} quiet ${spread(quiet).toFixed(3)}`);
assert.ok(spread(loud) > spread(quiet) * 1.2, 'the water must swell with the beat'); console.log('ok the water swells with the beat');

const bright = await p.evaluate(() => {
  const c = document.querySelector<HTMLCanvasElement>('.player .tide')!, x = document.createElement('canvas').getContext('2d')!;
  x.canvas.width = c.width; x.canvas.height = c.height; x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, lum: number[] = [];
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; if (a > 0.6) lum.push(0.2126 * lin(d[i] * a) + 0.7152 * lin(d[i + 1] * a) + 0.0722 * lin(d[i + 2] * a)); }
  lum.sort((l, r) => l - r);
  return lum[Math.floor(lum.length * 0.95)];
});
const contrast = 1.05 / (bright + 0.05);
assert.ok(contrast >= 4.5, `white on water only ${contrast.toFixed(1)}:1`); console.log(`ok white text on the bright water ${contrast.toFixed(1)}:1`);
const c1 = (await sample()).color;
await p.locator('.tr .hit').nth(1).dispatchEvent('click'); await p.waitForTimeout(3500); await seek(mid); await p.waitForTimeout(1500);
const c2 = (await sample()).color;
assert.ok(Math.abs(c1[0] - c2[0]) + Math.abs(c1[1] - c2[1]) + Math.abs(c1[2] - c2[2]) > 25, `another song, another colour: ${c1} / ${c2}`); console.log(`ok colour moved ${c1} -> ${c2}`);
if (process.argv[2]) await p.screenshot({ path: `${process.argv[2]}/tide-song2.png` });

await p.locator('.player > .playbtn').click(); await p.waitForTimeout(400);
const f1 = await sample(); await p.waitForTimeout(300); const f2 = await sample();
assert.notDeepEqual(f1, f2, 'just paused, the waves still move'); console.log('ok just paused, the waves still move');
await p.waitForTimeout(5500);
const a1 = await sample(); await p.waitForTimeout(800); const a2 = await sample();
assert.deepEqual(a1, a2, 'paused water holds still'); console.log('ok paused water holds still');
await p.locator('.player > .playbtn').click();
for (const [w, h, name] of [[844, 390, 'land'], [1280, 800, 'wide']] as const) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900); if (process.argv[2]) await p.screenshot({ path: `${process.argv[2]}/tide-${name}.png` }); const s = await sample(); assert.ok(s.w > 0 && s.shore > 0, name); console.log(`ok ${name}`); }
assert.deepEqual(errors, []);
await b.close();
