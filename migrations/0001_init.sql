CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0, plan_exempt INTEGER NOT NULL DEFAULT 0,
  plan_id TEXT, plan_expires INTEGER NOT NULL DEFAULT 0, family_owner_id TEXT,
  plays_since_ad INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE attempts (k TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX attempts_k ON attempts(k, at);
CREATE TABLE artists (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, bio TEXT NOT NULL DEFAULT '', image_key TEXT, created_at INTEGER NOT NULL);
CREATE TABLE albums (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist_id TEXT NOT NULL REFERENCES artists(id), cover_key TEXT, year INTEGER, created_at INTEGER NOT NULL, UNIQUE(title, artist_id));
CREATE TABLE tracks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, artist_id TEXT NOT NULL REFERENCES artists(id), album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
  genre TEXT NOT NULL DEFAULT '', cover_key TEXT, audio_key TEXT NOT NULL, size INTEGER NOT NULL, duration REAL NOT NULL,
  sample_rate INTEGER NOT NULL, bit_depth INTEGER NOT NULL, channels INTEGER NOT NULL, lyrics TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1, promoted INTEGER NOT NULL DEFAULT 0, promo_text TEXT NOT NULL DEFAULT '',
  play_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX tracks_pub ON tracks(published, created_at);
CREATE TABLE likes (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, track_id));
CREATE TABLE playlists (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE playlist_tracks (playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, added_at INTEGER NOT NULL, PRIMARY KEY(playlist_id, track_id));
CREATE TABLE plays (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, started_at INTEGER NOT NULL, counted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX plays_time ON plays(started_at, counted);
CREATE INDEX plays_user ON plays(user_id, started_at);
CREATE TABLE plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', price_uzs INTEGER NOT NULL, days INTEGER NOT NULL DEFAULT 30, seats INTEGER NOT NULL DEFAULT 1, features TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ads (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', image_key TEXT, audio_key TEXT, duration INTEGER NOT NULL DEFAULT 15, cta_label TEXT NOT NULL DEFAULT '', cta_url TEXT NOT NULL DEFAULT '', track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL, active INTEGER NOT NULL DEFAULT 1, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE ad_views (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, ad_id TEXT, duration INTEGER NOT NULL, started_at INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES plans(id), amount INTEGER NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, decided_at INTEGER);
CREATE INDEX payments_status ON payments(status, created_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE releases (id TEXT PRIMARY KEY, version_code INTEGER NOT NULL UNIQUE, version_name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', apk_key TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, force INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);

INSERT INTO plans (id,name,tagline,price_uzs,days,seats,features,sort) VALUES
 ('puls','Puls','Bir kishi uchun, reklamasiz',29000,30,1,'Reklamasiz tinglash
Asl WAV sifati
Cheksiz pleylistlar',1),
 ('duet','Duet','Ikki kishiga bitta obuna',44000,30,2,'Puls imkoniyatlari
2 ta alohida akkaunt
Bitta to''lov',2),
 ('orkestr','Orkestr','Butun oila uchun',64000,30,6,'Puls imkoniyatlari
6 tagacha akkaunt
Eng tejamkor tarif',3);
INSERT INTO settings (key,value) VALUES ('plans_enabled','1'),('ad_every','3'),('ad_seconds','15'),('site_name','SvRvS Rythm'),('hero_title','Musiqani asl sifatida tinglang'),('hero_sub','Har bir qo''shiq siqilmagan WAV formatida.'),('card_number',''),('card_holder',''),('support_url','');
