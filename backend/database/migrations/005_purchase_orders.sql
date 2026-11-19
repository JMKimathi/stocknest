-- Run once on a database created before purchase orders were added.
USE stocknest;

-- What the shop pays the supplier per unit (updated each time stock is received)
ALTER TABLE products
  ADD COLUMN cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER unit_price;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(30) UNIQUE,
  supplier_id INT NULL,
  supplier_name VARCHAR(150),
  status ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  expected_date DATE NULL,
  notes VARCHAR(500),
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_by INT NULL,
  created_by_name VARCHAR(100),
  ordered_at TIMESTAMP NULL,
  received_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_po_status (status),
  INDEX idx_po_created (created_at)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(150) NOT NULL,
  sku VARCHAR(60),
  quantity_ordered INT NOT NULL,
  quantity_received INT NOT NULL DEFAULT 0,
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_po_items_po (po_id)
);
