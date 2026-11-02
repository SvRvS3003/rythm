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
const I = {
  home: 'M3 11l9-8 9 8v10h-6v-6H9v6H3z', search: 'M10.5 3a7.5 7.5 0 015.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z',
  lib: 'M4 3h2v18H4zM9 3h2v18H9zM14.5 3.5l2-.5 4 17-2 .5z', star: 'M12 2l3 6.6 7 .8-5.2 4.7 1.5 7L12 17l-6.3 3.1 1.5-7L2 9.4l7-.8z',
  user: 'M12 3a5 5 0 110 10 5 5 0 010-10zM3 21c0-4.4 4-7 9-7s9 2.6 9 7z', admin: 'M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.700-8-6-8-11V5z',
  play: 'M7 4l14 8-14 8z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z', next: 'M5 4l11 8-11 8zM17 4h2.500v16H17z', prev: 'M19 4L8 12l11 8zM4.500 4H7v16H4.500z',
  shuffle: 'M16 4l5 4-5 4V9h-2.300l-7 8H3v-2h2.800l7-8H16zM3 7h3.700l2.400 2.700-1.300 1.500L5.800 9H3zm13 8v-2l5 4-5 4v-3h-3.300l-2.400-2.700 1.300-1.500 2 2.200z',
  repeat: 'M7 7h10V4l4 4-4 4V9H7a3 3 0 00-3 3H2a5 5 0 015-5zm10 10H7v3l-4-4 4-4v3h10a3 3 0 003-3h2a5 5 0 01-5 5z',
  heart: 'M12 21S3 15 3 8.500A4.500 4.500 0 0112 6a4.500 4.500 0 019 2.500C21 15 12 21 12 21z', plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  down: 'M5 8l7 8 7-8-1.500-1.300L12 13 6.500 6.700z', x: 'M6.400 5L12 10.600 17.600 5 19 6.400 13.400 12 19 17.600 17.600 19 12 13.400 6.400 19 5 17.600 10.600 12 5 6.400z',
  vol: 'M3 9v6h4l6 5V4L7 9zm13-1.500v9a5 5 0 000-9z', text: 'M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z', trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z',
};
export const icon = (name, size = 22) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('fill', 'currentColor'); s.setAttribute('aria-hidden', 'true');
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

export function playList(list, index = 0) {
  if (!list?.length) return;
  P.queue = list.slice();
  loadAt(index);
}
async function loadAt(i, resumeAt = 0) {
  if (i < 0 || i >= P.queue.length) return;
  const token = ++P.token;
  P.i = i; P.track = P.queue[i]; P.heard = 0; P.counted = false;
  syncPlayer();
  try {
    let r = await api('/api/play', { method: 'POST', body: { trackId: P.track.id } });
    if (token !== P.token) return;
    if (r.ad) {
      const done = await runAd(r.ad);
      if (!done || token !== P.token) return;
      r = await api('/api/play', { method: 'POST', body: { trackId: P.track.id } });
      if (token !== P.token || r.ad) return;
    }
    P.playId = r.playId;
    audio.src = r.url;
    if (resumeAt) audio.currentTime = resumeAt;
    P.retried = !!resumeAt && P.retried;
    await audio.play().catch(() => syncPlayer());
    syncMediaSession();
  } catch (e) { toast(e.message); }
  syncPlayer();
}
function nextIndex(dir = 1) {
  if (P.shuffle && P.queue.length > 1 && dir > 0) {
    let n; do n = Math.floor(Math.random() * P.queue.length); while (n === P.i);
    return n;
  }
  const n = P.i + dir;
  if (n >= P.queue.length) return P.repeat === 'all' ? 0 : -1;
  return n < 0 ? 0 : n;
}
export const P_next = () => { const n = nextIndex(1); if (n >= 0) loadAt(n); else { audio.pause(); syncPlayer(); } };
const P_prev = () => { if (audio.currentTime > 4) audio.currentTime = 0; else loadAt(nextIndex(-1)); };
const toggle = () => { if (P.ad) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };

audio.addEventListener('ended', () => {
  if (P.ad) return P.ad.finish();
  if (P.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  P_next();
});
audio.addEventListener('timeupdate', () => {
  if (P.ad) return;
  const delta = audio.currentTime - P.last;
  P.last = audio.currentTime;
  if (delta > 0 && delta < 2) P.heard += delta;
  if (!P.counted && P.playId && P.track && P.heard >= Math.min(30, P.track.duration / 2)) {
    P.counted = true;
    api(`/api/plays/${P.playId}/counted`, { method: 'POST' }).catch(() => { P.counted = false; });
  }
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
    try { navigator.mediaSession.setActionHandler('seekto', e => { audio.currentTime = e.seekTime; }); } catch { /* older iOS */ }
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
        iconBtn('lib', 'Navbat', () => renderNow(m === 'queue' ? 'art' : 'queue'), m === 'queue' ? 'on' : '')))));
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
    let finishing = false;
    const finish = async () => {
      if (finishing) return;
      finishing = true;
      clearInterval(timer);
      // Server clock decides; retry shortly if the client finished a moment early.
      for (let n = 0; n < 5 && !finished; n++) {
        try { await api(`/api/ads/${ad.viewId}/complete`, { method: 'POST' }); return stop(true); } catch { await new Promise(r => setTimeout(r, 1200)); }
      }
      stop(false);
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
    P.ad = { finish };
    if (ad.audio) { audio.src = ad.audio; audio.play().catch(() => {}); }
    else audio.pause();
  });
}

// ---------- shared pieces ----------
function trackRow(t, list, i, extra) {
  const row = h('div', { class: `tr ${P.track?.id === t.id ? 'cur' : ''}`, 'data-id': t.id },
    h('button', { class: 'hit', onclick: () => playList(list, i) },
      cover(t.cover, t.title),
      h('div', { class: 'grow' }, h('div', { class: 'clip t' }, t.title), h('div', { class: 'clip s' }, t.artist))),
    t.album ? h('div', { class: 'alb clip' }, t.album) : null,
    h('div', { class: 'dur' }, fmt(t.duration)),
    likeBtn(t, 'sm'),
    extra || iconBtn('plus', 'Pleylistga qo\'shish', () => addToPlaylist(t), 'sm', 18));
  return row;
}
const trackList = (list, extra) => h('div', { class: 'list' }, list.map((t, i) => trackRow(t, list, i, extra?.(t))));
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
    if (free) el.append(upsell());
    if (d.genres.length) el.append(h('div', { class: 'pill-row' }, d.genres.map(g => h('a', { class: 'pill', href: `/genre/${encodeURIComponent(g)}` }, g))));
    el.append(...[
      shelf('Yaqinda tinglangan', d.recent.map((t, i) => trackCard(t, d.recent, i))),
      d.promoted.length > 1 ? shelf('Tavsiya etamiz', d.promoted.map((t, i) => trackCard(t, d.promoted, i))) : null,
      shelf('Yangi qo\'shiqlar', d.fresh.map((t, i) => trackCard(t, d.fresh, i))),
      shelf('Eng ko\'p tinglanganlar', d.popular.map((t, i) => trackCard(t, d.popular, i))),
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
    el.append(h('h1', null, 'Akkaunt'),
      h('form', { class: 'panel', onsubmit: guard(async ev => { ev.preventDefault(); await api('/api/me', { method: 'PATCH', body: { name: name.value } }); u.name = name.value; toast('Saqlandi'); }) },
        h('div', { class: 'row between wrap' }, h('div', { class: 'grow' }, h('h3', { class: 'clip' }, u.email)), h('span', { class: 'tag' }, label)),
        h('label', { class: 'f' }, 'Ism', name), h('button', { class: 'btn light' }, 'Saqlash')),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn', href: '/premium' }, 'Tariflar'),
        h('a', { class: 'btn', href: '/install' }, 'Ilovani o\'rnatish'),
        u.role === 'admin' ? h('a', { class: 'btn pri', href: '/admin' }, 'Admin panel') : null,
        S.settings.supportUrl ? h('a', { class: 'btn', href: S.settings.supportUrl, target: '_blank', rel: 'noopener' }, 'Yordam') : null,
        h('button', { class: 'btn danger', onclick: guard(async () => { await api('/api/auth/logout', { method: 'POST' }); audio.pause(); P.track = null; S.user = null; go('/', true); render(); }) }, 'Chiqish')));
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

async function boot() {
  const d = await api('/api/me');
  S.user = d.user; S.settings = d.settings;
  document.title = d.settings.siteName;
  if (S.user) await loadLibrary().catch(() => {});
  render();
  if (S.user) checkUpdate();
}
boot().catch(e => root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'panel' }, h('p', { class: 'err' }, e.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Qayta urinish')))));
