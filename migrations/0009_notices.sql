CREATE TABLE notices (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '/', user_id TEXT REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE INDEX notices_user ON notices(user_id, id);
CREATE TABLE push_subs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, endpoint TEXT NOT NULL, seen INTEGER NOT NULL, tickled INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX push_subs_user ON push_subs(user_id);
CREATE INDEX push_subs_tickled ON push_subs(kind, tickled);
ALTER TABLE users ADD COLUMN nudged_at INTEGER NOT NULL DEFAULT 0;
