import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MUTE_ARGS, silence } from './silent.ts';
const BASE = 'http://127.0.0.1:8787';
const b = await chromium.launch({ args: [...MUTE_ARGS, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await silence(ctx);
const p = await ctx.newPage();
const errors: string[] = []; p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE);
await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'local-dev-pass' }) }));
await p.goto(BASE); await p.waitForSelector('.tr .hit');
await p.locator('.tr .hit').first().dispatchEvent('click');
await p.waitForSelector('.player.show'); await p.waitForTimeout(2500);
await p.locator('.player .info:not(.ghost)').first().click(); await p.waitForSelector('.now.show'); await p.waitForTimeout(800);

const trace = await p.evaluate(() => new Promise<{ ms: number; frames: number; steps: number[]; labels: string[] }>(res => {
  const bars = [...document.querySelectorAll<HTMLInputElement>('[data-seek]')];
  const prev = bars.map(() => -1), steps = bars.map(() => 0);
  let frames = 0;
  const t0 = performance.now();
  const step = (now: number): void => {
    frames++;
    bars.forEach((el, i) => {
      const f = Number(el.value) / (Number(el.max) || 1);
      if (f !== prev[i]) { steps[i]++; prev[i] = f; }
    });
    if (now - t0 < 2000) requestAnimationFrame(step);
    else res({ ms: now - t0, frames, steps, labels: bars.map(el => el.getAttribute('aria-label') || '') });
  };
  requestAnimationFrame(step);
}));
assert.equal(trace.steps.length, 2, 'the mini bar and the big player both carry a line');
const perSecond = (n: number): number => Math.round(n / (trace.ms / 1000));
for (const [name, moved] of trace.labels.map((l, i) => [l, trace.steps[i]] as const))
  assert.ok(perSecond(moved) > 12, `${name} moved only ${perSecond(moved)} times a second`);
console.log(`ok every progress mark moves frame by frame (${trace.labels.map((l, i) => `${l}: ${perSecond(trace.steps[i])}/s`).join(', ')}, ${trace.frames} frames in ${Math.round(trace.ms)} ms)`);

await p.locator('.now [data-seek]').evaluate(el => { (el as HTMLElement).dataset.drag = '1'; });
const held = await p.evaluate(() => document.querySelector<HTMLInputElement>('.now [data-seek]')!.value);
await p.waitForTimeout(700);
assert.equal(await p.evaluate(() => document.querySelector<HTMLInputElement>('.now [data-seek]')!.value), held, 'a held line stays where the finger left it');
await p.locator('.now [data-seek]').evaluate(el => { delete (el as HTMLElement).dataset.drag; });
assert.deepEqual(errors, []);
await b.close();
