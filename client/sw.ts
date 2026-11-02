// TypeScript, client/sw.ts, service worker: keeps upcoming WAVs on the device and serves them with byte ranges.
// Only tracks the page explicitly prefetches are stored; a live stream is never duplicated.
import { CHUNK, deviceKey, get, licenseOpen, openChunk, type License, type OfflineRecord } from './offline-store.ts';

declare const BUILD_ID: string, SHELL_FILES: string[];
const SHELL = `rythm-shell-${BUILD_ID}`;
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = 'rythm-audio', MAX_BYTES = 1.5e9;
const inflight = new Map<string, AbortController>();
const key = (id: string): string => `/audio/${id}`;

// The whole app installs as one version, so it opens instantly and a deploy can never mix old and new files.
sw.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => sw.skipWaiting())));
sw.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rythm-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => sw.clients.claim())));

// Saved songs are decrypted only here, piece by piece as they play, and only while the plan's licence is open.
async function serveOffline(req: Request, id: string): Promise<Response> {
  const [song, license, key] = await Promise.all([get<OfflineRecord>('songs', id), get<License>('meta', 'license'), deviceKey(false)]);
  if (!song?.done || !key || !licenseOpen(license, id)) return new Response(null, { status: 403 });
  const size = song.size, base = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  const start = r ? (r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]))) : 0;
  const end = r && r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
  let n = Math.floor(start / CHUNK);
  const body = new ReadableStream<Uint8Array>({
    async pull(ctl) {
      const off = n * CHUNK;
      if (off > end) { ctl.close(); return; }
      const plain = await openChunk(key, id, n);
      ctl.enqueue(plain.subarray(Math.max(0, start - off), Math.min(plain.length, end - off + 1)));
      n++;
    },
  });
  const headers = { ...base, 'content-length': String(end - start + 1) };
  return r ? new Response(body, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}` } }) : new Response(body, { headers });
}

sw.addEventListener('fetch', e => {
  const off = /^\/off\/([0-9a-f]{32})$/.exec(new URL(e.request.url).pathname);
  if (off) return e.respondWith(serveOffline(e.request, off[1]));
  if (/^\/media\/(covers|rhythm)\//.test(new URL(e.request.url).pathname)) return e.respondWith(caches.open('rythm-offline-img').then(c => c.match(e.request.url)).then(hit => hit || fetch(e.request)));
  const m = /^\/media\/stream\/([0-9a-f]{32})$/.exec(new URL(e.request.url).pathname);
  if (m) return e.respondWith(serve(e.request, m[1]));
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /^\/(api|media|dl)\//.test(u.pathname)) return;
  const asset = SHELL_FILES.includes(u.pathname) ? u.pathname : e.request.mode === 'navigate' ? '/' : null;
  if (asset) e.respondWith(caches.open(SHELL).then(c => c.match(asset)).then(r => r || fetch(e.request)));
});

// The page only holds this URL after /api/play approved it, so the cache cannot bypass the ad gate.
async function serve(req: Request, id: string): Promise<Response> {
  const hit = await (await caches.open(CACHE)).match(key(id));
  if (!hit) return fetch(req);
  const blob = await hit.blob(), size = blob.size;
  const base = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (!r) return new Response(blob, { headers: { ...base, 'content-length': String(size) } });
  const start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]));
  const end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
  if (start > end) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), { status: 206, headers: { ...base, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}` } });
}

async function trim(cache: Cache): Promise<void> {
  const keys = await cache.keys(); // oldest first
  const sizes = await Promise.all(keys.map(async k => (await (await cache.match(k))!.blob()).size));
  let total = sizes.reduce((a, b) => a + b, 0), i = 0;
  while (total > MAX_BYTES && i < keys.length - 1) { await cache.delete(keys[i]); total -= sizes[i++]; }
}

async function prefetch(id: string, url: string, client: Client | ServiceWorker | MessagePort | null): Promise<void> {
  const cache = await caches.open(CACHE);
  if (inflight.has(id)) return;
  if (await cache.match(key(id))) { client?.postMessage({ type: 'cached', id }); return; }
  const ctl = new AbortController();
  inflight.set(id, ctl);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (res.status !== 200) return;
    const blob = await res.blob();
    await cache.put(key(id), new Response(blob, { headers: { 'content-type': 'audio/wav' } }));
    await trim(cache);
    client?.postMessage({ type: 'cached', id, bytes: blob.size, ms: Date.now() - t0 });
  } catch { /* aborted or offline: the page falls back to the network */ } finally { inflight.delete(id); }
}

sw.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'prefetch') e.waitUntil(prefetch(m.id, m.url, e.source));
  if (m.type === 'cancel') for (const [id, c] of inflight) if (id !== m.keep) c.abort();
  if (m.type === 'clear') { for (const c of inflight.values()) c.abort(); e.waitUntil(caches.delete(CACHE)); }
});
