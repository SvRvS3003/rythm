ALTER TABLE plans ADD COLUMN offline_recent INTEGER NOT NULL DEFAULT 0;
UPDATE plans SET offline_recent=5 WHERE id='duet';
UPDATE plans SET offline_recent=20 WHERE id='orkestr';
