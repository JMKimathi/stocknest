-- Run once on a database created before user profiles were added.
USE stocknest;

ALTER TABLE users
  ADD COLUMN phone VARCHAR(30) AFTER password_hash,
  ADD COLUMN avatar MEDIUMTEXT AFTER phone,
  ADD COLUMN last_login_at TIMESTAMP NULL AFTER is_active;
