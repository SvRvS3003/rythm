import { MUTE_ARGS, silence } from './silent.ts';
import { webkit } from 'playwright';
import assert from 'node:assert/strict';
const BASE = 'http://127.0.0.1:8787', OUT = process.argv[2] || 'dist/shots';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const b = await webkit.launch();
const open = async (ua, w, h) => {
  const c = await b.newContext({ viewport: { width: w, height: h }, userAgent: ua });
  await silence(c);
  const p = await c.newPage();
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
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 790 }, screen: { width: 390, height: 844 }, userAgent: IOS });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector('.auth');
  assert.equal(await p.evaluate(() => document.body.getBoundingClientRect().height), 844);
  await ctx.close();
  console.log('  ok installed app fills the screen height');
}

const offer = async (p) => {
  if (!await p.locator('button.get-app').count()) return 'none';
  await p.locator('button.get-app').click(); await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const first = document.querySelector('.app-menu .app-item'); return `${getComputedStyle(document.querySelector('.app-menu')).visibility}:${location.pathname}:${first?.getAttribute('href')}`; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  return `${r}:${await p.evaluate(() => getComputedStyle(document.querySelector('.app-menu')).visibility)}`;
};

for (const [name, ua, want] of [
  ['android browser', ANDROID, 'visible:/:/dl/android:hidden'],
  ['iphone browser', IOS, 'visible:/:/dl/ios.mobileconfig:hidden'],
  ['desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 'visible:/:/dl/ios.mobileconfig:hidden'],
] as [string, string, string][]) {
  const p = await open(ua, 390, 844);
  assert.equal(await offer(p), want, name);
  await p.close();
  console.log(`  ok ${name}: download ${want}`);
}
for (const [name, ua, stand] of [['android app', ANDROID, false], ['iphone app', IOS, true]] as [string, string, boolean][]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
  await ctx.addInitScript(s => {
    if (s) Object.defineProperty(navigator, 'standalone', { get: () => true });
    else (window as unknown as { RythmNative: unknown }).RythmNative = { versionCode: () => 6 };
  }, stand);
  await silence(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'local-dev-pass' }) }));
  await p.goto(BASE); await p.waitForSelector('.card');
  assert.equal(await offer(p), 'none', name);
  await ctx.close();
  console.log(`  ok ${name}: no download offered inside the app`);
}
const sizes = { 'iphone-se': [320, 568], 'iphone': [390, 844], 'duo-outer': [466, 678], 'duo-inner': [626, 890], 'phone-land': [844, 390], 'duo-inner-land': [890, 626], 'ipad': [820, 1180] };
for (const [name, [w, h]] of Object.entries(sizes)) {
  const p = await open(IOS, w, h);
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('ios')));

  const wide = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth, over = (e: Element): boolean => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; };
    const box = document.querySelector('.get-app-wrap');
    return { page: document.documentElement.scrollWidth > vw + 1, offer: box ? [box, ...box.querySelectorAll('*')].filter(over).length : 0 };
  });
  assert.deepEqual(wide, { page: false, offer: 0 }, `${name} home overflow`);
  await p.locator('.card').first().click();
  await p.waitForSelector('.player.show');
  await p.waitForTimeout(600);
  assert.match(await blur(p, '.player'), /blur/, `${name} player`);
  await p.screenshot({ path: `${OUT}/glass-${name}.png` });

  const r = await p.evaluate(() => {
    const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight;
    const kids = [...document.querySelectorAll('.view > *')], last = kids[kids.length - 1].getBoundingClientRect().bottom;
    const bars = [...document.querySelectorAll('.tabs, .player')].filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).position === 'fixed').map(e => e.getBoundingClientRect().top);
    const vw = document.documentElement.clientWidth, over = [...document.querySelectorAll('.tabs, .player')].some(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().right > vw + 1);
    return { last, top: bars.length ? Math.min(...bars) : Infinity, over };
  });
  assert.ok(r.last <= r.top + 1, `${name}: content ${r.last} hidden under bars at ${r.top}`);
  assert.ok(!r.over, `${name}: bar leaves the screen`);
  await p.locator('.player .info:not(.ghost)').click(); await p.waitForSelector('.now.show'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/glass-now-${name}.png` });
  await p.close();
  console.log(`  ok ${name}`);
}
await b.close();
console.log('ios glass checks passed');
