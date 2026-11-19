-- Run once on a database created before reports were added.
-- Stores what each sold item cost the shop, so profit stays correct
-- even after the product's cost price changes later.
USE stocknest;

ALTER TABLE sale_items
  ADD COLUMN unit_cost DECIMAL(10,2) NULL AFTER unit_price;
