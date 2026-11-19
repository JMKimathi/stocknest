-- Run once on a database created before sales were added.
USE stocknest;

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(30) UNIQUE,
  user_id INT NULL,
  cashier_name VARCHAR(100),
  customer_name VARCHAR(120),
  customer_phone VARCHAR(30),
  payment_method ENUM('cash', 'mpesa', 'card', 'bank') NOT NULL DEFAULT 'cash',
  payment_ref VARCHAR(60),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  change_due DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('completed', 'voided') NOT NULL DEFAULT 'completed',
  void_reason VARCHAR(255),
  voided_by VARCHAR(100),
  voided_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sales_created (created_at),
  INDEX idx_sales_status (status)
);

-- Name, SKU and price are copied onto each line so old receipts never change
-- when a product is later renamed or repriced.
CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(150) NOT NULL,
  sku VARCHAR(60),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_sale_items_sale (sale_id),
  INDEX idx_sale_items_product (product_id)
);
