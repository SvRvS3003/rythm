// JavaScript, test/ui.ts, node + playwright: layout overflow sweep and real playback against local dev.
import { webkit, chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8787', OUT = process.argv[2] || 'dist/shots';
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'ui-'));
const SIZES = { 'iphone-se': [320, 568], 'iphone-16': [390, 844], 'promax': [430, 932], 'duo-outer': [466, 678], 'duo-inner': [626, 890], 'duo-inner-land': [890, 626], 'phone-land': [844, 390], 'tablet': [820, 1180], 'desktop': [1440, 900] };
const engine = process.env.ENGINE === 'chromium' ? chromium : webkit;
const b = await engine.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, ...(process.env.UA ? { userAgent: process.env.UA } : {}) });
const p = await ctx.newPage();
const problems = [];
p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|access control checks/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`); });
// WebKit reports a background refresh cut off by the test's own page.goto as an error; it is not an app failure.
p.on('pageerror', e => { if (!/access control checks/.test(e.message)) problems.push(`pageerror: ${e.message}`); });

await p.goto(BASE);
const call = (path: string, opts?: any): Promise<any> => p.evaluate(async ([path, opts]) => { const r = await fetch(path, { method: opts?.method || 'GET', headers: opts?.body ? { 'content-type': 'application/json' } : {}, body: opts?.body ? JSON.stringify(opts.body) : undefined }); return r.json(); }, [path, opts]);
await call('/api/auth/login', { method: 'POST', body: { email: 'admin', password: 'local-dev-pass' } });
const upload = async (name, args) => {
  const f = join(tmp, name); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, f]);
  const b64 = readFileSync(f).toString('base64');
  return p.evaluate(async b64 => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const st = await (await fetch('/api/admin/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"kind":"audio"}' })).json();
    const part = await (await fetch(`/api/admin/uploads/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=1`, { method: 'PUT', body: buf })).json();
    return (await fetch('/api/admin/uploads/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: st.key, uploadId: st.uploadId, parts: [part] }) })).json();
  }, b64);
};
const image = async (name, color) => {
  const f = join(tmp, name); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `gradients=s=600x600:c0=${color}:c1=0x101018:x0=0:y0=0:x1=600:y1=600:d=1`, '-frames:v', '1', f]);
  const b64 = readFileSync(f).toString('base64');
  return p.evaluate(async b64 => (await (await fetch('/api/admin/images', { method: 'POST', body: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) })).json()).key, b64);
};
const seed = [
  ['Tungi Shahar', 'Ozoda Karimova', 'Yulduzlar ostida', 'Pop', '0xff4d2e'], ['Samarqand Ohanglari', 'Dilshod Rahmon', 'Ipak yo\'li', 'Folk', '0x2e8bff'],
  ['Juda Uzun Nomli Qoʻshiq Bu Dizaynni Buzmasligi Kerak Boʻlgan Sinov Sarlavhasi Shunchalik Uzun', 'Haddan Tashqari Uzun Ismli Ijrochi Va Uning Katta Orkestri Hamkorligida', 'Albom Nomi Ham Juda Va Juda Uzun Bo\'lgan Holat Uchun Sinov', 'Elektron', '0x9b2eff'],
  ['Bahor', 'Ozoda Karimova', 'Yulduzlar ostida', 'Pop', '0x2eff9b'], ['Ritm 808', 'SvRvS', '', 'Hip-Hop', '0xffb02e'], ['Sokin Tong', 'Dilshod Rahmon', 'Ipak yo\'li', 'Folk', '0xff2e88'],
];
const existing = await call('/api/admin/tracks');
if (existing.tracks.length < 6) for (const [i, [title, artist, album, genre, c]] of seed.entries()) {
  const up = await upload(`t${i}.wav`, ['-f', 'lavfi', '-i', `sine=${220 + i * 55}:duration=70`, '-af', 'aformat=channel_layouts=stereo', '-ar', i % 2 ? '48000' : '44100', '-c:a', i % 2 ? 'pcm_s24le' : 'pcm_s16le']);
  const coverKey = await image(`c${i}.png`, c);
  const t = await call('/api/admin/tracks', { method: 'POST', body: { key: up.key, title, artist, album, genre, coverKey, lyrics: 'Birinchi qator\nIkkinchi qator' } });
  if (i < 2) await call(`/api/admin/tracks/${t.id}`, { method: 'PATCH', body: { promoted: true, promoText: 'Yangi singl endi SvRvS Rythm\'da' } });
}
const cat = await call('/api/admin/tracks');
const home = await call('/api/home');
await call('/api/admin/settings', { method: 'PATCH', body: { card_number: '8600 1234 5678 9012', card_holder: 'SVRVS RYTHM', ad_every: 2, ad_seconds: 4, plans_enabled: true } });

const overflow = () => p.evaluate(() => {
  const vw = document.documentElement.clientWidth, bad = [];
  const scroller = el => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; if (s.overflowX === 'hidden' && e !== document.body && e !== document.documentElement && getComputedStyle(el).whiteSpace === 'nowrap') return true; } return false; };
  for (const el of document.querySelectorAll('#root *, .sheet *, .now *, .ad *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > vw + 1 || r.left < -1) && !scroller(el)) bad.push(`${el.tagName}.${(el.className as any)?.baseVal ?? el.className} [${Math.round(r.left)},${Math.round(r.right)}] vw=${vw}`);
  }
  const m = document.querySelector('.main');
  if (m && m.scrollWidth > m.clientWidth + 1) bad.unshift(`main scrolls sideways ${m.scrollWidth}>${m.clientWidth}`);
  if (document.documentElement.scrollWidth > vw + 1) bad.unshift('page scrolls sideways');
  return bad.slice(0, 4);
});
const small = () => p.evaluate(() => [...document.querySelectorAll('button.ib, button.btn, button.playbtn, .tabs a')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 32 || r.width < 32); }).slice(0, 3).map(e => `${e.className}:${e.getAttribute('aria-label') || e.textContent}`));

// Fresh listener for the player flows
const pages = ['/', '/search?q=o', '/library', '/liked', '/premium', '/account', '/install', `/artist/${home.artists[0].id}`, `/album/${home.albums[0].id}`, '/admin', '/admin/tracks', '/admin/upload', '/admin/users', '/admin/plans', '/admin/payments', '/admin/ads', '/admin/app', '/admin/settings', '/admin/artists'];
const shoot = new Set(['/', '/premium', '/admin', '/admin/tracks', '/admin/users']);
for (const [name, [w, h]] of Object.entries(SIZES)) {
  await p.setViewportSize({ width: w, height: h });
  for (const path of pages) {
    await p.goto(BASE + path); await p.waitForSelector('.view', { timeout: 15000 }); await p.waitForTimeout(250);
    const bad = await overflow();
    if (bad.length) problems.push(`${name} ${path}: ${bad.join(' | ')}`);
    const tiny = await small();
    if (tiny.length) problems.push(`${name} ${path} small targets: ${tiny.join(', ')}`);
    if (shoot.has(path) && ['iphone-se', 'duo-outer', 'duo-inner', 'desktop'].includes(name)) await p.screenshot({ path: `${OUT}/${name}${path.replaceAll('/', '_')}.png` });
  }
}
await call('/api/auth/logout', { method: 'POST' });
await p.evaluate(() => localStorage.clear()); // the app does this on its own logout button
const email = `ui${Date.now()}@test.uz`;
await p.setViewportSize({ width: 390, height: 844 });
await p.goto(BASE);
await p.screenshot({ path: `${OUT}/login.png` });
await p.getByRole('button', { name: 'Akkaunt yaratish' }).click();
await p.getByLabel('Ism').fill('Ali'); await p.getByLabel('Email').fill(email); await p.getByLabel('Parol').fill('parol12345');
await p.getByRole('button', { name: "Ro'yxatdan o'tish" }).click();
await p.waitForSelector('.hero');
await p.screenshot({ path: `${OUT}/listener-home.png` });

// Real playback: time label must advance, on both track and after an enforced ad.
const curTime = () => p.evaluate(() => document.querySelector('.player [data-cur]')?.textContent);
await p.locator('.card').first().click();
await p.waitForSelector('.player.show');
await p.waitForTimeout(3500);
const t1 = await curTime();
const adv = await p.evaluate(() => document.querySelector<HTMLInputElement>('.player [data-seek]')?.value);
console.log('playback time after 3.5s:', t1, 'seek value:', adv);
if (Number(adv) <= 0.5) problems.push(`playback did not advance (${t1}/${adv})`);
await p.locator('.player .info').click();
await p.waitForSelector('.now.show');
for (const [name, [w, h]] of Object.entries(SIZES)) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(150);
  const bad = await overflow(); if (bad.length) problems.push(`now ${name}: ${bad.join(' | ')}`);
  const fit = await p.evaluate(() => { const n = document.querySelector('.now'); return [n.scrollHeight, n.clientHeight]; });
  if (fit[0] > fit[1] + 1) console.log(`  note: now playing scrolls on ${name} ${fit}`);
  if (['iphone-se', 'duo-outer', 'duo-inner', 'phone-land', 'desktop'].includes(name)) await p.screenshot({ path: `${OUT}/now-${name}.png` });
}
await p.setViewportSize({ width: 390, height: 844 });
await p.getByRole('button', { name: 'Yopish' }).click();
await p.locator('.player .playbtn').first().waitFor();
// plays so far: 1. ad_every=2, so second is allowed, third gets the ad.
await p.goto(BASE); await p.waitForSelector('.card');
await p.locator('.card').first().click(); await p.waitForTimeout(800);
await p.locator('.card').nth(1).click(); 
await p.waitForSelector('.ad', { timeout: 6000 });
await p.screenshot({ path: `${OUT}/ad.png` });
const ov = await overflow(); if (ov.length) problems.push(`ad: ${ov.join('|')}`);
console.log('ad shown');
await p.waitForSelector('.ad', { state: 'detached', timeout: 15000 });
await p.waitForTimeout(2500);
const adv2 = await p.evaluate(() => document.querySelector<HTMLInputElement>('.player [data-seek]')?.value);
console.log('after ad seek value:', adv2);
if (Number(adv2) <= 0.3) problems.push('playback did not resume after ad');
// purchase sheet
await p.goto(BASE + '/premium'); await p.waitForSelector('.plan');
await p.getByRole('button', { name: 'Tanlash' }).first().click(); await p.waitForSelector('.sheet');
await p.screenshot({ path: `${OUT}/buy.png` });
await b.close();
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'no layout or console problems');
process.exit(problems.length ? 1 : 0);
