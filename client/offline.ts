import { CHUNK, all, deviceKey, get, licenseOpen, put, removeSong, sealChunk, wipeAll, type License, type OfflineRecord } from './offline-store.ts';

const NET_STEP = 8 * CHUNK;
const IMG_CACHE = 'rythm-offline-img';
export const ready = new Set<string>();
export const active = new Map<string, number>();
const listeners = new Set<() => void>();
export const onChange = (f: () => void): void => { listeners.add(f); };
const changed = (): void => { for (const f of listeners) f(); };

export async function refreshReady(): Promise<License | undefined> {
  try {
    const l = await get<License>('meta', 'license');
    ready.clear();
    for (const s of await all<OfflineRecord>('songs')) if (s.done && licenseOpen(l, s.id)) ready.add(s.id);
    return l;
  } catch { return undefined; }
}

export async function syncLicense(user: string, state: { limit: number; items: { id: string; allowed: boolean }[]; validUntil: number }): Promise<void> {
  const prev = await get<License>('meta', 'license');
  if (prev && prev.user !== user) await wipeAll();
  await put('meta', 'license', { user, limit: state.limit, allowed: state.items.filter(i => i.allowed).map(i => i.id), validUntil: state.validUntil * 1000, seenAt: Math.max(Date.now(), prev?.user === user ? prev.seenAt : 0) } satisfies License);
  const listed = new Set(state.items.map(i => i.id));
  for (const s of await all<OfflineRecord>('songs')) if (!listed.has(s.id) && !active.has(s.id)) await removeSong(s.id);
  const before = [...ready].join();
  await refreshReady();
  if ([...ready].join() !== before) changed();
}
export async function download(track: { id: string; cover?: string | null; rhythm?: string | null }, url: () => Promise<string>): Promise<void> {
  if (active.has(track.id) || ready.has(track.id)) return;
  active.set(track.id, 0); changed();
  try {
    const key = await deviceKey(true);
    if (!key) throw new Error('key');
    navigator.storage?.persist?.().catch(() => {});
    let rec = await get<OfflineRecord>('songs', track.id);
    const src = await url();
    let at = rec?.have ?? 0;
    let size = rec?.size ?? 0;
    do {
      const res = await fetch(src, { headers: { range: `bytes=${at * CHUNK}-${at * CHUNK + NET_STEP - 1}` } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      size = Number(res.headers.get('content-range')?.split('/')[1]);
      const buf = new Uint8Array(await res.arrayBuffer());
      for (let o = 0; o < buf.length; o += CHUNK, at++) await sealChunk(key, track.id, at, buf.slice(o, o + CHUNK));
      rec = { id: track.id, track, size, have: at, done: at * CHUNK >= size };
      await put('songs', track.id, rec);
      active.set(track.id, Math.min(1, (at * CHUNK) / size)); changed();
    } while (at * CHUNK < size);

    const c = await caches.open(IMG_CACHE);
    for (const u of [track.cover, track.rhythm]) if (u) await c.add(u).catch(() => {});
    await refreshReady();
  } finally { active.delete(track.id); changed(); }
}
export async function forget(id: string): Promise<void> {
  await removeSong(id); ready.delete(id); changed();
}
export async function wipeDevice(): Promise<void> {
  ready.clear();
  await wipeAll().catch(() => {});
  await caches.delete(IMG_CACHE).catch(() => {});
}
export const localSongs = (): Promise<OfflineRecord[]> => all<OfflineRecord>('songs').catch(() => []);
