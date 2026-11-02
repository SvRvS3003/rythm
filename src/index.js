// JavaScript, src/index.js, Cloudflare Workers runtime: API, R2 streaming, admin.
import { parseWav, parseRange, imageType, isApk, hex, sha256, hmac, hashPassword, safeEqual, xmlEscape } from './lib.js';

const now = () => Math.floor(Date.now() / 1000);
const uid = () => crypto.randomUUID().replaceAll('-', '');
const DAY = 86400;
const PART_SIZE = 20 * 1024 * 1024; // Worker request limit is 100 MB; big WAVs go through R2 multipart.

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const st = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, name = 'Qiymat') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${name} noto'g'ri`);
  return n;
};
const media = key => (key ? `/media/${key}` : null);

// ---------- routing ----------
const routes = [];
const route = (method, path, handler, guard = 'user') => {
  const names = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '$');
  routes.push({ method, re, names, handler, guard });
};

async function body(req) {
  try { return await req.json(); } catch { fail(400, "So'rov noto'g'ri"); }
}

// ---------- auth ----------
const cookieName = 'rythm_session';
function sessionCookie(req, token, maxAge) {
  const secure = new URL(req.url).protocol === 'https:' ? ' Secure;' : '';
  return `${cookieName}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}
async function startSession(env, req, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await run(env, 'INSERT INTO sessions (token_hash,user_id,expires) VALUES (?,?,?)', await sha256(token), userId, now() + 60 * DAY);
  return sessionCookie(req, token, 60 * DAY);
}
async function currentUser(env, req) {
  const m = new RegExp(`${cookieName}=([0-9a-f]{64})`).exec(req.headers.get('cookie') || '');
  if (!m) return null;
  return first(env, 'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.banned=0', await sha256(m[1]), now());
}
async function limited(env, key, max, windowSec) {
  const row = await first(env, 'SELECT COUNT(*) c FROM attempts WHERE k=? AND at>?', key, now() - windowSec);
  if (row.c >= max) fail(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.");
}
const note = (env, key) => run(env, 'INSERT INTO attempts (k,at) VALUES (?,?)', key, now());
const ip = req => req.headers.get('cf-connecting-ip') || 'local';

// Per-isolate read cache: hot, rarely changing reads stop reaching the single D1 primary.
const memoStore = new Map();
async function memo(key, ttlSec, fn) {
  const hit = memoStore.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  memoStore.set(key, { val, exp: Date.now() + ttlSec * 1000 });
  return val;
}
const liveSettings = env => memo('settings', 10, () => settings(env));

async function settings(env) {
  const out = {};
  for (const r of await all(env, 'SELECT key,value FROM settings')) out[r.key] = r.value;
  return out;
}

// Plan off, exempt list and admins all mean: no ads, no paywall.
async function entitlement(env, u, s) {
  if (s.plans_enabled !== '1') return { premium: true, reason: 'plans_off' };
  if (u.role === 'admin') return { premium: true, reason: 'admin' };
  if (u.plan_exempt) return { premium: true, reason: 'exempt' };
  if (u.plan_expires > now()) return { premium: true, reason: 'plan', planId: u.plan_id, expires: u.plan_expires };
  if (u.family_owner_id) {
    const o = await first(env, 'SELECT plan_id,plan_expires FROM users WHERE id=? AND banned=0', u.family_owner_id);
    if (o && o.plan_expires > now()) return { premium: true, reason: 'family', planId: o.plan_id, expires: o.plan_expires };
  }
  return { premium: false, reason: 'free' };
}
const publicUser = (u, e) => ({ id: u.id, name: u.name, email: u.email, role: u.role, entitlement: e });
const publicSettings = s => ({ siteName: s.site_name, heroTitle: s.hero_title, heroSub: s.hero_sub, plansEnabled: s.plans_enabled === '1', supportUrl: s.support_url });

route('POST', '/api/auth/register', async (req, env) => {
  await limited(env, `reg:${ip(req)}`, 20, 3600);
  const b = await body(req);
  const email = str(b.email, 120).toLowerCase(), name = str(b.name, 60), password = String(b.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Email noto'g'ri");
  if (!name) fail(400, 'Ismingizni kiriting');
  if (password.length < 8 || password.length > 200) fail(400, "Parol kamida 8 belgi bo'lsin");
  await note(env, `reg:${ip(req)}`);
  if (await first(env, 'SELECT id FROM users WHERE email=?', email)) fail(409, "Bu email allaqachon ro'yxatdan o'tgan");
  const { hash, salt } = await hashPassword(password);
  const id = uid();
  await run(env, 'INSERT INTO users (id,email,name,pass_hash,pass_salt,created_at,last_seen) VALUES (?,?,?,?,?,?,?)', id, email, name, hash, salt, now(), now());
  return json({ ok: true }, 201, { 'set-cookie': await startSession(env, req, id) });
}, null);

route('POST', '/api/auth/login', async (req, env) => {
  const b = await body(req);
  const email = str(b.email, 120).toLowerCase(), password = String(b.password ?? '');
  const key = `login:${ip(req)}:${email}`;
  await limited(env, key, 10, 900);
  // Admin credentials live in Worker secrets, so rotating the secret rotates the login.
  if (env.ADMIN_LOGIN && email === env.ADMIN_LOGIN.toLowerCase()) {
    if (!env.ADMIN_PASSWORD || !safeEqual(await sha256(password), await sha256(env.ADMIN_PASSWORD))) { await note(env, key); fail(401, "Login yoki parol noto'g'ri"); }
    await run(env, "INSERT INTO users (id,email,name,pass_hash,pass_salt,role,created_at) VALUES ('admin',?,'Admin','','','admin',?) ON CONFLICT(id) DO UPDATE SET email=excluded.email", email, now());
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, req, 'admin') });
  }
  const u = await first(env, 'SELECT * FROM users WHERE email=?', email);
  const ok = u && u.pass_hash && safeEqual((await hashPassword(password, u.pass_salt)).hash, u.pass_hash);
  if (!ok) { await note(env, key); fail(401, "Login yoki parol noto'g'ri"); }
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

route('PATCH', '/api/me', async (req, env, { user }) => {
  const b = await body(req);
  const name = str(b.name, 60);
  if (!name) fail(400, 'Ismingizni kiriting');
  await run(env, 'UPDATE users SET name=? WHERE id=?', name, user.id);
  return json({ ok: true });
});

// ---------- catalogue ----------
const TRACK_SQL = `SELECT t.id,t.title,t.artist_id,a.name artist,t.album_id,al.title album,t.genre,t.duration,t.sample_rate,t.bit_depth,t.channels,t.play_count,t.promoted,t.promo_text,t.published,t.created_at,COALESCE(t.cover_key,al.cover_key,a.image_key) cover_key
  FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id`;
const mapTrack = t => ({ id: t.id, title: t.title, artistId: t.artist_id, artist: t.artist, albumId: t.album_id, album: t.album, genre: t.genre, duration: t.duration, sampleRate: t.sample_rate, bitDepth: t.bit_depth, channels: t.channels, plays: t.play_count, promoted: !!t.promoted, promoText: t.promo_text, published: !!t.published, cover: media(t.cover_key), createdAt: t.created_at });
const tracks = async (env, where, ...a) => (await all(env, `${TRACK_SQL} ${where}`, ...a)).map(mapTrack);
const mapAlbum = a => ({ id: a.id, title: a.title, artistId: a.artist_id, artist: a.artist, year: a.year, cover: media(a.cover_key) });
const mapArtist = a => ({ id: a.id, name: a.name, bio: a.bio, image: media(a.image_key) });
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
  // The admin sees a new upload at once; listeners within 30 s.
  const [shared, recent] = await Promise.all([
    user.role === 'admin' ? loadShared() : memo('home', 30, loadShared),
    tracks(env, 'WHERE t.published=1 AND t.id IN (SELECT track_id FROM plays WHERE user_id=? ORDER BY started_at DESC LIMIT 40) LIMIT 8', user.id),
  ]);
  return json({ ...shared, recent });
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
  if (!t) fail(404, 'Qo\'shiq topilmadi');
  const row = await first(env, 'SELECT lyrics FROM tracks WHERE id=?', params.id);
  return json({ ...t, lyrics: row.lyrics });
});

route('GET', '/api/artists/:id', async (req, env, { params }) => {
  const a = await first(env, 'SELECT * FROM artists WHERE id=?', params.id);
  if (!a) fail(404, 'Ijrochi topilmadi');
  const [top, albums] = await Promise.all([
    tracks(env, 'WHERE t.published=1 AND t.artist_id=? ORDER BY t.play_count DESC LIMIT 50', params.id),
    all(env, `${ALBUM_SQL} WHERE al.artist_id=? ORDER BY al.year DESC`, params.id),
  ]);
  return json({ ...mapArtist(a), tracks: top, albums: albums.map(mapAlbum) });
});

route('GET', '/api/albums/:id', async (req, env, { params }) => {
  const a = await first(env, `${ALBUM_SQL} WHERE al.id=?`, params.id);
  if (!a) fail(404, 'Albom topilmadi');
  return json({ ...mapAlbum(a), tracks: await tracks(env, 'WHERE t.published=1 AND t.album_id=? ORDER BY t.created_at', params.id) });
});

// ---------- library ----------
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
  if (!name) fail(400, 'Pleylist nomini kiriting');
  const id = uid();
  await run(env, 'INSERT INTO playlists (id,user_id,name,created_at) VALUES (?,?,?,?)', id, user.id, name, now());
  return json({ id, name }, 201);
});
async function ownedPlaylist(env, id, user) {
  const p = await first(env, 'SELECT * FROM playlists WHERE id=?', id);
  if (!p || p.user_id !== user.id) fail(404, 'Pleylist topilmadi');
  return p;
}
route('GET', '/api/playlists/:id', async (req, env, { user, params }) => {
  const p = await first(env, 'SELECT * FROM playlists WHERE id=?', params.id);
  if (!p || (p.user_id !== user.id && !p.public)) fail(404, 'Pleylist topilmadi');
  return json({
    id: p.id, name: p.name, public: !!p.public, mine: p.user_id === user.id,
    tracks: await tracks(env, 'JOIN playlist_tracks x ON x.track_id=t.id WHERE x.playlist_id=? AND t.published=1 ORDER BY x.added_at', p.id),
  });
});
route('PATCH', '/api/playlists/:id', async (req, env, { user, params }) => {
  const p = await ownedPlaylist(env, params.id, user);
  const b = await body(req);
  const name = b.name === undefined ? p.name : str(b.name, 80);
  if (!name) fail(400, 'Pleylist nomini kiriting');
  // Public playlists appear on everyone's home page, so only the admin can publish.
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

// ---------- playback ----------
const streamSig = (env, trackId, userId, exp) => hmac(env.SIGNING_SECRET, `${trackId}.${userId}.${exp}`);

// Ads are decided here, not in the client: without a completed ad view no stream URL is issued.
route('POST', '/api/play', async (req, env, { user }) => {
  const trackId = str((await body(req)).trackId, 40);
  const t = await first(env, 'SELECT id,duration FROM tracks WHERE id=? AND published=1', trackId);
  if (!t) fail(404, 'Qo\'shiq topilmadi');
  const s = await liveSettings(env);
  const e = await entitlement(env, user, s);
  const every = Number(s.ad_every) || 0;
  if (!e.premium && every > 0 && user.plays_since_ad >= every) {
    const ad = await first(env, 'SELECT * FROM ads WHERE active=1 ORDER BY RANDOM() LIMIT 1');
    const duration = ad ? ad.duration : Number(s.ad_seconds) || 15;
    const viewId = uid();
    const writes = [st(env, 'INSERT INTO ad_views (id,user_id,ad_id,duration,started_at) VALUES (?,?,?,?,?)', viewId, user.id, ad?.id ?? null, duration, now())];
    if (ad) writes.push(st(env, 'UPDATE ads SET impressions=impressions+1 WHERE id=?', ad.id));
    await env.DB.batch(writes);
    return json({ ad: { viewId, duration, title: ad?.title ?? `${s.site_name} reklamasiz`, body: ad?.body ?? 'Tarif oling va musiqani reklamasiz, uzluksiz tinglang.', image: media(ad?.image_key), audio: media(ad?.audio_key), ctaLabel: ad?.cta_label ?? '', ctaUrl: ad?.cta_url ?? '', trackId: ad?.track_id ?? null } });
  }
  const t0 = now(), exp = t0 + Math.ceil(t.duration) + 6 * 3600;
  // Paying listeners cause no write here; a start is only stored once it counts, keeping D1 writes and size down.
  if (!e.premium) await run(env, 'UPDATE users SET plays_since_ad=plays_since_ad+1,last_seen=? WHERE id=?', t0, user.id);
  else if (t0 - user.last_seen > 300) await run(env, 'UPDATE users SET last_seen=? WHERE id=?', t0, user.id);
  const playId = `${t.id}.${t0}.${await hmac(env.SIGNING_SECRET, `play.${t.id}.${user.id}.${t0}`)}`;
  return json({ playId, url: `/media/stream/${t.id}?u=${user.id}&e=${exp}&s=${await streamSig(env, t.id, user.id, exp)}` });
});

// Spotify counts a stream after 30 s; shorter tracks count at half length.
route('POST', '/api/plays/:id/counted', async (req, env, { user, params }) => {
  const [trackId, startedRaw, sig] = params.id.split('.');
  const started = Number(startedRaw);
  if (!sig || !safeEqual(sig, await hmac(env.SIGNING_SECRET, `play.${trackId}.${user.id}.${startedRaw}`))) fail(404, 'Topilmadi');
  const t = await first(env, 'SELECT duration FROM tracks WHERE id=?', trackId);
  if (!t) fail(404, 'Topilmadi');
  if (now() - started < Math.min(30, t.duration / 2) - 2) return json({ counted: false });
  // The signature is the row id, so a repeated report cannot count twice.
  const r = await run(env, 'INSERT OR IGNORE INTO plays (id,user_id,track_id,started_at,counted) VALUES (?,?,?,?,1)', sig, user.id, trackId, started);
  if (r.meta.changes) await run(env, 'UPDATE tracks SET play_count=play_count+1 WHERE id=?', trackId);
  return json({ counted: true });
});

route('POST', '/api/ads/:view/complete', async (req, env, { user, params }) => {
  const v = await first(env, 'SELECT * FROM ad_views WHERE id=? AND user_id=?', params.view, user.id);
  if (!v) fail(404, 'Topilmadi');
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

// ---------- plans & payments ----------
const mapPlan = p => ({ id: p.id, name: p.name, tagline: p.tagline, price: p.price_uzs, days: p.days, seats: p.seats, features: p.features.split('\n').filter(Boolean), active: !!p.active, sort: p.sort });

route('GET', '/api/plans', async (req, env, { user }) => {
  const s = await settings(env);
  const [plans, pending, family] = await Promise.all([
    all(env, 'SELECT * FROM plans WHERE active=1 ORDER BY sort,price_uzs'),
    first(env, "SELECT p.id,p.plan_id,p.reference,p.created_at FROM payments p WHERE p.user_id=? AND p.status='pending'", user.id),
    all(env, 'SELECT id,name,email FROM users WHERE family_owner_id=?', user.id),
  ]);
  return json({ plans: plans.map(mapPlan), pending, family, card: { number: s.card_number, holder: s.card_holder } });
});
route('POST', '/api/payments', async (req, env, { user }) => {
  const b = await body(req);
  const plan = await first(env, 'SELECT * FROM plans WHERE id=? AND active=1', str(b.planId, 40));
  if (!plan) fail(404, 'Tarif topilmadi');
  const reference = str(b.reference, 120);
  if (reference.length < 3) fail(400, 'To\'lov ma\'lumotini kiriting (chek raqami yoki karta oxirgi 4 raqami)');
  if (await first(env, "SELECT id FROM payments WHERE user_id=? AND status='pending'", user.id)) fail(409, 'Oldingi so\'rovingiz hali ko\'rib chiqilmoqda');
  await run(env, 'INSERT INTO payments (id,user_id,plan_id,amount,reference,created_at) VALUES (?,?,?,?,?,?)', uid(), user.id, plan.id, plan.price_uzs, reference, now());
  return json({ ok: true }, 201);
});
route('POST', '/api/family', async (req, env, { user }) => {
  if (user.plan_expires <= now()) fail(403, 'Faol tarif kerak');
  const plan = await first(env, 'SELECT seats FROM plans WHERE id=?', user.plan_id);
  const taken = await first(env, 'SELECT COUNT(*) c FROM users WHERE family_owner_id=?', user.id);
  if (!plan || taken.c + 1 >= plan.seats) fail(409, "Tarifda bo'sh joy qolmadi");
  const m = await first(env, 'SELECT id,family_owner_id FROM users WHERE email=? AND id<>?', str((await body(req)).email, 120), user.id);
  if (!m) fail(404, "Bu email bilan foydalanuvchi topilmadi. Avval ro'yxatdan o'tsin.");
  if (m.family_owner_id) fail(409, "Bu foydalanuvchi boshqa tarifga qo'shilgan");
  await run(env, 'UPDATE users SET family_owner_id=? WHERE id=?', user.id, m.id);
  return json({ ok: true });
});
route('DELETE', '/api/family/:id', async (req, env, { user, params }) => {
  await run(env, 'UPDATE users SET family_owner_id=NULL WHERE id=? AND family_owner_id=?', params.id, user.id);
  return json({ ok: true });
});

// ---------- media ----------
async function serveObject(env, req, key, contentType, extra = {}) {
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
async function handleMedia(req, env, url) {
  const stream = /^\/media\/stream\/([0-9a-f]{32})$/.exec(url.pathname);
  if (stream) {
    const q = url.searchParams, exp = Number(q.get('e')), u = q.get('u') || '';
    const good = exp > now() && safeEqual(q.get('s') || '', await streamSig(env, stream[1], u, exp));
    if (!good) return new Response('Havola eskirgan', { status: 403 });
    const t = await first(env, 'SELECT audio_key FROM tracks WHERE id=?', stream[1]);
    if (!t) return new Response('Topilmadi', { status: 404 });
    return serveObject(env, req, t.audio_key, 'audio/wav', { 'cache-control': 'private, max-age=3600' });
  }
  const pub = /^\/media\/((covers|adaudio|apk)\/[0-9a-f]{32}\.(jpg|png|webp|wav|apk))$/.exec(url.pathname);
  if (!pub) return new Response('Topilmadi', { status: 404 });
  const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', wav: 'audio/wav', apk: 'application/vnd.android.package-archive' };
  const extra = pub[3] === 'apk' ? { 'content-disposition': 'attachment; filename="SvRvS-Rythm.apk"', 'cache-control': 'public, max-age=3600' } : { 'cache-control': 'public, max-age=31536000, immutable' };
  return serveObject(env, req, pub[1], types[pub[3]], extra);
}

// ---------- install ----------
async function mobileconfig(req, env) {
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
const latestRelease = env => first(env, 'SELECT * FROM releases ORDER BY version_code DESC LIMIT 1');
const mapRelease = r => r && ({ id: r.id, versionCode: r.version_code, versionName: r.version_name, notes: r.notes, url: media(r.apk_key), size: r.size, sha256: r.sha256, force: !!r.force, createdAt: r.created_at });

route('GET', '/api/app/latest', async (req, env) => json({ release: mapRelease(await latestRelease(env)) }), null);

// ---------- admin ----------
route('GET', '/api/admin/stats', async (req, env) => {
  const t = now();
  const [users, new7, active1, active30, paid, exempt, plays, plays7, storage, pendingPay, revenue, top7, topAll, daily, signups, revenuePlans] = await Promise.all([
    first(env, 'SELECT COUNT(*) c FROM users'),
    first(env, 'SELECT COUNT(*) c FROM users WHERE created_at>?', t - 7 * DAY),
    first(env, 'SELECT COUNT(*) c FROM users WHERE last_seen>?', t - DAY),
    first(env, 'SELECT COUNT(*) c FROM users WHERE last_seen>?', t - 30 * DAY),
    first(env, 'SELECT COUNT(*) c FROM users WHERE plan_expires>?', t),
    first(env, 'SELECT COUNT(*) c FROM users WHERE plan_exempt=1'),
    first(env, 'SELECT COALESCE(SUM(play_count),0) c FROM tracks'),
    first(env, 'SELECT COUNT(*) c FROM plays WHERE counted=1 AND started_at>?', t - 7 * DAY),
    first(env, 'SELECT COALESCE(SUM(size),0) bytes,COUNT(*) tracks,COALESCE(SUM(duration),0) seconds FROM tracks'),
    first(env, "SELECT COUNT(*) c FROM payments WHERE status='pending'"),
    first(env, "SELECT COALESCE(SUM(amount),0) c FROM payments WHERE status='approved' AND decided_at>?", t - 30 * DAY),
    all(env, `SELECT t.id,t.title,a.name artist,COUNT(*) plays FROM plays p JOIN tracks t ON t.id=p.track_id JOIN artists a ON a.id=t.artist_id WHERE p.counted=1 AND p.started_at>? GROUP BY t.id ORDER BY plays DESC LIMIT 10`, t - 7 * DAY),
    all(env, 'SELECT t.id,t.title,a.name artist,t.play_count plays FROM tracks t JOIN artists a ON a.id=t.artist_id ORDER BY t.play_count DESC LIMIT 10'),
    all(env, "SELECT date(started_at,'unixepoch') d,COUNT(*) c FROM plays WHERE counted=1 AND started_at>? GROUP BY d ORDER BY d", t - 30 * DAY),
    all(env, "SELECT date(created_at,'unixepoch') d,COUNT(*) c FROM users WHERE created_at>? GROUP BY d ORDER BY d", t - 30 * DAY),
    all(env, "SELECT plan_id,COUNT(*) c FROM users WHERE plan_expires>? GROUP BY plan_id", t),
  ]);
  return json({ users: users.c, newUsers7: new7.c, active1: active1.c, active30: active30.c, paid: paid.c, exempt: exempt.c, plays: plays.c, plays7: plays7.c, storage, pendingPayments: pendingPay.c, revenue30: revenue.c, top7, topAll, daily, signups, planCounts: revenuePlans });
}, 'admin');

// --- multipart WAV upload ---
const uploadKey = key => /^(audio|adaudio)\/[0-9a-f]{32}\.wav$/.test(key) ? key : fail(400, 'Fayl kaliti noto\'g\'ri');

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
    try { parseWav(new Uint8Array(buf)); } catch (e) { await up.abort().catch(() => {}); fail(415, `Faqat WAV qabul qilinadi: ${e.message}`); }
  }
  return json(await up.uploadPart(n, buf));
}, 'admin');

async function inspectWav(env, key) {
  const head = await env.BUCKET.head(key);
  if (!head) fail(404, 'Fayl topilmadi');
  const obj = await env.BUCKET.get(key, { range: { offset: 0, length: Math.min(head.size, 4 * 1024 * 1024) } });
  return { ...parseWav(new Uint8Array(await obj.arrayBuffer()), head.size), size: head.size };
}
route('POST', '/api/admin/uploads/complete', async (req, env) => {
  const b = await body(req);
  const key = uploadKey(b.key);
  const up = env.BUCKET.resumeMultipartUpload(key, str(b.uploadId, 2000));
  await up.complete(b.parts);
  // Final gate: anything that is not a complete PCM WAV leaves the bucket here.
  try { return json({ key, ...await inspectWav(env, key) }); } catch (e) {
    await env.BUCKET.delete(key);
    fail(415, `Faqat WAV qabul qilinadi: ${e.message}`);
  }
}, 'admin');

route('POST', '/api/admin/images', async (req, env) => {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) fail(413, 'Rasm 8 MB dan oshmasin');
  const type = imageType(new Uint8Array(buf.slice(0, 16)));
  if (!type) fail(415, 'Rasm JPG, PNG yoki WEBP bo\'lsin');
  const key = `covers/${uid()}.${type}`;
  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: `image/${type === 'jpg' ? 'jpeg' : type}` } });
  return json({ key, url: media(key) }, 201);
}, 'admin');
const coverKey = v => {
  if (v === null || v === undefined || v === '') return null;
  return /^covers\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(v) ? v : fail(400, 'Rasm kaliti noto\'g\'ri');
};

async function artistId(env, name) {
  const n = str(name, 100);
  if (!n) fail(400, 'Ijrochi nomini kiriting');
  const found = await first(env, 'SELECT id FROM artists WHERE name=?', n);
  if (found) return found.id;
  const id = uid();
  await run(env, 'INSERT INTO artists (id,name,created_at) VALUES (?,?,?)', id, n, now());
  return id;
}
async function albumId(env, title, artist, cover, year) {
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
  if (!t) fail(404, 'Qo\'shiq topilmadi');
  const row = await first(env, 'SELECT lyrics,cover_key FROM tracks WHERE id=?', params.id);
  return json({ ...t, lyrics: row.lyrics, coverKey: row.cover_key });
}, 'admin');

route('POST', '/api/admin/tracks', async (req, env) => {
  const b = await body(req);
  const key = uploadKey(b.key);
  if (!key.startsWith('audio/')) fail(400, 'Fayl kaliti noto\'g\'ri');
  const w = await inspectWav(env, key);
  const title = str(b.title, 160);
  if (!title) fail(400, 'Qo\'shiq nomini kiriting');
  const cover = coverKey(b.coverKey);
  const artist = await artistId(env, b.artist);
  const album = await albumId(env, b.album, artist, cover, b.year ? int(b.year, 1900, 2100, 'Yil') : null);
  const id = uid();
  await run(env, 'INSERT INTO tracks (id,title,artist_id,album_id,genre,cover_key,audio_key,size,duration,sample_rate,bit_depth,channels,lyrics,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, title, artist, album, str(b.genre, 60), cover, key, w.size, w.duration, w.sampleRate, w.bitDepth, w.channels, str(b.lyrics, 20000), b.published === false ? 0 : 1, now());
  return json({ id }, 201);
}, 'admin');

route('PATCH', '/api/admin/tracks/:id', async (req, env, { params }) => {
  const t = await first(env, 'SELECT * FROM tracks WHERE id=?', params.id);
  if (!t) fail(404, 'Qo\'shiq topilmadi');
  const b = await body(req);
  const cover = b.coverKey === undefined ? t.cover_key : coverKey(b.coverKey);
  const artist = b.artist === undefined ? t.artist_id : await artistId(env, b.artist);
  const album = b.album === undefined ? t.album_id : await albumId(env, b.album, artist, cover, null);
  const title = b.title === undefined ? t.title : str(b.title, 160);
  if (!title) fail(400, 'Qo\'shiq nomini kiriting');
  await run(env, 'UPDATE tracks SET title=?,artist_id=?,album_id=?,genre=?,cover_key=?,lyrics=?,published=?,promoted=?,promo_text=? WHERE id=?',
    title, artist, album, b.genre === undefined ? t.genre : str(b.genre, 60), cover, b.lyrics === undefined ? t.lyrics : str(b.lyrics, 20000),
    b.published === undefined ? t.published : (b.published ? 1 : 0), b.promoted === undefined ? t.promoted : (b.promoted ? 1 : 0),
    b.promoText === undefined ? t.promo_text : str(b.promoText, 160), t.id);
  return json({ ok: true });
}, 'admin');

route('DELETE', '/api/admin/tracks/:id', async (req, env, { params }) => {
  const t = await first(env, 'SELECT audio_key FROM tracks WHERE id=?', params.id);
  if (!t) fail(404, 'Qo\'shiq topilmadi');
  await run(env, 'DELETE FROM tracks WHERE id=?', params.id);
  await env.BUCKET.delete(t.audio_key);
  return json({ ok: true });
}, 'admin');

route('PATCH', '/api/admin/artists/:id', async (req, env, { params }) => {
  const a = await first(env, 'SELECT * FROM artists WHERE id=?', params.id);
  if (!a) fail(404, 'Ijrochi topilmadi');
  const b = await body(req);
  await run(env, 'UPDATE artists SET name=?,bio=?,image_key=? WHERE id=?', str(b.name ?? a.name, 100) || a.name, str(b.bio ?? a.bio, 4000), b.imageKey === undefined ? a.image_key : coverKey(b.imageKey), a.id);
  return json({ ok: true });
}, 'admin');
route('GET', '/api/admin/artists', async (req, env) => json({ artists: (await all(env, 'SELECT a.*,(SELECT COUNT(*) FROM tracks t WHERE t.artist_id=a.id) tracks FROM artists a ORDER BY a.name')).map(a => ({ ...mapArtist(a), tracks: a.tracks, imageKey: a.image_key })) }), 'admin');

route('GET', '/api/admin/users', async (req, env) => {
  const p = new URL(req.url).searchParams;
  const q = str(p.get('q'), 80), filter = p.get('filter');
  const like = `%${q.replace(/[\\%_]/g, c => '\\' + c)}%`;
  const where = { exempt: 'AND u.plan_exempt=1', paid: `AND u.plan_expires>${now()}`, banned: 'AND u.banned=1' }[filter] || '';
  const users = await all(env, `SELECT u.id,u.email,u.name,u.role,u.banned,u.plan_exempt,u.plan_id,u.plan_expires,u.family_owner_id,u.created_at,u.last_seen,p.name plan_name FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE (u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\') ${where} ORDER BY u.created_at DESC LIMIT 200`, like);
  return json({ users, now: now() });
}, 'admin');
route('PATCH', '/api/admin/users/:id', async (req, env, { params }) => {
  const u = await first(env, 'SELECT * FROM users WHERE id=?', params.id);
  if (!u) fail(404, 'Foydalanuvchi topilmadi');
  const b = await body(req);
  if (b.planExempt !== undefined) await run(env, 'UPDATE users SET plan_exempt=? WHERE id=?', b.planExempt ? 1 : 0, u.id);
  if (b.banned !== undefined) {
    if (u.role === 'admin') fail(400, 'Adminni bloklab bo\'lmaydi');
    await env.DB.batch([st(env, 'UPDATE users SET banned=? WHERE id=?', b.banned ? 1 : 0, u.id), st(env, 'DELETE FROM sessions WHERE user_id=?', u.id)]);
  }
  if (b.grantPlanId) {
    const plan = await first(env, 'SELECT * FROM plans WHERE id=?', str(b.grantPlanId, 40));
    if (!plan) fail(404, 'Tarif topilmadi');
    await run(env, 'UPDATE users SET plan_id=?,plan_expires=? WHERE id=?', plan.id, Math.max(now(), u.plan_expires) + plan.days * DAY, u.id);
  }
  if (b.revokePlan) await env.DB.batch([st(env, 'UPDATE users SET plan_id=NULL,plan_expires=0 WHERE id=?', u.id), st(env, 'UPDATE users SET family_owner_id=NULL WHERE family_owner_id=?', u.id)]);
  return json({ ok: true });
}, 'admin');

route('GET', '/api/admin/plans', async (req, env) => json({ plans: (await all(env, 'SELECT * FROM plans ORDER BY sort,price_uzs')).map(mapPlan) }), 'admin');
route('POST', '/api/admin/plans', async (req, env) => {
  const b = await body(req);
  const id = b.id ? str(b.id, 40) : uid();
  const name = str(b.name, 40);
  if (!name) fail(400, 'Tarif nomini kiriting');
  await run(env, `INSERT INTO plans (id,name,tagline,price_uzs,days,seats,features,active,sort) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,tagline=excluded.tagline,price_uzs=excluded.price_uzs,days=excluded.days,seats=excluded.seats,features=excluded.features,active=excluded.active,sort=excluded.sort`,
    id, name, str(b.tagline, 120), int(b.price, 0, 100000000, 'Narx'), int(b.days ?? 30, 1, 3660, 'Muddat'), int(b.seats ?? 1, 1, 20, "Joylar soni"), str(b.features, 1000), b.active === false ? 0 : 1, int(b.sort ?? 0, 0, 1000, 'Tartib'));
  return json({ id });
}, 'admin');

route('GET', '/api/admin/payments', async (req, env) => json({
  payments: await all(env, "SELECT p.*,u.name user_name,u.email,pl.name plan_name FROM payments p JOIN users u ON u.id=p.user_id JOIN plans pl ON pl.id=p.plan_id ORDER BY p.status='pending' DESC,p.created_at DESC LIMIT 200"),
}), 'admin');
route('POST', '/api/admin/payments/:id/:decision', async (req, env, { params }) => {
  if (!['approve', 'reject'].includes(params.decision)) fail(404, 'Topilmadi');
  const p = await first(env, 'SELECT p.*,pl.days FROM payments p JOIN plans pl ON pl.id=p.plan_id WHERE p.id=?', params.id);
  if (!p) fail(404, 'To\'lov topilmadi');
  // The status guard makes a double click unable to extend a plan twice.
  const r = await run(env, "UPDATE payments SET status=?,decided_at=? WHERE id=? AND status='pending'", params.decision === 'approve' ? 'approved' : 'rejected', now(), p.id);
  if (!r.meta.changes) fail(409, 'To\'lov allaqachon ko\'rib chiqilgan');
  if (params.decision === 'approve') {
    const u = await first(env, 'SELECT plan_expires FROM users WHERE id=?', p.user_id);
    await run(env, 'UPDATE users SET plan_id=?,plan_expires=? WHERE id=?', p.plan_id, Math.max(now(), u.plan_expires) + p.days * DAY, p.user_id);
  }
  return json({ ok: true });
}, 'admin');

const httpUrl = v => {
  const s = str(v, 500);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { if (['http:', 'https:'].includes(new URL(s).protocol)) return s; } catch { /* falls through */ }
  fail(400, "Havola noto'g'ri");
};
route('GET', '/api/admin/ads', async (req, env) => json({ ads: await all(env, 'SELECT * FROM ads ORDER BY created_at DESC') }), 'admin');
route('POST', '/api/admin/ads', async (req, env) => {
  const b = await body(req);
  const title = str(b.title, 120);
  if (!title) fail(400, 'Reklama sarlavhasini kiriting');
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
  if (!a) fail(404, 'Topilmadi');
  await run(env, 'DELETE FROM ads WHERE id=?', params.id);
  await env.BUCKET.delete([a.audio_key, a.image_key].filter(Boolean));
  return json({ ok: true });
}, 'admin');

const SETTING_KEYS = ['plans_enabled', 'ad_every', 'ad_seconds', 'site_name', 'hero_title', 'hero_sub', 'card_number', 'card_holder', 'support_url'];
route('GET', '/api/admin/settings', async (req, env) => json(await settings(env)), 'admin');
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
  if (writes.length) await env.DB.batch(writes);
  return json({ ok: true });
}, 'admin');

route('GET', '/api/admin/releases', async (req, env) => json({ releases: (await all(env, 'SELECT * FROM releases ORDER BY version_code DESC')).map(mapRelease) }), 'admin');
route('POST', '/api/admin/releases', async (req, env) => {
  const q = new URL(req.url).searchParams;
  const versionCode = int(q.get('versionCode'), 1, 2100000000, 'Versiya kodi'), versionName = str(q.get('versionName'), 30);
  if (!versionName) fail(400, 'Versiya nomini kiriting');
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
  if (!r) fail(404, 'Topilmadi');
  await run(env, 'DELETE FROM releases WHERE id=?', params.id);
  await env.BUCKET.delete(r.apk_key);
  return json({ ok: true });
}, 'admin');

// ---------- entry ----------
// D1 has a hard 10 GB limit. Stats read 30 days of plays; all-time counts live on tracks.play_count.
async function cleanup(env) {
  const t = now();
  const jobs = [['plays', 'started_at', t - 35 * DAY], ['ad_views', 'started_at', t - 7 * DAY], ['attempts', 'at', t - DAY], ['sessions', 'expires', t]];
  for (const [table, col, before] of jobs) {
    for (let i = 0; i < 20; i++) {
      const r = await run(env, `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${col}<? LIMIT 20000)`, before);
      if (r.meta.changes < 20000) break;
    }
  }
}

export default {
  scheduled(event, env, ctx) { ctx.waitUntil(cleanup(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
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
        let user = null;
        if (r.guard) {
          user = await currentUser(env, req);
          if (!user) fail(401, 'Avval tizimga kiring');
          if (r.guard === 'admin' && user.role !== 'admin') fail(403, 'Ruxsat yo\'q');
        }
        return await r.handler(req, env, { params, user });
      }
      return json({ error: 'Topilmadi' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Serverda xatolik yuz berdi' }, 500);
    }
  },
};
