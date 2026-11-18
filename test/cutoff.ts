import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MUTE_ARGS, silence } from './silent.ts';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const b = await chromium.launch({ args: MUTE_ARGS });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await silence(ctx);
const p = await ctx.newPage();
const errors: string[] = []; p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE);
await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'local-dev-pass' }) }));

await p.evaluate(() => { for (const k of ['/api/me', '/api/library', '/api/home']) localStorage.setItem(`page:${k}`, '{}'); });
for (const path of ['/liked', '/', '/library']) { await p.goto(BASE + path); await p.waitForSelector('.view', { timeout: 15000 }); }
console.log('  ok saved empty answers are ignored on start');

await p.route('**/api/library', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"liked":["a"],"playl' }));
await p.evaluate(() => localStorage.removeItem('page:/api/library'));
await p.goto(BASE + '/liked'); await p.waitForSelector('.view', { timeout: 15000 });
assert.notEqual(await p.evaluate(() => localStorage.getItem('page:/api/library')), '{}', 'a cut-off answer was saved');
await p.unroute('**/api/library');
await p.goto(BASE + '/library'); await p.waitForSelector('.view', { timeout: 15000 });
console.log('  ok a cut-off answer is not saved and the next start works');

assert.deepEqual(errors.filter(e => /playlists|undefined is not|Cannot read/.test(e)), []);
await b.close();
console.log('cut-off checks passed');
