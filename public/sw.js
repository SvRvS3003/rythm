// JavaScript, public/sw.js, service worker: keeps upcoming WAVs on the device and serves them with byte ranges.
// Only tracks the page explicitly prefetches are stored; a live stream is never duplicated.
const CACHE = 'rythm-audio', MAX_BYTES = 1.5e9;
const inflight = new Map();
const key = id => `/audio/${id}`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const m = /^\/media\/stream\/([0-9a-f]{32})$/.exec(new URL(e.request.url).pathname);
  if (m) e.respondWith(serve(e.request, m[1]));
});

// The page only holds this URL after /api/play approved it, so the cache cannot bypass the ad gate.
async function serve(req, id) {
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

async function trim(cache) {
  const keys = await cache.keys(); // oldest first
  const sizes = await Promise.all(keys.map(async k => (await (await cache.match(k)).blob()).size));
  let total = sizes.reduce((a, b) => a + b, 0), i = 0;
  while (total > MAX_BYTES && i < keys.length - 1) { await cache.delete(keys[i]); total -= sizes[i++]; }
}

async function prefetch(id, url, client) {
  const cache = await caches.open(CACHE);
  if (inflight.has(id)) return;
  if (await cache.match(key(id))) return client?.postMessage({ type: 'cached', id });
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

self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'prefetch') e.waitUntil(prefetch(m.id, m.url, e.source));
  if (m.type === 'cancel') for (const [id, c] of inflight) if (id !== m.keep) c.abort();
  if (m.type === 'clear') { for (const c of inflight.values()) c.abort(); e.waitUntil(caches.delete(CACHE)); }
});
