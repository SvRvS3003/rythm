CREATE TABLE user_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, kind TEXT NOT NULL, scope TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, hint TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX user_tokens_user ON user_tokens(user_id);
CREATE TABLE oauth_codes (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, scope TEXT NOT NULL, expires INTEGER NOT NULL);
