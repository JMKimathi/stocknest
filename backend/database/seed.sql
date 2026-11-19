-- StockNest sample data
-- Run AFTER schema.sql. Safe to re-run on a fresh database.
USE stocknest;

-- Demo logins:
--   admin@stocknest.com  /  Admin@12345
--   staff@stocknest.com  /  Staff@12345
INSERT INTO users (name, email, password_hash, role, is_active) VALUES
('Ada Mwangi', 'admin@stocknest.com', '$2a$10$muBBrw1CYT7AMON6VuTGjuOtMUsnIBV7TCWnVDdsj4z6CUrBSGgw6', 'admin', 1),
('James Otieno', 'staff@stocknest.com', '$2a$10$mqKIWpncsdB/nmODHG7ct.S1r5je7lg5tutLrzum2GarUCDPvpngu', 'staff', 1);

INSERT INTO categories (name, description) VALUES
('Beverages', 'Drinks, juices, and bottled water'),
('Groceries', 'Everyday food staples'),
('Household', 'Cleaning and home supplies'),
('Personal Care', 'Soap, toothpaste, and toiletries'),
('Stationery', 'Office and school supplies');

INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
('Rift Valley Distributors', 'Mary Wanjiku', '+254 712 445 210', 'orders@rvdist.co.ke', 'Industrial Area, Nairobi'),
('Coastal Fresh Ltd', 'Ali Hassan', '+254 733 118 904', 'sales@coastalfresh.co.ke', 'Mombasa Road, Nairobi'),
('Savanna Wholesale', 'Peter Kimani', '+254 720 667 331', 'hello@savannawholesale.com', 'Thika Superhighway, Ruiru');

INSERT INTO products (name, sku, description, category_id, supplier_id, quantity, reorder_level, unit_price) VALUES
('Highland Still Water 500ml', 'BEV-WTR-500', 'Pack of 24 bottles', 1, 2, 120, 24, 280.00),
('Savanna Cola 330ml', 'BEV-COLA-330', 'Canned soda, case of 24', 1, 1, 18, 24, 420.00),
('Maize Flour 2kg', 'GRO-MF-2KG', 'Fine sifted maize meal', 2, 3, 64, 20, 185.00),
('Cooking Oil 1L', 'GRO-OIL-1L', 'Sunflower cooking oil', 2, 3, 8, 15, 310.00),
('White Sugar 1kg', 'GRO-SUG-1KG', 'Granulated sugar', 2, 3, 45, 12, 175.00),
('Laundry Bar Soap', 'HSE-SOAP-BAR', 'Multipurpose washing bar', 3, 1, 90, 20, 65.00),
('Dishwashing Liquid 750ml', 'HSE-DISH-750', 'Lemon scented', 3, 1, 22, 10, 195.00),
('Toilet Tissue 10-pack', 'HSE-TISS-10', '2-ply household pack', 3, 1, 14, 8, 340.00),
('Toothpaste 100ml', 'PC-PASTE-100', 'Mint fluoride toothpaste', 4, 1, 36, 12, 145.00),
('Bath Soap 125g', 'PC-BATH-125', 'Aloe moisturising bar', 4, 1, 4, 10, 85.00),
('A4 Copy Paper 500 sheets', 'STN-A4-500', '80gsm white paper', 5, 3, 28, 6, 620.00),
('Blue Ballpoint Pens (box 50)', 'STN-PEN-50', 'Medium point, blue ink', 5, 3, 11, 5, 250.00);

-- Opening stock + a few later movements so the dashboard activity feed is not empty
INSERT INTO stock_transactions (product_id, user_id, type, quantity, reason, created_at) VALUES
(1, 1, 'in', 120, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 12 DAY)),
(2, 1, 'in', 48, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 12 DAY)),
(3, 1, 'in', 80, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 11 DAY)),
(4, 1, 'in', 40, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 11 DAY)),
(5, 1, 'in', 50, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(6, 1, 'in', 90, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(7, 1, 'in', 30, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 9 DAY)),
(8, 1, 'in', 20, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 9 DAY)),
(9, 1, 'in', 40, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 8 DAY)),
(10, 1, 'in', 20, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 8 DAY)),
(11, 1, 'in', 28, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(12, 1, 'in', 15, 'Initial stock on product creation', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(2, 2, 'out', 30, 'Weekend sales', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(4, 2, 'out', 32, 'Restaurant restock order', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(10, 2, 'out', 16, 'Retail sales', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(3, 2, 'out', 16, 'Walk-in customer order', DATE_SUB(NOW(), INTERVAL 18 HOUR)),
(7, 1, 'out', 8, 'Damaged bottles written off', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(12, 2, 'out', 4, 'School stationery pack', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(5, 2, 'out', 5, 'Retail sales', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(8, 2, 'out', 6, 'Retail sales', DATE_SUB(NOW(), INTERVAL 4 DAY)),
(9, 2, 'out', 4, 'Retail sales', DATE_SUB(NOW(), INTERVAL 4 DAY));
