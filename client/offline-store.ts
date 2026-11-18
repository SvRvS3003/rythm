export const CHUNK = 1 << 20;
export interface OfflineRecord { id: string; track: Record<string, unknown>; size: number; have: number; done: boolean }
export interface License { user: string; limit: number; allowed: string[]; validUntil: number; seenAt: number }

let opening: Promise<IDBDatabase> | null = null;
export function db(): Promise<IDBDatabase> {
  return opening || (opening = new Promise((ok, no) => {
    const r = indexedDB.open('rythm-offline', 1);
    r.onupgradeneeded = () => { for (const s of ['meta', 'songs', 'chunks']) r.result.createObjectStore(s); };
    r.onsuccess = () => { r.result.onclose = () => { opening = null; }; ok(r.result); };
    r.onerror = () => { opening = null; no(r.error); };
  }));
}
export async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const d = await db();
  return new Promise((ok, no) => { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => ok(r.result as T | undefined); r.onerror = () => no(r.error); });
}
export async function put(store: string, key: IDBValidKey, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((ok, no) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(value, key); t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error); });
}
export async function all<T>(store: string): Promise<T[]> {
  const d = await db();
  return new Promise((ok, no) => { const r = d.transaction(store).objectStore(store).getAll(); r.onsuccess = () => ok(r.result as T[]); r.onerror = () => no(r.error); });
}
export async function removeSong(id: string): Promise<void> {
  const d = await db();
  return new Promise((ok, no) => {
    const t = d.transaction(['songs', 'chunks'], 'readwrite');
    t.objectStore('songs').delete(id);
    t.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
    t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error);
  });
}
export async function wipeAll(): Promise<void> {
  const d = await db();
  return new Promise((ok, no) => {
    const t = d.transaction(['meta', 'songs', 'chunks'], 'readwrite');
    for (const s of ['meta', 'songs', 'chunks']) t.objectStore(s).clear();
    t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error);
  });
}
export async function deviceKey(create: boolean): Promise<CryptoKey | undefined> {
  const k = await get<CryptoKey>('meta', 'key');
  if (k || !create) return k;
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await put('meta', 'key', fresh);
  return fresh;
}

const aad = (id: string, n: number): Uint8Array<ArrayBuffer> => new TextEncoder().encode(`${id}/${n}`);
export async function sealChunk(key: CryptoKey, id: string, n: number, plain: Uint8Array<ArrayBuffer>): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(id, n) }, key, plain);
  await put('chunks', [id, n], { iv, data });
}
export async function openChunk(key: CryptoKey, id: string, n: number): Promise<Uint8Array<ArrayBuffer>> {
  const c = await get<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }>('chunks', [id, n]);
  if (!c) throw new Error('missing chunk');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.iv, additionalData: aad(id, n) }, key, c.data));
}

export function licenseOpen(l: License | undefined, id: string, now = Date.now()): boolean {
  return !!l && l.allowed.includes(id) && l.validUntil > Math.max(now, l.seenAt);
}
