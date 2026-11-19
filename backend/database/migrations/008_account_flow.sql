-- Run once on a database created before sign-up, approval and password resets were added.
USE stocknest;

ALTER TABLE users
  -- 0 = signed up on the website and still waiting for an admin to approve
  ADD COLUMN is_approved TINYINT NOT NULL DEFAULT 1 AFTER is_active,
  -- 1 = must choose a new password at next sign-in (new account or reset by admin)
  ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 AFTER is_approved;
