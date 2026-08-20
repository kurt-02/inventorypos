-- ============================================================================
-- Coffee Shop POS & Inventory Management System - Database Schema
-- MySQL 8.0+
-- ============================================================================

CREATE DATABASE IF NOT EXISTS coffee_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE coffee_pos;

-- ----------------------------------------------------------------------------
-- branches: the two physical coffee shop locations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- users: admin (branch_id NULL, sees everything) and cashiers (tied to a branch)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'cashier') NOT NULL,
  branch_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- refresh_tokens: server-side record of issued JWT refresh tokens so they can
-- be revoked on logout/deactivation instead of relying on expiry alone
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- products: sellable menu items (same catalog across both branches)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'General',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- ingredients: raw stock items tracked in inventory (beans, milk, cups, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL, -- g, ml, pcs, etc.
  category VARCHAR(50) NOT NULL DEFAULT 'General',
  low_stock_threshold DECIMAL(10,3) NOT NULL DEFAULT 0, -- par level; below this = "low stock" in reports/UI
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- product_recipes: how much of each ingredient a product consumes when sold
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  CONSTRAINT fk_recipe_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
  UNIQUE KEY uq_product_ingredient (product_id, ingredient_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- inventory: current stock level of each ingredient, per branch
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
  last_counted_at TIMESTAMP NULL,
  last_counted_by INT NULL,
  CONSTRAINT fk_inventory_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_counted_by FOREIGN KEY (last_counted_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_branch_ingredient (branch_id, ingredient_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- sales: one row per checkout/transaction
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  cashier_id INT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Covers "today's sales for branch X" and the date-ranged report queries.
  KEY idx_sales_branch_created (branch_id, created_at),
  CONSTRAINT fk_sales_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_cashier FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- sale_items: line items belonging to a sale
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price_at_sale DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_saleitems_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_saleitems_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- inventory_adjustments: full audit trail of every stock change - automatic
-- deductions from sales, end-of-shift counts, and manual admin corrections.
--
-- Declared after `sales` because sale-driven rows carry a real sale_id foreign
-- key: the admin history screen groups every ingredient deducted by one
-- checkout under that checkout, and matching on the free-text note would break
-- the moment the wording changed.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  quantity_change DECIMAL(10,3) NOT NULL, -- positive = added, negative = removed
  reason ENUM('sale', 'waste', 'restock', 'correction', 'shift_count') NOT NULL,
  sale_id INT NULL, -- set only when reason = 'sale'; NULL for manual/shift rows
  notes VARCHAR(255) NULL,
  adjusted_by INT NULL,
  adjusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Speeds up the filtered adjustment-history queries on the admin screen.
  KEY idx_adjustments_branch_ingredient (branch_id, ingredient_id),
  KEY idx_adjustments_sale (sale_id),
  CONSTRAINT fk_adj_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_adj_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
  CONSTRAINT fk_adj_user FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE SET NULL,
  -- SET NULL rather than CASCADE: deleting a sale must never erase the record
  -- that the stock actually moved.
  CONSTRAINT fk_adj_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- A note on indexes: the report-oriented composite indexes are declared inline
-- above rather than as standalone CREATE INDEX statements. MySQL has no
-- CREATE INDEX IF NOT EXISTS, so standalone statements make this file fail on
-- a re-run even though every CREATE TABLE is guarded - and a setup script has
-- to be safe to run twice.
--
-- Single-column lookups on sale_items.product_id and users.branch_id need no
-- explicit index: InnoDB automatically creates one for every foreign key
-- column, so declaring them again would just duplicate an existing index.
-- ----------------------------------------------------------------------------
