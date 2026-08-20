/**
 * Database setup script.
 *
 * Runs schema.sql (creates tables), then seeds.sql (branches, products,
 * ingredients, recipes, initial inventory), then creates the 3 default user
 * accounts with bcrypt-hashed passwords.
 *
 * Safe to run more than once: every step skips what already exists rather
 * than failing, and nothing here overwrites live data - current stock levels
 * and changed passwords survive a re-run untouched. To start over from an
 * empty database instead, use `npm run db:reset`.
 *
 * Usage: node database/seed.js   (or `npm run db:seed` from /backend)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { runMigrations } = require('./migrate');

const DB_NAME = process.env.DB_NAME || 'coffee_pos';

const DEFAULT_USERS = [
  { username: 'admin', password: 'Admin123!', full_name: 'System Admin', role: 'admin', branch_id: null },
  { username: 'cashier1', password: 'Cashier123!', full_name: 'Cashier Branch A', role: 'cashier', branch_id: 1 },
  { username: 'cashier2', password: 'Cashier123!', full_name: 'Cashier Branch B', role: 'cashier', branch_id: 2 },
];

async function runSqlFile(connection, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  // mysql2 supports multiple statements per query when multipleStatements: true
  await connection.query(sql);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    console.log('Running schema.sql ...');
    await runSqlFile(connection, path.join(__dirname, 'schema.sql'));

    console.log('Running seeds.sql ...');
    await runSqlFile(connection, path.join(__dirname, 'seeds.sql'));

    await connection.query(`USE \`${DB_NAME}\``);

    // Brings databases built by an earlier version up to the current schema.
    // schema.sql can't do this itself - it only guards at table level.
    console.log('Applying migrations ...');
    await runMigrations(connection, DB_NAME);

    console.log('Creating default users ...');

    // Existing accounts are left untouched - re-running this script must never
    // reset a password that has since been changed.
    let created = 0;
    for (const u of DEFAULT_USERS) {
      const [existing] = await connection.query('SELECT id FROM users WHERE username = ?', [u.username]);
      if (existing.length > 0) {
        console.log(`  Skipped "${u.username}" - already exists.`);
        continue;
      }
      const hash = await bcrypt.hash(u.password, 10);
      await connection.query(
        'INSERT INTO users (username, password_hash, full_name, role, branch_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [u.username, hash, u.full_name, u.role, u.branch_id]
      );
      console.log(`  Created ${u.role} "${u.username}"`);
      created++;
    }

    console.log('\nDatabase setup complete.');
    if (created > 0) {
      console.log('Default login credentials:');
      DEFAULT_USERS.forEach((u) => console.log(`  ${u.username} / ${u.password}`));
    } else {
      console.log('All default accounts already existed - no passwords were changed.');
    }
  } catch (err) {
    console.error('Database setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
