-- Run once on a database created before the activity log was added.
USE stocknest;

CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  user_name VARCHAR(100),           -- copy of the name, kept even if the user is deleted
  action VARCHAR(50) NOT NULL,      -- e.g. product.create, stock.out, user.update
  entity_type VARCHAR(30),          -- product, category, supplier, user, auth
  entity_id INT,
  details VARCHAR(500),
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_created (created_at),
  INDEX idx_activity_user (user_id),
  INDEX idx_activity_entity (entity_type, entity_id)
);
