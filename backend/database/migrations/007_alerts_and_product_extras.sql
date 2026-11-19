-- Run once on a database created before alerts and product pictures/barcodes were added.
USE stocknest;

ALTER TABLE products
  ADD COLUMN barcode VARCHAR(64) NULL UNIQUE AFTER sku,
  ADD COLUMN image MEDIUMTEXT NULL AFTER description;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,        -- low_stock, out_of_stock, po_overdue, po_received, sale_voided
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500),
  link VARCHAR(200),
  entity_type VARCHAR(30),
  entity_id INT,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read, created_at),
  INDEX idx_notifications_entity (type, entity_type, entity_id)
);
