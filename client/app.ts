import * as offline from './offline.ts';
import { startTide, type Tide } from './tide.ts';
import { unseen } from './queue.ts';
import { BANDS, FPS } from './rhythm.ts';

export type Row = Record<string, any>;
export interface Track { id: string; title: string; artistId: string; artist: string; albumId: string | null; album: string | null; genre: string; duration: number; sampleRate: number; bitDepth: number; channels: number; plays: number; promoted: boolean; promoText: string; published: boolean; cover: string | null; createdAt: number; rhythm: string | null }
type Attrs = Record<string, any>;
type Kid = Node | string | number | boolean | null | undefined | Kid[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = v;
    else if (k === 'value') (el as unknown as HTMLInputElement).value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'required' || k === 'multiple') (el as unknown as Row)[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const c of (kids as unknown[]).flat(Infinity) as (Node | string | number | boolean | null | undefined)[]) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('ios');

const nav = navigator as Navigator & { audioSession?: { type: string; state?: string }; connection?: { saveData?: boolean }; standalone?: boolean };
const win = window as unknown as Row;
const installed = (): boolean => Boolean(win.RythmNative) || nav.standalone === true || /SvRvSRythmApp\//.test(navigator.userAgent);
function fitScreen() {
  if (!nav.standalone) return;
  const portrait = matchMedia('(orientation: portrait)').matches;
  document.documentElement.style.setProperty('--app-h', `${portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)}px`);
}
fitScreen();
addEventListener('resize', fitScreen);
addEventListener('orientationchange', fitScreen);

const I: Record<string, string> = { offline: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8.5 12.5 12 16l3.5-3.5', heartfull: 'M12 20.5s-7.5-4.6-9.2-9.3C1.700 8 3.700 4.500 7.300 4.500c2 0 3.600 1 4.700 2.700 1.100-1.700 2.700-2.700 4.700-2.700 3.600 0 5.600 3.500 4.500 6.700-1.700 4.700-9.200 9.300-9.200 9.300z', chev: 'm9 6 6 6-6 6',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', search: 'M11 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM21 21l-4.3-4.3',
  lib: 'M4 4v16M9 4v16M14 4.5l5.5 15.2', star: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', play: 'M7 4.5v15l13-7.5z', pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  next: 'M5 5l11 7-11 7zM19 5v14', prev: 'M19 5L8 12l11 7zM5 5v14',
  shuffle: 'M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6C14.3 16 15.5 17 17.500 17H21M18 14l3 3-3 3M3 17h3.500c1.600 0 2.600-.6 3.500-1.700M13.500 8.700C14.400 7.600 15.500 7 17.500 7H21M18 4l3 3-3 3',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  save: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  repeat1: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M11 10.500l1.500-1v5',
  heart: 'M12 20.500S3.500 15.500 3.500 9A4.500 4.500 0 0 1 12 7a4.500 4.500 0 0 1 8.500 2c0 6.500-8.500 11.500-8.500 11.500z', plus: 'M12 5v14M5 12h14', down: 'M6 9l6 6 6-6', x: 'M6 6l12 12M18 6L6 18', check: 'M4.5 12.5 9.5 17.5 20 7',
  vol: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11', mute: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16.5 10l4.5 4.5M21 10l-4.5 4.5', text: 'M4 6h16M4 12h16M4 18h10', queue: 'M4 6h12M4 12h12M4 18h7M20 6v10.500a2.500 2.500 0 1 1-2-2.450', trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
};
const SOLID = new Set(['heartfull', 'play', 'pause', 'next', 'prev']);
export const icon = (name: string, size = 22): SVGSVGElement => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: SOLID.has(name) ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': SOLID.has(name) ? 1.5 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, String(v));
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', I[name]); s.append(p);
  return s;
};

const store = new Map<string, { json: string; at: number }>();
const FRESH_MS = 15000;
const NEVER = /^\/api\/(search|app\/latest|auth|tracks\/|admin\/users|admin\/fingerprints|admin\/notices|notices|offline)/;
const KEEP = ['/api/me', '/api/home', '/api/library', '/api/plans'];
const NO_INVALIDATE = /^\/api\/(play$|plays\/|ads\/|me\/seen|notices\/)/;
const pending = new Map<string, Promise<unknown>>();
try { for (const k of KEEP) { const v = localStorage.getItem(`page:${k}`); if (v && v !== '{}') store.set(k, { json: v, at: 0 }); } } catch {  }
function dropPages(all: boolean): void {
  for (const k of [...store.keys()]) { if (all || !KEEP.includes(k)) store.delete(k); else store.get(k)!.at = 0; }
  if (all) try { for (const k of KEEP) localStorage.removeItem(`page:${k}`); } catch {  }
}
async function request<T>(path: string, method: string, body?: unknown, raw?: BodyInit): Promise<T> {
  const res = await fetch(path, { method, headers: raw ? {} : body ? { 'content-type': 'application/json' } : {}, body: raw ?? (body ? JSON.stringify(body) : undefined) });

  const data = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith('/api/auth')) { dropPages(true); if (S.user) { S.user = null; render(); } }
  if (!res.ok || data === null) throw new Error(data?.error || "Tarmoq xatosi. Internetni tekshiring.");
  return data;
}

let writes = 0;
function loadPage(path: string): Promise<unknown> {
  const running = pending.get(path);
  if (running) return running;
  const startedAt = writes;
  const p = request<unknown>(path, 'GET').then(data => {
    if (startedAt !== writes) return data;
    const json = JSON.stringify(data), before = store.get(path);
    store.set(path, { json, at: Date.now() });
    if (KEEP.includes(path)) try { localStorage.setItem(`page:${path}`, json); } catch {  }
    if (before && before.json !== json) pageChanged(path, data as Row);
    return data;
  }).finally(() => pending.delete(path));
  pending.set(path, p);
  return p;
}
export async function api<T = any>(path: string, { method = 'GET', body, raw }: { method?: string; body?: unknown; raw?: BodyInit } = {}): Promise<T> {
  if (method !== 'GET') {
    const data = await request<T>(path, method, body, raw);
    if (path.startsWith('/api/auth')) { writes++; pending.clear(); dropPages(true); }
    else if (!NO_INVALIDATE.test(path)) { writes++; pending.clear(); dropPages(false); }
    return data;
  }
  if (NEVER.test(path)) return request<T>(path, 'GET');
  const hit = store.get(path);
  if (!hit) return loadPage(path) as Promise<T>;
  if (Date.now() - hit.at > FRESH_MS) loadPage(path).catch(() => {});
  return JSON.parse(hit.json) as T;
}

function pageChanged(path: string, data: Row): void {
  if (path === '/api/me') {
    const hadUser = !!S.user;
    S.user = data.user; S.settings = data.settings;
    if (!S.user || !hadUser) { render(); return; }
  }
  if (path === '/api/library') { S.liked = new Set(data.liked); S.playlists = data.playlists; renderSideLists(); }
  const busy = document.querySelector('.sheet') || document.activeElement?.matches('input, textarea, select');
  if (!busy && mainEl && !/^\/(admin|account|search|install)/.test(location.pathname)) route(true);
}

const CATALOG_CHECK_MS = 30000;
let catalogStamp = '';
async function checkCatalog(): Promise<void> {
  if (!S.user || document.hidden || !navigator.onLine) return;
  const { stamp } = await request<{ stamp: string }>('/api/catalog/stamp', 'GET').catch(() => ({ stamp: '' }));
  if (!stamp || stamp === catalogStamp) return;
  const first = !catalogStamp;
  catalogStamp = stamp;
  if (first) return;
  const refresh = async (): Promise<void> => {
    const [home] = await Promise.all(['/api/home', '/api/catalog'].map(p => loadPage(p).catch(() => null)));

    if (home) pageChanged('/api/home', home as Row);
  };
  await refresh();

  setTimeout(refresh, CATALOG_CHECK_MS + 5000);
}
setInterval(checkCatalog, CATALOG_CHECK_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkCatalog(); });
function loadAllPages(): void {
  if (!S.user) return;
  const list = ['/api/me', '/api/home', '/api/catalog', '/api/library', '/api/plans', '/api/likes'];
  if (S.user.role === 'admin') list.push('/api/admin/stats', '/api/admin/tracks');
  for (const p of list) if (Date.now() - (store.get(p)?.at || 0) > FRESH_MS) loadPage(p).catch(() => {});
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadAllPages(); if (navigator.onLine) refreshOffline(); } });

export const fmt = (s: number): string => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const money = (n: number): string => `${Number(n).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
const hue = (t: string): number => [...String(t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export function cover(src: string | null | undefined, label: string, cls = ''): HTMLElement {
  if (src) return h('img', { class: `cover ${cls}`, src, alt: '', loading: 'lazy' });
  const d = hue(label);

  const seed = [...String(label)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const bars = Array.from({ length: 17 }, (_, i) => {
    const swell = Math.sin(((i + 1) / 18) * Math.PI), hgt = 8 + swell * (18 + ((seed >>> (i % 24)) & 31) * 1.6);
    return `<rect x="${13 + i * 4.4}" y="${50 - hgt / 2}" width="1.9" height="${hgt}" rx=".95"/>`;
  }).join('');
  const el = h('div', { class: `cover fallback ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 100 100" fill="hsl(${d} 62% 66%)">${bars}</svg>`;
  el.style.background = `radial-gradient(120% 90% at 30% 15%, hsl(${d} 30% 19%), hsl(${(d + 40) % 360} 24% 8%))`;
  return el;
}
const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');
const SOFT = 'cubic-bezier(.2, .8, .2, 1)';
function fadeAway(el: HTMLElement): void {
  if (stillMotion.matches) { el.remove(); return; }
  el.style.pointerEvents = 'none';
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
}

new MutationObserver(list => {
  if (stillMotion.matches) return;
  for (const m of list) {
    const before = m.removedNodes[0], after = m.addedNodes[0], el = m.target as HTMLElement;
    if (m.addedNodes.length !== 1 || m.removedNodes.length !== 1 || before?.nodeType !== 3 || after?.nodeType !== 3 || !el.isConnected) continue;
    const was = before.textContent ?? '', is = after.textContent ?? '';
    if (was === is || was.replace(/\d+/g, '') === is.replace(/\d+/g, '') || el.closest('[data-cur], [data-dur]')) continue;
    el.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: SOFT });
  }
}).observe(document.documentElement, { childList: true, subtree: true });

function swapIcon(b: HTMLElement | null | undefined, name: string, size?: number): void {
  if (!b || b.dataset.face === name) return;
  const first = !b.dataset.face;
  b.dataset.face = name;
  b.replaceChildren(icon(name, size));
  if (!first && !stillMotion.matches) b.firstElementChild?.animate([{ opacity: 0, transform: 'scale(.55) rotate(-35deg)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: SOFT });
}
export function toast(msg: string): void {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => fadeAway(t), 2800);
}
export function sheet(build: (close: () => void) => unknown): () => void {
  const close = (): void => { fadeAway(scrim); document.removeEventListener('keydown', esc); };
  const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const scrim = h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === scrim) close(); } }, box);
  box.append(...([build(close)].flat(Infinity).filter(Boolean) as Node[]));
  document.body.append(scrim);
  document.addEventListener('keydown', esc);
  return close;
}
const guard = <A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A): Promise<void> => { try { await fn(...a); } catch (e) { toast((e as Error).message); } };

export const S: { user: Row | null; settings: Row; liked: Set<string>; playlists: Row[] } = { user: null, settings: {}, liked: new Set(), playlists: [] };
const root = document.getElementById('root') as HTMLElement;

export const go = (path: string, replace?: boolean): void => { history[replace ? 'replaceState' : 'pushState'](null, '', path); route(); };
window.addEventListener('popstate', () => { route(); });
document.addEventListener('click', e => {
  const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
  const href = a?.getAttribute('href');
  if (!a || !href || a.target || e.metaKey || e.ctrlKey || !href.startsWith('/') || a.hasAttribute('download')) return;
  e.preventDefault();
  closeNow();
  go(href);
});

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
function savedRepeat(): 'off' | 'all' | 'one' {
  try { const v = localStorage.getItem('repeat'); if (v === 'off' || v === 'one') return v; } catch {  }
  return 'all';
}
const P: {
  queue: Track[]; i: number; track: Track | null; shuffle: boolean; repeat: 'off' | 'all' | 'one'; playId: string | null; heard: number; last: number; counted: boolean; token: number;
  ad: { finish: () => void; tick: () => void } | null; retried: boolean; next: { i: number; grant: Row; sent?: boolean } | null; pick: number | null; preparing: boolean; speed: number; afterAd: Row | null; resume: number | null; offlineOnly: boolean; dir: 1 | -1; quiet: boolean; switching: { i: number; track: Track | null; heard: number; counted: boolean; playing: boolean } | null;
} = { queue: [], i: -1, track: null, shuffle: false, repeat: savedRepeat(), playId: null, heard: 0, last: 0, counted: false, token: 0, ad: null, retried: false, next: null, pick: null, preparing: false, speed: 0, afterAd: null, resume: null, offlineOnly: false, dir: 1, quiet: false, switching: null };
const ui: { nowKey?: string; nowSh?: HTMLElement; nowRp?: HTMLElement; nowPlay?: HTMLElement; player?: HTMLElement; now?: HTMLElement; miniPlay?: HTMLElement; barPlay?: HTMLElement; sh?: HTMLElement; rp?: HTMLElement; vol?: HTMLButtonElement; volBar?: HTMLInputElement; nowMode?: string } = {};

const diagLog: string[] = (() => { try { return JSON.parse(localStorage.getItem('diag') || '[]'); } catch { return []; } })();
function note(what: string): void {
  const u = S.user;
  if (u && u.role !== 'admin') return;
  diagLog.push(`${new Date().toISOString().slice(11, 23)} ${what} | hid=${+document.hidden} pau=${+audio.paused} t=${audio.currentTime.toFixed(1)} rs=${audio.readyState} ns=${audio.networkState} mut=${+audio.muted} sess=${nav.audioSession?.state ?? '-'}`);
  if (diagLog.length > 300) diagLog.splice(0, diagLog.length - 300);
  try { localStorage.setItem('diag', JSON.stringify(diagLog)); } catch {  }
}
function sendDiag(): void {
  if (S.user?.role !== 'admin' || !diagLog.length) return;
  fetch('/api/admin/diag', { method: 'PUT', body: JSON.stringify({ ua: navigator.userAgent, standalone: nav.standalone === true, log: diagLog }), keepalive: diagLog.join('').length < 60000 }).catch(() => {});
}
for (const ev of ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'error', 'ended', 'emptied', 'abort', 'loadstart', 'loadedmetadata', 'canplay', 'seeking', 'seeked']) audio.addEventListener(ev, () => note(`${ev}${ev === 'error' ? ` code=${audio.error?.code}` : ''}`));
for (const ev of ['pagehide', 'pageshow', 'focus', 'blur']) addEventListener(ev, () => note(ev));
for (const ev of ['freeze', 'resume']) document.addEventListener(ev, () => note(ev));
document.addEventListener('visibilitychange', () => { note('visibility'); if (!document.hidden) setTimeout(sendDiag, 1500); });

const SILENT = `data:audio/wav;base64,${btoa(`RIFF\x64\x1f\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x40\x1f\0\0\x40\x1f\0\0\x01\0\x08\0data\x40\x1f\0\0${'\x80'.repeat(8000)}`)}`;
let unlocked = false;
document.addEventListener('pointerdown', () => {
  if (unlocked || audio.src) return;
  unlocked = true;
  audio.src = SILENT;
  audio.play().then(() => { if (audio.src === SILENT) audio.pause(); }).catch(() => {});
}, { capture: true, once: false });

let savedAt = 0;
function saveListening(): void {
  savedAt = performance.now();
  const t = P.track, pos = P.resume ?? audio.currentTime;
  if (!t || !S.user || audio.src === SILENT) return;

  try { localStorage.setItem('listening', JSON.stringify({ user: S.user.id, queue: P.queue.slice(0, 200), i: Math.min(P.i, 199), pos: pos >= t.duration - 2 ? 0 : pos })); } catch {  }
}
function restoreListening(): void {
  try {
    const s = JSON.parse(localStorage.getItem('listening') || 'null');
    if (!s || s.user !== S.user?.id || P.track || !s.queue?.[s.i]) return;
    P.queue = s.queue; P.i = s.i; P.track = s.queue[s.i]; P.resume = Number(s.pos) || 0;
    loadRhythm();
    syncMediaSession();
  } catch {  }
}
addEventListener('pagehide', saveListening);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveListening(); });
const sw = (msg: unknown) => navigator.serviceWorker?.controller?.postMessage(msg);
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.bytes && e.data.ms > 200) P.speed = e.data.bytes / (e.data.ms / 1000);
});

function keepSession(): void {
  const s = nav.audioSession;
  if (!s || s.type === 'playback') return;
  note(`session-was-${s.type}`);
  try { s.type = 'playback'; } catch {  }
}
const audioEvents = nav.audioSession as (NonNullable<typeof nav.audioSession> & EventTarget) | undefined;
if (audioEvents) {
  keepSession();
  for (const ev of ['interruptionend', 'playbackinterruptend']) audioEvents.addEventListener(ev, () => { note(ev); keepSession(); });
  audioEvents.addEventListener('statechange', () => { note(`state-${nav.audioSession?.state ?? '?'}`); keepSession(); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepSession(); });

const autoAdvances = (): boolean => P.repeat === 'all' || (P.repeat === 'off' && P.shuffle);
const localGrant = (id: string): Row => ({ url: `/off/${id}`, playId: null });
const requestPlay = (id: string): Promise<Row> => offline.ready.has(id) ? Promise.resolve(localGrant(id)) : api('/api/play', { method: 'POST', body: { trackId: id, hidden: document.hidden } });
const wavBytes = (t: Track): number => t.duration * t.sampleRate * t.channels * t.bitDepth / 8;

export function playList(list: Track[], index = 0, offlineOnly = false): void {
  if (!list?.length) return;
  P.queue = list.slice();
  P.next = null; P.pick = null; P.offlineOnly = offlineOnly;
  loadAt(index);
}

let blocked = false;
document.addEventListener('visibilitychange', () => { if (!document.hidden && blocked && !P.ad) audio.play().catch(() => {}); });

document.addEventListener('pointerdown', () => { keepSession(); if (blocked && !P.ad && !P.switching) audio.play().catch(() => {}); }, { capture: true });

function beginSwitch(): void {
  P.switching ??= { i: P.i, track: P.track, heard: P.heard, counted: P.counted, playing: !audio.paused };
  if (!document.hidden) audio.pause();
}
function endSwitch(): void { P.switching = null; }

function cancelSwitch(resume = true): void {
  if (!P.switching) return;
  const { i, track, heard, counted } = P.switching;
  const playing = resume && P.switching.playing;
  P.i = i; P.track = track; P.heard = heard; P.counted = counted; P.dir = P.dir === 1 ? -1 : 1;
  endSwitch();
  if (playing && audio.src) audio.play().catch(() => { blocked = true; syncPlayer(); });
}
const PLAY_WAIT_MS = 15000;
let grantedAt = 0;
function startGrant(i: number, r: Row, resumeAt = 0): void {
  endSwitch();
  grantedAt = performance.now();
  P.i = i; P.track = P.queue[i]; P.heard = 0; P.last = resumeAt; P.counted = false; P.playId = r.playId; P.next = null; P.pick = null; P.preparing = false; P.resume = null;
  sw({ type: 'cancel' });
  blocked = false;
  clockAt = 0;
  audio.loop = false;
  audio.src = r.url;

  if (resumeAt) audio.addEventListener('loadedmetadata', () => { audio.currentTime = resumeAt; }, { once: true });
  audio.play().catch(() => { blocked = true; syncPlayer(); });
  syncMediaSession();
  syncPlayer();
  loadRhythm();
}
async function loadAt(i: number, resumeAt = 0, dir: 1 | -1 = 1): Promise<void> {
  if (i < 0 || i >= P.queue.length) return;
  P.dir = dir;
  const token = ++P.token;
  const ready = !resumeAt && P.next?.i === i ? P.next.grant : null;
  if (ready?.url) return startGrant(i, ready);
  beginSwitch();
  P.next = null; P.pick = null;
  P.i = i; P.track = P.queue[i]; P.heard = 0; P.counted = false;
  syncPlayer();
  try {

    let r = ready || await Promise.race([requestPlay(P.track.id), new Promise<never>((_, no) => setTimeout(() => no(new Error('Internet sekin: qo\'shiq ochilmadi. Qayta urinib ko\'ring.')), PLAY_WAIT_MS))]);
    if (token !== P.token) return;
    if (r.ad) {
      endSwitch();
      const done = await runAd(r.ad);
      if (!done || token !== P.token) return;
      r = P.afterAd || await requestPlay(P.track.id);
      P.afterAd = null;
      if (token !== P.token || r.ad) return;
    }
    startGrant(i, r, resumeAt);
  } catch (e) {
    toast((e as Error).message);
    if (token === P.token) cancelSwitch();
    syncPlayer();
  }
}

async function pickNext(): Promise<number> {
  if (P.pick !== null) return P.pick;
  if (P.shuffle && P.queue.length > 1) {
    let n: number; do n = Math.floor(Math.random() * P.queue.length); while (n === P.i);
    return (P.pick = n);
  }
  if (P.i + 1 >= P.queue.length) {

    if (!P.offlineOnly && navigator.onLine) {
      const d = await api('/api/home').catch(() => null);
      if (d) P.queue.push(...unseen(P.queue, [...d.fresh, ...d.popular]));
    }
  }
  return (P.pick = P.i + 1 < P.queue.length ? P.i + 1 : 0);
}

let prepareAfter = 0;
async function prepareNext() {
  const t = P.track;
  if (P.next?.sent || P.preparing || !t || !autoAdvances() || !isFinite(audio.duration) || performance.now() < prepareAfter) return;
  const early = !!S.user?.entitlement?.premium;
  if (!early && audio.duration - audio.currentTime > 130) return;
  P.preparing = true;
  try {
    const i = P.next?.i ?? await pickNext();
    const nextT = P.queue[i];

    const lead = Math.min(120, Math.max(20, P.speed ? wavBytes(nextT) / P.speed + 5 : 20));
    const near = audio.duration - audio.currentTime <= lead;
    if (!near && !early) return;
    const grant = P.next?.grant ?? await requestPlay(nextT.id);
    if (P.track !== t) return;
    if (!P.next) { P.next = { i, grant }; fetchBeat(nextT); }
    if (near) {
      P.next.sent = true;
      if (grant.url && !nav.connection?.saveData) sw({ type: 'prefetch', id: nextT.id, url: grant.url });
    }
  } catch { prepareAfter = performance.now() + 15000;  } finally { P.preparing = false; }
}
export const P_next = async () => {
  if (P.next) return loadAt(P.next.i);
  try { loadAt(await pickNext()); } catch (e) { toast((e as Error).message); }
};
const P_prev = () => { if (audio.currentTime > 4) audio.currentTime = 0; else loadAt(Math.max(0, P.i - 1), 0, -1); };

let pausedAt = 0;
function resumePlay(): void {
  note('cmd:play');
  if (P.ad) return;
  if (P.resume !== null) { loadAt(P.i, P.resume); return; }
  if (!audio.paused) return;
  const at = audio.currentTime;

  audio.play().catch(e => { note(`play-rejected ${(e as Error).name}`); if (P.track) loadAt(P.i, at); });
}

const HOLD_MS = 600000;
function holdSession(): void {
  const at = audio.currentTime;
  P.resume = at;
  saveListening();
  pausedAt = performance.now();
  audio.loop = true;
  audio.src = SILENT;
  audio.play().catch(() => { audio.loop = false; });
  syncPosition();
  syncPlayer();
  lockFrame(true);
}
function endHold(): void {
  if (!audio.loop || audio.src !== SILENT) return;
  audio.loop = false;
  audio.pause();
}
const pausePlay = (): void => {
  note('cmd:pause');
  if (P.ad) return;
  if (audio.loop && audio.src === SILENT) { resumePlay(); return; }
  if (document.hidden && nav.standalone === true && !audio.paused && audio.src !== SILENT && P.resume === null) holdSession();
  else audio.pause();
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) endHold(); });
const toggle = () => { if (P.ad) return; if (P.switching) { P.token++; cancelSwitch(false); audio.pause(); syncPlayer(); return; } if (P.resume !== null) { loadAt(P.i, P.resume); return; } if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };

audio.addEventListener('ended', () => {
  if (audio.src === SILENT || P.switching) return;
  if (P.ad) return P.ad.finish();
  if (P.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  if (autoAdvances()) P_next(); else syncPlayer();
});
audio.addEventListener('timeupdate', () => {
  if (audio.src === SILENT) { if (performance.now() - pausedAt > HOLD_MS) endHold(); return; }
  if (audio.currentTime !== clockPos) { clockPos = audio.currentTime; if (performance.now() - clockAt > 1500) { clockAt = performance.now(); wakeLogo(); syncPlayer(); } else clockAt = performance.now(); }
  if (P.ad) return P.ad.tick();
  if (P.switching) return;

  if (document.hidden && P.next?.grant.url && autoAdvances() && audio.duration - audio.currentTime < 0.5) { loadAt(P.next.i); return; }
  const delta = audio.currentTime - P.last;
  P.last = audio.currentTime;
  if (delta > 0 && delta < 2) P.heard += delta;
  if (!P.counted && P.playId && P.track && P.heard >= Math.min(30, P.track.duration / 2)) {
    P.counted = true;
    api(`/api/plays/${P.playId}/counted`, { method: 'POST' }).catch(() => { P.counted = false; });
  }
  prepareNext();
  paintTime();
  paintLoop();
  lockFrame();
  if (performance.now() - savedAt > 5000) saveListening();
});
audio.addEventListener('play', () => { if (audio.src !== SILENT) syncPlayer(); wakeLogo(); });
audio.addEventListener('pause', () => { pausedAt = performance.now(); if (!P.switching) saveListening(); syncPlayer(); wakeLogo(); lockFrame(true); });
audio.addEventListener('error', () => {
  if (P.ad || !P.track || audio.src === SILENT || P.switching) return;

  if (!P.retried) { P.retried = true; loadAt(P.i, audio.currentTime); return; }
  toast('Qo\'shiqni ochib bo\'lmadi. Internetni tekshiring.');
  syncPlayer();
});
audio.addEventListener('playing', () => { P.retried = false; blocked = false; wakeLogo(); syncPlayer(); });
audio.addEventListener('waiting', () => { wakeLogo(); syncPlayer(); });

const STALL_MS = 20000;
let streamRetried = false;
setInterval(() => {
  if (audio.paused || audio.src === SILENT || !audio.src || P.ad || P.switching || P.resume !== null || !P.track) return;
  const still = performance.now() - Math.max(clockAt, grantedAt);
  if (still < 1500) { streamRetried = false; return; }
  syncPlayer();
  if (still < STALL_MS) return;
  const at = audio.currentTime;
  note(`stall-reload ${P.track.title} ${at.toFixed(1)} buffered=${audio.buffered.length ? audio.buffered.end(audio.buffered.length - 1).toFixed(1) : 0}`);
  sendDiag();
  grantedAt = performance.now();
  if (!streamRetried) {
    streamRetried = true;
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true });
    audio.load();
    audio.play().catch(() => { blocked = true; syncPlayer(); });
    return;
  }

  streamRetried = false;
  keepSession();
  loadAt(P.i, at);
}, 1000);
audio.addEventListener('durationchange', () => syncPosition());

function syncPosition() {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = shownPaused() ? 'paused' : 'playing';
  try {

    if (audio.src === SILENT && P.track && P.resume !== null) navigator.mediaSession?.setPositionState({ duration: P.track.duration, position: Math.min(P.resume, P.track.duration), playbackRate: 1e-6 });
    else if (isFinite(audio.duration)) navigator.mediaSession?.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate });
  } catch {  }
}
function syncMediaSession() {
  const t = P.track;
  if (!t) return;
  if ('mediaSession' in navigator) {
    const art = t.cover ? [{ src: new URL(t.cover, location.href).href, sizes: '512x512' }] : [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }];
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || '', artwork: art });
    navigator.mediaSession.setActionHandler('play', resumePlay);
    navigator.mediaSession.setActionHandler('pause', pausePlay);
    navigator.mediaSession.setActionHandler('nexttrack', P_next);
    navigator.mediaSession.setActionHandler('previoustrack', P_prev);
    try { navigator.mediaSession.setActionHandler('seekto', e => { audio.currentTime = e.seekTime ?? 0; syncPosition(); }); } catch {  }
  }
}
function syncNative() {
  win.RythmNative?.updateMedia?.(JSON.stringify({ title: P.track?.title || '', artist: P.track?.artist || '', cover: P.track?.cover ? new URL(P.track.cover, location.href).href : '', playing: !shownPaused() }));
}
const CMDS: Record<string, () => unknown> = { play: resumePlay, pause: pausePlay, next: P_next, prev: P_prev };
win.__nativeCmd = (c: string) => CMDS[c]?.();

function paintTime() {
  const d = !P.switching && audio.duration && isFinite(audio.duration) ? audio.duration : P.track?.duration || 0;
  const pos = P.resume ?? (P.switching ? 0 : audio.currentTime);
  const pct = d ? (pos / d) * 100 : 0;
  tide?.paint(pct / 100);
  seekTide?.paint(pct / 100);
  const max = String(d || 1), val = String(pos), fill = `${pct}%`, cur = fmt(pos), dur = fmt(d);
  for (const s of document.querySelectorAll<HTMLInputElement>('[data-seek]')) {
    if (s.dataset.drag) continue;
    if (s.max !== max) s.max = max;
    if (s.value !== val) s.value = val;
    if (s.style.getPropertyValue('--p') !== fill) s.style.setProperty('--p', fill);
  }
  for (const e of document.querySelectorAll('[data-cur]')) { if (e.textContent !== cur) e.textContent = cur; }
  for (const e of document.querySelectorAll('[data-dur]')) { if (e.textContent !== dur) e.textContent = dur; }
}

let paintRaf = 0, paintLast = 0;
function paintLoop(): void {
  if (paintRaf) return;
  paintRaf = requestAnimationFrame(function step(now) {
    paintRaf = 0;
    if (document.hidden || !sounding()) return;
    if (now - paintLast >= 32) { paintLast = now; paintTime(); }
    paintLoop();
  });
}
function seekBar() {
  const s = h('input', { type: 'range', min: 0, max: 1, step: 'any', value: 0, 'data-seek': '1', 'aria-label': 'Qo\'shiq vaqti' });
  s.addEventListener('pointerdown', () => { s.dataset.drag = '1'; });
  s.addEventListener('input', () => { s.dataset.drag = '1'; s.style.setProperty('--p', `${(Number(s.value) / (Number(s.max) || 1)) * 100}%`); });
  s.addEventListener('change', () => { if (P.resume !== null) P.resume = Number(s.value); else audio.currentTime = Number(s.value); delete s.dataset.drag; P.last = Number(s.value); saveListening(); });
  return s;
}

const shownPaused = (): boolean => !P.switching && (audio.paused || audio.ended || P.resume !== null || audio.src === SILENT);
const loadingSong = (): boolean => !!P.switching || (!audio.paused && audio.src !== SILENT && !P.ad && P.resume === null && performance.now() - clockAt >= 1500);
const quality = (t: Track): string => `WAV · ${t.bitDepth}-bit · ${(t.sampleRate / 1000).toFixed(t.sampleRate % 1000 ? 1 : 0)} kHz`;
const iconBtn = (name: string, label: string, onclick: (e: Event) => unknown, cls = '', size?: number) => h('button', { class: `ib ${cls}`, 'aria-label': label, title: label, onclick }, icon(name, size));
function likeBtn(t: Track, cls = ''): HTMLButtonElement {
  const b = iconBtn('heart', 'Yoqtirish', guard(async (e: Event) => {
    e.stopPropagation();
    const on = S.liked.has(t.id);
    if (on) S.liked.delete(t.id); else S.liked.add(t.id);
    b.classList.toggle('liked', !on);
    if (!on && !stillMotion.matches) b.firstElementChild?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 320, easing: SOFT });
    b.setAttribute('aria-pressed', String(!on));
    await api(`/api/likes/${t.id}`, { method: on ? 'DELETE' : 'PUT' });
  }), cls);
  b.classList.toggle('liked', S.liked.has(t.id));
  b.setAttribute('aria-pressed', String(S.liked.has(t.id)));
  return b;
}
function offlineSaver(t: Track): HTMLButtonElement {
  const pct = h('span', { class: 'saver-pct' }, '0%');
  const b = h('button', { type: 'button', class: 'saver', 'aria-label': 'Oflayn saqlash', title: 'Oflayn saqlash' },
    h('span', { class: 'saver-glyph' },
      h('span', { class: 'saver-ic saver-dl' }, icon('save', 18)),
      h('span', { class: 'saver-ic saver-ok' }, icon('check', 18))),
    h('span', { class: 'saver-label' }, 'Yuklanyabdi'), pct,
    h('span', { class: 'saver-note' }, "Yuklanib bo'lgan")) as HTMLButtonElement;
  let starting = false, prev = '', noting = false, hold: ReturnType<typeof setTimeout> | undefined;
  const paint = (): void => {
    const done = offline.ready.has(t.id), p = offline.active.get(t.id), busy = p !== undefined || starting;
    const state = noting && done ? 'note' : done ? 'done' : busy ? 'busy' : 'idle';
    const label = state === 'note' ? "Yuklanib bo'lgan" : done ? 'Oflayn saqlangan' : busy ? `Yuklanyabdi ${Math.round((p ?? 0) * 100)}%` : 'Oflayn saqlash';
    b.classList.toggle('done', state === 'done' || state === 'note');
    b.classList.toggle('busy', state === 'busy');
    b.classList.toggle('note', state === 'note');
    if ((prev === 'busy' || prev === 'note') && state === 'done') {
      b.classList.add('just-done');
      setTimeout(() => b.classList.remove('just-done'), 700);
    }
    prev = state;
    b.disabled = false;
    b.style.setProperty('--p', String(done ? 1 : p ?? 0));
    pct.textContent = `${Math.round((p ?? 0) * 100)}%`;
    b.setAttribute('aria-label', label);
    b.title = label;
  };
  const stop = offline.onChange(() => { if (!b.isConnected) { stop(); return; } paint(); });
  b.onclick = guard(async () => {
    if (offline.ready.has(t.id)) {
      if (noting) return;
      noting = true; paint();
      hold = setTimeout(() => { noting = false; if (b.isConnected) paint(); }, 1600);
      return;
    }
    if (!navigator.onLine) throw new Error("Internet yo'q. Oflayn saqlash uchun internet kerak.");
    starting = true; paint();
    try { await saveOffline(t); } finally { starting = false; if (b.isConnected) paint(); }
  });
  paint();
  return b;
}

function playerBar() {
  const el = h('div', { class: 'player', id: 'player' });
  ui.player = el;
  return el;
}

let tideCanvas: HTMLCanvasElement | undefined, tide: Tide | undefined, seekCanvas: HTMLCanvasElement | undefined, seekTide: Tide | undefined;

function ghost(el: Element | null | undefined, host: HTMLElement, cls: string): () => void {
  if (!el || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();
  if (!r.width) return () => {};
  const g = el.cloneNode(true) as HTMLElement;
  g.classList.remove('flip-next', 'flip-prev', 'swipe-next', 'swipe-prev');
  g.classList.add('ghost', cls);
  g.setAttribute('inert', '');
  g.setAttribute('aria-hidden', 'true');
  Object.assign(g.style, { left: `${r.left - b.left}px`, top: `${r.top - b.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  return () => { host.append(g); setTimeout(() => g.remove(), 450); };
}
const stagePaint = new WeakMap<Element, () => void>();
function syncPlayer() {
  const shown = document.querySelector('.stage-gl');
  if (shown) stagePaint.get(shown)?.();
  syncNative();
  syncPosition();
  document.documentElement.classList.toggle('playing', sounding());
  const el = ui.player;
  if (!el) return;
  const t = P.track;
  el.classList.toggle('show', !!t);
  if (!t) return;
  const paused = shownPaused();
  if (el.dataset.id !== t.id) {
    const changed = !!el.dataset.id;
    const flip = P.dir === 1 ? 'next' : 'prev', leave = changed ? ghost(el.querySelector(':scope > .info'), el, `flip-${flip}-out`) : () => {};
    el.dataset.id = t.id;
    tideCanvas ??= h('canvas', { class: 'tide', 'aria-hidden': 'true' }) as HTMLCanvasElement;
    tide ??= startTide(tideCanvas, sounding, readRhythm, () => !!ui.now?.classList.contains('show'));
    tide.song(t.cover, hue(t.title) / 360);
    el.replaceChildren(
      tideCanvas,
      h('button', { class: `info ${changed && !document.hidden ? `flip-${flip}` : ''}`, onclick: openNow, 'aria-label': 'To\'liq pleyerni ochish' }, cover(t.cover, t.title),
        h('div', { class: 'grow' }, h('div', { class: 'clip', style: 'font-weight:700' }, t.title), h('div', { class: 'clip small muted' }, t.artist))),
      likeBtn(t),
      ui.miniPlay = h('button', { class: 'playbtn', 'aria-label': 'Ijro', onclick: toggle }),
      h('div', { class: 'center' },
        h('div', { class: 'row', style: 'gap:6px' },
          ui.sh = iconBtn('shuffle', 'Aralash', () => { P.shuffle = !P.shuffle; syncPlayer(); }, 'sm', 18),
          iconBtn('prev', 'Oldingi', P_prev),
          ui.barPlay = h('button', { class: 'playbtn', 'aria-label': 'Ijro', onclick: toggle }),
          iconBtn('next', 'Keyingi', P_next),
          ui.rp = iconBtn(repeatIcon(), REPEAT_LABEL[P.repeat], cycleRepeat, 'sm', 18)),
        h('div', { class: 'row', style: 'width:100%;gap:10px' }, h('span', { class: 'time', 'data-cur': '1' }, '0:00'), seekBar(), h('span', { class: 'time', 'data-dur': '1' }, '0:00'))),
      h('div', { class: 'right' },
        h('span', { class: 'quality clip' }, quality(t)),
        ui.vol = iconBtn('vol', 'Ovoz', () => { audio.muted = P.quiet = !audio.muted; toast(P.quiet ? "Ovoz o'chirilgan" : "Ovoz yoqilgan"); syncVolume(); }, 'sm', 18),
        volume()),
    );
    leave();
  }
  for (const b of [ui.miniPlay, ui.barPlay]) swapIcon(b, paused ? 'play' : 'pause', 22);
  ui.sh?.classList.toggle('on', P.shuffle);
  if (ui.rp) { ui.rp.classList.toggle('on', P.repeat !== 'off'); swapIcon(ui.rp, repeatIcon(), 18); ui.rp.setAttribute('aria-label', REPEAT_LABEL[P.repeat]); ui.rp.title = REPEAT_LABEL[P.repeat]; }
  syncVolume();
  paintTime();
  if (ui.now?.classList.contains('show')) renderNow();
  for (const r of document.querySelectorAll<HTMLElement>('.tr')) r.classList.toggle('cur', r.dataset.id === t.id);
}
function volume() {
  const v = ui.volBar = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: audio.volume, 'aria-label': 'Ovoz balandligi' });
  v.style.setProperty('--p', `${audio.volume * 100}%`);

  v.addEventListener('pointerdown', () => { v.dataset.drag = '1'; });
  v.addEventListener('pointerup', () => { delete v.dataset.drag; });
  v.addEventListener('input', () => { audio.volume = Number(v.value); audio.muted = false; P.quiet = audio.volume === 0; syncVolume(); });
  return v;
}

function syncVolume(): void {
  const off = P.quiet;
  if (ui.vol) {
    swapIcon(ui.vol, off ? 'mute' : 'vol', 18);
    const lab = off ? 'Ovozni yoqish' : "Ovozni o'chirish";
    ui.vol.setAttribute('aria-label', lab);
    ui.vol.title = lab;
  }
  if (ui.volBar && !ui.volBar.dataset.drag) { ui.volBar.value = String(audio.volume); ui.volBar.style.setProperty('--p', `${off ? 0 : audio.volume * 100}%`); }
}
audio.addEventListener('volumechange', () => note(`volume vol=${audio.volume.toFixed(2)} mut=${+audio.muted}`));
const REPEAT_NEXT = { all: 'one', one: 'off', off: 'all' } as const;
const repeatIcon = (): string => (P.repeat === 'one' ? 'repeat1' : 'repeat');
const REPEAT_LABEL = { off: 'Takrorlash: o\'chiq', all: 'Takrorlash: hammasi', one: 'Takrorlash: bitta qo\'shiq' } as const;
function cycleRepeat() { P.repeat = REPEAT_NEXT[P.repeat]; P.next = null; P.pick = null; try { localStorage.setItem('repeat', P.repeat); } catch {  } toast({ off: 'Qo\'shiq tugagach to\'xtaydi', all: 'Keyingi qo\'shiqqa o\'tadi', one: 'Shu qo\'shiq takrorlanadi' }[P.repeat]); syncPlayer(); }

const beat: { id: string | null; data: Uint8Array | null } = { id: null, data: null };
const beatStore = new Map<string, Promise<Uint8Array | null>>();
function fetchBeat(t: Track): Promise<Uint8Array | null> {
  if (!t.rhythm) return Promise.resolve(null);
  let got = beatStore.get(t.id);
  if (!got) {
    got = fetch(t.rhythm).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? new Uint8Array(b) : null)).catch(() => { beatStore.delete(t.id); return null; });
    beatStore.set(t.id, got);
    if (beatStore.size > 12) beatStore.delete(beatStore.keys().next().value as string);
  }
  return got;
}
function loadRhythm(): void {
  const t = P.track;
  if (!t || beat.id === t.id) return;
  beat.id = t.id; beat.data = null; lockFrameNo = -1;
  fetchBeat(t).then(d => { if (beat.id === t.id) beat.data = d; });
}

function readRhythm(bins: Uint8Array): number | null {
  const d = beat.data;
  if (!d || !sounding()) return null;
  const f = Math.floor(audio.currentTime * FPS) * BANDS;
  if (f + BANDS > d.length) return null;
  for (let i = 0; i < bins.length; i++) {
    const m = Math.abs(i / bins.length * 2 - 1);
    bins[i] = d[f + Math.min(BANDS - 1, Math.floor((1 - m) * BANDS))];
  }
  const prev = Math.max(0, f - BANDS);
  let bass = 0, rise = 0;
  for (let b = 0; b < 4; b++) { bass += d[f + b]; rise += Math.max(0, d[f + b] - d[prev + b]); }
  return Math.min(1, (bass / 1020) * 0.7 + (rise / 510));
}

let clockAt = 0, clockPos = -1;
const sounding = (): boolean => !P.switching && !audio.paused && audio.src !== SILENT && !P.ad && !!P.track && P.resume === null && performance.now() - clockAt < 1500;
const LOGO_REST = [80, 220, 320, 160, 60], LOGO_BANDS = [0, 3, 7, 10, 14];
const LOGO_SVG = `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="logo-g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="512" y2="512"><stop offset="0" stop-color="#ff4d2e"/><stop offset="1" stop-color="#ffb02e"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="#0b0a0d"/><g fill="url(#logo-g)">${LOGO_REST.map((r, i) => `<rect x="${96 + i * 74}" y="${256 - r / 2}" width="44" height="${r}" rx="22"/>`).join('')}</g></svg>`;
const logoH = LOGO_REST.slice();
let logoRaf = 0, logoLast = 0, logoCopies = 0;
function logoMark(cls = ''): HTMLElement {
  const el = h('span', { class: `logo-mark ${cls}` });

  el.innerHTML = LOGO_SVG.replaceAll('logo-g', `logo-g${++logoCopies}`);
  return el;
}
function logoTargets(): number[] {
  if (!sounding()) return LOGO_REST;
  const d = beat.data, f = Math.floor(audio.currentTime * FPS) * BANDS;
  if (!d || f + BANDS > d.length) return LOGO_REST;
  return LOGO_BANDS.map(b => 56 + 380 * (d[f + b] / 255));
}

const EQ_BANDS = [1, 6, 12], EQ_REST = 18;
const eqH = [EQ_REST, EQ_REST, EQ_REST];
function eqTargets(): number[] {
  const d = beat.data, f = Math.floor(audio.currentTime * FPS) * BANDS;
  if (!sounding() || !d || f + BANDS > d.length) return [EQ_REST, EQ_REST, EQ_REST];
  return EQ_BANDS.map(b => EQ_REST + (100 - EQ_REST) * (d[f + b] / 255));
}
function logoFrame(now: number): void {
  const dt = Math.min(64, now - logoLast);
  logoLast = now;
  const goal = logoTargets(), eqGoal = eqTargets();
  let moving = sounding();
  eqGoal.forEach((v, i) => {
    eqH[i] += (v - eqH[i]) * (1 - Math.exp(-dt / (v > eqH[i] ? 45 : 150)));
    if (Math.abs(v - eqH[i]) > 0.5) moving = true;
  });
  for (const eq of document.querySelectorAll('.tr.cur .eq')) [...eq.children].forEach((b, i) => { (b as HTMLElement).style.height = `${eqH[i].toFixed(1)}%`; });
  for (let i = 0; i < logoH.length; i++) {

    const k = 1 - Math.exp(-dt / (goal[i] > logoH[i] ? 55 : 170));
    logoH[i] += (goal[i] - logoH[i]) * k;
    if (Math.abs(goal[i] - logoH[i]) > 0.5) moving = true;
  }
  for (const g of document.querySelectorAll('.logo-mark g')) {
    [...g.children].forEach((r, i) => { r.setAttribute('height', logoH[i].toFixed(1)); r.setAttribute('y', (256 - logoH[i] / 2).toFixed(1)); });
  }
  logoRaf = moving ? requestAnimationFrame(logoFrame) : 0;
}

const LOCK_MS = 333;
const lockCanvas = document.createElement('canvas');
lockCanvas.width = lockCanvas.height = 192;
const lockH = LOGO_REST.slice();
let lockLast = 0, lockFrameNo = -1;
function lockFrame(force = false): void {
  const t = P.track, now = performance.now();
  if (!t || t.cover || P.ad || !document.hidden || !('mediaSession' in navigator) || (!force && now - lockLast < LOCK_MS) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dt = Math.min(500, now - lockLast);
  lockLast = now;
  const c = lockCanvas.getContext('2d');
  if (!c) return;
  c.setTransform(0.75, 0, 0, 0.75, 0, 0);

  const d = sounding() ? beat.data : null, end = Math.floor(audio.currentTime * FPS);
  const goal = d ? LOGO_REST.map((_, i) => {
    let peak = 0;
    for (let f = Math.max(lockFrameNo + 1, end - 8); f <= end; f++) { const at = f * BANDS + LOGO_BANDS[i]; if (at < d.length) peak = Math.max(peak, d[at]); }
    return 56 + 380 * (peak / 255);
  }) : logoTargets();
  lockFrameNo = end;
  c.fillStyle = '#0b0a0d';
  c.fillRect(0, 0, 256, 256);
  const g = c.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#ff4d2e'); g.addColorStop(1, '#ffb02e');
  c.fillStyle = g;
  goal.forEach((v, i) => {
    lockH[i] += (v - lockH[i]) * (1 - Math.exp(-dt / (v > lockH[i] ? 45 : 170)));
    const h = lockH[i] / 2;
    c.beginPath();
    c.roundRect((96 + i * 74) / 2, 128 - h / 2, 22, h, 11);
    c.fill();
  });
  const artwork = [{ src: lockCanvas.toDataURL('image/png'), sizes: '192x192', type: 'image/png' }];

  const m = navigator.mediaSession.metadata;
  if (m) m.artwork = artwork; else navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || '', artwork });
}
function wakeLogo(): void {
  if (logoRaf || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  logoLast = performance.now();
  logoRaf = requestAnimationFrame(logoFrame);
}

const queueList = h('div', { class: 'list queue' });
const queueSheet = h('div', { class: 'q-sheet', role: 'dialog', 'aria-label': 'Navbat' }, h('div', { class: 'q-grab' }, h('i'), h('h3', null, 'Navbat')), queueList);
const sheetState = { open: false, p: 0 };
let queueDrawn = '';
function renderQueue(): void {
  const sig = P.queue.map(q => q.id).join();
  if (sig !== queueDrawn) {
    queueDrawn = sig;
    queueList.replaceChildren(...P.queue.map((q, n) => h('button', { class: 'tr', 'data-id': q.id, 'data-n': n, style: 'margin:0;width:100%', onclick: () => loadAt(n, 0, n < P.i ? -1 : 1) }, cover(q.cover, q.title), h('div', { class: 'grow', style: 'text-align:left' }, h('div', { class: 'clip t' }, q.title), h('div', { class: 'clip s' }, q.artist)))));
  }
  for (const b of queueList.querySelectorAll<HTMLElement>('.tr')) {
    const cur = Number(b.dataset.n) === P.i;
    b.classList.toggle('cur', cur);
    if (cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
}
function paintSheet(p: number, animate: boolean): void {
  sheetState.p = p;
  if (!ui.now) return;
  ui.now.classList.toggle('q-anim', animate);
  ui.now.classList.toggle('q-shown', p > 0 || sheetState.open);
  ui.now.style.setProperty('--q', p.toFixed(4));
}
function setQueue(open: boolean, animate = true): void {
  const was = sheetState.open;
  sheetState.open = open;
  paintSheet(open ? 1 : 0, animate);
  if (open && !was) { renderQueue(); queueList.querySelector('.cur')?.scrollIntoView({ block: 'center' }); }
  for (const b of ui.now?.querySelectorAll('button[aria-label="Navbat"]') || []) b.classList.toggle('on', open);
  if (!open) setTimeout(() => { if (!sheetState.open && sheetState.p === 0) ui.now?.classList.remove('q-shown'); }, animate ? 420 : 0);
}
let dragBusy = false;
function attachSwipe(now: HTMLElement): void {
  let d: { x0: number; y0: number; p0: number; on: boolean; inList: boolean; y: number; t: number; v: number; dismiss: boolean; h: number; qh: number; dy: number } | null = null;
  let swallowClick = 0, raf = 0, pending: (() => void) | null = null;
  // Coalesce every pointer report into one write per display frame: 60 Hz panels
  // get 60, 120 Hz panels get 120, and a slow phone never queues a backlog.
  const schedule = (fn: () => void): void => {
    pending = fn;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const f = pending; pending = null; f?.(); });
  };
  const flush = (): void => { if (raf) cancelAnimationFrame(raf); raf = 0; pending = null; };
  const begin = (x: number, y: number, target: EventTarget | null) => {
    const el = target as Element;
    d = el.closest?.('input[type=range]') || P.ad ? null
      : { x0: x, y0: y, p0: sheetState.p, on: false, inList: !!el.closest?.('.queue'), y, t: performance.now(), v: 0, dismiss: false, h: innerHeight, qh: 0, dy: 0 };
    dragBusy = !!d;
  };
  const move = (x: number, y: number, e: Event) => {
    if (!d) return;
    const dy = y - d.y0;
    if (!d.on) {
      if (Math.abs(dy) < 8 || Math.abs(x - d.x0) > Math.abs(dy)) return;

      if (d.p0 === 0 ? dy > 0 && (now.querySelector('.now-in')?.scrollTop || 0) > 0 : dy < 0 || (d.inList && queueList.scrollTop > 0)) { d = null; return; }
      d.on = true;
      d.dismiss = d.p0 === 0 && dy > 0;
      now.classList.remove('d-anim');
      if (!d.dismiss) ui.now?.classList.add('q-shown');
    }
    if (e.cancelable) e.preventDefault();
    const t = performance.now();
    d.v = (y - d.y) / Math.max(1, t - d.t);
    d.y = y; d.t = t; d.dy = dy;
    if (d.dismiss) {
      const ratio = Math.max(0, dy / d.h);
      schedule(() => now.style.setProperty('--d', ratio.toFixed(4)));
    } else {
      const p = Math.min(1, Math.max(0, d.p0 - dy / (d.qh || (d.qh = queueSheet.offsetHeight))));
      schedule(() => paintSheet(p, false));
    }
  };
  const end = () => {
    const g = d;
    d = null;
    flush();
    if (!g?.on) { dragBusy = false; return; }
    swallowClick = performance.now();

    if (g.dismiss) {
      now.style.setProperty('--d', Math.max(0, g.dy / g.h).toFixed(4));
      if (g.v > 0.35 || g.dy > g.h * 0.28) dismissNow();
      else {
        now.classList.add('d-anim');
        now.style.setProperty('--d', '0');
        startBackdrop();
        setTimeout(() => { if (now.style.getPropertyValue('--d') === '0') dragBusy = false; }, 340);
      }
      return;
    }
    setQueue(g.v < -0.35 ? true : g.v > 0.35 ? false : Math.min(1, Math.max(0, g.p0 - g.dy / (g.qh || queueSheet.offsetHeight))) > 0.4);
    dragBusy = false;
  };
  now.addEventListener('touchstart', e => begin(e.touches[0].clientX, e.touches[0].clientY, e.target), { passive: true });
  now.addEventListener('touchmove', e => move(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
  now.addEventListener('touchend', end);
  now.addEventListener('touchcancel', () => {
    flush();
    const was = sheetState.open;
    d = null;
    setQueue(was);
    now.classList.add('d-anim');
    now.style.setProperty('--d', '0');
    startBackdrop();
    setTimeout(() => { if (now.style.getPropertyValue('--d') === '0') dragBusy = false; }, 340);
  });
  now.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) begin(e.clientX, e.clientY, e.target); });
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY, e); });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end(); });
  addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') end(); });
  now.addEventListener('dragstart', e => e.preventDefault());
  now.addEventListener('click', e => {
    if (performance.now() - swallowClick < 350) { e.stopPropagation(); e.preventDefault(); return; }
    if (sheetState.open && !(e.target as Element).closest('.q-sheet') && !(e.target as Element).closest('button[aria-label="Navbat"]') && !(e.target as Element).closest('button[aria-label="Yopish"]')) { e.stopPropagation(); e.preventDefault(); setQueue(false); }
  }, true);
}
let nebulaCanvas = h('canvas', { class: 'nebula', 'aria-hidden': 'true' });
let stopNebula: (() => void) | null = null;
function startBackdrop(): void {
  if (stopNebula || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  import('./nebula.ts').then(m => {
    if (!ui.now?.classList.contains('show') || stopNebula) return;
    stopNebula = m.startNebula(nebulaCanvas, sounding, readRhythm, () => {

      stopNebula = null;
      const fresh = h('canvas', { class: 'nebula', 'aria-hidden': 'true' });
      nebulaCanvas.replaceWith(fresh);
      nebulaCanvas = fresh;
      if (!document.hidden) startBackdrop();
    }, () => dragBusy);
  }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.now?.classList.contains('show')) startBackdrop(); });
function openNow() {
  ui.nowKey = '';
  renderNow();
  ui.now?.classList.add('show', 'opening');
  setTimeout(() => ui.now?.classList.remove('opening'), 700);
  loadRhythm();
  startBackdrop();
}

function dismissNow(): void {
  const now = ui.now;
  if (!now) return;
  now.classList.add('d-anim');
  now.style.setProperty('--d', '1');

  if (!stillMotion.matches) ui.player?.animate([{ transform: 'scale(.95)', opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: SOFT });
  setTimeout(() => { closeNow(); now.classList.remove('d-anim'); now.style.setProperty('--d', '0'); }, 300);
}
function closeNow() {
  setQueue(false, false);
  ui.now?.classList.remove('show');
  dragBusy = false;
  stopNebula?.();
  stopNebula = null;
}
function renderNow(mode?: string): void {
  const t = P.track;
  if (!t || !ui.now) return closeNow();
  if (mode) ui.nowMode = mode;
  const m = ui.nowMode || 'art';
  ui.now.style.setProperty('--art', t.cover ? `url("${t.cover}")` : 'none');
  const left = m === 'lyrics' ? h('div', { class: 'lyrics', id: 'lyr' }, 'Yuklanmoqda…')
    : h('div', { class: 'art-wrap' }, cover(t.cover, t.title, 'art'));
  const listTop = queueList.scrollTop;
  renderQueue();
  const key = `${t.id}|${m}`;
  if (key === ui.nowKey) {
    queueList.scrollTop = listTop;
    swapIcon(ui.nowPlay, shownPaused() ? 'play' : 'pause', 30);
    ui.nowSh?.classList.toggle('on', P.shuffle);
    if (ui.nowRp) { ui.nowRp.classList.toggle('on', P.repeat !== 'off'); swapIcon(ui.nowRp, repeatIcon()); ui.nowRp.setAttribute('aria-label', REPEAT_LABEL[P.repeat]); ui.nowRp.title = REPEAT_LABEL[P.repeat]; }
    paintTime();
    return;
  }
  const moved = !!ui.nowKey && ui.nowKey.split('|')[0] !== t.id && ui.now.classList.contains('show') && !document.hidden;
  ui.nowKey = key;
  const swipe = P.dir === 1 ? 'next' : 'prev';
  const leaving = moved ? [ghost(ui.now.querySelector('.art-wrap, .lyrics'), ui.now, `swipe-${swipe}-out`), ghost(ui.now.querySelector('.now-title'), ui.now, `swipe-${swipe}-out`)] : [];
  if (moved) left.classList.add(`swipe-${swipe}`);
  else if (ui.now.classList.contains('show')) left.classList.add('mode-in');
  seekCanvas ??= h('canvas', { class: 'tide', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  seekTide ??= startTide(seekCanvas, sounding, readRhythm, () => !ui.now?.classList.contains('show') || dragBusy, 3);
  seekTide.song(t.cover, hue(t.title) / 360);
  ui.now.replaceChildren(queueSheet, nebulaCanvas, h('div', { class: 'now-in' },
    h('div', { class: 'top' },
      iconBtn('down', 'Yopish', dismissNow),
      h('div', { class: 'small muted clip', style: 'font-weight:700' }, t.album || 'Hozir ijro etilmoqda'),
      iconBtn('plus', 'Pleylistga qo\'shish', () => addToPlaylist(t))),
    left,
    h('div', { class: 'pane' },
      h('div', { class: `row between now-title ${moved ? `swipe-${swipe}` : ''}` },
        h('div', { class: 'grow' }, h('h2', { class: 'clip' }, t.title), h('a', { class: 'muted clip', style: 'display:block', href: `/artist/${t.artistId}` }, t.artist)),
        offlineSaver(t),
        likeBtn(t)),
      h('span', { class: 'quality' }, quality(t)),
      h('div', null, h('div', { class: 'water-seek' }, seekCanvas, seekBar()), h('div', { class: 'row between' }, h('span', { class: 'time', 'data-cur': '1' }, '0:00'), h('span', { class: 'time', 'data-dur': '1' }, '0:00'))),
      h('div', { class: 'ctl' },
        ui.nowSh = iconBtn('shuffle', 'Aralash', () => { P.shuffle = !P.shuffle; syncPlayer(); }, P.shuffle ? 'on' : ''),
        iconBtn('prev', 'Oldingi', P_prev, '', 30),
        ui.nowPlay = h('button', { class: 'playbtn big', 'aria-label': 'Ijro', 'data-face': shownPaused() ? 'play' : 'pause', onclick: toggle }, icon(shownPaused() ? 'play' : 'pause', 30)),
        iconBtn('next', 'Keyingi', P_next, '', 30),
        ui.nowRp = iconBtn(repeatIcon(), REPEAT_LABEL[P.repeat], cycleRepeat, P.repeat !== 'off' ? 'on' : '')),
      h('div', { class: 'row between' },
        iconBtn('text', 'Qo\'shiq matni', () => renderNow(m === 'lyrics' ? 'art' : 'lyrics'), m === 'lyrics' ? 'on' : ''),
        h('div', { class: 'q-hint', 'aria-hidden': 'true' }, icon('down', 20)),
        iconBtn('queue', 'Navbat', () => setQueue(!sheetState.open), sheetState.open ? 'on' : '')))));
  if (m === 'lyrics') api(`/api/tracks/${t.id}`).then(d => { const l = document.getElementById('lyr'); if (l) l.textContent = d.lyrics || 'Bu qo\'shiq uchun matn hali kiritilmagan.'; }).catch(() => {});
  queueList.scrollTop = listTop;
  for (const go of leaving) go();
  paintTime();
}

function runAd(ad: Row): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    closeNow();
    let left = ad.duration, finished = false;
    const counter = h('div', { class: 'count', 'aria-live': 'off' }, `${left}s`);
    const stop = (result: boolean): void => {
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
    let finishing = false, early: Promise<boolean> | null = null;

    const settle = () => early || (early = (async () => {
      for (let n = 0; n < 5; n++) {
        try { await api(`/api/ads/${ad.viewId}/complete`, { method: 'POST' }); P.afterAd = await requestPlay(P.track!.id); return true; } catch { await new Promise(r => setTimeout(r, 1200)); }
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

function trackRow(t: Track, list: Track[], i: number, extra?: Node | null): HTMLElement {
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
const trackList = (list: Track[], extra?: ((t: Track) => Node) | null) => h('div', { class: 'list' },
  h('div', { class: 'thead', 'aria-hidden': 'true' }, h('span', { class: 'n' }, '#'), h('span', { class: 'grow' }, 'Nomi'), h('span', { class: 'alb' }, 'Albom'), h('span', { class: 'dur' }, 'Vaqt'), h('span', { class: 'pad' })),
  list.map((t, i) => trackRow(t, list, i, extra?.(t))));
const NEW_DAYS = 7 * 86400;
const isNew = (t: Track): boolean => Date.now() / 1000 - t.createdAt < NEW_DAYS;
const trackCard = (t: Track, list: Track[], i: number) => h('button', { class: 'card', 'data-track': t.id, onclick: () => playList(list, i) }, isNew(t) ? h('span', { class: 'tag hot new-tag' }, 'Yangi') : null, cover(t.cover, t.title), h('div', { class: 't clip' }, t.title), h('div', { class: 's clip' }, t.artist));

function announceNew(fresh: Track[]): void {
  const newest = fresh.filter(isNew)[0];
  if (!newest || !S.user || newest.createdAt <= (S.user.seenTrackAt || 0) || ui.now?.classList.contains('show')) return;
  setTimeout(() => {
    const card = mainEl?.querySelector<HTMLElement>(`.shelf .card[data-track="${newest.id}"]`);
    if (!card || ui.now?.classList.contains('show')) return;
    S.user!.seenTrackAt = newest.createdAt;
    api('/api/me/seen', { method: 'POST', body: { at: newest.createdAt } }).catch(() => {});
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center', inline: 'center' });
    card.classList.add('spotlight');
    toast(`Yangi qo'shiq: ${newest.title}`);
    setTimeout(() => card.classList.remove('spotlight'), 5200);
  }, 700);
}
const albumCard = (a: Row) => h('a', { class: 'card', href: `/album/${a.id}` }, cover(a.cover, a.title), h('div', { class: 't clip' }, a.title), h('div', { class: 's clip' }, a.artist));
const artistCard = (a: Row) => h('a', { class: 'card round', href: `/artist/${a.id}` }, cover(a.image, a.name), h('div', { class: 't clip' }, a.name), h('div', { class: 's' }, 'Ijrochi'));
const libRow = (href: string, mark: Node, title: string, sub: string) => h('a', { class: 'lib-row', href }, mark, h('div', { class: 'grow' }, h('div', { class: 't clip' }, title), h('div', { class: 's clip' }, sub)), icon('chev', 16));
const shelf = (title: string, items: Node[]) => items.length ? h('section', { class: 'section' }, h('h2', null, title), h('div', { class: 'shelf' }, items)) : null;
const nodes = (l: unknown[]): Node[] => l.filter(Boolean) as Node[];
const empty = (text: string) => h('div', { class: 'panel muted', style: 'text-align:center;padding:36px 18px' }, text);

function addToPlaylist(t: Track): void {
  sheet(close => {
    const name = h('input', { placeholder: 'Yangi pleylist nomi', 'aria-label': 'Yangi pleylist nomi' });
    return [h('h2', null, 'Pleylistga qo\'shish'), h('p', { class: 'muted small clip' }, t.title),
      S.playlists.map((p: Row) => h('button', { class: 'btn full', onclick: guard(async () => { await api(`/api/playlists/${p.id}/tracks`, { method: 'POST', body: { trackId: t.id } }); close(); toast(`"${p.name}" ga qo'shildi`); }) }, h('span', { class: 'clip' }, p.name))),
      h('form', { class: 'row', onsubmit: guard(async (e: Event) => {
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

type View = (el: HTMLElement, parts: string[]) => Promise<void>;
const V: Record<string, View> = {
  async home(el) {
    const d = await api('/api/home');
    const hr = new Date().getHours();
    const free = S.user!.entitlement && !S.user!.entitlement.premium;
    const promoted = d.promoted[0];
    const lead: Track | undefined = promoted || d.fresh[0];
    const leadList: Track[] = promoted ? d.promoted : d.fresh;
    const stage = h('canvas', { class: 'stage-gl', 'aria-hidden': 'true' });
    const eyebrow = h('span', { class: 'eyebrow' });
    const title = h('h1', { class: 'clip2' });
    const sub = h('p', { class: 'muted clip' });
    const quality = h('span', { class: 'quality' });
    const go = h('button', { class: 'btn pri' });

    const paintStage = (): void => {
      const now = P.track, t = now || lead;
      if (!t) return;
      const paused = shownPaused();
      eyebrow.textContent = now ? (loadingSong() ? 'Yuklanmoqda' : paused ? 'To\'xtatilgan' : P.quiet ? 'Ovoz o\'chirilgan' : 'Hozir chalinmoqda') : promoted ? 'Reklama' : isNew(t) ? 'Yangi chiqdi' : 'Tinglab ko\'ring';
      title.textContent = t.title;
      sub.textContent = !now && promoted?.promoText || t.artist;
      quality.textContent = `WAV · ${t.bitDepth}-bit · ${Math.round(t.sampleRate / 100) / 10} kHz`;

      const face = !now ? 'Tinglash' : paused ? 'Davom etish' : 'Pauza';
      if (go.textContent !== face) {
        const from = go.offsetWidth;
        go.replaceChildren(icon(now && !paused ? 'pause' : 'play', 18), h('span', { class: 'go-face' }, face));
        if (from && !stillMotion.matches) go.animate([{ width: `${from}px` }, { width: `${go.offsetWidth}px` }], { duration: 280, easing: SOFT });
      }
      go.classList.toggle('on', !!now && !paused);
      title.classList.toggle('open', !!now);
    };
    go.onclick = () => { if (P.track) toggle(); else if (lead) playList(leadList, 0); };
    title.onclick = () => { if (P.track) openNow(); };
    stagePaint.set(stage, paintStage);
    paintStage();
    el.append(stage, h('section', { class: 'stage' },
      h('div', { class: 'stage-top' }, logoMark('home-mark'), h('span', { class: 'greet grow' }, hr < 6 ? 'Xayrli tun' : hr < 12 ? 'Xayrli tong' : hr < 18 ? 'Xayrli kun' : 'Xayrli kech'), getApp(), h('a', { class: 'ib', href: '/account', 'aria-label': 'Akkaunt' }, icon('user'))),
      lead || P.track
        ? h('div', { class: 'stage-lead' }, eyebrow, title, sub, h('div', { class: 'stage-go' }, go, quality))
        : h('div', { class: 'stage-lead' }, h('h1', null, S.settings.heroTitle), h('p', { class: 'muted' }, S.settings.heroSub))));

    const scroller = mainEl;
    const dim = (): void => {
      if (!stage.isConnected) { scroller?.removeEventListener('scroll', dim); return; }
      stage.style.opacity = String(Math.max(0.42, 1 - (scroller?.scrollTop ?? 0) / 700));
    };
    scroller?.addEventListener('scroll', dim, { passive: true });
    import('./stage.ts').then(m => m.startStage(stage, sounding, readRhythm, () => !!ui.now?.classList.contains('show'))).catch(() => {});
    if (free) el.append(upsell());
    if (d.genres.length) el.append(h('div', { class: 'pill-row' }, d.genres.map((g: string) => h('a', { class: 'pill', href: `/genre/${encodeURIComponent(g)}` }, g))));
    const top = d.popular.slice(0, 5);
    el.append(...nodes([
      d.promoted.length > 1 ? shelf('Tavsiya etamiz', d.promoted.map((t: Track, i: number) => trackCard(t, d.promoted, i))) : null,
      shelf('Yangi qo\'shiqlar', d.fresh.map((t: Track, i: number) => trackCard(t, d.fresh, i))),
      top.length ? h('section', { class: 'section' }, h('h2', null, 'Top 5'), trackList(top)) : null,
      shelf('Tahririyat pleylistlari', d.editorial.map((p: Row) => h('a', { class: 'card', href: `/playlist/${p.id}` }, cover(null, p.name), h('div', { class: 't clip' }, p.name)))),
      shelf('Albomlar', d.albums.map(albumCard)),
      shelf('Ijrochilar', d.artists.map(artistCard)),
    ]));
    announceNew(d.fresh);
    if (!d.fresh.length) el.append(empty('Hozircha qo\'shiqlar yo\'q. Tez orada yangi musiqalar joylanadi.'));
  },
  async search(el) {
    const results = h('div', { class: 'stack', style: 'gap:24px' });
    const q = h('input', { type: 'search', placeholder: 'Qo\'shiq, ijrochi yoki albom', 'aria-label': 'Qidiruv', value: new URLSearchParams(location.search).get('q') || '' });
    let timer: ReturnType<typeof setTimeout> | undefined, seq = 0;
    const runIt = async () => {
      const s = ++seq, term = q.value.trim();
      if (!term) {
        history.replaceState(null, '', '/search');
        const all = await api('/api/catalog').catch(() => null);
        if (s !== seq) return;
        results.replaceChildren(all?.tracks.length ? h('section', { class: 'section' }, h('h2', null, 'Barcha qo\'shiqlar'), trackList(all.tracks)) : empty('Hozircha qo\'shiqlar yo\'q.'));
        return;
      }
      history.replaceState(null, '', `/search?q=${encodeURIComponent(term)}`);
      try {
        const d = await api(`/api/search?q=${encodeURIComponent(term)}`);
        if (s !== seq) return;
        results.replaceChildren(...nodes([
          d.tracks.length ? h('section', { class: 'section' }, h('h2', null, 'Qo\'shiqlar'), trackList(d.tracks)) : null,
          shelf('Ijrochilar', d.artists.map(artistCard)), shelf('Albomlar', d.albums.map(albumCard)),
          !d.tracks.length && !d.artists.length && !d.albums.length ? empty(`"${term}" bo'yicha hech narsa topilmadi`) : null,
        ]));
      } catch (e) { toast((e as Error).message); }
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runIt, 250); });
    el.append(h('h1', null, 'Qidiruv'), q, results);
    await runIt();
  },
  async library(el) {
    await loadLibrary();
    el.append(h('div', { class: 'top' }, h('h1', null, 'Kutubxona'),
      h('button', { class: 'btn sm', onclick: () => newPlaylist() }, icon('plus', 16), 'Pleylist')),
      h('section', { class: 'lib' },
        libRow('/offline', h('span', { class: 'lib-ic' }, icon('offline', 22)), 'Oflayn', 'Internetsiz tinglash'),
        libRow('/liked', h('span', { class: 'lib-ic liked' }, icon('heartfull', 20)), 'Yoqtirganlarim', `${S.liked.size} ta qo'shiq`),
        S.playlists.map((p: Row) => libRow(`/playlist/${p.id}`, cover(null, p.name), p.name, `${p.count} ta qo'shiq`))));
  },
  async liked(el) {
    const d = await api('/api/likes');
    el.append(pageHead(null, 'Yoqtirganlarim', `${d.tracks.length} ta qo'shiq`, d.tracks), d.tracks.length ? trackList(d.tracks) : empty('Yoqqan qo\'shiqlaringiz shu yerda to\'planadi.'));
  },
  async playlist(el, [id]) {
    const d = await api(`/api/playlists/${id}`);
    const extra = d.mine ? (t: Track) => iconBtn('x', 'Olib tashlash', guard(async () => { await api(`/api/playlists/${id}/tracks/${t.id}`, { method: 'DELETE' }); route(); }), 'sm', 18) : null;
    el.append(pageHead(null, d.name, `${d.tracks.length} ta qo'shiq`, d.tracks, d.mine ? [
      S.user!.role === 'admin' ? h('button', { class: 'btn sm', onclick: guard(async () => { await api(`/api/playlists/${id}`, { method: 'PATCH', body: { public: !d.public } }); toast(d.public ? 'Yashirildi' : 'Bosh sahifaga chiqarildi'); route(); }) }, d.public ? 'Yashirish' : 'Hammaga ko\'rsatish') : null,
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
    const e = S.user!.entitlement;
    el.append(h('div', { class: 'stack' }, h('h1', null, 'Musiqa, reklamasiz'), h('p', { class: 'muted' }, 'O\'zingizga mos tarifni tanlang. Istalgan vaqtda to\'xtatish mumkin.')));
    if (!S.settings.plansEnabled) el.append(empty('Hozir barcha foydalanuvchilar uchun tinglash bepul va reklamasiz.'));
    if (e?.reason === 'plan' || e?.reason === 'family') el.append(h('div', { class: 'upsell' }, h('div', null, h('h3', null, 'Tarifingiz faol'), h('p', { class: 'small muted' }, `${new Date(e.expires * 1000).toLocaleDateString('ru-RU')} gacha`))));
    const free = ['admin', 'exempt'].includes(e?.reason);
    if (free) el.append(h('div', { class: 'upsell' }, h('div', null, h('h3', null, 'Sizga to\'lov kerak emas'), h('p', { class: 'small muted' }, 'Akkauntingiz plan va reklamadan ozod.'))));
    if (d.pending) el.append(h('div', { class: 'upsell' }, h('div', null, h('h3', null, 'To\'lovingiz tekshirilmoqda'), h('p', { class: 'small muted' }, 'Admin tasdiqlashi bilan tarif faollashadi.'))));
    el.append(h('div', { class: 'plans' },
      h('div', { class: 'plan' }, h('h2', null, 'Sado'), h('p', { class: 'muted small' }, 'Bepul, reklama bilan'), h('div', { class: 'price' }, '0 so\'m'),
        h('ul', null, h('li', null, 'Butun katalog'), h('li', null, 'Asl WAV sifati'), h('li', null, 'Qo\'shiqlar orasida reklama')),
        h('button', { class: 'btn', disabled: true }, e?.reason === 'free' ? 'Joriy tarif' : 'Bepul')),
      d.plans.map((p: Row, i: number) => h('div', { class: `plan ${i === 0 ? 'best' : ''}` },
        i === 0 ? h('span', { class: 'tag hot' }, 'Ommabop') : null,
        h('h2', null, p.name), h('p', { class: 'muted small' }, p.tagline),
        h('div', { class: 'price' }, money(p.price), h('span', { class: 'small muted', style: 'font-weight:600' }, ` / ${p.days === 30 ? 'oy' : p.days + ' kun'}`)),
        h('ul', null, p.features.map((f: string) => h('li', null, f))),
        free || !S.settings.plansEnabled ? null : h('button', { class: `btn ${i === 0 ? 'pri' : 'light'}`, disabled: !!d.pending, onclick: d.click ? guard(async () => { location.href = (await api('/api/payments/click', { method: 'POST', body: { planId: p.id } })).url; }) : () => buy(p, d.card) }, d.click ? 'Click orqali to\'lash' : 'Tanlash')))));
    if ((e?.reason === 'plan') && d.plans.find((p: Row) => p.id === e.planId)?.seats > 1) el.append(familyPanel(d.family));
  },
  async account(el) {
    const u = S.user!, e = u.entitlement;
    const label = ({ plans_off: 'Bepul rejim', admin: e?.planName ? `${e.planName} · doimiy` : 'Admin', exempt: 'Maxsus ruxsat', plan: 'Faol tarif', family: 'Oila tarifi', free: 'Sado (bepul)' } as Record<string, string>)[e?.reason] || '';
    const name = h('input', { value: u.name, 'aria-label': 'Ism' });
    const probe = h('div', { style: 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' });
    document.body.append(probe);
    const inset = getComputedStyle(probe);
    const diag = `ekran ${screen.width}x${screen.height} | oyna ${innerWidth}x${innerHeight} | body ${document.body.clientHeight} | safe ${inset.paddingTop}/${inset.paddingBottom} | standalone ${nav.standalone === true}`;
    probe.remove();
    const [push, apiBox] = await Promise.all([pushPanel().catch(() => null), apiPanel().catch(() => null)]);
    el.append(...nodes([h('h1', null, 'Akkaunt'), push, apiBox,
      h('form', { class: 'panel', onsubmit: guard(async (ev: Event) => { ev.preventDefault(); await api('/api/me', { method: 'PATCH', body: { name: name.value } }); u.name = name.value; toast('Saqlandi'); }) },
        h('div', { class: 'row between wrap' }, h('div', { class: 'grow' }, h('h3', { class: 'clip' }, u.email)), h('span', { class: 'tag' }, label)),
        h('label', { class: 'f' }, 'Ism', name), h('button', { class: 'btn light' }, 'Saqlash')),
      u.role === 'admin' ? h('p', { class: 'small dim', style: 'overflow-wrap:anywhere' }, diag) : null,
      h('p', { class: 'small dim' }, 'Pleyer animatsiyasi: "nebula", muallif ', h('a', { href: 'https://www.youtube.com/@yoniicat', target: '_blank', rel: 'noopener', style: 'text-decoration:underline' }, 'Firecat (@yoniicat)'), ', Vizzy.io loyihasi asosida.'),
      h('div', { class: 'row wrap' },
        u.role === 'admin' ? null : h('a', { class: 'btn', href: '/premium' }, 'Tariflar'),
        installed() ? null : h('a', { class: 'btn', href: '/install' }, 'Ilovani o\'rnatish'),
        u.role === 'admin' ? h('a', { class: 'btn pri', href: '/admin' }, 'Admin panel') : null,
        S.settings.supportUrl ? h('a', { class: 'btn', href: S.settings.supportUrl, target: '_blank', rel: 'noopener' }, 'Yordam') : null,
        h('button', { class: 'btn danger', onclick: guard(async () => { await api('/api/auth/logout', { method: 'POST' }); sw({ type: 'clear' }); offline.wipeDevice(); try { localStorage.removeItem('listening'); } catch {  } audio.pause(); P.track = null; S.user = null; go('/', true); render(); }) }, 'Chiqish'))]));
  },

  async connect(el) {
    const q = new URLSearchParams(location.search);
    const ask = { client_name: q.get('client_name'), redirect_uri: q.get('redirect_uri'), state: q.get('state') ?? '', code_challenge: q.get('code_challenge'), code_challenge_method: q.get('code_challenge_method'), scope: q.get('scope') ?? 'read' };
    let info: Row;
    try { info = await api('/api/oauth/approve', { method: 'POST', body: { ...ask, check: true } }); } catch (e) {
      el.append(h('section', { class: 'panel connect' }, h('h1', null, 'Ulanib bo\'lmadi'), h('p', { class: 'err' }, (e as Error).message), h('p', { class: 'muted small' }, 'Ilovaning so\'rovi noto\'g\'ri tuzilgan. Uni yuborgan ilova egasiga xabar bering.')));
      return;
    }
    const answer = (deny: boolean) => guard(async () => {
      for (const b of el.querySelectorAll<HTMLButtonElement>('.connect button')) b.disabled = true;
      const { redirect } = await api('/api/oauth/approve', { method: 'POST', body: { ...ask, deny } });
      location.href = redirect;
    });
    const can = (text: string) => h('li', null, icon('plus', 16), text), cannot = (text: string) => h('li', { class: 'no' }, icon('x', 16), text);
    const badge = h('span', { class: 'connect-app', style: `--h:${hue(info.client)}` }, info.client.slice(0, 1).toUpperCase());
    el.append(h('section', { class: 'panel connect' },
      h('div', { class: 'connect-logos' }, logoMark('connect-mark'), h('span', { class: 'connect-link' }, h('i'), h('i'), h('i')), badge),
      h('h1', null, h('b', null, info.client), ' akkauntingizga ulanmoqchi'),
      h('p', { class: 'muted small' }, 'Akkaunt: ', h('b', null, info.account)),
      h('h3', null, 'Ruxsat beriladi'),
      h('ul', { class: 'perm' }, can('Kutubxona, layklar va pleylistlaringizni ko\'rish'), can('Katalogdan qidirish va qo\'shiq tinglash'), info.scope.includes('write') ? can('Layk bosish, pleylist yaratish, o\'zgartirish va o\'chirish') : null),
      h('h3', null, 'Hech qachon berilmaydi'),
      h('ul', { class: 'perm' }, cannot('Parol, email va kirish'), cannot('To\'lov, tarif va oila a\'zolari'), cannot('Admin panel va boshqa foydalanuvchilar')),
      h('p', { class: 'small muted' }, 'Tasdiqlasangiz, ', h('b', null, info.host), ' manziliga qaytasiz. Ruxsatni istalgan vaqtda Akkaunt → API bo\'limidan uzishingiz mumkin.'),
      h('div', { class: 'row connect-go' }, h('button', { class: 'btn grow', onclick: answer(true) }, 'Rad etish'), h('button', { class: 'btn pri grow', onclick: answer(false) }, 'Ruxsat berish'))));
  },
  async install(el) {
    if (installed()) { go('/', true); return; }
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
    el.append(h('h1', null, 'Ilovani o\'rnatish'), h('div', { class: 'two' }, android ? [apk, ios] : [ios, apk]), S.user ? '' : h('a', { class: 'btn', href: '/' }, 'Kirish sahifasiga qaytish'));
  },
};

const refreshOffline = async (): Promise<void> => {
  if (!S.user) return;
  const state = await api('/api/offline').catch(() => null);
  if (state) await offline.syncLicense(S.user.id, state as never).catch(() => {});
};
async function saveOffline(t: Track): Promise<void> {
  await api('/api/offline', { method: 'POST', body: { trackId: t.id } });
  await refreshOffline();
  await offline.download(t, async () => (await api(`/api/offline/${t.id}/url`)).url);
}
V.offline = async el => {
  const online = navigator.onLine;
  let state: Row | null = online ? await api('/api/offline').catch(() => null) : null;
  if (state && S.user) await offline.syncLicense(S.user.id, state as never).catch(() => {});
  const lic = await offline.refreshReady();
  const local = await offline.localSongs();
  if (!state) state = { limit: lic?.limit ?? 0, items: local.map(s => ({ ...s.track, allowed: offline.ready.has(s.id) })) };
  const items = state.items as (Track & { allowed: boolean })[];
  const has = new Map(local.map(s => [s.id, s]));
  const limitText = state.limit === -1 ? `${items.length} ta qo'shiq` : `${items.length} / ${state.limit} ta qo'shiq`;
  const playable = () => items.filter(t => offline.ready.has(t.id));
  el.append(h('div', { class: 'stack' }, h('h1', null, 'Oflayn'), h('p', { class: 'muted' }, state.limit === 0 && !items.length ? 'Bu imkoniyat Boyvacha va Karanda tariflarida bor.' : limitText)));
  if (state.limit === 0 || (items.length && !items.some(t => t.allowed))) el.append(h('div', { class: 'upsell' }, h('div', { class: 'grow' }, h('h3', null, 'Oflayn yopiq'), h('p', { class: 'small muted' }, items.length ? 'Saqlangan qo\'shiqlaringiz turibdi, tarif olsangiz darhol ochiladi.' : 'Tarif oling va internetsiz tinglang.')), online ? h('a', { class: 'btn pri sm', href: '/premium' }, 'Tarif olish') : null));
  if (!online) el.append(h('span', { class: 'tag' }, 'Internet yo\'q'));
  if (playable().length) el.append(h('div', null, h('button', { class: 'btn pri', onclick: () => playList(playable(), 0, true) }, icon('play', 18), 'Tinglash')));
  if (!items.length && state.limit !== 0) el.append(empty('Hali saqlangan qo\'shiq yo\'q. Qo\'shiq yonidagi + tugmasidan "Oflayn saqlash"ni tanlang.'));
  const move = (i: number, dir: number) => guard(async () => {
    const ids = items.map(t => t.id), j = i + dir;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api('/api/offline/order', { method: 'PUT', body: { ids } });
    route(true);
  });
  el.append(h('section', { class: 'list offline-list' }, items.map((t, i) => {
    const rec = has.get(t.id), open = offline.ready.has(t.id), busy = offline.active.get(t.id);
    const status = busy !== undefined ? `Yuklanmoqda ${Math.round(busy * 100)}%` : open ? 'Oflayn tayyor' : !t.allowed ? 'Limitdan tashqari' : rec?.done ? 'Yopiq' : rec ? `To'xtagan ${Math.round((rec.have * 1048576 / rec.size) * 100)}%` : 'Yuklanmagan';
    return h('div', { class: `tr ${P.track?.id === t.id ? 'cur' : ''}`, 'data-id': t.id },
      h('button', { class: 'hit', disabled: !open, onclick: () => playList(playable(), playable().findIndex(x => x.id === t.id), true) }, cover(t.cover, t.title),
        h('div', { class: 'grow' }, h('div', { class: 'clip t' }, t.title), h('div', { class: 'clip s' }, status))),
      !open && t.allowed && online && busy === undefined ? h('button', { class: 'btn sm', onclick: guard(async () => { await offline.download(t, async () => (await api(`/api/offline/${t.id}/url`)).url); }) }, 'Yuklash') : null,
      online ? iconBtn('down', 'Yuqoriga', move(i, -1), `sm flip ${i === 0 ? 'off' : ''}`, 18) : null,
      online ? iconBtn('down', 'Pastga', move(i, 1), `sm ${i === items.length - 1 ? 'off' : ''}`, 18) : null,
      online ? iconBtn('x', 'O\'chirish', guard(async () => { await api(`/api/offline/${t.id}`, { method: 'DELETE' }); await offline.forget(t.id); route(true); }), 'sm', 18) : null);
  })));
};
offline.onChange(() => { if (location.pathname === '/offline' && mainEl && !document.querySelector('.sheet')) route(true); });

const pushSupported = (): boolean => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64ToBytes(s: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>; }
async function enablePush(): Promise<void> {
  try { localStorage.removeItem('push-off'); } catch {  }
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bildirishnomaga ruxsat berilmadi. Telefon sozlamalaridan yoqish mumkin.');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('/api/notices/key');
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api('/api/notices/subscribe', { method: 'POST', body: { kind: 'web', endpoint: sub.endpoint } });
}
async function disablePush(): Promise<void> {
  try { localStorage.setItem('push-off', '1'); } catch {  }
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (sub) { await api('/api/notices/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
}

document.addEventListener('click', function pushByDefault() {
  if (!S.user) return;
  document.removeEventListener('click', pushByDefault, true);
  let off = false;
  try { off = !!localStorage.getItem('push-off'); } catch {  }
  if (off || win.RythmNative || !pushSupported() || Notification.permission === 'denied') return;
  enablePush().then(() => { if (location.pathname === '/account') route(true); }).catch(() => {});
}, true);

async function apiPanel(): Promise<HTMLElement> {
  const [{ tokens }, docs] = await Promise.all([api('/api/me/tokens'), api('/api/me/api')]);
  const when = (t: number): string => (t ? new Date(t * 1000).toLocaleDateString('ru-RU') : 'hali yo\'q');
  const name = h('input', { required: true, maxlength: 60, placeholder: 'Masalan: Telegram botim', 'aria-label': 'Kalit nomi' });
  const write = h('input', { type: 'checkbox' });
  const made = h('div');
  const list = h('div', { class: 'stack' });
  const rows = (l: Row[]) => list.replaceChildren(...(l.length ? l.map(k => h('div', { class: 'item' },
    h('div', { class: 'body' }, h('div', { class: 'row', style: 'gap:8px' }, h('b', { class: 'clip' }, k.name), h('span', { class: 'tag' }, k.kind === 'app' ? 'Ilova' : 'Kalit')),
      h('div', { class: 'small muted' }, `${k.scope.includes('write') ? 'Ko\'rish va o\'zgartirish' : 'Faqat ko\'rish'} · …${k.hint} · ulangan ${when(k.created_at)} · ishlatilgan ${when(k.last_used)}`)),
    h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/me/tokens/${k.id}`, { method: 'DELETE' }); toast(`${k.name} uzildi`); rows((await api('/api/me/tokens')).tokens); }) }, 'Uzish'))) : [h('p', { class: 'muted small' }, 'Hali kalit yoki ulangan ilova yo\'q.')]));
  rows(tokens);
  const o = location.origin;
  return h('section', { class: 'panel' }, h('h2', null, 'API va ulangan ilovalar'),
    h('p', { class: 'muted small' }, 'Kalit faqat sizning akkauntingizni boshqaradi: kutubxona, layklar, pleylistlar va tinglash. Parol, to\'lov, oila va admin panelga u orqali kirib bo\'lmaydi.'),
    h('form', { class: 'stack', onsubmit: guard(async (e: Event) => {
      e.preventDefault();
      const { key } = await api('/api/me/tokens', { method: 'POST', body: { name: name.value, write: write.checked } });
      name.value = ''; write.checked = false;
      made.replaceChildren(h('div', { class: 'upsell' }, h('div', { class: 'grow', style: 'min-width:0' }, h('h3', null, 'Kalitni hozir saqlang'), h('p', { class: 'small muted' }, 'U boshqa hech qachon ko\'rsatilmaydi.'), h('code', { style: 'overflow-wrap:anywhere;font-size:13px' }, key)),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { navigator.clipboard?.writeText(key).then(() => toast('Nusxalandi'), () => toast('Qo\'lda nusxalang')); } }, 'Nusxalash')));
      rows((await api('/api/me/tokens')).tokens);
    }) }, h('label', { class: 'f' }, 'Yangi kalit nomi', name), h('label', { class: 'check' }, write, 'O\'zgartirishga ham ruxsat (layk, pleylist)'), h('button', { class: 'btn pri' }, 'Kalit yaratish')),
    made, list,
    h('details', { class: 'api-doc' }, h('summary', null, 'Qanday ishlatiladi'),
      h('p', { class: 'small muted' }, 'So\'rovga kalitni sarlavha qilib qo\'shing:'),
      h('pre', null, `curl ${o}/api/likes \\\n  -H "Authorization: Bearer ut_..."`),
      h('p', { class: 'small muted' }, 'Boshqa ilova sizning nomingizdan ulanmoqchi bo\'lsa, sizni ruxsat sahifasiga yuboradi. U yerda bir marta tasdiqlaysiz va ilova o\'z kalitini oladi (OAuth 2.0, PKCE S256):'),
      h('pre', null, `${o}/connect?client_name=ILOVA&redirect_uri=https://ilova.uz/callback\n  &state=...&code_challenge=...&code_challenge_method=S256&scope=read%20write\n\nPOST ${o}/api/oauth/token\n  grant_type=authorization_code&code=...&code_verifier=...&redirect_uri=...`),
      h('p', { class: 'small muted' }, 'Kalit ishlaydigan manzillar:'),
      h('div', { class: 'stack', style: 'gap:2px' }, docs.endpoints.map((d: Row) => h('div', { class: 'small', style: 'overflow-wrap:anywhere' }, h('b', { style: 'display:inline-block;width:62px' }, d.method), d.path, d.scope === 'write' ? h('span', { class: 'dim' }, ' · o\'zgartirish') : null)))));
}
async function pushPanel(): Promise<HTMLElement> {
  const iosBrowser = /iPhone|iPad|iPod/.test(navigator.userAgent) && !nav.standalone;
  const box = h('section', { class: 'panel' }, h('h2', null, 'Bildirishnomalar'));
  if (win.RythmNative?.pushToken) { box.append(h('p', { class: 'muted small' }, 'Ilova yangi qo\'shiqlar haqida o\'zi xabar beradi. Telefon sozlamalaridan o\'chirish mumkin.')); return box; }
  if (iosBrowser) { box.append(h('p', { class: 'muted small' }, 'iPhone\'da bildirishnoma faqat bosh ekranga o\'rnatilgan ilovada ishlaydi. Avval ilovani o\'rnating va shu yerdan yoqing.'), h('a', { class: 'btn sm', href: '/install' }, 'Ilovani o\'rnatish')); return box; }
  if (!pushSupported()) { box.append(h('p', { class: 'muted small' }, 'Bu qurilma bildirishnomani qo\'llamaydi.')); return box; }

  let on = false;
  const note = h('p', { class: 'muted small' }, 'Ruxsat bersangiz, yangi qo\'shiqlardan birinchi bo\'lib xabar olasiz.');
  const btn = h('button', { class: 'btn pri', onclick: guard(async () => { if (on) await disablePush(); else await enablePush(); toast(on ? 'O\'chirildi' : 'Yoqildi'); route(true); }) }, 'Yoqish');
  box.append(note, btn);

  if (Notification.permission === 'granted') navigator.serviceWorker.getRegistration().then(r => r?.pushManager.getSubscription()).then(sub => {
    if (!sub) return;
    on = true; note.textContent = 'Yoqilgan: yangi qo\'shiqlar haqida xabar olasiz.'; btn.textContent = 'O\'chirish'; btn.className = 'btn';
  }).catch(() => {});
  return box;
}
function newPlaylist() {
  sheet(close => {
    const n = h('input', { placeholder: 'Pleylist nomi', 'aria-label': 'Pleylist nomi', required: true });
    return [h('h2', null, 'Yangi pleylist'), h('form', { class: 'stack', onsubmit: guard(async (e: Event) => { e.preventDefault(); const p = await api('/api/playlists', { method: 'POST', body: { name: n.value } }); await loadLibrary(); close(); go(`/playlist/${p.id}`); }) }, n, h('button', { class: 'btn pri' }, 'Yaratish'))];
  });
}
function pageHead(img: string | null, title: string, sub: string, list?: Track[], actions?: Kid) {
  return h('header', { class: 'head' }, cover(img, title), h('div', { class: 'meta' }, h('h1', null, title), h('p', { class: 'muted' }, sub),
    h('div', { class: 'row wrap' }, list?.length ? h('button', { class: 'btn pri', onclick: () => playList(list, 0) }, icon('play', 18), 'Tinglash') : null, actions)));
}
const upsell = () => h('div', { class: 'upsell' }, h('div', { class: 'grow' }, h('h3', null, 'Reklamadan charchadingizmi?'), h('p', { class: 'small muted' }, 'Puls tarifi bilan uzluksiz tinglang.')), h('a', { class: 'btn pri sm', href: '/premium' }, 'Tarif olish'));

const getApp = (): HTMLElement | null => {
  if (installed()) return null;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);

  const APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z"/></svg>';
  const ROBOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.1c-1.78 0-3.46.38-4.92 1.04L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>';
  const item = (cls: string, logo: string, name: string, how: string, href: string, mine: boolean): HTMLElement => {
    const mark = h('span', { class: `app-logo ${cls}` });
    mark.innerHTML = logo;
    return h('a', { class: 'app-item', role: 'menuitem', href, download: '', onclick: () => close() }, mark,
      h('span', { class: 'grow' }, h('b', null, name, mine ? h('span', { class: 'app-mine' }, 'Sizniki') : null), h('small', null, how)), icon('offline', 18));
  };
  const items = [item('ios', APPLE, 'iPhone va iPad', 'Safari orqali, App Store kerak emas', '/dl/ios.mobileconfig', iOS), item('android', ROBOT, 'Android', 'APK fayl, Play Market kerak emas', '/dl/android', android)];
  const menu = h('div', { class: 'app-menu', role: 'menu', 'aria-label': 'Ilovani yuklab olish' }, ...(android ? items.reverse() : items));
  const btn = h('button', { class: 'btn sm get-app', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => (wrap.classList.contains('open') ? close() : open()) },
    icon('offline', 16), h('span', { class: 'long' }, 'Ilovani yuklab olish'), h('span', { class: 'short' }, 'Ilova'), icon('down', 14));
  const wrap = h('div', { class: 'get-app-wrap' }, btn, menu);
  const away = (ev: Event): void => { if (!wrap.contains(ev.target as Node)) close(); };
  const esc = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') { close(); btn.focus(); } };

  let morph: Animation | null = null;
  const pill = (): string => {
    const row = (wrap.parentElement as HTMLElement).getBoundingClientRect(), b = btn.getBoundingClientRect(), m = menu.getBoundingClientRect();
    return `inset(0px ${row.right - b.right}px ${m.height - b.height}px ${m.width - (row.right - b.left)}px round ${b.height / 2}px)`;
  };
  function open(): void {
    const row = (wrap.parentElement as HTMLElement).getBoundingClientRect(), b = btn.getBoundingClientRect();
    menu.style.top = `${b.top - row.top}px`; menu.style.paddingTop = `${b.height + 8}px`;
    morph?.cancel();
    wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    if (!stillMotion.matches) morph = menu.animate([{ clipPath: pill() }, { clipPath: 'inset(0px round 22px)' }], { duration: 480, easing: 'cubic-bezier(.32, .72, 0, 1)' });
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
  }
  function close(): void {
    if (!wrap.classList.contains('open')) return;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc);
    morph?.cancel();
    if (stillMotion.matches) { wrap.classList.remove('open'); return; }
    wrap.classList.add('closing');
    morph = menu.animate([{ clipPath: 'inset(0px round 22px)' }, { clipPath: pill() }], { duration: 300, easing: 'cubic-bezier(.4, 0, .2, 1)' });
    morph.onfinish = () => wrap.classList.remove('open', 'closing');
  }
  return wrap;
};
function buy(p: Row, card: Row): void {
  sheet(close => {
    const ref = h('input', { placeholder: 'Chek raqami yoki karta oxirgi 4 raqami', 'aria-label': 'To\'lov ma\'lumoti', required: true, minlength: 3 });
    if (!card.number) return [h('h2', null, p.name), h('p', { class: 'muted' }, 'To\'lov rekvizitlari hali kiritilmagan. Keyinroq urinib ko\'ring.'), h('button', { class: 'btn', onclick: close }, 'Yopish')];
    return [h('h2', null, `${p.name} · ${money(p.price)}`),
      h('ol', { class: 'steps' }, h('li', null, 'Tugmani bosing, Click\'da "Kartaga o\'tkazma"ga raqamni qo\'ying va summani yuboring.'), h('li', null, 'Chek raqamini kiriting va yuboring.'), h('li', null, 'Admin tasdiqlagach tarif faollashadi.')),
      h('div', { class: 'panel' }, h('div', { style: 'font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere' }, card.number), h('div', { class: 'muted small' }, card.holder),
        h('button', { class: 'btn pri', onclick: () => {

          navigator.clipboard?.writeText(card.number.replace(/\s/g, '')).then(() => toast('Karta raqami nusxalandi')).catch(() => toast('Raqamni qo\'lda nusxalang'));
          window.open('https://my.click.uz/', '_blank', 'noopener');
        } }, 'Nusxalash va Click\'ni ochish')),
      h('form', { class: 'stack', onsubmit: guard(async (e: Event) => { e.preventDefault(); await api('/api/payments', { method: 'POST', body: { planId: p.id, reference: ref.value } }); close(); toast('So\'rov yuborildi'); route(); }) }, ref, h('button', { class: 'btn pri' }, 'To\'ladim'))];
  });
}
function familyPanel(family: Row[]) {
  const email = h('input', { type: 'email', placeholder: 'Email', 'aria-label': 'A\'zo emaili', required: true });
  return h('section', { class: 'panel' }, h('h2', null, 'Tarif a\'zolari'),
    family.map((m: Row) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', { class: 'clip' }, m.name), h('div', { class: 'clip small muted' }, m.email)), h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/family/${m.id}`, { method: 'DELETE' }); route(); }) }, 'Olib tashlash'))),
    h('form', { class: 'row', onsubmit: guard(async (e: Event) => { e.preventDefault(); await api('/api/family', { method: 'POST', body: { email: email.value } }); route(); }) }, email, h('button', { class: 'btn pri' }, 'Qo\'shish')));
}

function authView() {
  let mode: 'login' | 'register' | 'code' = 'login', pendingEmail = '';
  const box = h('div', { class: 'auth' });
  const brand = () => h('div', { class: 'logo' }, h('img', { src: '/icon.svg', alt: '' }), S.settings.siteName || 'SvRvS Rythm');
  const draw = () => {
    const err = h('div', { class: 'err', role: 'alert' });
    if (mode === 'code') {
      const code = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]{6}', required: true, 'aria-label': 'Tasdiqlash kodi' });
      const submit = h('button', { class: 'btn pri full' }, 'Tasdiqlash');
      box.replaceChildren(h('form', { onsubmit: async (e: Event) => {
        e.preventDefault(); err.textContent = ''; submit.disabled = true;
        try { await api('/api/auth/verify', { method: 'POST', body: { email: pendingEmail, code: code.value } }); await boot(); } catch (x) { err.textContent = (x as Error).message; submit.disabled = false; }
      } }, brand(), h('h1', null, 'Emailni tasdiqlang'), h('p', { class: 'muted' }, `${pendingEmail} manziliga 6 xonali kod yubordik. Kod 10 daqiqa amal qiladi.`),
        h('label', { class: 'f' }, 'Kod', code), err, submit,
        h('button', { type: 'button', class: 'btn full', onclick: () => { mode = 'register'; draw(); } }, 'Orqaga')));
      code.focus();
      return;
    }
    const name = h('input', { autocomplete: 'name', required: true });
    const email = h('input', { autocomplete: 'username', required: true, inputmode: 'email', autocapitalize: 'none' });
    const pass = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
    const submit = h('button', { class: 'btn pri full' }, mode === 'login' ? 'Kirish' : 'Ro\'yxatdan o\'tish');
    box.replaceChildren(h('form', { onsubmit: async (e: Event) => {
      e.preventDefault(); err.textContent = ''; submit.disabled = true;
      try {
        const r = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: { name: name.value, email: email.value, password: pass.value } });
        if (r.verify) { pendingEmail = r.email; mode = 'code'; draw(); return; }
        await boot();
      } catch (x) { err.textContent = (x as Error).message; submit.disabled = false; }
    } },
      brand(),
      h('h1', null, mode === 'login' ? 'Xush kelibsiz' : 'Bepul boshlang'),
      h('p', { class: 'muted' }, S.settings.heroSub || ''),
      mode === 'login' ? null : h('label', { class: 'f' }, 'Ism', name),
      h('label', { class: 'f' }, 'Email', email), h('label', { class: 'f' }, 'Parol', pass), err, submit,
      h('button', { type: 'button', class: 'btn full', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; draw(); } }, mode === 'login' ? 'Akkaunt yaratish' : 'Menda akkaunt bor'),
      installed() ? null : h('div', { class: 'auth-apps' }, h('p', { class: 'small muted' }, 'Ilovani akkauntsiz yuklab oling'),
        h('div', { class: 'row' },
          h('a', { class: 'btn sm grow', href: '/dl/ios.mobileconfig', download: '' }, 'iPhone'),
          h('a', { class: 'btn sm grow', href: '/dl/android', download: '' }, 'Android APK')),
        h('a', { class: 'small muted', href: '/install' }, 'O\'rnatish yo\'riqnomasi'))));
  };
  draw();
  return box;
}

let mainEl: HTMLElement | null = null, sideLists: HTMLElement | undefined;
const NAV: [string, string, string][] = [['/', 'home', 'Bosh sahifa'], ['/search', 'search', 'Qidiruv'], ['/library', 'lib', 'Kutubxona'], ['/premium', 'star', 'Tariflar']];
function renderSideLists() {
  sideLists?.replaceChildren(h('nav', null, h('a', { href: '/liked' }, icon('heart', 18), h('span', { class: 'clip' }, 'Yoqtirganlarim')), S.playlists.map((p: Row) => h('a', { href: `/playlist/${p.id}` }, icon('lib', 18), h('span', { class: 'clip' }, p.name)))));
}
function render() {
  if (S.user && !catalogStamp) checkCatalog();
  if (!S.user) {
    closeNow();
    if (location.pathname === '/install') { root.replaceChildren(mainEl = h('main', { class: 'main', style: 'height:100%' })); route(); return; }
    mainEl = null;
    root.replaceChildren(authView());
    return;
  }
  mainEl = h('main', { class: 'main' });
  sideLists = h('div', { class: 'lists' });
  if (!ui.now) { ui.now = h('div', { class: 'now', role: 'dialog', 'aria-label': 'Hozir ijro etilmoqda' }); attachSwipe(ui.now); }
  const navLinks = (extra: [string, string, string][]) => [...NAV.filter(n => n[0] !== '/premium' || S.user?.role !== 'admin'), ...extra].map(([href, ic, label]) => h('a', { href, 'data-nav': href }, icon(ic, 22), h('span', { class: 'clip' }, label)));
  const adminNav: [string, string, string][] = S.user!.role === 'admin' ? [['/admin', 'admin', 'Admin']] : [];
  root.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' }, h('a', { class: 'logo', href: '/' }, logoMark(), h('span', { class: 'clip' }, S.settings.siteName)), h('nav', null, navLinks([...adminNav, ['/account', 'user', 'Akkaunt']])), sideLists),
    mainEl, playerBar(), dragTabs(h('nav', { class: 'tabs' }, h('i', { class: 'tab-pill', 'aria-hidden': 'true' }), navLinks(adminNav)))), ui.now);
  delete ui.player!.dataset.id;
  renderSideLists();
  syncPlayer();
  route();
}

function movePill(tabs: HTMLElement, link: Element | null): void {
  const pill = tabs.querySelector<HTMLElement>('.tab-pill');
  if (!pill || !link) return;
  const r = link.getBoundingClientRect(), o = tabs.getBoundingClientRect();
  pill.style.width = `${r.width}px`;
  pill.style.height = `${r.height}px`;
  pill.style.transform = `translate3d(${r.left - o.left - tabs.clientLeft}px, ${r.top - o.top - tabs.clientTop}px, 0)`;
}
function syncTabs() {
  const tabs = document.querySelector<HTMLElement>('.tabs');
  if (tabs) movePill(tabs, tabs.querySelector('a.on') || tabs.querySelector('a'));
}
addEventListener('resize', syncTabs);
function dragTabs(tabs: HTMLElement): HTMLElement {
  let held: HTMLElement | null = null;
  const under = (x: number): HTMLElement => {
    const links = [...tabs.querySelectorAll('a')] as HTMLElement[];
    return links.reduce((best, l) => { const r = l.getBoundingClientRect(), d = Math.abs(x - (r.left + r.right) / 2); return d < best.d ? { l, d } : best; }, { l: links[0], d: Infinity }).l;
  };
  const hold = (link: HTMLElement) => {
    held = link;
    movePill(tabs, link);
    for (const l of tabs.querySelectorAll('a')) l.classList.toggle('hover', l === link);
  };
  const end = () => {
    held = null;
    tabs.classList.remove('held');
    for (const l of tabs.querySelectorAll('a')) l.classList.remove('hover');
  };
  tabs.addEventListener('pointerdown', e => {
    if (e.button) return;
    e.preventDefault();
    tabs.setPointerCapture(e.pointerId);
    tabs.classList.add('held');
    hold(under(e.clientX));
  });
  tabs.addEventListener('pointermove', e => { if (held) { const l = under(e.clientX); if (l !== held) hold(l); } });
  tabs.addEventListener('pointerup', () => {
    if (!held) return;
    const href = held.getAttribute('href') as string;
    end();
    if (location.pathname !== href) go(href); else syncTabs();
  });
  tabs.addEventListener('pointercancel', () => { end(); syncTabs(); });

  tabs.addEventListener('click', e => { if (e.detail) { e.preventDefault(); e.stopPropagation(); } });
  tabs.addEventListener('contextmenu', e => e.preventDefault());
  return tabs;
}

function takeSavedScroll(): number {
  try {
    const raw = sessionStorage.getItem('scroll');
    sessionStorage.removeItem('scroll');
    const s = raw ? JSON.parse(raw) as { path: string; top: number } : null;
    return s && s.path === location.pathname + location.search ? s.top : 0;
  } catch { return 0; }
}
addEventListener('pagehide', () => { try { if (mainEl) sessionStorage.setItem('scroll', JSON.stringify({ path: location.pathname + location.search, top: mainEl.scrollTop })); } catch {  } });
let routeSeq = 0;
async function route(quiet = false): Promise<void> {
  if (!mainEl) { if (S.user || location.pathname === '/install') render(); return; }
  const seq = ++routeSeq;
  const parts = location.pathname.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  if (!S.user && name !== 'install') { mainEl = null; render(); return; }
  for (const a of document.querySelectorAll<HTMLElement>('[data-nav]')) {
    const href = a.dataset.nav as string;
    a.classList.toggle('on', href === '/' ? !parts.length : location.pathname.startsWith(href));
  }
  syncTabs();
  const view = h('div', { class: `view ${quiet ? 'quiet' : ''}` });
  try {
    if (name === 'admin') {
      if (S.user?.role !== 'admin') return go('/', true);
      const { adminView } = await import('./admin.ts');
      await adminView(view, parts.slice(1));
    } else if (V[name] && (S.user || name === 'install')) await V[name](view, parts.slice(1));
    else view.append(empty('Sahifa topilmadi'));
  } catch (e) {
    view.replaceChildren(h('div', { class: 'panel' }, h('p', { class: 'err' }, (e as Error).message), h('button', { class: 'btn', onclick: () => route() }, 'Qayta urinish')));
  }
  if (seq !== routeSeq) return;
  const top = mainEl.scrollTop;
  mainEl.replaceChildren(view);
  mainEl.scrollTop = quiet ? top : takeSavedScroll();

  const tabs = view.querySelector<HTMLElement>('.anav'), cur = tabs?.querySelector<HTMLElement>('.on');
  if (tabs && cur) tabs.scrollLeft = cur.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - cur.offsetWidth) / 2;
}
export const refresh = (): Promise<void> => route();

async function checkUpdate() {
  const n = win.RythmNative;
  if (!n?.versionCode) return;
  const { release: r } = await api('/api/app/latest').catch(() => ({}));
  if (!r || r.versionCode <= n.versionCode()) return;
  sheet(close => {
    const bar = h('i'), wrap = h('div', { class: 'progress', style: 'display:none' }, bar);
    win.__updateProgress = (pct: number) => { wrap.style.display = 'block'; bar.style.width = `${pct}%`; };
    win.__updateError = (msg: string) => { btn.disabled = false; toast(msg); };
    const btn = h('button', { class: 'btn pri', onclick: () => { btn.disabled = true; n.installUpdate(new URL(r.url, location.href).href, r.sha256); } }, 'Yangilash');
    return [h('h2', null, `Yangi versiya: ${r.versionName}`), h('p', { class: 'muted', style: 'white-space:pre-wrap' }, r.notes || 'Ilova yangilandi.'), wrap, btn, r.force ? null : h('button', { class: 'btn', onclick: close }, 'Keyinroq')];
  });
  if (r.force) document.querySelector('.scrim')?.addEventListener('click', (e: Event) => e.stopImmediatePropagation(), true);
}

const bareDomain = location.hostname === 'svrvs.uz';

const oldAddress = location.hostname.endsWith('.workers.dev');
function moveScreen(): void {
  const n = win.RythmNative;
  const home = 'https://rythm.svrvs.uz';
  if (!n && nav.standalone !== true) { location.replace(`${home}${location.pathname}${location.search}`); return; }
  const err = h('p', { class: 'err', role: 'alert' });
  const bar = h('i'), wrap = h('div', { class: 'progress', style: 'display:none' }, bar);
  win.__updateProgress = (pct: number) => { wrap.style.display = 'block'; bar.style.width = `${pct}%`; };
  win.__updateError = (msg: string) => { btn.disabled = false; err.textContent = msg; };
  const btn = h('button', { class: 'btn pri', onclick: guard(async () => {
    err.textContent = '';
    btn.disabled = true;
    try {
      const { release: r } = await api('/api/app/latest');
      n.installUpdate(new URL(r.url, location.href).href, r.sha256);
    } catch (e) { btn.disabled = false; throw e; }
  }) }, 'Yangilash');
  root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'panel stack' },
    h('h1', null, 'Ilova yangi manzilga o\'tdi'),
    n
      ? [h('p', { class: 'muted' }, 'Davom etish uchun ilovani yangilang. Telefon so\'raganda "O\'rnatish" ni bosing.'), wrap, btn, err]
      : [h('p', { class: 'muted' }, 'Davom etish uchun yangi ilovani o\'rnating.'),
        h('a', { class: 'btn pri', href: `${home}/dl/ios.mobileconfig` }, 'Yangi ilovani o\'rnatish'),
        h('ol', { class: 'steps' }, h('li', null, '"Allow" ni bosing.'), h('li', null, 'Settings → General → VPN & Device Management → SvRvS Rythm → Install.'), h('li', null, 'Bosh ekrandagi yangi belgini oching va akkauntga kiring.'), h('li', null, 'Eski belgi va eski profilni o\'chiring.')),
        h('p', { class: 'small muted', style: 'overflow-wrap:anywhere' }, `Tugma ishlamasa, Safari'da oching: ${home}/install`)])));
}
if (bareDomain) location.replace(`https://rythm.svrvs.uz${location.pathname}${location.search}`);
else navigator.serviceWorker?.register('/sw.js').catch(() => {});

async function playFromLink(): Promise<void> {
  const q = new URLSearchParams(location.search).get('play')?.trim();
  if (!q || !S.user) return;
  history.replaceState(null, '', location.pathname);
  const d = await api(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
  if (d?.tracks?.length) playList(d.tracks, 0); else toast(`"${q}" topilmadi`);
}
async function boot(): Promise<void> {
  await offline.refreshReady();

  if (!navigator.onLine && location.pathname === '/') history.replaceState(null, '', '/offline');
  const d = await api('/api/me');
  S.user = d.user; S.settings = d.settings;
  document.title = d.settings.siteName;
  const lib = S.user ? await api('/api/library').catch(() => null) : null;
  if (lib) { S.liked = new Set(lib.liked); S.playlists = lib.playlists; }
  if (S.user) restoreListening();
  render();

  if (S.user && win.RythmNative?.pushToken) api('/api/notices/subscribe', { method: 'POST', body: { kind: 'android', endpoint: win.RythmNative.pushToken() } }).catch(() => {});
  if (S.user) { checkUpdate(); setTimeout(loadAllPages, 300); playFromLink(); if (navigator.onLine) refreshOffline(); }
}
if (oldAddress) moveScreen();
else if (!bareDomain) boot().catch((e: Error) => root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'panel' }, h('p', { class: 'err' }, e.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Qayta urinish')))));
