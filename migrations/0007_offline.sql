ALTER TABLE plans ADD COLUMN offline_limit INTEGER NOT NULL DEFAULT 0;
UPDATE plans SET offline_limit=10, features=features||char(10)||'10 ta qo''shiq oflayn' WHERE id='duet';
UPDATE plans SET offline_limit=-1, features=features||char(10)||'Cheksiz oflayn tinglash' WHERE id='orkestr';
CREATE TABLE offline_items (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, position INTEGER NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY(user_id, track_id));
CREATE INDEX offline_track ON offline_items(track_id);
