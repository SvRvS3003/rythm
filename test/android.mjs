// JavaScript, test/android.mjs, node + adb: drives the real APK against production. Reads .prod.vars, never prints it.
// Needs a booted emulator with 1.0.0 installed and dist/SvRvS-Rythm-1.0.2.apk built. Publishes 1.0.2 as the live release.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://rythm.svrvs-rythm.workers.dev', ADB = join(homedir(), 'Library/Android/sdk/platform-tools/adb'), PKG = 'uz.svrvs.rythm';
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), 'droid-'));
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 1 << 26 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const vars = readFileSync('.prod.vars', 'utf8'), pass = vars.match(/ADMIN_PASSWORD=(.*)/)[1].trim(), login = vars.match(/ADMIN_LOGIN=(.*)/)[1].trim();
let cookie = '';
const api = async (path, { method = 'GET', body, raw } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${d.error}`);
  return d;
};
const dump = () => { try { adb('shell', 'uiautomator', 'dump', '/sdcard/u.xml'); return adb('shell', 'cat', '/sdcard/u.xml'); } catch { return ''; } };
const nodes = xml => [...xml.matchAll(/<node [^>]*>/g)].map(m => { const a = m[0]; const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(a).slice(1).map(Number); return { text: /text="([^"]*)"/.exec(a)?.[1] || '', desc: /content-desc="([^"]*)"/.exec(a)?.[1] || '', cls: /class="([^"]*)"/.exec(a)?.[1] || '', x: (b[0] + b[2]) >> 1, y: (b[1] + b[3]) >> 1 }; });
async function find(pred, label, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const n = nodes(dump()).find(pred); if (n) return n; await wait(1500); }
  shot(`missing-${label}`);
  throw new Error(`not on screen: ${label}`);
}
const byText = t => n => n.text === t || n.desc === t;
const tap = async (t, ms) => { const n = await find(byText(t), t, ms); adb('shell', 'input', 'tap', String(n.x), String(n.y)); await wait(700); };
const shot = name => writeFileSync(join(OUT, `${name}.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 }));
const session = () => adb('shell', 'dumpsys', 'media_session');
const state = () => { const m = /package=uz\.svrvs\.rythm[\s\S]*?state=PlaybackState \{state=(\w+)[\s\S]*?metadata:[^\n]*description=([^\n]*)/.exec(session()); return m ? { state: m[1], desc: m[2] } : null; };
const ok = m => console.log(`  ok ${m}`);

const email = `droid${Date.now()}@test.uz`;
const ids = [];
await api('/api/auth/login', { method: 'POST', body: { email: login, password: pass } });
const before = await api('/api/admin/settings');
try {
  await api('/api/admin/settings', { method: 'PATCH', body: { ad_every: 0, plans_enabled: true } });
  await wait(11000); // settings cache
  for (const [i, sec] of [[1, 70], [2, 14]]) {
    const f = join(OUT, `s${i}.wav`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=${300 + i * 100}:duration=${sec}:sample_rate=48000`, '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s24le', f]);
    const st = await api('/api/admin/uploads', { method: 'POST', body: { kind: 'audio' } });
    const part = await api(`/api/admin/uploads/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=1`, { method: 'PUT', raw: readFileSync(f) });
    await api('/api/admin/uploads/complete', { method: 'POST', body: { key: st.key, uploadId: st.uploadId, parts: [part] } });
    ids.push((await api('/api/admin/tracks', { method: 'POST', body: { key: st.key, title: `DroidSinov${i}`, artist: 'SinovIjrochi' } })).id);
  }
  await wait(31000); // listeners' home cache
  adb('shell', 'am', 'force-stop', PKG); adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  await tap('Akkaunt yaratish');
  await find(byText("Ro'yxatdan o'tish"), 'register form');
  // The keyboard shifts the form, so coordinates are re-read before every field.
  for (const [i, v] of [[0, 'Sinov'], [1, email], [2, 'parol12345']]) {
    const inputs = nodes(dump()).filter(n => n.cls === 'android.widget.EditText');
    assert.equal(inputs.length, 3);
    adb('shell', 'input', 'tap', String(inputs[i].x), String(inputs[i].y)); await wait(1200);
    adb('shell', 'input', 'text', v); await wait(700);
  }
  adb('shell', 'input', 'keyevent', '66'); // Enter submits; Back here would leave the app.
  await find(n => n.text === 'Bosh sahifa' || n.desc === 'Bosh sahifa', 'home');
  shot('home'); ok('registered inside the app');

  // Newest first: the 14 s track plays first, so the queue must advance on its own while off-screen.
  { const n = await find(x => x.text.includes('DroidSinov2'), 'first card'); adb('shell', 'input', 'tap', String(n.x), String(n.y)); }
  let s; const end = Date.now() + 30000;
  while (Date.now() < end) { s = state(); if (s?.state === 'PLAYING') break; await wait(1500); }
  assert.equal(s?.state, 'PLAYING', `session ${JSON.stringify(s)}`);
  shot('playing'); ok('WAV plays; system media session says PLAYING');
  assert.match(adb('shell', 'dumpsys', 'notification', '--noredact'), /pkg=uz\.svrvs\.rythm[\s\S]*?MediaStyle|uz\.svrvs\.rythm/); 
  assert.match(adb('shell', 'dumpsys', 'activity', 'services', PKG), /isForeground=true/); ok('foreground service and notification up');

  adb('shell', 'input', 'keyevent', '3'); await wait(8000);
  assert.equal(state()?.state, 'PLAYING'); ok('keeps playing after Home');
  adb('shell', 'input', 'keyevent', '26'); await wait(8000);
  assert.equal(state()?.state, 'PLAYING'); ok('keeps playing with the screen off');
  adb('shell', 'input', 'keyevent', '224'); await wait(1000);
  adb('shell', 'cmd', 'media_session', 'dispatch', 'pause'); await wait(3000);
  assert.equal(state()?.state, 'PAUSED'); ok('system pause control reaches the player');
  adb('shell', 'cmd', 'media_session', 'dispatch', 'play'); await wait(3000);
  assert.equal(state()?.state, 'PLAYING');
  const now = () => session().match(/description=(DroidSinov\d)/)?.[1];
  assert.equal(now(), 'DroidSinov1'); ok('queue advanced by itself to the next track while the screen was off');
  adb('shell', 'cmd', 'media_session', 'dispatch', 'previous'); await wait(2500);
  adb('shell', 'cmd', 'media_session', 'dispatch', 'previous'); await wait(6000);
  assert.equal(now(), 'DroidSinov2'); ok('previous from system controls, off-screen');

  const cached = /uz\.svrvs\.rythm/.test(adb('shell', 'ps', '-A')); assert.ok(cached);
  if (process.env.SKIP_UPDATE) { console.log('android checks passed (update skipped)'); process.exit(0); }
  // Self-update without any store.
  await api(`/api/admin/releases?versionCode=3&versionName=1.0.2&notes=${encodeURIComponent('Barqarorlik yaxshilandi')}`, { method: 'POST', raw: readFileSync('dist/SvRvS-Rythm-1.0.2.apk') });
  adb('shell', 'appops', 'set', PKG, 'REQUEST_INSTALL_PACKAGES', 'allow');
  adb('shell', 'am', 'force-stop', PKG); adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  await find(byText('Yangilash'), 'update prompt', 60000);
  shot('update-prompt'); ok('update prompt appears');
  await tap('Yangilash');
  const inst = await find(n => /^(Update|UPDATE|Install|INSTALL)$/.test(n.text), 'system confirm', 60000);
  shot('confirm');
  adb('shell', 'input', 'tap', String(inst.x), String(inst.y));
  let v = ''; const vEnd = Date.now() + 60000;
  while (Date.now() < vEnd) { v = adb('shell', 'dumpsys', 'package', PKG); if (/versionCode=3/.test(v)) break; await wait(2000); }
  assert.match(v, /versionCode=3/); ok('APK updated itself from 1.0.1 to 1.0.2');
  assert.match(v, /versionName=1\.0\.2/);
} finally {
  for (const id of ids) await api(`/api/admin/tracks/${id}`, { method: 'DELETE' }).catch(() => {});
  await api('/api/admin/settings', { method: 'PATCH', body: { ad_every: before.ad_every, plans_enabled: before.plans_enabled === '1' } }).catch(() => {});
}
console.log('android checks passed', OUT);
