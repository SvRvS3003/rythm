import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MUTE_ARGS, silence } from './silent.ts';
const DIR = process.argv[2] || '.';
const b = await chromium.launch({ args: MUTE_ARGS });
for (const host of ['rythm', 'svrvs-rythm']) {
  const old = `https://${host}.svrvs-rythm.workers.dev`;
  const open = async (init: () => void) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await silence(ctx); await ctx.addInitScript(init);
    const p = await ctx.newPage(); await p.goto(`${old}/admin`); await p.waitForTimeout(3000);
    return p;
  };
  const browser = await open(() => {});
  assert.equal(new URL(browser.url()).origin, 'https://rythm.svrvs.uz'); assert.equal(new URL(browser.url()).pathname, '/admin'); console.log(`ok ${host}: browser goes to the new domain`);
  const ios = await open(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  assert.equal(new URL(ios.url()).host, `${host}.svrvs-rythm.workers.dev`);
  assert.equal(await ios.locator('a[href="https://rythm.svrvs.uz/dl/ios.mobileconfig"]').count(), 1);
  assert.equal(await ios.getByRole('button', { name: 'Yopish' }).count(), 0);
  assert.ok(await ios.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ios.screenshot({ path: `${DIR}/move-ios.png` }); console.log(`ok ${host}: installed iPhone app gets the forced screen`);
  const droid = await open(() => { (window as any).RythmNative = { installUpdate: (u: string, s: string) => { (window as any).__call = [u, s]; }, versionCode: () => 5 }; });
  await droid.getByRole('button', { name: 'Yangilash' }).click(); await droid.waitForTimeout(1500);
  const [u, s] = await droid.evaluate(() => (window as any).__call);
  assert.ok(u.startsWith(`${old}/media/apk/`), u); assert.match(s, /^[0-9a-f]{64}$/);
  const apk = await fetch(u, { method: 'HEAD' }); assert.equal(apk.status, 200);
  await droid.screenshot({ path: `${DIR}/move-android.png` }); console.log(`ok ${host}: old Android app gets the APK from its own address (${u.slice(-12)})`);
}
await b.close();
