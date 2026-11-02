// JavaScript, test/ios.ts, node + playwright: glass only on iOS, and floating bars never hide content. Usage: node test/ios.ts [outDir]
import { webkit } from 'playwright';
import assert from 'node:assert/strict';
const BASE = 'http://127.0.0.1:8787', OUT = process.argv[2] || 'dist/shots';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const b = await webkit.launch();
const open = async (ua, w, h) => {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, userAgent: ua })).newPage();
  await p.goto(BASE);
  await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'local-dev-pass' }) }));
  await p.goto(BASE); await p.waitForSelector('.card');
  return p;
};
const blur = (p, sel) => p.evaluate(s => { const c = getComputedStyle(document.querySelector(s)); return c.backdropFilter || (c as any).webkitBackdropFilter || 'none'; }, sel);
for (const [name, ua, on] of [['android', ANDROID, false], ['desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', false]] as [string, string, boolean][]) {
  const p = await open(ua, 1000, 800);
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('ios')), on, name);
  console.log(`  ok ${name}: no glass`);
}
{ // Installed app whose reported window is shorter than the screen: must still fill the screen.
  const ctx = await b.newContext({ viewport: { width: 390, height: 790 }, screen: { width: 390, height: 844 }, userAgent: IOS });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector('.auth');
  assert.equal(await p.evaluate(() => document.body.getBoundingClientRect().height), 844);
  await ctx.close();
  console.log('  ok installed app fills the screen height');
}
const sizes = { 'iphone-se': [320, 568], 'iphone': [390, 844], 'duo-outer': [466, 678], 'duo-inner': [626, 890], 'phone-land': [844, 390], 'duo-inner-land': [890, 626], 'ipad': [820, 1180] };
for (const [name, [w, h]] of Object.entries(sizes)) {
  const p = await open(IOS, w, h);
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('ios')));
  await p.locator('.card').first().click();
  await p.waitForSelector('.player.show');
  await p.waitForTimeout(600);
  assert.match(await blur(p, '.player'), /blur/, `${name} player`);
  await p.screenshot({ path: `${OUT}/glass-${name}.png` });
  // Scrolled to the very end, the last content must sit above the floating bars.
  const r = await p.evaluate(() => {
    const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight;
    const kids = [...document.querySelectorAll('.view > *')], last = kids[kids.length - 1].getBoundingClientRect().bottom;
    const bars = [...document.querySelectorAll('.tabs, .player')].filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).position === 'fixed').map(e => e.getBoundingClientRect().top);
    const vw = document.documentElement.clientWidth, over = [...document.querySelectorAll('.tabs, .player')].some(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().right > vw + 1);
    return { last, top: bars.length ? Math.min(...bars) : Infinity, over };
  });
  assert.ok(r.last <= r.top + 1, `${name}: content ${r.last} hidden under bars at ${r.top}`);
  assert.ok(!r.over, `${name}: bar leaves the screen`);
  await p.locator('.player .info').click(); await p.waitForSelector('.now.show'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/glass-now-${name}.png` });
  await p.close();
  console.log(`  ok ${name}`);
}
await b.close();
console.log('ios glass checks passed');
