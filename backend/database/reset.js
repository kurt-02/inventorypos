/**
 * DESTRUCTIVE: drops the entire database, deleting all sales, inventory and
 * user accounts. Intended for local development when you want a clean slate.
 *
 * Normally you do not need this - `npm run db:seed` is safe to re-run and
 * skips whatever already exists. Reach for this only when you actually want
 * the existing data gone.
 *
 * Usage: npm run db:reset   (drops, then re-seeds)
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'coffee_pos';

async function main() {
  // A misconfigured production run would wipe real sales history, so refuse
  // outright rather than trusting the operator to have read the warning.
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to drop the database while NODE_ENV=production.');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log(`Dropping database "${DB_NAME}" ...`);
    await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    console.log('Dropped. Run the seed step next to rebuild it.');
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
