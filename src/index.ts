import { connect } from 'cloudflare:sockets';
import { smtpSend } from './mail.ts';
import { vapidHeader, vapidPublicKey } from './push.ts';
import { parseWav, parseRange, imageType, isApk, hex, sha256, hmac, hashPassword, safeEqual, xmlEscape } from './lib.ts';

export interface Env { DB: D1Database; BUCKET: R2Bucket; ASSETS: Fetcher; ADMIN_LOGIN: string; ADMIN_PASSWORD: string; SIGNING_SECRET: string; VAPID_JWK?: string; EMAIL?: { send(m: { to: string; from: { email: string; name: string }; subject: string; text: string; html: string }): Promise<unknown> } }

type Row = Record<string, any>;
type Guard = 'user' | 'admin' | null;
interface Ctx { params: Record<string, string>; user: Row }
type Handler = (req: Request, env: Env, ctx: Ctx) => Promise<Response> | Response;

const now = () => Math.floor(Date.now() / 1000);
const uid = () => crypto.randomUUID().replaceAll('-', '');
const DAY = 86400;
const PART_SIZE = 20 * 1024 * 1024;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const all = async (env: Env, sql: string, ...a: unknown[]): Promise<Row[]> => (await env.DB.prepare(sql).bind(...a).all<Row>()).results;
const first = (env: Env, sql: string, ...a: unknown[]): Promise<Row | null> => env.DB.prepare(sql).bind(...a).first<Row>();

const one = (env: Env, sql: string, ...a: unknown[]): Promise<Row> => env.DB.prepare(sql).bind(...a).first<Row>() as Promise<Row>;
const run = (env: Env, sql: string, ...a: unknown[]) => env.DB.prepare(sql).bind(...a).run();
const st = (env: Env, sql: string, ...a: unknown[]) => env.DB.prepare(sql).bind(...a);

const str = (v: unknown, max = 200): string => String(v ?? '').trim().slice(0, max);
const int = (v: unknown, min: number, max: number, name = 'Qiymat'): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${name} noto'g'ri`);
  return n;
};
const media = (key: string | null | undefined): string | null => (key ? `/media/${key}` : null);

const routes: { method: string; path: string; re: RegExp; names: string[]; handler: Handler; guard: Guard }[] = [];
const route = (method: string, path: string, handler: Handler, guard: Guard = 'user') => {
  const names: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, n: string) => (names.push(n), '([^/]+)')) + '$');
  routes.push({ method, path, re, names, handler, guard });
};

async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { fail(400, "So'rov noto'g'ri"); }
}

const cookieName = 'rythm_session';
function sessionCookie(req: Request, token: string, maxAge: number): string {
  const secure = new URL(req.url).protocol === 'https:' ? ' Secure;' : '';
  return `${cookieName}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}
async function startSession(env: Env, req: Request, userId: string): Promise<string> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await run(env, 'INSERT INTO sessions (token_hash,user_id,expires) VALUES (?,?,?)', await sha256(token), userId, now() + 60 * DAY);
  return sessionCookie(req, token, 60 * DAY);
}

async function apiKeyUser(env: Env, token: string): Promise<Row | null> {
  const key = await first(env, 'SELECT id,last_used FROM api_keys WHERE key_hash=?', await sha256(token));
  if (!key) return fail(401, 'API kalit noto\'g\'ri');
  if (now() - key.last_used > 300) await run(env, 'UPDATE api_keys SET last_used=? WHERE id=?', now(), key.id);
  return first(env, "SELECT * FROM users WHERE role='admin' AND banned=0 LIMIT 1");
}

async function tokenUser(env: Env, token: string): Promise<Row> {
  const u = await first(env, 'SELECT u.*,k.id token_id,k.scope token_scope,k.last_used token_used FROM user_tokens k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND u.banned=0', await sha256(token));
  if (!u) return fail(401, 'API kalit noto\'g\'ri yoki uzilgan');
  if (now() - u.token_used > 300) await run(env, 'UPDATE user_tokens SET last_used=? WHERE id=?', now(), u.token_id);
  return { ...u, role: 'user', via_token: true };
}
async function currentUser(env: Env, req: Request): Promise<Row | null> {
  const auth = req.headers.get('authorization') || '';
  const own = /^Bearer (ut_[0-9a-f]{64})$/.exec(auth);
  if (own) return tokenUser(env, own[1]);
  const bearer = /^Bearer (rk_[0-9a-f]{64})$/.exec(auth);
  if (bearer) return apiKeyUser(env, bearer[1]);
  const m = new RegExp(`${cookieName}=([0-9a-f]{64})`).exec(req.headers.get('cookie') || '');
  if (!m) return null;
  return first(env, 'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.banned=0', await sha256(m[1]), now());
}
async function limited(env: Env, key: string, max: number, windowSec: number): Promise<void> {
  const row = await one(env, 'SELECT COUNT(*) c FROM attempts WHERE k=? AND at>?', key, now() - windowSec);
  if (row!.c >= max) fail(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.");
}
const note = (env: Env, key: string) => run(env, 'INSERT INTO attempts (k,at) VALUES (?,?)', key, now());
const ip = (req: Request): string => req.headers.get('cf-connecting-ip') || 'local';

const memoStore = new Map<string, { val: any; exp: number }>();
async function memo<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  memoStore.set(key, { val, exp: Date.now() + ttlSec * 1000 });
  return val;
}
const liveSettings = (env: Env) => memo('settings', 10, () => settings(env));

async function settings(env: Env): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await all(env, 'SELECT key,value FROM settings')) out[r.key] = r.value;
  return out;
}

type Entitlement = { premium: boolean; reason: string; planId?: string; planName?: string; expires?: number };
async function entitlement(env: Env, u: Row, s: Record<string, string>): Promise<Entitlement> {

  if (u.role === 'admin') return { premium: true, reason: 'admin', planName: (await first(env, 'SELECT name FROM plans WHERE active=1 ORDER BY price_uzs DESC LIMIT 1'))?.name };
  if (s.plans_enabled !== '1') return { premium: true, reason: 'plans_off' };
  if (u.plan_exempt) return { premium: true, reason: 'exempt' };
  if (u.plan_expires > now()) return { premium: true, reason: 'plan', planId: u.plan_id, expires: u.plan_expires };
  if (u.family_owner_id) {
    const o = await first(env, 'SELECT plan_id,plan_expires FROM users WHERE id=? AND banned=0', u.family_owner_id);
    if (o && o.plan_expires > now()) return { premium: true, reason: 'family', planId: o.plan_id, expires: o.plan_expires };
  }
  return { premium: false, reason: 'free' };
}
const publicUser = (u: Row, e: Entitlement) => ({ id: u.id, name: u.name, email: u.email, role: u.role, entitlement: e, seenTrackAt: u.seen_track_at });
const publicSettings = (s: Record<string, string>) => ({ siteName: s.site_name, heroTitle: s.hero_title, heroSub: s.hero_sub, plansEnabled: s.plans_enabled === '1', supportUrl: s.support_url });

const mailReady = (env: Env, s: Record<string, string>): boolean => !!((s.smtp_user && s.smtp_pass) || (s.email_from && env.EMAIL));
async function sendMail(env: Env, s: Record<string, string>, to: string, subject: string, text: string, html: string): Promise<void> {
  if (!(s.smtp_user && s.smtp_pass)) { await env.EMAIL!.send({ to, from: { email: s.email_from, name: s.site_name }, subject, text, html }); return; }
  const sock = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
  const timeout = new Promise<never>((_, no) => setTimeout(() => no(new Error('SMTP timeout')), 15000));
  try {
    await Promise.race([smtpSend(sock.readable, sock.writable, { user: s.smtp_user, pass: s.smtp_pass.replace(/\s/g, ''), to, fromName: s.site_name, subject, text, html }), timeout]);
  } finally { await sock.close().catch(() => {}); }
}

route('POST', '/api/auth/register', async (req, env) => {
  await limited(env, `reg:${ip(req)}`, 20, 3600);
  const b = await body(req);
  const email = str(b.email, 120).toLowerCase(), name = str(b.name, 60), password = String(b.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Email noto'g'ri");
  if (!name) return fail(400, 'Ismingizni kiriting');
  if (password.length < 8 || password.length > 200) fail(400, "Parol kamida 8 belgi bo'lsin");
  await note(env, `reg:${ip(req)}`);
  if (await first(env, 'SELECT id FROM users WHERE email=?', email)) fail(409, "Bu email allaqachon ro'yxatdan o'tgan");
  const { hash, salt } = await hashPassword(password);
  const s = await settings(env);

  if (mailReady(env, s)) {
    const prev = await first(env, 'SELECT sent_at FROM signups WHERE email=?', email);
    if (prev && now() - prev.sent_at < 60) fail(429, 'Kod yuborilgan. Bir daqiqadan keyin qayta urinib ko\'ring.');
    await limited(env, `code:${email}`, 5, 3600);
    await note(env, `code:${email}`);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    await run(env, `INSERT INTO signups (email,name,pass_hash,pass_salt,code_hash,tries,expires,sent_at) VALUES (?,?,?,?,?,0,?,?)
      ON CONFLICT(email) DO UPDATE SET name=excluded.name,pass_hash=excluded.pass_hash,pass_salt=excluded.pass_salt,code_hash=excluded.code_hash,tries=0,expires=excluded.expires,sent_at=excluded.sent_at`,
      email, name, hash, salt, await hmac(env.SIGNING_SECRET, `signup.${email}.${code}`), now() + 600, now());
    try {
      await sendMail(env, s, email, `${s.site_name}: tasdiqlash kodi ${code}`, `Tasdiqlash kodingiz: ${code}\nKod 10 daqiqa amal qiladi. Siz so'ramagan bo'lsangiz, bu xatga e'tibor bermang.`, `<p>Tasdiqlash kodingiz:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Kod 10 daqiqa amal qiladi. Siz so'ramagan bo'lsangiz, bu xatga e'tibor bermang.</p>`);
    } catch (e) {
      console.error(e);
      await run(env, 'DELETE FROM signups WHERE email=?', email);
      return fail(502, 'Email yuborib bo\'lmadi. Keyinroq urinib ko\'ring.');
    }
    return json({ verify: true, email }, 202);
  }
  const id = uid();
  await run(env, 'INSERT INTO users (id,email,name,pass_hash,pass_salt,created_at,last_seen) VALUES (?,?,?,?,?,?,?)', id, email, name, hash, salt, now(), now());
  return json({ ok: true }, 201, { 'set-cookie': await startSession(env, req, id) });
}, null);

route('POST', '/api/auth/verify', async (req, env) => {
  const b = await body(req);
  const email = str(b.email, 120).toLowerCase(), code = str(b.code, 6);
  const row = await first(env, 'SELECT * FROM signups WHERE email=?', email);
  if (!row || row.expires < now()) return fail(410, 'Kod eskirgan. Qaytadan ro\'yxatdan o\'ting.');
  if (row.tries >= 5) { await run(env, 'DELETE FROM signups WHERE email=?', email); return fail(429, 'Urinishlar tugadi. Qaytadan ro\'yxatdan o\'ting.'); }
  if (!safeEqual(await hmac(env.SIGNING_SECRET, `signup.${email}.${code}`), row.code_hash)) {
    await run(env, 'UPDATE signups SET tries=tries+1 WHERE email=?', email);
    return fail(401, 'Kod noto\'g\'ri');
  }
  if (await first(env, 'SELECT id FROM users WHERE email=?', email)) return fail(409, "Bu email allaqachon ro'yxatdan o'tgan");
  const id = uid();
  await env.DB.batch([
    st(env, 'INSERT INTO users (id,email,name,pass_hash,pass_salt,created_at,last_seen) VALUES (?,?,?,?,?,?,?)', id, email, row.name, row.pass_hash, row.pass_salt, now(), now()),
    st(env, 'DELETE FROM signups WHERE email=?', email),
  ]);
  return json({ ok: true }, 201, { 'set-cookie': await startSession(env, req, id) });
}, null);

route('POST', '/api/auth/login', async (req, env) => {
  const b = await body(req);
  const email = str(b.email, 120).toLowerCase(), password = String(b.password ?? '');
  const key = `login:${ip(req)}:${email}`;
  await limited(env, key, 10, 900);

  if (env.ADMIN_LOGIN && email === env.ADMIN_LOGIN.toLowerCase()) {
    if (!env.ADMIN_PASSWORD || !safeEqual(await sha256(password), await sha256(env.ADMIN_PASSWORD))) { await note(env, key); fail(401, "Login yoki parol noto'g'ri"); }
    await run(env, "INSERT INTO users (id,email,name,pass_hash,pass_salt,role,created_at) VALUES ('admin',?,'Admin','','','admin',?) ON CONFLICT(id) DO UPDATE SET email=excluded.email", email, now());
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, req, 'admin') });
  }
  const u = await first(env, 'SELECT * FROM users WHERE email=?', email);
  const ok = u && u.pass_hash && safeEqual((await hashPassword(password, u.pass_salt)).hash, u.pass_hash);
  if (!u || !ok) { await note(env, key); return fail(401, "Login yoki parol noto'g'ri"); }
  if (u.banned) fail(403, 'Akkaunt bloklangan');
  return json({ ok: true }, 200, { 'set-cookie': await startSession(env, req, u.id) });
}, null);

route('POST', '/api/auth/logout', async (req, env) => {
  const m = new RegExp(`${cookieName}=([0-9a-f]{64})`).exec(req.headers.get('cookie') || '');
  if (m) await run(env, 'DELETE FROM sessions WHERE token_hash=?', await sha256(m[1]));
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
}, null);

route('GET', '/api/me', async (req, env) => {
  const s = await liveSettings(env);
  const u = await currentUser(env, req);
  if (!u) return json({ user: null, settings: publicSettings(s) });
  if (now() - u.last_seen > 300) await run(env, 'UPDATE users SET last_seen=? WHERE id=?', now(), u.id);
  return json({ user: publicUser(u, await entitlement(env, u, s)), settings: publicSettings(s) });
}, null);

route('POST', '/api/me/seen', async (req, env, { user }) => {
  await run(env, 'UPDATE users SET seen_track_at=MAX(seen_track_at,?) WHERE id=?', int((await body(req)).at, 0, now(), 'Vaqt'), user.id);
  return json({ ok: true });
});

route('PATCH', '/api/me', async (req, env, { user }) => {
  const b = await body(req);
  const name = str(b.name, 60);
  if (!name) return fail(400, 'Ismingizni kiriting');
  await run(env, 'UPDATE users SET name=? WHERE id=?', name, user.id);
  return json({ ok: true });
});

const TOKEN_ROUTES = new Map<string, 'read' | 'write'>([
  ...['GET /api/me', 'GET /api/me/api', 'GET /api/home', 'GET /api/catalog', 'GET /api/catalog/stamp', 'GET /api/search', 'GET /api/genres/:name', 'GET /api/tracks/:id', 'GET /api/artists/:id', 'GET /api/albums/:id',
    'GET /api/likes', 'GET /api/library', 'GET /api/playlists/:id', 'POST /api/play', 'POST /api/plays/:id/counted', 'POST /api/ads/:view/complete'].map(k => [k, 'read'] as const),
  ...['PATCH /api/me', 'PUT /api/likes/:id', 'DELETE /api/likes/:id', 'POST /api/playlists', 'PATCH /api/playlists/:id', 'DELETE /api/playlists/:id', 'POST /api/playlists/:id/tracks', 'DELETE /api/playlists/:id/tracks/:track'].map(k => [k, 'write'] as const),
]);
const MAX_TOKENS = 20;

const sessionOnly = (req: Request): void => { if (req.headers.has('authorization')) fail(403, 'Bu amal faqat saytdagi akkaunt sozlamalaridan bajariladi'); };
const newToken = () => `ut_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
async function issueToken(env: Env, userId: string, name: string, kind: 'key' | 'app', scope: string): Promise<string> {
  const n = await one(env, 'SELECT COUNT(*) c FROM user_tokens WHERE user_id=?', userId);
  if (n!.c >= MAX_TOKENS) fail(409, `Ko'pi bilan ${MAX_TOKENS} ta kalit yoki ulangan ilova. Keraksizini uzing.`);
  const token = newToken();
  await run(env, 'INSERT INTO user_tokens (id,user_id,name,kind,scope,key_hash,hint,created_at) VALUES (?,?,?,?,?,?,?,?)', uid(), userId, name, kind, scope, await sha256(token), token.slice(-6), now());
  return token;
}
const scopeOf = (v: unknown): string => {
  const parts = new Set(String(v ?? 'read').split(/[\s,+]+/).filter(Boolean));
  if ([...parts].some(p => p !== 'read' && p !== 'write')) fail(400, 'Ruxsat turi noto\'g\'ri: faqat read va write');
  return parts.has('write') ? 'read write' : 'read';
};
route('GET', '/api/me/tokens', async (req, env, { user }) => {
  sessionOnly(req);
  return json({ tokens: await all(env, 'SELECT id,name,kind,scope,hint,created_at,last_used FROM user_tokens WHERE user_id=? ORDER BY created_at DESC', user.id) });
});
route('POST', '/api/me/tokens', async (req, env, { user }) => {
  sessionOnly(req);
  const b = await body(req);
  const name = str(b.name, 60);
  if (!name) return fail(400, 'Kalit nomini kiriting');
  await limited(env, `tok:${user.id}`, 20, 3600);
  await note(env, `tok:${user.id}`);
  return json({ key: await issueToken(env, user.id, name, 'key', b.write ? 'read write' : 'read') }, 201);
});
route('DELETE', '/api/me/tokens/:id', async (req, env, { user, params }) => {
  sessionOnly(req);
  const r = await run(env, 'DELETE FROM user_tokens WHERE id=? AND user_id=?', params.id, user.id);
  if (!r.meta.changes) fail(404, 'Kalit topilmadi');
  return json({ ok: true });
});

route('GET', '/api/me/api', async (req) => {
  const o = new URL(req.url).origin;
  return json({
    auth: 'Authorization: Bearer ut_...',
    endpoints: [...TOKEN_ROUTES].map(([k, scope]) => { const [method, path] = k.split(' '); return { method, path, scope }; }),
    oauth: { authorize: `${o}/connect`, token: `${o}/api/oauth/token`, pkce: 'S256', scopes: ['read', 'write'] },
  });
});

function redirectTo(raw: unknown): URL {
  let u: URL;
  try { u = new URL(String(raw ?? '')); } catch { return fail(400, 'Qaytish manzili noto\'g\'ri'); }
  const loopback = u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (!(u.protocol === 'https:' || loopback) || u.username || u.password || u.hash) fail(400, 'Qaytish manzili https bo\'lishi kerak');
  return u;
}
const b64url = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
route('POST', '/api/oauth/approve', async (req, env, { user }) => {
  sessionOnly(req);
  const b = await body(req);
  const client = str(b.client_name, 60), redirect = redirectTo(b.redirect_uri), state = str(b.state, 500);
  if (!client) fail(400, 'Ilova nomi berilmagan');
  if (b.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(String(b.code_challenge ?? ''))) fail(400, 'PKCE (S256) talab qilinadi');
  const scope = scopeOf(b.scope);
  const back = (q: Record<string, string>): string => { const u = new URL(redirect); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v); if (state) u.searchParams.set('state', state); return u.toString(); };
  if (b.check) return json({ client, host: redirect.host, scope, account: user.email });
  if (b.deny) return json({ redirect: back({ error: 'access_denied' }) });
  await limited(env, `oauth:${user.id}`, 30, 3600);
  await note(env, `oauth:${user.id}`);
  const code = hex(crypto.getRandomValues(new Uint8Array(32)));
  await run(env, 'INSERT INTO oauth_codes (code_hash,user_id,client,redirect_uri,challenge,scope,expires) VALUES (?,?,?,?,?,?,?)', await sha256(code), user.id, client, redirect.toString(), b.code_challenge, scope, now() + 600);
  return json({ redirect: back({ code }) });
});

route('POST', '/api/oauth/token', async (req, env) => {
  await limited(env, `otok:${ip(req)}`, 60, 3600);
  await note(env, `otok:${ip(req)}`);
  const form = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const b: Record<string, unknown> = form ? Object.fromEntries(new URLSearchParams(await req.text())) : await body(req);
  const bad = (error: string, error_description: string) => json({ error, error_description }, 400);
  if (b.grant_type !== 'authorization_code') return bad('unsupported_grant_type', 'Faqat authorization_code');
  const verifier = String(b.code_verifier ?? '');
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return bad('invalid_request', 'code_verifier noto\'g\'ri');
  const c = await first(env, 'DELETE FROM oauth_codes WHERE code_hash=? RETURNING *', await sha256(String(b.code ?? '')));
  if (!c || c.expires < now()) return bad('invalid_grant', 'Kod eskirgan yoki ishlatilgan');
  if (String(b.redirect_uri ?? '') !== c.redirect_uri && redirectTo(b.redirect_uri).toString() !== c.redirect_uri) return bad('invalid_grant', 'Qaytish manzili mos emas');
  if (!safeEqual(b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))), c.challenge)) return bad('invalid_grant', 'PKCE tekshiruvidan o\'tmadi');
  if (!await first(env, 'SELECT id FROM users WHERE id=? AND banned=0', c.user_id)) return bad('invalid_grant', 'Akkaunt faol emas');
  return json({ access_token: await issueToken(env, c.user_id, c.client, 'app', c.scope), token_type: 'Bearer', scope: c.scope }, 200, { 'cache-control': 'no-store' });
}, null);

const TRACK_SQL = `SELECT t.id,t.title,t.artist_id,a.name artist,t.album_id,al.title album,t.genre,t.duration,t.sample_rate,t.bit_depth,t.channels,t.play_count,t.promoted,t.promo_text,t.published,t.created_at,t.rhythm_key,COALESCE(t.cover_key,al.cover_key,a.image_key) cover_key
  FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id`;
const mapTrack = (t: Row) => ({ id: t.id, title: t.title, artistId: t.artist_id, artist: t.artist, albumId: t.album_id, album: t.album, genre: t.genre, duration: t.duration, sampleRate: t.sample_rate, bitDepth: t.bit_depth, channels: t.channels, plays: t.play_count, promoted: !!t.promoted, promoText: t.promo_text, published: !!t.published, cover: media(t.cover_key), createdAt: t.created_at, rhythm: media(t.rhythm_key) });
const tracks = async (env: Env, where: string, ...a: unknown[]) => (await all(env, `${TRACK_SQL} ${where}`, ...a)).map(mapTrack);
const mapAlbum = (a: Row) => ({ id: a.id, title: a.title, artistId: a.artist_id, artist: a.artist, year: a.year, cover: media(a.cover_key) });
const mapArtist = (a: Row) => ({ id: a.id, name: a.name, bio: a.bio, image: media(a.image_key) });
const ALBUM_SQL = 'SELECT al.*,a.name artist FROM albums al JOIN artists a ON a.id=al.artist_id';

route('GET', '/api/home', async (req, env, { user }) => {
  const loadShared = async () => {
    const [promoted, fresh, popular, albums, artists, genres, editorial] = await Promise.all([
      tracks(env, 'WHERE t.published=1 AND t.promoted=1 ORDER BY t.created_at DESC LIMIT 6'),
      tracks(env, 'WHERE t.published=1 ORDER BY t.created_at DESC LIMIT 16'),
      tracks(env, 'WHERE t.published=1 ORDER BY t.play_count DESC, t.created_at DESC LIMIT 16'),
      all(env, `${ALBUM_SQL} WHERE al.id IN (SELECT album_id FROM tracks WHERE published=1) ORDER BY al.created_at DESC LIMIT 12`),
      all(env, 'SELECT * FROM artists WHERE id IN (SELECT artist_id FROM tracks WHERE published=1) ORDER BY created_at DESC LIMIT 12'),
      all(env, "SELECT genre,COUNT(*) c FROM tracks WHERE published=1 AND genre<>'' GROUP BY genre ORDER BY c DESC LIMIT 12"),
      all(env, 'SELECT id,name FROM playlists WHERE public=1 ORDER BY created_at DESC LIMIT 12'),
    ]);
    return { promoted, fresh, popular, albums: albums.map(mapAlbum), artists: artists.map(mapArtist), genres: genres.map(g => g.genre), editorial };
  };

  return json(user.role === 'admin' ? await loadShared() : await memo('home', 30, loadShared));
});

route('GET', '/api/catalog/stamp', async (req, env) => {
  const r = await one(env, 'SELECT COUNT(*) c, COALESCE(MAX(created_at),0) m FROM tracks WHERE published=1');
  return json({ stamp: `${r.c}.${r.m}` });
});
route('GET', '/api/catalog', async (req, env, { user }) => {
  const load = () => tracks(env, 'WHERE t.published=1 ORDER BY t.created_at DESC LIMIT 200');
  return json({ tracks: user.role === 'admin' ? await load() : await memo('catalog', 30, load) });
});

route('GET', '/api/search', async (req, env) => {
  const q = str(new URL(req.url).searchParams.get('q'), 80);
  if (!q) return json({ tracks: [], artists: [], albums: [] });
  const like = `%${q.replace(/[\\%_]/g, c => '\\' + c)}%`;
  const [t, ar, al] = await Promise.all([
    tracks(env, "WHERE t.published=1 AND (t.title LIKE ?1 ESCAPE '\\' OR a.name LIKE ?1 ESCAPE '\\' OR al.title LIKE ?1 ESCAPE '\\' OR t.genre LIKE ?1 ESCAPE '\\') ORDER BY t.play_count DESC LIMIT 40", like),
    all(env, "SELECT * FROM artists WHERE name LIKE ? ESCAPE '\\' LIMIT 12", like),
    all(env, `${ALBUM_SQL} WHERE al.title LIKE ? ESCAPE '\\' LIMIT 12`, like),
  ]);
  return json({ tracks: t, artists: ar.map(mapArtist), albums: al.map(mapAlbum) });
});

route('GET', '/api/genres/:name', async (req, env, { params }) => json({ name: params.name, tracks: await tracks(env, 'WHERE t.published=1 AND t.genre=? ORDER BY t.play_count DESC LIMIT 100', params.name) }));

route('GET', '/api/tracks/:id', async (req, env, { params }) => {
  const [t] = await tracks(env, 'WHERE t.id=? AND t.published=1', params.id);
  if (!t) return fail(404, 'Qo\'shiq topilmadi');
  const row = await one(env, 'SELECT lyrics FROM tracks WHERE id=?', params.id);
  return json({ ...t, lyrics: row.lyrics });
});

route('GET', '/api/artists/:id', async (req, env, { params }) => {
  const a = await first(env, 'SELECT * FROM artists WHERE id=?', params.id);
  if (!a) return fail(404, 'Ijrochi topilmadi');
  const [top, albums] = await Promise.all([
    tracks(env, 'WHERE t.published=1 AND t.artist_id=? ORDER BY t.play_count DESC LIMIT 50', params.id),
    all(env, `${ALBUM_SQL} WHERE al.artist_id=? ORDER BY al.year DESC`, params.id),
  ]);
  return json({ ...mapArtist(a), tracks: top, albums: albums.map(mapAlbum) });
});

route('GET', '/api/albums/:id', async (req, env, { params }) => {
  const a = await first(env, `${ALBUM_SQL} WHERE al.id=?`, params.id);
  if (!a) return fail(404, 'Albom topilmadi');
  return json({ ...mapAlbum(a), tracks: await tracks(env, 'WHERE t.published=1 AND t.album_id=? ORDER BY t.created_at', params.id) });
});

route('GET', '/api/likes', async (req, env, { user }) => json({
  tracks: await tracks(env, 'JOIN likes l ON l.track_id=t.id WHERE l.user_id=? AND t.published=1 ORDER BY l.created_at DESC', user.id),
}));
route('PUT', '/api/likes/:id', async (req, env, { user, params }) => {
  if (!await first(env, 'SELECT id FROM tracks WHERE id=? AND published=1', params.id)) fail(404, 'Qo\'shiq topilmadi');
  await run(env, 'INSERT OR IGNORE INTO likes (user_id,track_id,created_at) VALUES (?,?,?)', user.id, params.id, now());
  return json({ ok: true });
});
route('DELETE', '/api/likes/:id', async (req, env, { user, params }) => {
  await run(env, 'DELETE FROM likes WHERE user_id=? AND track_id=?', user.id, params.id);
  return json({ ok: true });
});
route('GET', '/api/library', async (req, env, { user }) => {
  const [playlists, liked] = await Promise.all([
    all(env, 'SELECT p.id,p.name,p.public,(SELECT COUNT(*) FROM playlist_tracks x WHERE x.playlist_id=p.id) count FROM playlists p WHERE p.user_id=? ORDER BY p.created_at DESC', user.id),
    all(env, 'SELECT track_id FROM likes WHERE user_id=?', user.id),
  ]);
  return json({ playlists, liked: liked.map(l => l.track_id) });
});
route('POST', '/api/playlists', async (req, env, { user }) => {
  const name = str((await body(req)).name, 80);
  if (!name) return fail(400, 'Pleylist nomini kiriting');
  const id = uid();
  await run(env, 'INSERT INTO playlists (id,user_id,name,created_at) VALUES (?,?,?,?)', id, user.id, name, now());
  return json({ id, name }, 201);
});
async function ownedPlaylist(env: Env, id: string, user: Row): Promise<Row> {
  const p = await first(env, 'SELECT * FROM playlists WHERE id=?', id);
  if (!p || p.user_id !== user.id) return fail(404, 'Pleylist topilmadi');
  return p;
}
route('GET', '/api/playlists/:id', async (req, env, { user, params }) => {
  const p = await first(env, 'SELECT * FROM playlists WHERE id=?', params.id);
  if (!p || (p.user_id !== user.id && !p.public)) return fail(404, 'Pleylist topilmadi');
  return json({
    id: p.id, name: p.name, public: !!p.public, mine: p.user_id === user.id,
    tracks: await tracks(env, 'JOIN playlist_tracks x ON x.track_id=t.id WHERE x.playlist_id=? AND t.published=1 ORDER BY x.added_at', p.id),
  });
});
route('PATCH', '/api/playlists/:id', async (req, env, { user, params }) => {
  const p = await ownedPlaylist(env, params.id, user);
  const b = await body(req);
  const name = b.name === undefined ? p.name : str(b.name, 80);
  if (!name) return fail(400, 'Pleylist nomini kiriting');

  const pub = user.role === 'admin' && b.public !== undefined ? (b.public ? 1 : 0) : p.public;
  await run(env, 'UPDATE playlists SET name=?,public=? WHERE id=?', name, pub, p.id);
  return json({ ok: true });
});
route('DELETE', '/api/playlists/:id', async (req, env, { user, params }) => {
  await ownedPlaylist(env, params.id, user);
  await run(env, 'DELETE FROM playlists WHERE id=?', params.id);
  return json({ ok: true });
});
route('POST', '/api/playlists/:id/tracks', async (req, env, { user, params }) => {
  await ownedPlaylist(env, params.id, user);
  const trackId = str((await body(req)).trackId, 40);
  if (!await first(env, 'SELECT id FROM tracks WHERE id=? AND published=1', trackId)) fail(404, 'Qo\'shiq topilmadi');
  await run(env, 'INSERT OR IGNORE INTO playlist_tracks (playlist_id,track_id,added_at) VALUES (?,?,?)', params.id, trackId, Date.now());
  return json({ ok: true });
});
route('DELETE', '/api/playlists/:id/tracks/:track', async (req, env, { user, params }) => {
  await ownedPlaylist(env, params.id, user);
  await run(env, 'DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?', params.id, params.track);
  return json({ ok: true });
});

const streamSig = (env: Env, trackId: string, userId: string, exp: number) => hmac(env.SIGNING_SECRET, `${trackId}.${userId}.${exp}`);

route('POST', '/api/play', async (req, env, { user }) => {
  const b = await body(req);
  const trackId = str(b.trackId, 40);
  const t = await first(env, 'SELECT id,duration FROM tracks WHERE id=? AND published=1', trackId);
  if (!t) return fail(404, 'Qo\'shiq topilmadi');
  const s = await liveSettings(env);
  const e = await entitlement(env, user, s);
  const every = Number(s.ad_every) || 0;
  if (!e.premium && every > 0 && user.plays_since_ad >= every) {

    const ad = await first(env, `SELECT * FROM ads WHERE active=1 ${b.hidden ? 'AND audio_key IS NOT NULL' : ''} ORDER BY RANDOM() LIMIT 1`);
    if (ad || !b.hidden) {
    const duration = ad ? ad.duration : Number(s.ad_seconds) || 15;
    const viewId = uid();
    const writes = [st(env, 'INSERT INTO ad_views (id,user_id,ad_id,duration,started_at) VALUES (?,?,?,?,?)', viewId, user.id, ad?.id ?? null, duration, now())];
    if (ad) writes.push(st(env, 'UPDATE ads SET impressions=impressions+1 WHERE id=?', ad.id));
    await env.DB.batch(writes);
    return json({ ad: { viewId, duration, title: ad?.title ?? `${s.site_name} reklamasiz`, body: ad?.body ?? 'Tarif oling va musiqani reklamasiz, uzluksiz tinglang.', image: media(ad?.image_key), audio: media(ad?.audio_key), ctaLabel: ad?.cta_label ?? '', ctaUrl: ad?.cta_url ?? '', trackId: ad?.track_id ?? null } });
    }
  }
  const t0 = now(), exp = t0 + Math.ceil(t.duration) + 6 * 3600;

  if (!e.premium) await run(env, 'UPDATE users SET plays_since_ad=plays_since_ad+1,last_seen=? WHERE id=?', t0, user.id);
  else if (t0 - user.last_seen > 300) await run(env, 'UPDATE users SET last_seen=? WHERE id=?', t0, user.id);
  const playId = `${t.id}.${t0}.${await hmac(env.SIGNING_SECRET, `play.${t.id}.${user.id}.${t0}`)}`;
  return json({ playId, url: `/media/stream/${t.id}?u=${user.id}&e=${exp}&s=${await streamSig(env, t.id, user.id, exp)}` });
});

route('POST', '/api/plays/:id/counted', async (req, env, { user, params }) => {
  const [trackId, startedRaw, sig] = params.id.split('.');
  const started = Number(startedRaw);
  if (!sig || !safeEqual(sig, await hmac(env.SIGNING_SECRET, `play.${trackId}.${user.id}.${startedRaw}`))) fail(404, 'Topilmadi');
  const t = await first(env, 'SELECT duration FROM tracks WHERE id=?', trackId);
  if (!t) return fail(404, 'Topilmadi');
  if (now() - started < Math.min(30, t.duration / 2) - 2) return json({ counted: false });

  const r = await run(env, 'INSERT OR IGNORE INTO plays (id,user_id,track_id,started_at,counted) VALUES (?,?,?,?,1)', sig, user.id, trackId, started);
  if (r.meta.changes) await run(env, 'UPDATE tracks SET play_count=play_count+1 WHERE id=?', trackId);
  return json({ counted: true });
});

route('POST', '/api/ads/:view/complete', async (req, env, { user, params }) => {
  const v = await first(env, 'SELECT * FROM ad_views WHERE id=? AND user_id=?', params.view, user.id);
  if (!v) return fail(404, 'Topilmadi');
  if (now() - v.started_at < v.duration - 2) fail(409, 'Reklama hali tugamadi');
  await env.DB.batch([
    st(env, 'UPDATE ad_views SET completed=1 WHERE id=?', v.id),
    st(env, 'UPDATE users SET plays_since_ad=0 WHERE id=?', user.id),
  ]);
  return json({ ok: true });
});
route('POST', '/api/ads/:view/click', async (req, env, { user, params }) => {
  const v = await first(env, 'SELECT ad_id FROM ad_views WHERE id=? AND user_id=?', params.view, user.id);
  if (v?.ad_id) await run(env, 'UPDATE ads SET clicks=clicks+1 WHERE id=?', v.ad_id);
  return json({ ok: true });
});

const mapPlan = (p: Row) => ({ id: p.id, name: p.name, tagline: p.tagline, price: p.price_uzs, days: p.days, seats: p.seats, features: p.features.split('\n').filter(Boolean), active: !!p.active, sort: p.sort, offlineLimit: p.offline_limit, offlineRecent: p.offline_recent });

route('GET', '/api/plans', async (req, env, { user }) => {
  const s = await settings(env);
  const [plans, pending, family] = await Promise.all([
    all(env, 'SELECT * FROM plans WHERE active=1 ORDER BY sort,price_uzs'),
    first(env, "SELECT p.id,p.plan_id,p.reference,p.created_at FROM payments p WHERE p.user_id=? AND p.status='pending' AND p.provider='manual'", user.id),
    all(env, 'SELECT id,name,email FROM users WHERE family_owner_id=?', user.id),
  ]);
  return json({ plans: plans.map(mapPlan), pending, family, card: { number: s.card_number, holder: s.card_holder }, click: clickReady(s) });
});
const clickReady = (s: Record<string, string>): boolean => !!(s.click_service_id && s.click_merchant_id && s.click_secret);

async function mustBeAbleToPay(env: Env, user: Row): Promise<void> {
  const e = await entitlement(env, user, await settings(env));
  if (['admin', 'exempt', 'plans_off'].includes(e.reason)) fail(400, 'Sizga to\'lov kerak emas');
}
async function grantPaid(env: Env, p: Row): Promise<void> {
  const [plan, u] = await Promise.all([one(env, 'SELECT days FROM plans WHERE id=?', p.plan_id), one(env, 'SELECT plan_expires FROM users WHERE id=?', p.user_id)]);
  await run(env, 'UPDATE users SET plan_id=?,plan_expires=? WHERE id=?', p.plan_id, Math.max(now(), u.plan_expires) + plan.days * DAY, p.user_id);
}
route('POST', '/api/payments/click', async (req, env, { user }) => {
  await mustBeAbleToPay(env, user);
  const s = await settings(env);
  if (!clickReady(s)) return fail(503, 'Click hali ulanmagan');
  const plan = await first(env, 'SELECT * FROM plans WHERE id=? AND active=1', str((await body(req)).planId, 40));
  if (!plan) return fail(404, 'Tarif topilmadi');

  const open = await first(env, "SELECT id FROM payments WHERE user_id=? AND plan_id=? AND amount=? AND provider='click' AND status='pending'", user.id, plan.id, plan.price_uzs);
  const id = open?.id ?? uid();
  if (!open) await run(env, "INSERT INTO payments (id,user_id,plan_id,amount,reference,provider,created_at) VALUES (?,?,?,?,'Click','click',?)", id, user.id, plan.id, plan.price_uzs, now());
  const q = new URLSearchParams({ service_id: s.click_service_id, merchant_id: s.click_merchant_id, amount: Number(plan.price_uzs).toFixed(2), transaction_param: id, return_url: `${new URL(req.url).origin}/premium` });
  return json({ url: `https://my.click.uz/services/pay?${q}` }, 201);
});

route('POST', '/api/click/callback', async (req, env) => {
  const f = await req.formData();
  const get = (k: string): string => String(f.get(k) ?? '');
  const transId = get('click_trans_id'), order = get('merchant_trans_id'), action = get('action'), amount = get('amount'), prepareId = get('merchant_prepare_id');
  const reply = (error: number, note: string, extra: Record<string, unknown> = {}) => json({ click_trans_id: Number(transId), merchant_trans_id: order, error, error_note: note, ...extra });
  if (action !== '0' && action !== '1') return reply(-3, 'Action not found');
  const s = await settings(env);
  if (!clickReady(s) || get('service_id') !== s.click_service_id) return reply(-1, 'SIGN CHECK FAILED!');
  const signed = transId + get('service_id') + s.click_secret + order + (action === '1' ? prepareId : '') + amount + action + get('sign_time');
  const expected = hex(await crypto.subtle.digest('MD5', new TextEncoder().encode(signed)));
  if (!safeEqual(expected, get('sign_string').toLowerCase())) return reply(-1, 'SIGN CHECK FAILED!');
  const p = await first(env, "SELECT rowid rid,* FROM payments WHERE id=? AND provider='click'", order);
  if (!p) return reply(-5, 'User does not exist');
  if (Number(amount) !== p.amount) return reply(-2, 'Incorrect parameter amount');
  if (p.status === 'approved') return reply(-4, 'Already paid');
  if (p.status !== 'pending') return reply(-9, 'Transaction cancelled');
  if (action === '0') {
    await run(env, 'UPDATE payments SET click_trans_id=? WHERE id=?', transId, p.id);
    return reply(0, 'Success', { merchant_prepare_id: p.rid });
  }
  if (String(p.rid) !== prepareId || p.click_trans_id !== transId) return reply(-6, 'Transaction does not exist');
  if (Number(get('error')) < 0) {
    await run(env, "UPDATE payments SET status='rejected',decided_at=? WHERE id=? AND status='pending'", now(), p.id);
    return reply(-9, 'Transaction cancelled');
  }

  const done = await run(env, "UPDATE payments SET status='approved',decided_at=? WHERE id=? AND status='pending'", now(), p.id);
  if (!done.meta.changes) return reply(-4, 'Already paid');
  await grantPaid(env, p);
  return reply(0, 'Success', { merchant_confirm_id: p.rid });
}, null);

route('POST', '/api/payments', async (req, env, { user }) => {
  await mustBeAbleToPay(env, user);
  const b = await body(req);
  const plan = await first(env, 'SELECT * FROM plans WHERE id=? AND active=1', str(b.planId, 40));
  if (!plan) return fail(404, 'Tarif topilmadi');
  const reference = str(b.reference, 120);
  if (reference.length < 3) fail(400, 'To\'lov ma\'lumotini kiriting (chek raqami yoki karta oxirgi 4 raqami)');
  if (await first(env, "SELECT id FROM payments WHERE user_id=? AND status='pending' AND provider='manual'", user.id)) fail(409, 'Oldingi so\'rovingiz hali ko\'rib chiqilmoqda');
  await run(env, 'INSERT INTO payments (id,user_id,plan_id,amount,reference,created_at) VALUES (?,?,?,?,?,?)', uid(), user.id, plan.id, plan.price_uzs, reference, now());
  return json({ ok: true }, 201);
});
route('POST', '/api/family', async (req, env, { user }) => {
  if (user.plan_expires <= now()) fail(403, 'Faol tarif kerak');
  const plan = await first(env, 'SELECT seats FROM plans WHERE id=?', user.plan_id);
  const taken = await one(env, 'SELECT COUNT(*) c FROM users WHERE family_owner_id=?', user.id);
  if (!plan || taken.c + 1 >= plan.seats) return fail(409, "Tarifda bo'sh joy qolmadi");
  const m = await first(env, 'SELECT id,family_owner_id FROM users WHERE email=? AND id<>?', str((await body(req)).email, 120), user.id);
  if (!m) return fail(404, "Bu email bilan foydalanuvchi topilmadi. Avval ro'yxatdan o'tsin.");
  if (m.family_owner_id) fail(409, "Bu foydalanuvchi boshqa tarifga qo'shilgan");
  await run(env, 'UPDATE users SET family_owner_id=? WHERE id=?', user.id, m.id);
  return json({ ok: true });
});
route('DELETE', '/api/family/:id', async (req, env, { user, params }) => {
  await run(env, 'UPDATE users SET family_owner_id=NULL WHERE id=? AND family_owner_id=?', params.id, user.id);
  return json({ ok: true });
});

const OFFLINE_FOREVER = 3650 * DAY;
const RECENT_PLAYS = `JOIN (SELECT track_id, MAX(started_at) m, MAX(rowid) r FROM plays WHERE user_id=? GROUP BY track_id ORDER BY m DESC, r DESC LIMIT ?) rec ON rec.track_id=t.id`;
async function offlineAccess(env: Env, user: Row): Promise<{ limit: number; recent: number; until: number }> {
  if (user.role === 'admin') return { limit: -1, recent: 20, until: now() + OFFLINE_FOREVER };
  const e = await entitlement(env, user, await liveSettings(env));
  if (e.reason !== 'plan' && e.reason !== 'family') {

    if (user.plan_expires <= now()) return { limit: 0, recent: 0, until: 0 };
    const p = await first(env, 'SELECT offline_limit,offline_recent FROM plans WHERE id=?', user.plan_id);
    return { limit: p?.offline_limit ?? 0, recent: p?.offline_recent ?? 0, until: user.plan_expires };
  }
  const plan = await first(env, 'SELECT offline_limit,offline_recent FROM plans WHERE id=?', e.planId);
  return { limit: plan?.offline_limit ?? 0, recent: plan?.offline_recent ?? 0, until: e.expires ?? 0 };
}
route('GET', '/api/offline', async (req, env, { user }) => {
  const a = await offlineAccess(env, user);
  const list = await tracks(env, 'JOIN offline_items o ON o.track_id=t.id WHERE o.user_id=? AND t.published=1 ORDER BY o.position,o.added_at', user.id);
  const recent = a.recent > 0 ? await tracks(env, `${RECENT_PLAYS} WHERE t.published=1 ORDER BY rec.m DESC,rec.r DESC`, user.id, a.recent) : [];

  return json({ limit: a.limit, recentLimit: a.recent, validUntil: a.until,
    items: list.map((t, i) => ({ ...t, allowed: a.limit === -1 || i < a.limit })),
    recent: recent.map(t => ({ ...t, allowed: a.until > 0 })) });
});
route('POST', '/api/offline', async (req, env, { user }) => {
  const a = await offlineAccess(env, user);
  if (a.limit === 0) return fail(403, 'Oflayn tinglash tarifingizga kirmaydi');
  const trackId = str((await body(req)).trackId, 40);
  if (!await first(env, 'SELECT id FROM tracks WHERE id=? AND published=1', trackId)) return fail(404, 'Qo\'shiq topilmadi');
  if (await first(env, 'SELECT track_id FROM offline_items WHERE user_id=? AND track_id=?', user.id, trackId)) return json({ ok: true });
  const c = await one(env, 'SELECT COUNT(*) c, COALESCE(MAX(position),0) p FROM offline_items WHERE user_id=?', user.id);
  if (a.limit !== -1 && c.c >= a.limit) return fail(409, `Tarifingizda ${a.limit} ta qo'shiq saqlash mumkin. Avval birini o'chiring.`);
  await run(env, 'INSERT INTO offline_items (user_id,track_id,position,added_at) VALUES (?,?,?,?)', user.id, trackId, c.p + 1, now());
  return json({ ok: true }, 201);
});
route('PUT', '/api/offline/order', async (req, env, { user }) => {
  const ids = (await body(req)).ids;
  if (!Array.isArray(ids) || ids.length > 5000) return fail(400, 'Tartib noto\'g\'ri');
  await env.DB.batch(ids.map((id: unknown, i: number) => st(env, 'UPDATE offline_items SET position=? WHERE user_id=? AND track_id=?', i + 1, user.id, str(id, 40))));
  return json({ ok: true });
});
route('DELETE', '/api/offline/:id', async (req, env, { user, params }) => {
  await run(env, 'DELETE FROM offline_items WHERE user_id=? AND track_id=?', user.id, params.id);
  return json({ ok: true });
});
route('GET', '/api/offline/:id/url', async (req, env, { user, params }) => {
  const a = await offlineAccess(env, user);
  if (a.limit === 0 && a.recent === 0) return fail(403, 'Oflayn tinglash tarifingizga kirmaydi');
  if (!await first(env, 'SELECT id FROM tracks WHERE id=? AND published=1', params.id)) return fail(404, 'Qo\'shiq topilmadi');
  const manual = a.limit !== 0 && await first(env, 'SELECT track_id FROM offline_items WHERE user_id=? AND track_id=?', user.id, params.id);
  const recent = manual || a.recent === 0 ? null
    : await first(env, `SELECT track_id FROM (SELECT track_id, MAX(started_at) m, MAX(rowid) r FROM plays WHERE user_id=? GROUP BY track_id ORDER BY m DESC, r DESC LIMIT ?) WHERE track_id=?`, user.id, a.recent, params.id);
  if (!manual && !recent) return fail(404, 'Bu qo\'shiq oflayn ro\'yxatida yo\'q');
  const exp = now() + 6 * 3600;
  return json({ url: `/media/stream/${params.id}?u=${user.id}&e=${exp}&s=${await streamSig(env, params.id, user.id, exp)}` });
});

const PUSH_CONTACT = 'https://rythm.svrvs.uz';
const NUDGE_AFTER = 7 * DAY, NUDGE_EVERY = 14 * DAY;
async function addNotice(env: Env, title: string, body: string, url: string, userId: string | null = null): Promise<void> {
  await run(env, 'INSERT INTO notices (title,body,url,user_id,created_at) VALUES (?,?,?,?,?)', title, body, url, userId, now());
}
route('GET', '/api/notices/key', async (req, env) => (env.VAPID_JWK ? json({ key: vapidPublicKey(JSON.parse(env.VAPID_JWK)) }) : fail(503, 'Bildirishnoma sozlanmagan')));
route('POST', '/api/notices/subscribe', async (req, env, { user }) => {
  const b = await body(req);
  const kind = b.kind === 'android' ? 'android' : 'web', endpoint = str(b.endpoint, 1000);
  if (kind === 'web' ? !/^https:\/\/[^\s]+$/.test(endpoint) : !/^[0-9a-f]{32,64}$/.test(endpoint)) return fail(400, 'Qurilma manzili noto\'g\'ri');
  const top = (await one(env, 'SELECT COALESCE(MAX(id),0) m FROM notices')).m;
  await run(env, `INSERT INTO push_subs (id,user_id,kind,endpoint,seen,tickled,created_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id`, await sha256(endpoint), user.id, kind, endpoint, top, top, now());
  return json({ ok: true }, 201);
});
route('POST', '/api/notices/unsubscribe', async (req, env) => {
  await run(env, 'DELETE FROM push_subs WHERE id=?', await sha256(str((await body(req)).endpoint, 1000)));
  return json({ ok: true });
}, null);

route('POST', '/api/notices/next', async (req, env) => {
  const sub = await first(env, 'SELECT * FROM push_subs WHERE id=?', await sha256(str((await body(req)).endpoint, 1000)));
  if (!sub) return json({ notice: null });
  const n = await first(env, 'SELECT id,title,body,url FROM notices WHERE id>? AND (user_id IS NULL OR user_id=?) ORDER BY id DESC LIMIT 1', sub.seen, sub.user_id);
  if (!n) return json({ notice: null });
  await run(env, 'UPDATE push_subs SET seen=?,tickled=MAX(tickled,?) WHERE id=?', n.id, n.id, sub.id);
  return json({ notice: { title: n.title, body: n.body, url: n.url } });
}, null);
route('GET', '/api/admin/notices', async (req, env) => json({
  devices: (await one(env, 'SELECT COUNT(*) c FROM push_subs')).c,
  notices: await all(env, 'SELECT id,title,body,url,created_at FROM notices WHERE user_id IS NULL ORDER BY id DESC LIMIT 30'),
}), 'admin');
route('POST', '/api/admin/notices', async (req, env) => {
  const b = await body(req);
  const title = str(b.title, 80);
  if (!title) return fail(400, 'Sarlavhani kiriting');
  const url = str(b.url, 200) || '/';
  if (!url.startsWith('/') || url.startsWith('//')) return fail(400, 'Havola "/" bilan boshlansin');
  await addNotice(env, title, str(b.body, 200), url);
  return json({ ok: true }, 201);
}, 'admin');
async function deliverPush(env: Env): Promise<void> {
  if (!env.VAPID_JWK) return;
  const jwk = JSON.parse(env.VAPID_JWK), t = now();

  const subs = await all(env, `SELECT s.id,s.endpoint,(SELECT MAX(n.id) FROM notices n WHERE n.id>s.tickled AND (n.user_id IS NULL OR n.user_id=s.user_id)) top
    FROM push_subs s WHERE s.kind='web' AND EXISTS (SELECT 1 FROM notices n WHERE n.id>s.tickled AND (n.user_id IS NULL OR n.user_id=s.user_id)) LIMIT 40`);
  await Promise.all(subs.map(async sub => {
    try {
      const res = await fetch(sub.endpoint, { method: 'POST', headers: { authorization: await vapidHeader(jwk, sub.endpoint, PUSH_CONTACT, t), ttl: '86400', urgency: 'normal', 'content-length': '0' } });
      if (res.status === 404 || res.status === 410) await run(env, 'DELETE FROM push_subs WHERE id=?', sub.id);
      else if (res.ok) await run(env, 'UPDATE push_subs SET tickled=? WHERE id=?', sub.top, sub.id);
    } catch (e) { console.error(e); }
  }));
}

async function nudgeAway(env: Env): Promise<void> {
  const t = now(), s = await settings(env);
  const away = await all(env, `SELECT u.id FROM users u WHERE u.banned=0 AND u.last_seen<? AND u.nudged_at<? AND u.last_seen>0 AND EXISTS (SELECT 1 FROM push_subs p WHERE p.user_id=u.id) LIMIT 200`, t - NUDGE_AFTER, t - NUDGE_EVERY);
  const fresh = await first(env, 'SELECT title FROM tracks WHERE published=1 ORDER BY created_at DESC LIMIT 1');
  for (const u of away) {
    await addNotice(env, `${s.site_name} sizni kutmoqda`, fresh ? `Yangi musiqalar bor. "${fresh.title}"ni tinglab ko'ring.` : 'Sevimli qo\'shiqlaringizga qayting.', '/', u.id);
    await run(env, 'UPDATE users SET nudged_at=? WHERE id=?', t, u.id);
  }
}

async function serveObject(env: Env, req: Request, key: string, contentType: string, extra: Record<string, string> = {}): Promise<Response> {
  const head = await env.BUCKET.head(key);
  if (!head) return new Response('Topilmadi', { status: 404 });
  const base = { 'content-type': contentType, 'accept-ranges': 'bytes', etag: head.httpEtag, 'x-content-type-options': 'nosniff', ...extra };
  const range = parseRange(req.headers.get('range'), head.size);
  if (range === 'invalid') return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${head.size}` } });
  const isHead = req.method === 'HEAD';
  if (!range) {
    const obj = isHead ? null : await env.BUCKET.get(key);
    return new Response(obj?.body ?? null, { headers: { ...base, 'content-length': String(head.size) } });
  }
  const obj = isHead ? null : await env.BUCKET.get(key, { range });
  return new Response(obj?.body ?? null, { status: 206, headers: { ...base, 'content-length': String(range.length), 'content-range': `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}` } });
}
async function handleMedia(req: Request, env: Env, url: URL): Promise<Response> {
  const stream = /^\/media\/stream\/([0-9a-f]{32})$/.exec(url.pathname);
  if (stream) {
    const q = url.searchParams, exp = Number(q.get('e')), u = q.get('u') || '';
    const good = exp > now() && safeEqual(q.get('s') || '', await streamSig(env, stream[1], u, exp));
    if (!good) return new Response('Havola eskirgan', { status: 403 });
    const t = await first(env, 'SELECT audio_key FROM tracks WHERE id=?', stream[1]);
    if (!t) return new Response('Topilmadi', { status: 404 });
    return serveObject(env, req, t.audio_key, 'audio/wav', { 'cache-control': 'private, max-age=3600, no-transform' });
  }
  const pub = /^\/media\/((covers|adaudio|apk|rhythm)\/[0-9a-f]{32}\.(jpg|png|webp|wav|apk|bin))$/.exec(url.pathname);
  if (!pub) return new Response('Topilmadi', { status: 404 });
  const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', wav: 'audio/wav', apk: 'application/vnd.android.package-archive', bin: 'application/octet-stream' };
  const extra: Record<string, string> = pub[3] === 'apk' ? { 'content-disposition': 'attachment; filename="SvRvS-Rythm.apk"', 'cache-control': 'public, max-age=3600' } : { 'cache-control': 'public, max-age=31536000, immutable' };
  return serveObject(env, req, pub[1], types[pub[3]], extra);
}

async function mobileconfig(req: Request, env: Env): Promise<Response> {
  const s = await settings(env);
  const origin = new URL(req.url).origin;
  const icon = await env.ASSETS.fetch(new Request(`${origin}/icon-512.png`));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(await icon.arrayBuffer())));
  const id = (await sha256(origin)).slice(0, 12);
  const name = xmlEscape(s.site_name);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>FullScreen</key><true/><key>IsRemovable</key><true/><key>Icon</key><data>${b64}</data>
<key>Label</key><string>${name}</string><key>URL</key><string>${xmlEscape(origin)}/</string>
<key>PayloadDisplayName</key><string>${name}</string><key>PayloadIdentifier</key><string>rythm.webclip.${id}</string>
<key>PayloadType</key><string>com.apple.webClip.managed</string><key>PayloadUUID</key><string>${crypto.randomUUID().toUpperCase()}</string><key>PayloadVersion</key><integer>1</integer>
</dict></array>
<key>PayloadDisplayName</key><string>${name}</string><key>PayloadIdentifier</key><string>rythm.profile.${id}</string>
<key>PayloadOrganization</key><string>${name}</string><key>PayloadRemovalDisallowed</key><false/>
<key>PayloadType</key><string>Configuration</string><key>PayloadUUID</key><string>${crypto.randomUUID().toUpperCase()}</string><key>PayloadVersion</key><integer>1</integer>
</dict></plist>`;
  return new Response(plist, { headers: { 'content-type': 'application/x-apple-aspen-config', 'content-disposition': 'attachment; filename="SvRvS-Rythm.mobileconfig"' } });
}
const latestRelease = (env: Env) => first(env, 'SELECT * FROM releases ORDER BY version_code DESC LIMIT 1');
const mapRelease = (r: Row | null) => r && ({ id: r.id, versionCode: r.version_code, versionName: r.version_name, notes: r.notes, url: media(r.apk_key), size: r.size, sha256: r.sha256, force: !!r.force, createdAt: r.created_at });

route('GET', '/api/app/latest', async (req, env) => json({ release: mapRelease(await latestRelease(env)) }), null);

route('PUT', '/api/admin/diag', async (req, env) => {
  const log = await req.text();
  if (log.length > 64000) return fail(413, 'Jurnal juda katta');
  await env.BUCKET.put('diag/playback.json', log, { httpMetadata: { contentType: 'application/json' } });
  return json({ ok: true });
}, 'admin');
route('GET', '/api/admin/diag', async (req, env) => json({ log: await (await env.BUCKET.get('diag/playback.json'))?.text() ?? null }), 'admin');
route('GET', '/api/admin/stats', async (req, env) => {
  const t = now();
  const [users, new7, active1, active30, paid, exempt, plays, plays7, storage, pendingPay, revenue, top7, topAll, daily, signups, revenuePlans] = await Promise.all([
    one(env, 'SELECT COUNT(*) c FROM users'),
    one(env, 'SELECT COUNT(*) c FROM users WHERE created_at>?', t - 7 * DAY),
    one(env, 'SELECT COUNT(*) c FROM users WHERE last_seen>?', t - DAY),
    one(env, 'SELECT COUNT(*) c FROM users WHERE last_seen>?', t - 30 * DAY),
    one(env, 'SELECT COUNT(*) c FROM users WHERE plan_expires>?', t),
    one(env, 'SELECT COUNT(*) c FROM users WHERE plan_exempt=1'),
    one(env, 'SELECT COALESCE(SUM(play_count),0) c FROM tracks'),
    one(env, 'SELECT COUNT(*) c FROM plays WHERE counted=1 AND started_at>?', t - 7 * DAY),
    one(env, 'SELECT COALESCE(SUM(size),0) bytes,COUNT(*) tracks,COALESCE(SUM(duration),0) seconds FROM tracks'),
    one(env, "SELECT COUNT(*) c FROM payments WHERE status='pending' AND provider='manual'"),
    one(env, "SELECT COALESCE(SUM(amount),0) c FROM payments WHERE status='approved' AND decided_at>?", t - 30 * DAY),
    all(env, `SELECT t.id,t.title,a.name artist,COUNT(*) plays FROM plays p JOIN tracks t ON t.id=p.track_id JOIN artists a ON a.id=t.artist_id WHERE p.counted=1 AND p.started_at>? GROUP BY t.id ORDER BY plays DESC LIMIT 10`, t - 7 * DAY),
    all(env, 'SELECT t.id,t.title,a.name artist,t.play_count plays FROM tracks t JOIN artists a ON a.id=t.artist_id ORDER BY t.play_count DESC LIMIT 10'),
    all(env, "SELECT date(started_at,'unixepoch') d,COUNT(*) c FROM plays WHERE counted=1 AND started_at>? GROUP BY d ORDER BY d", t - 30 * DAY),
    all(env, "SELECT date(created_at,'unixepoch') d,COUNT(*) c FROM users WHERE created_at>? GROUP BY d ORDER BY d", t - 30 * DAY),
    all(env, "SELECT plan_id,COUNT(*) c FROM users WHERE plan_expires>? GROUP BY plan_id", t),
  ]);
  return json({ users: users.c, newUsers7: new7.c, active1: active1.c, active30: active30.c, paid: paid.c, exempt: exempt.c, plays: plays.c, plays7: plays7.c, storage, pendingPayments: pendingPay.c, revenue30: revenue.c, top7, topAll, daily, signups, planCounts: revenuePlans });
}, 'admin');

const uploadKey = (key: unknown): string => typeof key === 'string' && /^(audio|adaudio)\/[0-9a-f]{32}\.wav$/.test(key) ? key : fail(400, 'Fayl kaliti noto\'g\'ri');

route('POST', '/api/admin/uploads', async (req, env) => {
  const kind = (await body(req)).kind === 'adaudio' ? 'adaudio' : 'audio';
  const key = `${kind}/${uid()}.wav`;
  const up = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: 'audio/wav' } });
  return json({ key, uploadId: up.uploadId, partSize: PART_SIZE });
}, 'admin');

route('PUT', '/api/admin/uploads/part', async (req, env) => {
  const q = new URL(req.url).searchParams;
  const key = uploadKey(q.get('key') || ''), n = int(q.get('n'), 1, 10000, 'Qism');
  const up = env.BUCKET.resumeMultipartUpload(key, q.get('uploadId') || '');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > PART_SIZE) fail(413, 'Qism juda katta');
  if (n === 1) {
    try { parseWav(new Uint8Array(buf)); } catch (e) { await up.abort().catch(() => {}); fail(415, `Faqat WAV qabul qilinadi: ${(e as Error).message}`); }
  }
  return json(await up.uploadPart(n, buf));
}, 'admin');

async function inspectWav(env: Env, key: string) {
  const head = await env.BUCKET.head(key);
  if (!head) return fail(404, 'Fayl topilmadi');
  const obj = await env.BUCKET.get(key, { range: { offset: 0, length: Math.min(head.size, 4 * 1024 * 1024) } });
  return { ...parseWav(new Uint8Array(await obj!.arrayBuffer()), head.size), size: head.size };
}
route('POST', '/api/admin/uploads/complete', async (req, env) => {
  const b = await body(req);
  const key = uploadKey(b.key);
  const up = env.BUCKET.resumeMultipartUpload(key, str(b.uploadId, 2000));
  await up.complete(b.parts);

  try { return json({ key, ...await inspectWav(env, key) }); } catch (e) {
    await env.BUCKET.delete(key);
    return fail(415, `Faqat WAV qabul qilinadi: ${(e as Error).message}`);
  }
}, 'admin');

route('POST', '/api/admin/images', async (req, env) => {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) fail(413, 'Rasm 8 MB dan oshmasin');
  const type = imageType(new Uint8Array(buf.slice(0, 16)));
  if (!type) return fail(415, 'Rasm JPG, PNG yoki WEBP bo\'lsin');
  const key = `covers/${uid()}.${type}`;
  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: `image/${type === 'jpg' ? 'jpeg' : type}` } });
  return json({ key, url: media(key) }, 201);
}, 'admin');
const coverKey = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'string' && /^covers\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(v) ? v : fail(400, 'Rasm kaliti noto\'g\'ri');
};

async function artistId(env: Env, name: unknown): Promise<string> {
  const n = str(name, 100);
  if (!n) return fail(400, 'Ijrochi nomini kiriting');
  const found = await first(env, 'SELECT id FROM artists WHERE name=?', n);
  if (found) return found.id;
  const id = uid();
  await run(env, 'INSERT INTO artists (id,name,created_at) VALUES (?,?,?)', id, n, now());
  return id;
}
async function albumId(env: Env, title: unknown, artist: string, cover: string | null, year: number | null): Promise<string | null> {
  const n = str(title, 120);
  if (!n) return null;
  const found = await first(env, 'SELECT id,cover_key FROM albums WHERE title=? AND artist_id=?', n, artist);
  if (found) {
    if (cover && !found.cover_key) await run(env, 'UPDATE albums SET cover_key=? WHERE id=?', cover, found.id);
    return found.id;
  }
  const id = uid();
  await run(env, 'INSERT INTO albums (id,title,artist_id,cover_key,year,created_at) VALUES (?,?,?,?,?,?)', id, n, artist, cover, year || null, now());
  return id;
}

route('GET', '/api/admin/tracks', async (req, env) => json({
  tracks: await tracks(env, 'ORDER BY t.created_at DESC LIMIT 500'),
  artists: await all(env, 'SELECT id,name FROM artists ORDER BY name'),
  albums: await all(env, 'SELECT id,title FROM albums ORDER BY title'),
}), 'admin');
route('GET', '/api/admin/tracks/:id', async (req, env, { params }) => {
  const [t] = await tracks(env, 'WHERE t.id=?', params.id);
  if (!t) return fail(404, 'Qo\'shiq topilmadi');
  const row = await one(env, 'SELECT lyrics,cover_key FROM tracks WHERE id=?', params.id);
  return json({ ...t, lyrics: row.lyrics, coverKey: row.cover_key });
}, 'admin');

route('POST', '/api/admin/tracks', async (req, env) => {
  const b = await body(req);
  const key = uploadKey(b.key);
  if (!key.startsWith('audio/')) fail(400, 'Fayl kaliti noto\'g\'ri');
  const w = await inspectWav(env, key);
  const title = str(b.title, 160);
  if (!title) return fail(400, 'Qo\'shiq nomini kiriting');
  const cover = coverKey(b.coverKey);
  const artist = await artistId(env, b.artist);
  const album = await albumId(env, b.album, artist, cover, b.year ? int(b.year, 1900, 2100, 'Yil') : null);
  const id = uid();
  if (b.published !== false && b.notify !== false) await addNotice(env, 'Yangi qo\'shiq', `${title} — ${str(b.artist, 100)}`, '/');
  await run(env, 'INSERT INTO tracks (id,title,artist_id,album_id,genre,cover_key,audio_key,size,duration,sample_rate,bit_depth,channels,lyrics,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, title, artist, album, str(b.genre, 60), cover, key, w.size, w.duration, w.sampleRate, w.bitDepth, w.channels, str(b.lyrics, 20000), b.published === false ? 0 : 1, now());
  return json({ id }, 201);
}, 'admin');

route('PATCH', '/api/admin/tracks/:id', async (req, env, { params }) => {
  const t = await first(env, 'SELECT * FROM tracks WHERE id=?', params.id);
  if (!t) return fail(404, 'Qo\'shiq topilmadi');
  const b = await body(req);
  const cover = b.coverKey === undefined ? t.cover_key : coverKey(b.coverKey);
  const artist = b.artist === undefined ? t.artist_id : await artistId(env, b.artist);
  const album = b.album === undefined ? t.album_id : await albumId(env, b.album, artist, cover, null);
  const title = b.title === undefined ? t.title : str(b.title, 160);
  if (!title) return fail(400, 'Qo\'shiq nomini kiriting');
  await run(env, 'UPDATE tracks SET title=?,artist_id=?,album_id=?,genre=?,cover_key=?,lyrics=?,published=?,promoted=?,promo_text=? WHERE id=?',
    title, artist, album, b.genre === undefined ? t.genre : str(b.genre, 60), cover, b.lyrics === undefined ? t.lyrics : str(b.lyrics, 20000),
    b.published === undefined ? t.published : (b.published ? 1 : 0), b.promoted === undefined ? t.promoted : (b.promoted ? 1 : 0),
    b.promoText === undefined ? t.promo_text : str(b.promoText, 160), t.id);
  return json({ ok: true });
}, 'admin');

route('PUT', '/api/admin/tracks/:id/rhythm', async (req, env, { params }) => {
  const t = await first(env, 'SELECT duration FROM tracks WHERE id=?', params.id);
  if (!t) return fail(404, 'Qo\'shiq topilmadi');
  const buf = await req.arrayBuffer();

  const frames = buf.byteLength / 16;
  if (!Number.isInteger(frames) || Math.abs(frames / 20 - t.duration) > 1) return fail(400, 'Ritm xaritasi noto\'g\'ri');
  const key = `rhythm/${params.id}.bin`;
  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: 'application/octet-stream' } });
  await run(env, 'UPDATE tracks SET rhythm_key=? WHERE id=?', key, params.id);
  return json({ ok: true });
}, 'admin');

route('GET', '/api/admin/fingerprints', async (req, env) => json({ tracks: await all(env, 'SELECT t.id,t.title,a.name artist,t.genre,t.fingerprint fp FROM tracks t JOIN artists a ON a.id=t.artist_id WHERE t.fingerprint IS NOT NULL') }), 'admin');
route('PUT', '/api/admin/tracks/:id/fingerprint', async (req, env, { params }) => {
  const fp = (await body(req)).fp;
  const text = JSON.stringify(fp);
  if (!fp || typeof fp.h !== 'string' || !Array.isArray(fp.p) || fp.p.length !== 16 || text.length > 60000) return fail(400, 'Barmoq izi noto\'g\'ri');
  const r = await run(env, 'UPDATE tracks SET fingerprint=? WHERE id=?', text, params.id);
  return r.meta.changes ? json({ ok: true }) : fail(404, 'Qo\'shiq topilmadi');
}, 'admin');

route('DELETE', '/api/admin/tracks/:id', async (req, env, { params }) => {
  const t = await first(env, 'SELECT audio_key,rhythm_key FROM tracks WHERE id=?', params.id);
  if (!t) return fail(404, 'Qo\'shiq topilmadi');
  await run(env, 'DELETE FROM tracks WHERE id=?', params.id);
  await env.BUCKET.delete([t.audio_key, t.rhythm_key].filter(Boolean));
  return json({ ok: true });
}, 'admin');

route('PATCH', '/api/admin/artists/:id', async (req, env, { params }) => {
  const a = await first(env, 'SELECT * FROM artists WHERE id=?', params.id);
  if (!a) return fail(404, 'Ijrochi topilmadi');
  const b = await body(req);
  await run(env, 'UPDATE artists SET name=?,bio=?,image_key=? WHERE id=?', str(b.name ?? a.name, 100) || a.name, str(b.bio ?? a.bio, 4000), b.imageKey === undefined ? a.image_key : coverKey(b.imageKey), a.id);
  return json({ ok: true });
}, 'admin');
route('GET', '/api/admin/artists', async (req, env) => json({ artists: (await all(env, 'SELECT a.*,(SELECT COUNT(*) FROM tracks t WHERE t.artist_id=a.id) tracks FROM artists a ORDER BY a.name')).map(a => ({ ...mapArtist(a), tracks: a.tracks, imageKey: a.image_key })) }), 'admin');

route('GET', '/api/admin/users', async (req, env) => {
  const p = new URL(req.url).searchParams;
  const q = str(p.get('q'), 80), filter = p.get('filter');
  const like = `%${q.replace(/[\\%_]/g, c => '\\' + c)}%`;
  const filters: Record<string, string> = { exempt: 'AND u.plan_exempt=1', paid: `AND u.plan_expires>${now()}`, banned: 'AND u.banned=1' };
  const where = filters[filter ?? ''] || '';
  const offset = int(p.get('offset') ?? 0, 0, 100000000, 'Offset');
  const [users, total] = await Promise.all([
    all(env, `SELECT u.id,u.email,u.name,u.role,u.banned,u.plan_exempt,u.plan_id,u.plan_expires,u.family_owner_id,u.created_at,u.last_seen,pl.name plan_name FROM users u LEFT JOIN plans pl ON pl.id=u.plan_id WHERE (u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\') ${where} ORDER BY u.created_at DESC LIMIT 100 OFFSET ?2`, like, offset),
    one(env, `SELECT COUNT(*) c FROM users u WHERE (u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\') ${where}`, like),
  ]);
  return json({ users, total: total.c, now: now() });
}, 'admin');
route('GET', '/api/admin/users.csv', async (req, env) => {
  const rows = await all(env, 'SELECT u.name,u.email,u.created_at,u.last_seen,u.plan_expires,u.plan_exempt,u.banned,pl.name plan_name FROM users u LEFT JOIN plans pl ON pl.id=u.plan_id ORDER BY u.created_at DESC');
  const day = (t: number): string => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '');

  const cell = (v: unknown): string => { const c = String(v ?? ''); return `"${(/^[=+\-@\t\r]/.test(c) ? `'${c}` : c).replaceAll('"', '""')}"`; };
  const lines = rows.map(r => [r.name, r.email, day(r.created_at), day(r.last_seen), r.plan_expires > now() ? r.plan_name ?? 'Tarif' : '', day(r.plan_expires > now() ? r.plan_expires : 0), r.plan_exempt ? 'ha' : '', r.banned ? 'ha' : ''].map(cell).join(','));
  return new Response(`\ufeff${['Ism,Email,Ro\'yxatdan o\'tgan,Oxirgi kirgan,Tarif,Tarif tugashi,Plansiz,Bloklangan', ...lines].join('\r\n')}\r\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="foydalanuvchilar.csv"', 'cache-control': 'no-store' } });
}, 'admin');
route('PATCH', '/api/admin/users/:id', async (req, env, { params }) => {
  const u = await first(env, 'SELECT * FROM users WHERE id=?', params.id);
  if (!u) return fail(404, 'Foydalanuvchi topilmadi');
  const b = await body(req);
  if (b.planExempt !== undefined) await run(env, 'UPDATE users SET plan_exempt=? WHERE id=?', b.planExempt ? 1 : 0, u.id);
  if (b.banned !== undefined) {
    if (u.role === 'admin') fail(400, 'Adminni bloklab bo\'lmaydi');
    await env.DB.batch([st(env, 'UPDATE users SET banned=? WHERE id=?', b.banned ? 1 : 0, u.id), st(env, 'DELETE FROM sessions WHERE user_id=?', u.id)]);
  }
  if (b.grantPlanId) {
    const plan = await first(env, 'SELECT * FROM plans WHERE id=?', str(b.grantPlanId, 40));
    if (!plan) return fail(404, 'Tarif topilmadi');
    await run(env, 'UPDATE users SET plan_id=?,plan_expires=? WHERE id=?', plan.id, Math.max(now(), u.plan_expires) + plan.days * DAY, u.id);
  }
  if (b.revokePlan) await env.DB.batch([st(env, 'UPDATE users SET plan_id=NULL,plan_expires=0 WHERE id=?', u.id), st(env, 'UPDATE users SET family_owner_id=NULL WHERE family_owner_id=?', u.id)]);
  return json({ ok: true });
}, 'admin');

route('DELETE', '/api/admin/users/:id', async (req, env, { params }) => {
  const u = await first(env, 'SELECT role,banned FROM users WHERE id=?', params.id);
  if (!u) return fail(404, 'Foydalanuvchi topilmadi');
  if (u.role === 'admin') return fail(400, 'Adminni o\'chirib bo\'lmaydi');
  if (!u.banned) return fail(409, 'Avval akkauntni bloklang');
  await env.DB.batch([st(env, 'UPDATE users SET family_owner_id=NULL WHERE family_owner_id=?', params.id), st(env, 'DELETE FROM users WHERE id=?', params.id)]);
  return json({ ok: true });
}, 'admin');

route('GET', '/api/admin/plans', async (req, env) => json({ plans: (await all(env, 'SELECT * FROM plans ORDER BY sort,price_uzs')).map(mapPlan) }), 'admin');
route('POST', '/api/admin/plans', async (req, env) => {
  const b = await body(req);
  const id = b.id ? str(b.id, 40) : uid();
  const name = str(b.name, 40);
  if (!name) return fail(400, 'Tarif nomini kiriting');
  await run(env, `INSERT INTO plans (id,name,tagline,price_uzs,days,seats,features,active,sort,offline_limit,offline_recent) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET offline_limit=excluded.offline_limit,offline_recent=excluded.offline_recent,name=excluded.name,tagline=excluded.tagline,price_uzs=excluded.price_uzs,days=excluded.days,seats=excluded.seats,features=excluded.features,active=excluded.active,sort=excluded.sort`,
    id, name, str(b.tagline, 120), int(b.price, 0, 100000000, 'Narx'), int(b.days ?? 30, 1, 3660, 'Muddat'), int(b.seats ?? 1, 1, 20, "Joylar soni"), str(b.features, 1000), b.active === false ? 0 : 1, int(b.sort ?? 0, 0, 1000, 'Tartib'), int(b.offlineLimit ?? 0, -1, 100000, 'Oflayn limit'), int(b.offlineRecent ?? 0, 0, 1000, 'Oxirgi qo\'shiqlar soni'));
  return json({ id });
}, 'admin');

route('GET', '/api/admin/payments', async (req, env) => json({
  payments: await all(env, "SELECT p.*,u.name user_name,u.email,pl.name plan_name FROM payments p JOIN users u ON u.id=p.user_id JOIN plans pl ON pl.id=p.plan_id WHERE NOT (p.provider='click' AND p.status='pending') ORDER BY p.status='pending' DESC,p.created_at DESC LIMIT 200"),
}), 'admin');
route('POST', '/api/admin/payments/:id/:decision', async (req, env, { params }) => {
  if (!['approve', 'reject'].includes(params.decision)) fail(404, 'Topilmadi');
  const p = await first(env, 'SELECT p.*,pl.days FROM payments p JOIN plans pl ON pl.id=p.plan_id WHERE p.id=?', params.id);
  if (!p) return fail(404, 'To\'lov topilmadi');

  const r = await run(env, "UPDATE payments SET status=?,decided_at=? WHERE id=? AND status='pending'", params.decision === 'approve' ? 'approved' : 'rejected', now(), p.id);
  if (!r.meta.changes) fail(409, 'To\'lov allaqachon ko\'rib chiqilgan');
  if (params.decision === 'approve') await grantPaid(env, p);
  return json({ ok: true });
}, 'admin');

const httpUrl = (v: unknown): string => {
  const s = str(v, 500);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { if (['http:', 'https:'].includes(new URL(s).protocol)) return s; } catch {  }
  return fail(400, "Havola noto'g'ri");
};
route('GET', '/api/admin/ads', async (req, env) => json({ ads: await all(env, 'SELECT * FROM ads ORDER BY created_at DESC') }), 'admin');
route('POST', '/api/admin/ads', async (req, env) => {
  const b = await body(req);
  const title = str(b.title, 120);
  if (!title) return fail(400, 'Reklama sarlavhasini kiriting');
  let duration = int(b.duration ?? 15, 3, 60, 'Davomiylik');
  let audio = null;
  if (b.audioKey) {
    audio = uploadKey(b.audioKey);
    if (!audio.startsWith('adaudio/')) fail(400, 'Fayl kaliti noto\'g\'ri');
    duration = Math.ceil((await inspectWav(env, audio)).duration);
  }
  await run(env, 'INSERT INTO ads (id,title,body,image_key,audio_key,duration,cta_label,cta_url,track_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    uid(), title, str(b.body, 300), coverKey(b.imageKey), audio, duration, str(b.ctaLabel, 40), httpUrl(b.ctaUrl), str(b.trackId, 40) || null, now());
  return json({ ok: true }, 201);
}, 'admin');
route('PATCH', '/api/admin/ads/:id', async (req, env, { params }) => {
  await run(env, 'UPDATE ads SET active=? WHERE id=?', (await body(req)).active ? 1 : 0, params.id);
  return json({ ok: true });
}, 'admin');
route('DELETE', '/api/admin/ads/:id', async (req, env, { params }) => {
  const a = await first(env, 'SELECT audio_key,image_key FROM ads WHERE id=?', params.id);
  if (!a) return fail(404, 'Topilmadi');
  await run(env, 'DELETE FROM ads WHERE id=?', params.id);
  await env.BUCKET.delete([a.audio_key, a.image_key].filter(Boolean));
  return json({ ok: true });
}, 'admin');

const panelOnly = (req: Request): void => { if (req.headers.has('authorization')) fail(403, 'API kalitlarni faqat admin paneldan boshqarish mumkin'); };
route('GET', '/api/admin/api-keys', async (req, env) => { panelOnly(req); return json({ keys: await all(env, 'SELECT id,name,hint,created_at,last_used FROM api_keys ORDER BY created_at DESC') }); }, 'admin');
route('POST', '/api/admin/api-keys', async (req, env) => {
  panelOnly(req);
  const name = str((await body(req)).name, 60);
  if (!name) return fail(400, 'Kalit nomini kiriting');
  const key = `rk_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
  await run(env, 'INSERT INTO api_keys (id,name,key_hash,hint,created_at) VALUES (?,?,?,?,?)', uid(), name, await sha256(key), key.slice(-6), now());
  return json({ key }, 201);
}, 'admin');
route('DELETE', '/api/admin/api-keys/:id', async (req, env, { params }) => { panelOnly(req); await run(env, 'DELETE FROM api_keys WHERE id=?', params.id); return json({ ok: true }); }, 'admin');

route('GET', '/api/admin/docs', async () => json({
  auth: 'Authorization: Bearer rk_...',
  endpoints: routes.filter(r => r.guard === 'admin' && !r.path.includes('api-keys')).map(r => ({ method: r.method, path: r.path })),
}), 'admin');

const SETTING_KEYS = ['smtp_user', 'click_service_id', 'click_merchant_id', 'email_from', 'plans_enabled', 'ad_every', 'ad_seconds', 'site_name', 'hero_title', 'hero_sub', 'card_number', 'card_holder', 'support_url'];

route('GET', '/api/admin/settings', async (req, env) => { const { click_secret, smtp_pass, ...rest } = await settings(env); return json({ ...rest, click_secret_set: !!click_secret, smtp_pass_set: !!smtp_pass }); }, 'admin');
route('PATCH', '/api/admin/settings', async (req, env) => {
  const b = await body(req);
  const writes = [];
  for (const k of SETTING_KEYS) {
    if (b[k] === undefined) continue;
    let v = str(b[k], 300);
    if (k === 'plans_enabled') v = b[k] === true || b[k] === '1' ? '1' : '0';
    if (k === 'ad_every') v = String(int(b[k], 0, 50, 'Reklama chastotasi'));
    if (k === 'ad_seconds') v = String(int(b[k], 3, 60, 'Reklama davomiyligi'));
    if (k === 'support_url') v = httpUrl(b[k]);
    writes.push(st(env, 'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v));
  }
  const secret = str(b.click_secret, 200);
  if (secret) writes.push(st(env, "INSERT INTO settings (key,value) VALUES ('click_secret',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", secret));
  const smtpPass = str(b.smtp_pass, 100);
  if (smtpPass) writes.push(st(env, "INSERT INTO settings (key,value) VALUES ('smtp_pass',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", smtpPass));
  if (b.smtp_user !== undefined && str(b.smtp_user, 120) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.smtp_user, 120))) fail(400, "Gmail manzili noto'g'ri");
  if (b.email_from !== undefined && str(b.email_from, 120) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.email_from, 120))) fail(400, "Yuboruvchi email noto'g'ri");
  if (writes.length) await env.DB.batch(writes);
  return json({ ok: true });
}, 'admin');

route('GET', '/api/admin/releases', async (req, env) => json({ releases: (await all(env, 'SELECT * FROM releases ORDER BY version_code DESC')).map(mapRelease) }), 'admin');
route('POST', '/api/admin/releases', async (req, env) => {
  const q = new URL(req.url).searchParams;
  const versionCode = int(q.get('versionCode'), 1, 2100000000, 'Versiya kodi'), versionName = str(q.get('versionName'), 30);
  if (!versionName) return fail(400, 'Versiya nomini kiriting');
  const latest = await latestRelease(env);
  if (latest && versionCode <= latest.version_code) fail(409, `Versiya kodi ${latest.version_code} dan katta bo'lishi kerak`);
  const buf = await req.arrayBuffer();
  if (!isApk(new Uint8Array(buf.slice(0, 4)))) fail(415, 'Fayl APK emas');
  const key = `apk/${uid()}.apk`;
  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: 'application/vnd.android.package-archive' } });
  await run(env, 'INSERT INTO releases (id,version_code,version_name,notes,apk_key,size,sha256,force,created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(), versionCode, versionName, str(q.get('notes'), 1000), key, buf.byteLength, await sha256(buf), q.get('force') === '1' ? 1 : 0, now());
  return json({ ok: true }, 201);
}, 'admin');
route('DELETE', '/api/admin/releases/:id', async (req, env, { params }) => {
  const r = await first(env, 'SELECT apk_key FROM releases WHERE id=?', params.id);
  if (!r) return fail(404, 'Topilmadi');
  await run(env, 'DELETE FROM releases WHERE id=?', params.id);
  await env.BUCKET.delete(r.apk_key);
  return json({ ok: true });
}, 'admin');

async function cleanup(env: Env): Promise<void> {
  const t = now();
  const jobs: [string, string, number][] = [['plays', 'started_at', t - 35 * DAY], ['ad_views', 'started_at', t - 7 * DAY], ['attempts', 'at', t - DAY], ['sessions', 'expires', t], ['signups', 'expires', t], ['notices', 'created_at', t - 60 * DAY], ['oauth_codes', 'expires', t]];
  for (const [table, col, before] of jobs) {
    for (let i = 0; i < 20; i++) {
      const r = await run(env, `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${col}<? LIMIT 20000)`, before);
      if (r.meta.changes < 20000) break;
    }
  }
}

export default {
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '17 3 * * *') ctx.waitUntil(Promise.all([cleanup(env), nudgeAway(env)]));
    else ctx.waitUntil(deliverPush(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname === 'svrvs.uz') return Response.redirect(`https://rythm.svrvs.uz${url.pathname}${url.search}`, 301);
    try {
      if (url.pathname.startsWith('/media/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
        return await handleMedia(req, env, url);
      }
      if (url.pathname === '/dl/ios.mobileconfig') return await mobileconfig(req, env);
      if (url.pathname === '/dl/android') {
        const r = await latestRelease(env);
        return r ? Response.redirect(`${url.origin}${media(r.apk_key)}`, 302) : new Response('APK hali joylanmagan', { status: 404 });
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        let user: Row | null = null;
        if (/^Bearer ut_/.test(req.headers.get('authorization') || '')) {
          const need = TOKEN_ROUTES.get(`${r.method} ${r.path}`);
          if (!need) fail(403, 'Bu amal API orqali mavjud emas');
          user = await currentUser(env, req);
          if (!user) fail(401, 'API kalit noto\'g\'ri');
          if (need === 'write' && !String(user!.token_scope).split(' ').includes('write')) fail(403, 'Bu kalitda o\'zgartirish ruxsati yo\'q');
        }
        if (r.guard) {
          user = await currentUser(env, req);
          if (!user) return fail(401, 'Avval tizimga kiring');
          if (r.guard === 'admin' && user.role !== 'admin') fail(403, 'Ruxsat yo\'q');
        }
        return await r.handler(req, env, { params, user: user as Row });
      }
      return json({ error: 'Topilmadi' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Serverda xatolik yuz berdi' }, 500);
    }
  },
};
