// JavaScript, public/app.js, browser / Android WebView / iOS standalone: the listener app.
// All text reaches the DOM through h() as text nodes, so catalogue data can never inject markup.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'required' || k === 'multiple') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
// iPadOS Safari reports itself as a Mac, so touch points tell them apart.
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('ios');
// An installed iOS app owns the whole screen, but its reported viewport can stop short of the top and bottom edges.
function fitScreen() {
  if (!navigator.standalone) return;
  const portrait = matchMedia('(orientation: portrait)').matches;
  document.documentElement.style.setProperty('--app-h', `${portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)}px`);
}
fitScreen();
addEventListener('resize', fitScreen);
addEventListener('orientationchange', fitScreen);

const I = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', search: 'M11 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM21 21l-4.3-4.3',
  lib: 'M4 4v16M9 4v16M14 4.5l5.5 15.2', star: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', play: 'M7 4.5v15l13-7.5z', pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  next: 'M5 5l11 7-11 7zM19 5v14', prev: 'M19 5L8 12l11 7zM5 5v14',
  shuffle: 'M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6C14.3 16 15.5 17 17.500 17H21M18 14l3 3-3 3M3 17h3.500c1.600 0 2.600-.6 3.500-1.700M13.500 8.700C14.400 7.600 15.500 7 17.500 7H21M18 4l3 3-3 3',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  heart: 'M12 20.500S3.500 15.500 3.500 9A4.500 4.500 0 0 1 12 7a4.500 4.500 0 0 1 8.500 2c0 6.500-8.500 11.500-8.500 11.500z', plus: 'M12 5v14M5 12h14', down: 'M6 9l6 6 6-6', x: 'M6 6l12 12M18 6L6 18',
  vol: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11', text: 'M4 6h16M4 12h16M4 18h10', queue: 'M4 6h12M4 12h12M4 18h7M20 6v10.500a2.500 2.500 0 1 1-2-2.450', trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
};
const SOLID = new Set(['play', 'pause', 'next', 'prev']);
export const icon = (name, size = 22) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: SOLID.has(name) ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': SOLID.has(name) ? 1.5 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', I[name]); s.append(p);
  return s;
};

export async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch(path, { method, headers: raw ? {} : body ? { 'content-type': 'application/json' } : {}, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.user && !path.startsWith('/api/auth')) { S.user = null; render(); }
  if (!res.ok) throw new Error(data.error || "Tarmoq xatosi. Internetni tekshiring.");
  return data;
}
export const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const money = n => `${Number(n).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
const hue = t => [...String(t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export function cover(src, label, cls = '') {
  if (src) return h('img', { class: `cover ${cls}`, src, alt: '', loading: 'lazy', decoding: 'async' });
  const d = hue(label);
  const el = h('div', { class: `cover fallback ${cls}`, 'aria-hidden': 'true' }, String(label || '?').trim().charAt(0).toUpperCase());
  el.style.background = `linear-gradient(135deg, hsl(${d} 65% 42%), hsl(${(d + 50) % 360} 70% 24%))`;
  return el;
}
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}
export function sheet(build) {
  const close = () => { scrim.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) close(); } }, box);
  box.append(...[build(close)].flat(Infinity).filter(Boolean));
  document.body.append(scrim);
  document.addEventListener('keydown', esc);
  return close;
}
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message); } };

// ---------- state ----------
export const S = { user: null, settings: {}, liked: new Set(), playlists: [] };
const root = document.getElementById('root');

export const go = (path, replace) => { history[replace ? 'replaceState' : 'pushState'](null, '', path); route(); };
window.addEventListener('popstate', () => route());
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || !a.getAttribute('href').startsWith('/') || a.hasAttribute('download')) return;
  e.preventDefault();
  closeNow();
  go(a.getAttribute('href'));
});

// ---------- player ----------
const audio = new Audio();
audio.preload = 'metadata';
audio.setAttribute('playsinline', '');
const P = { queue: [], i: -1, track: null, shuffle: false, repeat: 'off', playId: null, heard: 0, last: 0, counted: false, token: 0, ad: null, retried: false };
const ui = {};

// iOS only lets an element keep playing after async work if it has played inside a gesture once.
const SILENT = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
let unlocked = false;
document.addEventListener('pointerdown', () => {
  if (unlocked || audio.src) return;
  unlocked = true;
  audio.src = SILENT;
  audio.play().then(() => { if (audio.src === SILENT) audio.pause(); }).catch(() => {});
}, { capture: true, once: false });

const sw = msg => navigator.serviceWorker?.controller?.postMessage(msg);
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.bytes && e.data.ms > 200) P.speed = e.data.bytes / (e.data.ms / 1000);
});
// Lets playback continue past the mute switch and on the lock screen (Safari 16.4+).
if (navigator.audioSession) navigator.audioSession.type = 'playback';

const requestPlay = id => api('/api/play', { method: 'POST', body: { trackId: id, hidden: document.hidden } });
const wavBytes = t => t.duration * t.sampleRate * t.channels * t.bitDepth / 8;

export function playList(list, index = 0) {
  if (!list?.length) return;
  P.queue = list.slice();
  P.next = null; P.pick = null;
  loadAt(index);
}
// No await in here: iOS may freeze a backgrounded page during any network wait once audio has stopped.
function startGrant(i, r, resumeAt = 0) {
  P.i = i; P.track = P.queue[i]; P.heard = 0; P.last = resumeAt; P.counted = false; P.playId = r.playId; P.next = null; P.pick = null; P.preparing = false;
  sw({ type: 'cancel' });
  audio.src = r.url;
  if (resumeAt) audio.currentTime = resumeAt;
  audio.play().catch(() => syncPlayer());
  syncMediaSession();
  syncPlayer();
}
async function loadAt(i, resumeAt = 0) {
  if (i < 0 || i >= P.queue.length) return;
  const token = ++P.token;
  const ready = !resumeAt && P.next?.i === i ? P.next.grant : null;
  if (ready?.url) return startGrant(i, ready);
  P.next = null; P.pick = null;
  P.i = i; P.track = P.queue[i]; P.heard = 0; P.counted = false;
  syncPlayer();
  try {
    let r = ready || await requestPlay(P.track.id);
    if (token !== P.token) return;
    if (r.ad) {
      const done = await runAd(r.ad);
      if (!done || token !== P.token) return;
      r = P.afterAd || await requestPlay(P.track.id);
      P.afterAd = null;
      if (token !== P.token || r.ad) return;
    }
    startGrant(i, r, resumeAt);
  } catch (e) { toast(e.message); syncPlayer(); }
}
// When a list runs out the music keeps going with the rest of the catalogue.
async function extendQueue() {
  const d = await api('/api/home');
  const have = new Set(P.queue.map(t => t.id));
  const more = [...d.fresh, ...d.popular].filter(t => !have.has(t.id) && have.add(t.id));
  P.queue.push(...(more.length ? more : P.queue.slice()));
}
async function pickNext() {
  if (P.pick !== null) return P.pick;
  if (P.shuffle && P.queue.length > 1) {
    let n; do n = Math.floor(Math.random() * P.queue.length); while (n === P.i);
    return (P.pick = n);
  }
  if (P.i + 1 >= P.queue.length) {
    if (P.repeat === 'all') return (P.pick = 0);
    await extendQueue();
  }
  return (P.pick = P.i + 1);
}
// Before the song ends: secure the next stream link and put the file on the device, so the switch needs no network.
async function prepareNext() {
  const t = P.track;
  if (P.next || P.preparing || !t || P.repeat === 'one' || !isFinite(audio.duration)) return;
  const left = audio.duration - audio.currentTime;
  if (left > 130) return;
  P.preparing = true;
  try {
    const i = await pickNext();
    const nextT = P.queue[i];
    // 20 s is the floor; a big WAV on a slow line needs longer or it would not finish before the switch.
    const lead = Math.min(120, Math.max(20, P.speed ? wavBytes(nextT) / P.speed + 5 : 20));
    if (audio.duration - audio.currentTime > lead) return;
    const grant = await requestPlay(nextT.id);
    if (P.track !== t) return;
    P.next = { i, grant };
    if (grant.url && !navigator.connection?.saveData) sw({ type: 'prefetch', id: nextT.id, url: grant.url });
  } catch { /* the normal path retries at the switch */ } finally { P.preparing = false; }
}
export const P_next = async () => {
  if (P.next) return loadAt(P.next.i);
  try { loadAt(await pickNext()); } catch (e) { toast(e.message); }
};
const P_prev = () => { if (audio.currentTime > 4) audio.currentTime = 0; else loadAt(Math.max(0, P.i - 1)); };
const toggle = () => { if (P.ad) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };

audio.addEventListener('ended', () => {
  if (P.ad) return P.ad.finish();
  if (P.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  P_next();
});
audio.addEventListener('timeupdate', () => {
  if (P.ad) return P.ad.tick();
  const delta = audio.currentTime - P.last;
  P.last = audio.currentTime;
  if (delta > 0 && delta < 2) P.heard += delta;
  if (!P.counted && P.playId && P.track && P.heard >= Math.min(30, P.track.duration / 2)) {
    P.counted = true;
    api(`/api/plays/${P.playId}/counted`, { method: 'POST' }).catch(() => { P.counted = false; });
  }
  prepareNext();
  paintTime();
});
audio.addEventListener('play', syncPlayer);
audio.addEventListener('pause', syncPlayer);
audio.addEventListener('error', () => {
  if (P.ad || !P.track || audio.src === SILENT) return;
  // Usually an expired link after a long pause: fetch a fresh one once and resume in place.
  if (!P.retried) { P.retried = true; loadAt(P.i, audio.currentTime); return; }
  toast('Qo\'shiqni ochib bo\'lmadi. Internetni tekshiring.');
  syncPlayer();
});
audio.addEventListener('playing', () => { P.retried = false; });
audio.addEventListener('durationchange', () => syncPosition());

function syncPosition() {
  try { if (isFinite(audio.duration)) navigator.mediaSession?.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }); } catch { /* older iOS */ }
}
function syncMediaSession() {
  const t = P.track;
  if (!t) return;
  if ('mediaSession' in navigator) {
    const art = t.cover ? [{ src: new URL(t.cover, location.href).href, sizes: '512x512' }] : [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }];
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || '', artwork: art });
    navigator.mediaSession.setActionHandler('play', toggle);
    navigator.mediaSession.setActionHandler('pause', toggle);
    navigator.mediaSession.setActionHandler('nexttrack', P_next);
    navigator.mediaSession.setActionHandler('previoustrack', P_prev);
    try { navigator.mediaSession.setActionHandler('seekto', e => { audio.currentTime = e.seekTime; syncPosition(); }); } catch { /* older iOS */ }
  }
}
function syncNative() {
  window.RythmNative?.updateMedia?.(JSON.stringify({ title: P.track?.title || '', artist: P.track?.artist || '', cover: P.track?.cover ? new URL(P.track.cover, location.href).href : '', playing: !audio.paused }));
}
window.__nativeCmd = c => ({ play: toggle, pause: toggle, next: P_next, prev: P_prev }[c]?.());

function paintTime() {
  const d = audio.duration && isFinite(audio.duration) ? audio.duration : P.track?.duration || 0;
  const pct = d ? (audio.currentTime / d) * 100 : 0;
  if (ui.thin) ui.thin.style.width = `${pct}%`;
  for (const s of document.querySelectorAll('[data-seek]')) {
    if (s.dataset.drag) continue;
    s.max = d || 1; s.value = audio.currentTime; s.style.setProperty('--p', `${pct}%`);
  }
  for (const e of document.querySelectorAll('[data-cur]')) e.textContent = fmt(audio.currentTime);
  for (const e of document.querySelectorAll('[data-dur]')) e.textContent = fmt(d);
}
function seekBar() {
  const s = h('input', { type: 'range', min: 0, max: 1, step: 'any', value: 0, 'data-seek': '1', 'aria-label': 'Qo\'shiq vaqti' });
  s.addEventListener('pointerdown', () => { s.dataset.drag = '1'; });
  s.addEventListener('input', () => { s.dataset.drag = '1'; s.style.setProperty('--p', `${(s.value / (s.max || 1)) * 100}%`); });
  s.addEventListener('change', () => { audio.currentTime = Number(s.value); delete s.dataset.drag; P.last = audio.currentTime; });
  return s;
}
const quality = t => `WAV · ${t.bitDepth}-bit · ${(t.sampleRate / 1000).toFixed(t.sampleRate % 1000 ? 1 : 0)} kHz`;
const iconBtn = (name, label, onclick, cls = '', size) => h('button', { class: `ib ${cls}`, 'aria-label': label, title: label, onclick }, icon(name, size));
function likeBtn(t, cls = '') {
  const b = iconBtn('heart', 'Yoqtirish', guard(async e => {
    e.stopPropagation();
    const on = S.liked.has(t.id);
    if (on) S.liked.delete(t.id); else S.liked.add(t.id);
    b.classList.toggle('liked', !on);
    b.setAttribute('aria-pressed', String(!on));
    await api(`/api/likes/${t.id}`, { method: on ? 'DELETE' : 'PUT' });
  }), cls);
  b.classList.toggle('liked', S.liked.has(t.id));
  b.setAttribute('aria-pressed', String(S.liked.has(t.id)));
  return b;
}
function playerBar() {
  const el = h('div', { class: 'player', id: 'player' });
  ui.player = el;
  return el;
}
function syncPlayer() {
  syncNative();
  syncPosition();
  document.documentElement.classList.toggle('playing', !audio.paused);
  const el = ui.player;
  if (!el) return;
  const t = P.track;
  el.classList.toggle('show', !!t);
  if (!t) return;
  const paused = audio.paused;
  if (el.dataset.id !== t.id) {
    el.dataset.id = t.id;
    ui.thin = h('i');
    el.replaceChildren(
      h('div', { class: 'thin' }, ui.thin),
      h('button', { class: 'info', onclick: openNow, 'aria-label': 'To\'liq pleyerni ochish' }, cover(t.cover, t.title),
        h('div', { class: 'grow' }, h('div', { class: 'clip', style: 'font-weight:700' }, t.title), h('div', { class: 'clip small muted' }, t.artist))),
      likeBtn(t),
      ui.miniPlay = h('button', { class: 'playbtn', 'aria-label': 'Ijro', onclick: toggle }),
      h('div', { class: 'center' },
        h('div', { class: 'row', style: 'gap:6px' },
          ui.sh = iconBtn('shuffle', 'Aralash', () => { P.shuffle = !P.shuffle; syncPlayer(); }, 'sm', 18),
          iconBtn('prev', 'Oldingi', P_prev),
          ui.barPlay = h('button', { class: 'playbtn', 'aria-label': 'Ijro', onclick: toggle }),
          iconBtn('next', 'Keyingi', P_next),
          ui.rp = iconBtn('repeat', 'Takrorlash', cycleRepeat, 'sm', 18)),
        h('div', { class: 'row', style: 'width:100%;gap:10px' }, h('span', { class: 'time', 'data-cur': '1' }, '0:00'), seekBar(), h('span', { class: 'time', 'data-dur': '1' }, '0:00'))),
      h('div', { class: 'right' },
        h('span', { class: 'quality clip' }, quality(t)),
        iconBtn('vol', 'Ovoz', () => { audio.muted = !audio.muted; }, 'sm', 18),
        volume()),
    );
  }
  for (const b of [ui.miniPlay, ui.barPlay]) b?.replaceChildren(icon(paused ? 'play' : 'pause', 22));
  ui.sh?.classList.toggle('on', P.shuffle);
  ui.rp?.classList.toggle('on', P.repeat !== 'off');
  paintTime();
  if (ui.now?.classList.contains('show')) renderNow();
  for (const r of document.querySelectorAll('.tr')) r.classList.toggle('cur', r.dataset.id === t.id);
}
function volume() {
  const v = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: audio.volume, 'aria-label': 'Ovoz balandligi' });
  v.style.setProperty('--p', `${audio.volume * 100}%`);
  v.addEventListener('input', () => { audio.volume = Number(v.value); audio.muted = false; v.style.setProperty('--p', `${v.value * 100}%`); });
  return v;
}
function cycleRepeat() { P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat]; toast({ off: 'Takrorlash o\'chiq', all: 'Hammasini takrorlash', one: 'Bitta qo\'shiqni takrorlash' }[P.repeat]); syncPlayer(); }

// ---------- now playing ----------
function openNow() { renderNow(); ui.now.classList.add('show'); }
function closeNow() { ui.now?.classList.remove('show'); }
function renderNow(mode) {
  const t = P.track;
  if (!t) return closeNow();
  if (mode) ui.nowMode = mode;
  const m = ui.nowMode || 'art';
  ui.now.style.setProperty('--art', t.cover ? `url("${t.cover}")` : 'none');
  const left = m === 'lyrics' ? h('div', { class: 'lyrics', id: 'lyr' }, 'Yuklanmoqda…')
    : m === 'queue' ? h('div', { class: 'list' }, P.queue.slice(P.i, P.i + 30).map((q, n) => h('button', { class: 'tr', style: 'margin:0;width:100%', 'data-id': q.id, onclick: () => loadAt(P.i + n) }, cover(q.cover, q.title), h('div', { class: 'grow', style: 'text-align:left' }, h('div', { class: 'clip t' }, q.title), h('div', { class: 'clip s' }, q.artist)))))
    : cover(t.cover, t.title, 'art');
  ui.now.replaceChildren(h('div', { class: 'now-in' },
    h('div', { class: 'top' },
      iconBtn('down', 'Yopish', closeNow),
      h('div', { class: 'small muted clip', style: 'font-weight:700' }, t.album || 'Hozir ijro etilmoqda'),
      iconBtn('plus', 'Pleylistga qo\'shish', () => addToPlaylist(t))),
    left,
    h('div', { class: 'pane' },
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('h2', { class: 'clip' }, t.title), h('a', { class: 'muted clip', style: 'display:block', href: `/artist/${t.artistId}` }, t.artist)),
        likeBtn(t)),
      h('span', { class: 'quality' }, quality(t)),
      h('div', null, seekBar(), h('div', { class: 'row between' }, h('span', { class: 'time', 'data-cur': '1' }, '0:00'), h('span', { class: 'time', 'data-dur': '1' }, '0:00'))),
      h('div', { class: 'ctl' },
        iconBtn('shuffle', 'Aralash', () => { P.shuffle = !P.shuffle; syncPlayer(); }, P.shuffle ? 'on' : ''),
        iconBtn('prev', 'Oldingi', P_prev, '', 30),
        h('button', { class: 'playbtn big', 'aria-label': 'Ijro', onclick: toggle }, icon(audio.paused ? 'play' : 'pause', 30)),
        iconBtn('next', 'Keyingi', P_next, '', 30),
        iconBtn('repeat', 'Takrorlash', cycleRepeat, P.repeat !== 'off' ? 'on' : '')),
      h('div', { class: 'row between' },
        iconBtn('text', 'Qo\'shiq matni', () => renderNow(m === 'lyrics' ? 'art' : 'lyrics'), m === 'lyrics' ? 'on' : ''),
        iconBtn('queue', 'Navbat', () => renderNow(m === 'queue' ? 'art' : 'queue'), m === 'queue' ? 'on' : '')))));
  if (m === 'lyrics') api(`/api/tracks/${t.id}`).then(d => { const l = document.getElementById('lyr'); if (l) l.textContent = d.lyrics || 'Bu qo\'shiq uchun matn hali kiritilmagan.'; }).catch(() => {});
  paintTime();
}

// ---------- ads ----------
function runAd(ad) {
  return new Promise(resolve => {
    closeNow();
    let left = ad.duration, finished = false;
    const counter = h('div', { class: 'count', 'aria-live': 'off' }, `${left}s`);
    const stop = result => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      P.ad = null;
      audio.pause();
      box.remove();
      syncPlayer();
      resolve(result);
    };
    const clicked = () => api(`/api/ads/${ad.viewId}/click`, { method: 'POST' }).catch(() => {});
    let finishing = false, early = null;
    // Runs just before the ad's audio ends, while the page is still sure to be awake.
    const settle = () => early || (early = (async () => {
      for (let n = 0; n < 5; n++) {
        try { await api(`/api/ads/${ad.viewId}/complete`, { method: 'POST' }); P.afterAd = await requestPlay(P.track.id); return true; } catch { await new Promise(r => setTimeout(r, 1200)); }
      }
      return false;
    })());
    const finish = async () => {
      if (finishing) return;
      finishing = true;
      clearInterval(timer);
      stop(await settle());
    };
    const start = Date.now();
    const timer = setInterval(() => {
      left = Math.max(0, ad.duration - Math.floor((Date.now() - start) / 1000));
      counter.textContent = `${left}s`;
      // An ad whose audio failed to load must not trap the listener: the countdown still ends it.
      if (left <= 0 && (!ad.audio || audio.paused)) finish();
    }, 500);
    const box = h('div', { class: 'ad', role: 'dialog', 'aria-label': 'Reklama' },
      h('span', { class: 'tag' }, 'Reklama'), counter,
      ad.image ? h('img', { class: 'art', src: ad.image, alt: '' }) : h('img', { class: 'art', src: '/icon-512.png', alt: '' }),
      h('h2', null, ad.title),
      ad.body ? h('p', { class: 'muted' }, ad.body) : null,
      ad.ctaUrl ? h('a', { class: 'btn', href: ad.ctaUrl, target: '_blank', rel: 'noopener', onclick: clicked }, ad.ctaLabel || 'Batafsil') : null,
      h('button', { class: 'btn pri', onclick: () => { stop(false); go('/premium'); } }, 'Reklamasiz tinglash'));
    document.body.append(box);
    P.ad = { finish, tick: () => { if (ad.audio && isFinite(audio.duration) && audio.duration - audio.currentTime < 2) settle(); } };
    if (ad.audio) { audio.src = ad.audio; audio.play().catch(() => {}); }
    else audio.pause();
  });
}

// ---------- shared pieces ----------
function trackRow(t, list, i, extra) {
  const row = h('div', { class: `tr ${P.track?.id === t.id ? 'cur' : ''}`, 'data-id': t.id },
    h('div', { class: 'n', 'aria-hidden': 'true' }, h('span', null, i + 1), h('i', { class: 'eq' }, h('b'), h('b'), h('b'))),
    h('button', { class: 'hit', onclick: () => playList(list, i) },
      cover(t.cover, t.title),
      h('div', { class: 'grow' }, h('div', { class: 'clip t' }, t.title), h('div', { class: 'clip s' }, t.artist))),
    h('div', { class: 'alb clip' }, t.album || ''),
    h('div', { class: 'dur' }, fmt(t.duration)),
    likeBtn(t, 'sm'),
    extra || iconBtn('plus', 'Pleylistga qo\'shish', () => addToPlaylist(t), 'sm', 18));
  return row;
}
const trackList = (list, extra) => h('div', { class: 'list' },
  h('div', { class: 'thead', 'aria-hidden': 'true' }, h('span', { class: 'n' }, '#'), h('span', { class: 'grow' }, 'Nomi'), h('span', { class: 'alb' }, 'Albom'), h('span', { class: 'dur' }, 'Vaqt'), h('span', { class: 'pad' })),
  list.map((t, i) => trackRow(t, list, i, extra?.(t))));
const trackCard = (t, list, i) => h('button', { class: 'card', onclick: () => playList(list, i) }, cover(t.cover, t.title), h('div', { class: 't clip' }, t.title), h('div', { class: 's clip' }, t.artist));
const albumCard = a => h('a', { class: 'card', href: `/album/${a.id}` }, cover(a.cover, a.title), h('div', { class: 't clip' }, a.title), h('div', { class: 's clip' }, a.artist));
const artistCard = a => h('a', { class: 'card round', href: `/artist/${a.id}` }, cover(a.image, a.name), h('div', { class: 't clip' }, a.name), h('div', { class: 's' }, 'Ijrochi'));
const shelf = (title, items) => items.length ? h('section', { class: 'section' }, h('h2', null, title), h('div', { class: 'shelf' }, items)) : null;
const empty = text => h('div', { class: 'panel muted', style: 'text-align:center;padding:36px 18px' }, text);

function addToPlaylist(t) {
  sheet(close => {
    const name = h('input', { placeholder: 'Yangi pleylist nomi', 'aria-label': 'Yangi pleylist nomi' });
    return [h('h2', null, 'Pleylistga qo\'shish'), h('p', { class: 'muted small clip' }, t.title),
      S.playlists.map(p => h('button', { class: 'btn full', onclick: guard(async () => { await api(`/api/playlists/${p.id}/tracks`, { method: 'POST', body: { trackId: t.id } }); close(); toast(`"${p.name}" ga qo'shildi`); }) }, h('span', { class: 'clip' }, p.name))),
      h('form', { class: 'row', onsubmit: guard(async e => {
        e.preventDefault();
        const p = await api('/api/playlists', { method: 'POST', body: { name: name.value } });
        await api(`/api/playlists/${p.id}/tracks`, { method: 'POST', body: { trackId: t.id } });
        await loadLibrary(); close(); toast('Pleylist yaratildi');
      }) }, name, h('button', { class: 'btn pri' }, 'Yaratish'))];
  });
}
async function loadLibrary() {
  const d = await api('/api/library');
  S.liked = new Set(d.liked); S.playlists = d.playlists;
  renderSideLists();
}

// ---------- views ----------
const V = {
  async home(el) {
    const d = await api('/api/home');
    const hr = new Date().getHours();
    const free = S.user.entitlement && !S.user.entitlement.premium;
    const hero = d.promoted[0];
    el.append(h('div', { class: 'top' }, h('h1', null, hr < 6 ? 'Xayrli tun' : hr < 12 ? 'Xayrli tong' : hr < 18 ? 'Xayrli kun' : 'Xayrli kech'), h('a', { class: 'ib', href: '/account', 'aria-label': 'Akkaunt' }, icon('user'))));
    if (S.user.role === 'admin') el.append(h('a', { class: 'btn pri full', href: '/admin/upload' }, '+ Musiqa qo\'shish'));
    if (hero) el.append(h('section', { class: 'hero' },
      h('div', { class: 'stack' }, h('span', { class: 'tag hot' }, 'Reklama'), h('h2', null, hero.title), h('p', { class: 'muted' }, hero.promoText || hero.artist),
        h('div', null, h('button', { class: 'btn pri', onclick: () => playList(d.promoted, 0) }, icon('play', 18), 'Tinglash'))),
      cover(hero.cover, hero.title)));
    else if (!d.fresh.length) el.append(h('section', { class: 'hero' }, h('div', { class: 'stack' }, h('h2', null, S.settings.heroTitle), h('p', { class: 'muted' }, S.settings.heroSub))));
    if (d.recent.length) el.append(h('section', { class: 'quick' }, d.recent.slice(0, 6).map((t, i) => h('button', { class: 'qt', onclick: () => playList(d.recent, i) }, cover(t.cover, t.title), h('span', { class: 'clip' }, t.title)))));
    if (free) el.append(upsell());
    if (d.genres.length) el.append(h('div', { class: 'pill-row' }, d.genres.map(g => h('a', { class: 'pill', href: `/genre/${encodeURIComponent(g)}` }, g))));
    const top = d.popular.slice(0, 5);
    el.append(...[
      d.promoted.length > 1 ? shelf('Tavsiya etamiz', d.promoted.map((t, i) => trackCard(t, d.promoted, i))) : null,
      shelf('Yangi qo\'shiqlar', d.fresh.map((t, i) => trackCard(t, d.fresh, i))),
      top.length ? h('section', { class: 'section' }, h('h2', null, 'Top 5'), trackList(top)) : null,
      shelf('Tahririyat pleylistlari', d.editorial.map(p => h('a', { class: 'card', href: `/playlist/${p.id}` }, cover(null, p.name), h('div', { class: 't clip' }, p.name)))),
      shelf('Albomlar', d.albums.map(albumCard)),
      shelf('Ijrochilar', d.artists.map(artistCard)),
    ].filter(Boolean));
    if (!d.fresh.length) el.append(empty('Hozircha qo\'shiqlar yo\'q. Tez orada yangi musiqalar joylanadi.'));
  },
  async search(el) {
    const results = h('div', { class: 'stack', style: 'gap:24px' });
    const q = h('input', { type: 'search', placeholder: 'Qo\'shiq, ijrochi yoki albom', 'aria-label': 'Qidiruv', value: new URLSearchParams(location.search).get('q') || '' });
    let timer, seq = 0;
    const runIt = async () => {
      const s = ++seq, term = q.value.trim();
      if (!term) { results.replaceChildren(); return; }
      history.replaceState(null, '', `/search?q=${encodeURIComponent(term)}`);
      try {
        const d = await api(`/api/search?q=${encodeURIComponent(term)}`);
        if (s !== seq) return;
        results.replaceChildren(...[
          d.tracks.length ? h('section', { class: 'section' }, h('h2', null, 'Qo\'shiqlar'), trackList(d.tracks)) : null,
          shelf('Ijrochilar', d.artists.map(artistCard)), shelf('Albomlar', d.albums.map(albumCard)),
          !d.tracks.length && !d.artists.length && !d.albums.length ? empty(`"${term}" bo'yicha hech narsa topilmadi`) : null,
        ].filter(Boolean));
      } catch (e) { toast(e.message); }
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runIt, 250); });
    el.append(h('h1', null, 'Qidiruv'), q, results);
    if (q.value) runIt();
  },
  async library(el) {
    await loadLibrary();
    el.append(h('div', { class: 'top' }, h('h1', null, 'Kutubxona'),
      h('button', { class: 'btn sm', onclick: () => newPlaylist() }, icon('plus', 16), 'Pleylist')),
      h('div', { class: 'grid' },
        h('a', { class: 'card', href: '/liked' }, (() => { const c = h('div', { class: 'cover fallback' }, icon('heart', 44)); c.style.background = 'var(--grad)'; return c; })(), h('div', { class: 't' }, 'Yoqtirganlarim'), h('div', { class: 's' }, `${S.liked.size} ta qo'shiq`)),
        S.playlists.map(p => h('a', { class: 'card', href: `/playlist/${p.id}` }, cover(null, p.name), h('div', { class: 't clip' }, p.name), h('div', { class: 's' }, `${p.count} ta qo'shiq`)))));
  },
  async liked(el) {
    const d = await api('/api/likes');
    el.append(pageHead(null, 'Yoqtirganlarim', `${d.tracks.length} ta qo'shiq`, d.tracks), d.tracks.length ? trackList(d.tracks) : empty('Yoqqan qo\'shiqlaringiz shu yerda to\'planadi.'));
  },
  async playlist(el, [id]) {
    const d = await api(`/api/playlists/${id}`);
    const extra = d.mine ? t => iconBtn('x', 'Olib tashlash', guard(async () => { await api(`/api/playlists/${id}/tracks/${t.id}`, { method: 'DELETE' }); route(); }), 'sm', 18) : null;
    el.append(pageHead(null, d.name, `${d.tracks.length} ta qo'shiq`, d.tracks, d.mine ? [
      S.user.role === 'admin' ? h('button', { class: 'btn sm', onclick: guard(async () => { await api(`/api/playlists/${id}`, { method: 'PATCH', body: { public: !d.public } }); toast(d.public ? 'Yashirildi' : 'Bosh sahifaga chiqarildi'); route(); }) }, d.public ? 'Yashirish' : 'Hammaga ko\'rsatish') : null,
      h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/playlists/${id}`, { method: 'DELETE' }); await loadLibrary(); go('/library', true); }) }, 'O\'chirish'),
    ] : null), d.tracks.length ? trackList(d.tracks, extra) : empty('Pleylist bo\'sh. Qo\'shiq yonidagi + tugmasini bosing.'));
  },
  async artist(el, [id]) {
    const d = await api(`/api/artists/${id}`);
    el.append(pageHead(d.image, d.name, `${d.tracks.length} ta qo'shiq`, d.tracks));
    if (d.bio) el.append(h('p', { class: 'muted' }, d.bio));
    el.append(h('section', { class: 'section' }, h('h2', null, 'Mashhur'), trackList(d.tracks)));
    const s = shelf('Albomlar', d.albums.map(albumCard));
    if (s) el.append(s);
  },
  async album(el, [id]) {
    const d = await api(`/api/albums/${id}`);
    el.append(pageHead(d.cover, d.title, [d.artist, d.year].filter(Boolean).join(' · '), d.tracks), trackList(d.tracks));
  },
  async genre(el, [g]) {
    const d = await api(`/api/genres/${encodeURIComponent(decodeURIComponent(g))}`);
    el.append(pageHead(null, d.name, `${d.tracks.length} ta qo'shiq`, d.tracks), trackList(d.tracks));
  },
  async premium(el) {
    const d = await api('/api/plans');
    const e = S.user.entitlement;
    el.append(h('div', { class: 'stack' }, h('h1', null, 'Musiqa, reklamasiz'), h('p', { class: 'muted' }, 'O\'zingizga mos tarifni tanlang. Istalgan vaqtda to\'xtatish mumkin.')));
    if (!S.settings.plansEnabled) el.append(empty('Hozir barcha foydalanuvchilar uchun tinglash bepul va reklamasiz.'));
    if (e?.reason === 'plan' || e?.reason === 'family') el.append(h('div', { class: 'upsell' }, h('div', null, h('h3', null, 'Tarifingiz faol'), h('p', { class: 'small muted' }, `${new Date(e.expires * 1000).toLocaleDateString('ru-RU')} gacha`))));
    if (d.pending) el.append(h('div', { class: 'upsell' }, h('div', null, h('h3', null, 'To\'lovingiz tekshirilmoqda'), h('p', { class: 'small muted' }, 'Admin tasdiqlashi bilan tarif faollashadi.'))));
    el.append(h('div', { class: 'plans' },
      h('div', { class: 'plan' }, h('h2', null, 'Sado'), h('p', { class: 'muted small' }, 'Bepul, reklama bilan'), h('div', { class: 'price' }, '0 so\'m'),
        h('ul', null, h('li', null, 'Butun katalog'), h('li', null, 'Asl WAV sifati'), h('li', null, 'Qo\'shiqlar orasida reklama')),
        h('button', { class: 'btn', disabled: true }, e?.reason === 'free' ? 'Joriy tarif' : 'Bepul')),
      d.plans.map((p, i) => h('div', { class: `plan ${i === 0 ? 'best' : ''}` },
        i === 0 ? h('span', { class: 'tag hot' }, 'Ommabop') : null,
        h('h2', null, p.name), h('p', { class: 'muted small' }, p.tagline),
        h('div', { class: 'price' }, money(p.price), h('span', { class: 'small muted', style: 'font-weight:600' }, ` / ${p.days === 30 ? 'oy' : p.days + ' kun'}`)),
        h('ul', null, p.features.map(f => h('li', null, f))),
        h('button', { class: `btn ${i === 0 ? 'pri' : 'light'}`, disabled: !!d.pending, onclick: () => buy(p, d.card) }, 'Tanlash')))));
    if ((e?.reason === 'plan') && d.plans.find(p => p.id === e.planId)?.seats > 1) el.append(familyPanel(d.family));
  },
  async account(el) {
    const u = S.user, e = u.entitlement;
    const label = { plans_off: 'Bepul rejim', admin: 'Admin', exempt: 'Maxsus ruxsat', plan: 'Faol tarif', family: 'Oila tarifi', free: 'Sado (bepul)' }[e?.reason] || '';
    const name = h('input', { value: u.name, 'aria-label': 'Ism' });
    const probe = h('div', { style: 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' });
    document.body.append(probe);
    const inset = getComputedStyle(probe);
    const diag = `ekran ${screen.width}x${screen.height} | oyna ${innerWidth}x${innerHeight} | body ${document.body.clientHeight} | safe ${inset.paddingTop}/${inset.paddingBottom} | standalone ${navigator.standalone === true}`;
    probe.remove();
    el.append(...[h('h1', null, 'Akkaunt'),
      h('form', { class: 'panel', onsubmit: guard(async ev => { ev.preventDefault(); await api('/api/me', { method: 'PATCH', body: { name: name.value } }); u.name = name.value; toast('Saqlandi'); }) },
        h('div', { class: 'row between wrap' }, h('div', { class: 'grow' }, h('h3', { class: 'clip' }, u.email)), h('span', { class: 'tag' }, label)),
        h('label', { class: 'f' }, 'Ism', name), h('button', { class: 'btn light' }, 'Saqlash')),
      u.role === 'admin' ? h('p', { class: 'small dim', style: 'overflow-wrap:anywhere' }, diag) : null,
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn', href: '/premium' }, 'Tariflar'),
        h('a', { class: 'btn', href: '/install' }, 'Ilovani o\'rnatish'),
        u.role === 'admin' ? h('a', { class: 'btn pri', href: '/admin' }, 'Admin panel') : null,
        S.settings.supportUrl ? h('a', { class: 'btn', href: S.settings.supportUrl, target: '_blank', rel: 'noopener' }, 'Yordam') : null,
        h('button', { class: 'btn danger', onclick: guard(async () => { await api('/api/auth/logout', { method: 'POST' }); sw({ type: 'clear' }); audio.pause(); P.track = null; S.user = null; go('/', true); render(); }) }, 'Chiqish'))].filter(Boolean));
  },
  async install(el) {
    const ua = navigator.userAgent, iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
    const { release } = await api('/api/app/latest');
    const ios = h('div', { class: 'panel' }, h('h2', null, 'iPhone va iPad'),
      h('p', { class: 'muted' }, 'App Store kerak emas. Ilova Safari orqali bosh ekranga o\'rnatiladi va yangilanishlar avtomatik keladi.'),
      h('ol', { class: 'steps' }, h('li', null, 'Quyidagi tugmani Safari\'da bosing va "Allow" ni tanlang.'), h('li', null, 'Settings → Profile Downloaded → Install.'), h('li', null, 'Bosh ekrandagi ikonkani oching.')),
      h('a', { class: 'btn pri', href: '/dl/ios.mobileconfig', download: '' }, 'Profilni yuklab olish'),
      h('p', { class: 'small dim' }, 'Yoki Safari\'da: Ulashish → "Add to Home Screen".'));
    const apk = h('div', { class: 'panel' }, h('h2', null, 'Android'),
      release ? h('p', { class: 'muted' }, `Versiya ${release.versionName} · ${(release.size / 1048576).toFixed(1)} MB. Play Market kerak emas, yangilanishlar ilovaning o'zida chiqadi.`) : h('p', { class: 'muted' }, 'APK hali joylanmagan.'),
      release ? h('a', { class: 'btn pri', href: '/dl/android', download: '' }, 'APK yuklab olish') : null);
    el.append(h('h1', null, 'Ilovani o\'rnatish'), h('div', { class: 'two' }, android ? [apk, ios] : iOS ? [ios, apk] : [ios, apk]));
  },
};
function newPlaylist() {
  sheet(close => {
    const n = h('input', { placeholder: 'Pleylist nomi', 'aria-label': 'Pleylist nomi', required: true });
    return [h('h2', null, 'Yangi pleylist'), h('form', { class: 'stack', onsubmit: guard(async e => { e.preventDefault(); const p = await api('/api/playlists', { method: 'POST', body: { name: n.value } }); await loadLibrary(); close(); go(`/playlist/${p.id}`); }) }, n, h('button', { class: 'btn pri' }, 'Yaratish'))];
  });
}
function pageHead(img, title, sub, list, actions) {
  return h('header', { class: 'head' }, cover(img, title), h('div', { class: 'meta' }, h('h1', null, title), h('p', { class: 'muted' }, sub),
    h('div', { class: 'row wrap' }, list?.length ? h('button', { class: 'btn pri', onclick: () => playList(list, 0) }, icon('play', 18), 'Tinglash') : null, actions)));
}
const upsell = () => h('div', { class: 'upsell' }, h('div', { class: 'grow' }, h('h3', null, 'Reklamadan charchadingizmi?'), h('p', { class: 'small muted' }, 'Puls tarifi bilan uzluksiz tinglang.')), h('a', { class: 'btn pri sm', href: '/premium' }, 'Tarif olish'));
function buy(p, card) {
  sheet(close => {
    const ref = h('input', { placeholder: 'Chek raqami yoki karta oxirgi 4 raqami', 'aria-label': 'To\'lov ma\'lumoti', required: true, minlength: 3 });
    if (!card.number) return [h('h2', null, p.name), h('p', { class: 'muted' }, 'To\'lov rekvizitlari hali kiritilmagan. Keyinroq urinib ko\'ring.'), h('button', { class: 'btn', onclick: close }, 'Yopish')];
    return [h('h2', null, `${p.name} · ${money(p.price)}`),
      h('ol', { class: 'steps' }, h('li', null, 'Summani quyidagi kartaga o\'tkazing.'), h('li', null, 'Chek raqamini kiriting va yuboring.'), h('li', null, 'Admin tasdiqlagach tarif faollashadi.')),
      h('div', { class: 'panel' }, h('div', { style: 'font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere' }, card.number), h('div', { class: 'muted small' }, card.holder),
        h('button', { class: 'btn sm', onclick: () => navigator.clipboard?.writeText(card.number).then(() => toast('Nusxalandi')) }, 'Nusxalash')),
      h('form', { class: 'stack', onsubmit: guard(async e => { e.preventDefault(); await api('/api/payments', { method: 'POST', body: { planId: p.id, reference: ref.value } }); close(); toast('So\'rov yuborildi'); route(); }) }, ref, h('button', { class: 'btn pri' }, 'To\'ladim'))];
  });
}
function familyPanel(family) {
  const email = h('input', { type: 'email', placeholder: 'Email', 'aria-label': 'A\'zo emaili', required: true });
  return h('section', { class: 'panel' }, h('h2', null, 'Tarif a\'zolari'),
    family.map(m => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', { class: 'clip' }, m.name), h('div', { class: 'clip small muted' }, m.email)), h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/family/${m.id}`, { method: 'DELETE' }); route(); }) }, 'Olib tashlash'))),
    h('form', { class: 'row', onsubmit: guard(async e => { e.preventDefault(); await api('/api/family', { method: 'POST', body: { email: email.value } }); route(); }) }, email, h('button', { class: 'btn pri' }, 'Qo\'shish')));
}

// ---------- auth view ----------
function authView() {
  let mode = 'login';
  const box = h('div', { class: 'auth' });
  const draw = () => {
    const err = h('div', { class: 'err', role: 'alert' });
    const name = h('input', { autocomplete: 'name', required: true });
    const email = h('input', { autocomplete: 'username', required: true, inputmode: 'email', autocapitalize: 'none' });
    const pass = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
    const submit = h('button', { class: 'btn pri full' }, mode === 'login' ? 'Kirish' : 'Ro\'yxatdan o\'tish');
    box.replaceChildren(h('form', { onsubmit: async e => {
      e.preventDefault(); err.textContent = ''; submit.disabled = true;
      try {
        await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: { name: name.value, email: email.value, password: pass.value } });
        await boot();
      } catch (x) { err.textContent = x.message; submit.disabled = false; }
    } },
      h('div', { class: 'logo' }, h('img', { src: '/icon.svg', alt: '' }), S.settings.siteName || 'SvRvS Rythm'),
      h('h1', null, mode === 'login' ? 'Xush kelibsiz' : 'Bepul boshlang'),
      h('p', { class: 'muted' }, S.settings.heroSub || ''),
      mode === 'login' ? null : h('label', { class: 'f' }, 'Ism', name),
      h('label', { class: 'f' }, 'Email', email), h('label', { class: 'f' }, 'Parol', pass), err, submit,
      h('button', { type: 'button', class: 'btn full', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; draw(); } }, mode === 'login' ? 'Akkaunt yaratish' : 'Menda akkaunt bor'),
      h('a', { class: 'small muted', style: 'text-align:center', href: '/install' }, 'Ilovani o\'rnatish')));
  };
  draw();
  return box;
}

// ---------- shell ----------
let mainEl, sideLists;
const NAV = [['/', 'home', 'Bosh sahifa'], ['/search', 'search', 'Qidiruv'], ['/library', 'lib', 'Kutubxona'], ['/premium', 'star', 'Tariflar']];
function renderSideLists() {
  sideLists?.replaceChildren(h('nav', null, h('a', { href: '/liked' }, icon('heart', 18), h('span', { class: 'clip' }, 'Yoqtirganlarim')), S.playlists.map(p => h('a', { href: `/playlist/${p.id}` }, icon('lib', 18), h('span', { class: 'clip' }, p.name)))));
}
function render() {
  if (!S.user) {
    closeNow();
    if (location.pathname === '/install') { root.replaceChildren(mainEl = h('main', { class: 'main', style: 'height:100%' })); route(); return; }
    mainEl = null;
    root.replaceChildren(authView());
    return;
  }
  mainEl = h('main', { class: 'main' });
  sideLists = h('div', { class: 'lists' });
  ui.now = ui.now || h('div', { class: 'now', role: 'dialog', 'aria-label': 'Hozir ijro etilmoqda' });
  const navLinks = extra => [...NAV, ...extra].map(([href, ic, label]) => h('a', { href, 'data-nav': href }, icon(ic, 22), h('span', { class: 'clip' }, label)));
  const adminNav = S.user.role === 'admin' ? [['/admin', 'admin', 'Admin']] : [];
  root.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' }, h('a', { class: 'logo', href: '/' }, h('img', { src: '/icon.svg', alt: '' }), h('span', { class: 'clip' }, S.settings.siteName)), h('nav', null, navLinks([...adminNav, ['/account', 'user', 'Akkaunt']])), sideLists),
    mainEl, playerBar(), h('nav', { class: 'tabs' }, navLinks(adminNav))), ui.now);
  delete ui.player.dataset.id;
  renderSideLists();
  syncPlayer();
  route();
}
let routeSeq = 0;
async function route() {
  if (!mainEl) return S.user ? render() : location.pathname === '/install' ? render() : undefined;
  const seq = ++routeSeq;
  const parts = location.pathname.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  for (const a of document.querySelectorAll('[data-nav]')) {
    const href = a.dataset.nav;
    a.classList.toggle('on', href === '/' ? !parts.length : location.pathname.startsWith(href));
  }
  const view = h('div', { class: 'view' });
  try {
    if (name === 'admin') {
      if (S.user?.role !== 'admin') return go('/', true);
      const { adminView } = await import('./admin.js');
      await adminView(view, parts.slice(1));
    } else if (V[name] && (S.user || name === 'install')) await V[name](view, parts.slice(1));
    else view.append(empty('Sahifa topilmadi'));
  } catch (e) {
    view.replaceChildren(h('div', { class: 'panel' }, h('p', { class: 'err' }, e.message), h('button', { class: 'btn', onclick: () => route() }, 'Qayta urinish')));
  }
  if (seq !== routeSeq) return;
  mainEl.replaceChildren(view);
  mainEl.scrollTop = 0;
}
export const refresh = route;

// ---------- Android self-update ----------
async function checkUpdate() {
  const n = window.RythmNative;
  if (!n?.versionCode) return;
  const { release: r } = await api('/api/app/latest').catch(() => ({}));
  if (!r || r.versionCode <= n.versionCode()) return;
  sheet(close => {
    const bar = h('i'), wrap = h('div', { class: 'progress', style: 'display:none' }, bar);
    window.__updateProgress = pct => { wrap.style.display = 'block'; bar.style.width = `${pct}%`; };
    window.__updateError = msg => { btn.disabled = false; toast(msg); };
    const btn = h('button', { class: 'btn pri', onclick: () => { btn.disabled = true; n.installUpdate(new URL(r.url, location.href).href, r.sha256); } }, 'Yangilash');
    return [h('h2', null, `Yangi versiya: ${r.versionName}`), h('p', { class: 'muted', style: 'white-space:pre-wrap' }, r.notes || 'Ilova yangilandi.'), wrap, btn, r.force ? null : h('button', { class: 'btn', onclick: close }, 'Keyinroq')];
  });
  if (r.force) document.querySelector('.scrim')?.addEventListener('click', e => e.stopImmediatePropagation(), true);
}

navigator.serviceWorker?.register('/sw.js').catch(() => {});

async function boot() {
  const d = await api('/api/me');
  S.user = d.user; S.settings = d.settings;
  document.title = d.settings.siteName;
  if (S.user) await loadLibrary().catch(() => {});
  render();
  if (S.user) checkUpdate();
}
boot().catch(e => root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'panel' }, h('p', { class: 'err' }, e.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Qayta urinish')))));
