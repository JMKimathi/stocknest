-- Run this once on a database that was created BEFORE products could be archived.
-- (A fresh database built from schema.sql already has this column.)
USE stocknest;

ALTER TABLE products
  ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER unit_price;
