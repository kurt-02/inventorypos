-- ============================================================================
-- Sample seed data: branches, products, ingredients, recipes, initial stock.
-- User accounts are NOT created here (passwords need bcrypt hashing) - run
-- `npm run db:seed` from /backend instead, which executes this file and then
-- creates the 3 default users programmatically. See README.md.
--
-- Every statement uses INSERT IGNORE so this file is safe to run more than
-- once: rows that already exist (matched on their primary key, or on the
-- unique branch+ingredient / product+ingredient pairs) are skipped rather
-- than raising a duplicate-key error. Re-running never overwrites live data,
-- so existing stock levels are left as they are.
-- ============================================================================

USE coffee_pos;

-- ----------------------------------------------------------------------------
-- Branches
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO branches (id, name, location) VALUES
  (1, 'Branch A - Carmel Mall', 'Jose Yulo Sr. Ave, Calamba, 4027 Laguna'),
  (2, 'Branch B - NU Laguna', 'KM 53 Pan-Philippine Hwy, Calamba, 4027 Laguna');

-- ----------------------------------------------------------------------------
-- Ingredients
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO ingredients (id, name, unit, category, low_stock_threshold) VALUES
  (1, 'Espresso Beans', 'g', 'Coffee', 1000),
  (2, 'Milk', 'ml', 'Dairy', 3000),
  (3, 'Water', 'ml', 'Other', 3000),
  (4, 'Sugar', 'g', 'Other', 500),
  (5, 'Chocolate Syrup', 'ml', 'Syrup', 300),
  (6, 'Ice', 'g', 'Other', 1500),
  (7, 'Cup 8oz', 'pcs', 'Packaging', 40),
  (8, 'Cup 12oz', 'pcs', 'Packaging', 40),
  (9, 'Lid', 'pcs', 'Packaging', 60),
  (10, 'Croissant (raw)', 'pcs', 'Bakery', 10),
  (11, 'Blueberry Muffin (raw)', 'pcs', 'Bakery', 10);

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO products (id, name, price, category, is_active) VALUES
  (1, 'Espresso', 95.00, 'Coffee', 1),
  (2, 'Americano', 105.00, 'Coffee', 1),
  (3, 'Cappuccino', 120.00, 'Coffee', 1),
  (4, 'Latte', 130.00, 'Coffee', 1),
  (5, 'Mocha', 145.00, 'Coffee', 1),
  (6, 'Iced Latte', 140.00, 'Cold Drinks', 1),
  (7, 'Croissant', 85.00, 'Bakery', 1),
  (8, 'Blueberry Muffin', 90.00, 'Bakery', 1);

-- ----------------------------------------------------------------------------
-- Product Recipes (auto-deducted from inventory on every sale)
-- ----------------------------------------------------------------------------
-- Espresso: beans + 8oz cup + lid
INSERT IGNORE INTO product_recipes (product_id, ingredient_id, quantity, unit) VALUES
  (1, 1, 18, 'g'), (1, 7, 1, 'pcs'), (1, 9, 1, 'pcs'),
-- Americano: beans + water + 8oz cup + lid
  (2, 1, 18, 'g'), (2, 3, 150, 'ml'), (2, 7, 1, 'pcs'), (2, 9, 1, 'pcs'),
-- Cappuccino: beans + milk + 8oz cup + lid
  (3, 1, 18, 'g'), (3, 2, 150, 'ml'), (3, 7, 1, 'pcs'), (3, 9, 1, 'pcs'),
-- Latte: beans + milk + 12oz cup + lid
  (4, 1, 18, 'g'), (4, 2, 200, 'ml'), (4, 8, 1, 'pcs'), (4, 9, 1, 'pcs'),
-- Mocha: beans + milk + chocolate syrup + 12oz cup + lid
  (5, 1, 18, 'g'), (5, 2, 150, 'ml'), (5, 5, 30, 'ml'), (5, 8, 1, 'pcs'), (5, 9, 1, 'pcs'),
-- Iced Latte: beans + milk + ice + 12oz cup + lid
  (6, 1, 18, 'g'), (6, 2, 200, 'ml'), (6, 6, 100, 'g'), (6, 8, 1, 'pcs'), (6, 9, 1, 'pcs'),
-- Croissant: 1 raw croissant
  (7, 10, 1, 'pcs'),
-- Blueberry Muffin: 1 raw muffin
  (8, 11, 1, 'pcs');

-- ----------------------------------------------------------------------------
-- Initial inventory stock for both branches
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO inventory (branch_id, ingredient_id, quantity, last_counted_at) VALUES
  (1, 1, 5000, NOW()), (1, 2, 15000, NOW()), (1, 3, 20000, NOW()), (1, 4, 3000, NOW()),
  (1, 5, 2000, NOW()), (1, 6, 10000, NOW()), (1, 7, 200, NOW()), (1, 8, 200, NOW()),
  (1, 9, 400, NOW()), (1, 10, 50, NOW()), (1, 11, 50, NOW()),
  (2, 1, 5000, NOW()), (2, 2, 15000, NOW()), (2, 3, 20000, NOW()), (2, 4, 3000, NOW()),
  (2, 5, 2000, NOW()), (2, 6, 10000, NOW()), (2, 7, 200, NOW()), (2, 8, 200, NOW()),
  (2, 9, 400, NOW()), (2, 10, 50, NOW()), (2, 11, 50, NOW());
