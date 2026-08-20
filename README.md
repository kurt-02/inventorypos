# POS & Inventory Management System (Coffee Shop-Focused *for now)

A point-of-sale and recipe-based inventory system for a two-branch coffee shop. Cashiers ring up sales on their own branch's terminal; every sale automatically deducts the ingredients its recipe calls for from that branch's stock. Admins oversee both branches, compare their performance, and manage products, recipes, users, and inventory.

**Stack:** React + Tailwind CSS (Vite) · Node.js + Express · MySQL 8 · JWT auth with bcrypt-hashed passwords.

---

## Table of contents

- [How it works](#how-it-works)
- [Roles and permissions](#roles-and-permissions)
- [Local setup](#local-setup)
- [Default accounts](#default-accounts)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Deploying to Railway](#deploying-to-railway)
- [Troubleshooting](#troubleshooting)

---

## How it works

### Recipe-based inventory

Each product has a recipe: a list of ingredients and how much of each it consumes. A Cappuccino, for example, is defined as 18 g espresso beans, 150 ml milk, one 8 oz cup, and one lid.

When a cashier checks out, the backend runs one transaction that:

1. Records the sale and its line items, pricing every item from the database rather than trusting the amounts the browser sent.
2. Adds up the total ingredient usage across the whole basket (three cappuccinos means 54 g of beans, not three separate deductions).
3. Locks those inventory rows with `SELECT … FOR UPDATE`, checks there is enough stock, and subtracts.
4. Writes one `inventory_adjustments` row per ingredient with reason `sale`, so the movement is auditable.

If any ingredient is short, the whole transaction rolls back and the cashier sees which one ran out — no partial sale, no negative stock.

### Where stock changes come from

Every quantity change is logged in `inventory_adjustments` with a reason:

Rows written by a checkout carry the `sale_id` of the sale that caused them, so the admin inventory screen can group every ingredient one checkout consumed under that checkout instead of listing each ingredient as its own row. Manual and shift-count rows leave `sale_id` null — each of those really is an independent event.

| Reason | Written by | Meaning |
| --- | --- | --- |
| `sale` | Automatic | Deducted by a checkout |
| `shift_count` | Cashier | Difference found during an end-of-shift count |
| `restock` | Admin | Delivery received |
| `waste` | Admin | Spoilage, spillage, breakage |
| `correction` | Admin | Fixing a bad count |

### Low-stock thresholds

Each ingredient carries a `low_stock_threshold` (its par level). Stock at or below it is flagged as low on the inventory screens and counted in reports. The admin overview's "inventory health" percentage is simply the share of that branch's ingredients sitting above their threshold.

---

## Roles and permissions

**Cashier** — tied to exactly one branch. Rings up sales, views their branch's inventory, submits end-of-shift counts, and sees today's sales. No date picker, no product management, no visibility into the other branch. This is enforced server-side: cashier-scoped routes compare the requested `branch_id` against the one in the JWT and reject mismatches, and the today's-sales query is bounded by `CURDATE()` in SQL.

**Admin** — no branch assignment, sees everything. Compares branches, adjusts stock with a logged reason, and manages products, recipes, ingredients, and cashier accounts.

### Authentication

Access tokens are short-lived (15 minutes by default) and kept in memory in the browser — never in `localStorage`, so a cross-site scripting bug can't lift them from storage. The refresh token travels in an `httpOnly` cookie that JavaScript cannot read, and every use rotates it: the old token is deleted from `refresh_tokens` and a new one issued. Logging out deletes the row server-side, so a stolen refresh token stops working immediately rather than lingering until it expires.

The axios client refreshes automatically when a request comes back 401, replays the original request, and funnels concurrent 401s into a single refresh call so token rotation doesn't race with itself.

---

## Local setup

### Prerequisites

- Node.js 18 or newer
- A MySQL 8 server — via Docker Desktop, XAMPP, or an existing installation

### 1. Start MySQL

**With Docker:**

```bash
docker compose up -d
```

This starts MySQL 8 on `localhost:3306` with root password `rootpassword` and an empty `coffee_pos` database. Give it a few seconds to finish initializing on first run.

**With XAMPP:** start the MySQL module from the XAMPP control panel. You don't need to create the database or any tables by hand — the seed script in step 2 does all of it. Two settings differ from the Docker defaults:

- XAMPP's `root` account has **no password**, so `DB_PASSWORD=` must be left blank.
- Confirm the port in the control panel. It's normally 3306, but XAMPP gets moved to 3307 when something else already holds the default.

**With an existing MySQL server:** just point the `DB_*` variables in the next step at it.

### 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env      # Windows PowerShell: copy .env.example .env
```

Open `.env` and set both JWT secrets to long random strings. A quick way to generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then create the tables and load the sample data:

```bash
npm run db:seed
```

This runs `database/schema.sql`, then `database/seeds.sql` (two branches, eight products, eleven ingredients, full recipes, and starting stock for both branches), then creates the three default user accounts with bcrypt-hashed passwords.

The command is safe to run again at any time: every step skips what already exists rather than failing, and nothing is overwritten — current stock levels and any passwords you've changed survive a re-run untouched.

It also applies any pending schema migrations (`database/migrate.js`), which is how a database created by an earlier version picks up columns added later. **If you already have a database from a previous version, run `npm run db:seed` once after pulling** — `schema.sql` only guards at table level (`CREATE TABLE IF NOT EXISTS`), so it cannot add a column to a table that already exists. Migrations check the current column list first and do nothing when they've already been applied. If you'd rather start from an empty database, `npm run db:reset` drops it and rebuilds from scratch. That one deletes everything, so it refuses to run when `NODE_ENV=production`.

> **Don't skip this step, even if you already built the tables by hand.** It's tempting to paste `schema.sql` and `seeds.sql` straight into phpMyAdmin and call the database done — but no `.sql` file in this project creates user accounts. Passwords have to be bcrypt-hashed, which only happens here in Node. A database built purely from pasted SQL has an empty `users` table, and every login fails with "Invalid username or password" even though the app and database are both fine. Because the script skips whatever already exists, running it over a hand-built database is safe and simply fills in the missing accounts.

Start the API:

```bash
npm run dev
```

It listens on `http://localhost:5000`. Check `http://localhost:5000/api/health` — you should get `{"status":"ok","database":"connected"}`.

### 3. Set up the frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env      # Windows PowerShell: copy .env.example .env
npm run dev
```

Open `http://localhost:5173` and sign in.

Leave `VITE_API_URL` empty for local development — Vite's dev server proxies `/api` to `localhost:5000`, so the browser sees same-origin requests and the refresh cookie just works.

---

## Default accounts

| Username | Password | Role | Branch |
| --- | --- | --- | --- |
| `admin` | `Admin123!` | Admin | Both |
| `cashier1` | `Cashier123!` | Cashier | Branch A – Downtown |
| `cashier2` | `Cashier123!` | Cashier | Branch B – Uptown |

Change these before deploying anywhere public. You can do it from the admin **Users** page.

### Try it end to end

1. Sign in as `cashier1`, ring up two cappuccinos, and check out.
2. Go to **Inventory** — espresso beans have dropped by 36 g, milk by 300 ml, and both the cup and lid counts by 2.
3. Sign in as `admin` and open **Inventory**. The history at the bottom shows one `sale` row per ingredient consumed.
4. Adjust an ingredient with reason "restock" and watch it appear in the same history.

---

## Project structure

```
inventory-pos/
├── backend/
│   ├── src/
│   │   ├── config/db.js            MySQL connection pool
│   │   ├── controllers/            Request handlers, one file per resource
│   │   ├── middleware/             auth, validation, error handling
│   │   ├── routes/                 Endpoint definitions + role guards
│   │   ├── utils/tokens.js         JWT signing helpers
│   │   └── server.js               Express app entry point
│   ├── database/
│   │   ├── schema.sql              Table definitions
│   │   ├── seeds.sql               Sample branches/products/recipes/stock
│   │   ├── seed.js                 Runs both, then creates hashed users
│   │   └── reset.js                Drops the database (destructive)
│   ├── .env.example
│   ├── railway.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── cashier/            POS, inventory, shift count, today's sales
│   │   │   └── admin/              Overview, comparison, managers, reports
│   │   ├── components/             Shared UI, route guard, layouts
│   │   ├── context/AuthContext.jsx Session state and login/logout
│   │   ├── hooks/useApi.js         Fetch-with-loading-and-error hook
│   │   ├── utils/api.js            axios client + auto token refresh
│   │   ├── utils/format.js         Currency/quantity/date formatting
│   │   ├── App.jsx                 Routes
│   │   ├── main.jsx
│   │   └── index.css               Tailwind layers + component classes
│   ├── public/
│   ├── .env.example
│   ├── railway.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## API reference

All responses are JSON. Errors use the shape `{ "error": "message" }`, with validation failures adding a `details` array. Every route except login and refresh requires an `Authorization: Bearer <accessToken>` header.

### Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Returns an access token and user; sets the refresh cookie |
| POST | `/api/auth/refresh` | Cookie | Rotates the refresh token, returns a new access token |
| POST | `/api/auth/logout` | Cookie | Revokes the refresh token server-side |

### Sales

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/api/sales` | Cashier (own branch) | Rings up a sale and deducts recipe ingredients |
| GET | `/api/sales/today/:branch_id` | Cashier (own branch), admin | Today's sales with line items |

`POST /api/sales` body:

```json
{ "branch_id": 1, "items": [{ "product_id": 3, "quantity": 2 }] }
```

### Inventory

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/inventory` | Admin | Both branches |
| GET | `/api/inventory/:branch_id` | Cashier (own branch), admin | One branch |
| PUT | `/api/inventory/check` | Cashier | Submit end-of-shift counts |
| PUT | `/api/inventory/adjust` | Admin | Manual adjustment with a reason |
| GET | `/api/inventory/adjustments` | Admin | Audit history (`branch_id`, `ingredient_id`, `reason`, `limit`) |

`PUT /api/inventory/check` body:

```json
{ "branch_id": 1, "counts": [{ "ingredient_id": 1, "counted_quantity": 4820 }] }
```

`PUT /api/inventory/adjust` body — `reason` must be `waste`, `restock`, or `correction`:

```json
{ "branch_id": 1, "ingredient_id": 2, "quantity_change": 5000, "reason": "restock", "notes": "Weekly delivery" }
```

### Products, recipes, ingredients

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/products` | Any user | Active products (`?include_inactive=true` for admins) |
| POST / PUT / DELETE | `/api/products[/:id]` | Admin | Create, update, deactivate |
| GET | `/api/recipes` | Admin | Recipe lines (`?product_id=` to filter) |
| POST / PUT / DELETE | `/api/recipes[/:id]` | Admin | Manage recipe lines |
| GET | `/api/ingredients` | Any user | All ingredients |
| POST / PUT / DELETE | `/api/ingredients[/:id]` | Admin | Manage ingredients |

Deleting a product deactivates it rather than removing the row, so historical sales keep their reference. Creating an ingredient automatically seeds a zero-quantity inventory row at every branch.

### Users and reports

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET / POST / PUT / DELETE | `/api/users[/:id]` | Admin | Manage accounts (DELETE deactivates) |
| GET | `/api/branches` | Any user | Branch list for dropdowns |
| GET | `/api/reports/sales` | Admin | Sales history (`branch_id`, `start_date`, `end_date`) |
| GET | `/api/reports/comparison` | Admin | Branch A vs B for a date range |
| GET | `/api/reports/inventory` | Admin | Both branches with low-stock flags |
| GET | `/api/reports/top-items` | Admin | Best sellers (`branch_id`, dates, `limit`) |

Report date parameters are `YYYY-MM-DD`. Omitting them defaults to the last 30 days rather than scanning the entire table.

### Status codes

`200` success · `201` created · `400` validation error · `401` missing/expired token · `403` wrong role or wrong branch · `404` not found · `409` duplicate record or insufficient stock · `500` server error.

---

## Database schema

Nine tables plus `refresh_tokens`:

- **branches** — the two locations.
- **users** — admins (`branch_id` null) and cashiers (`branch_id` set). Deactivated rather than deleted.
- **products** — the menu. Soft-deleted via `is_active`.
- **ingredients** — raw stock items with a unit and low-stock threshold.
- **product_recipes** — how much of each ingredient a product uses; unique on `(product_id, ingredient_id)`.
- **inventory** — current quantity per branch per ingredient; unique on `(branch_id, ingredient_id)`.
- **inventory_adjustments** — every stock movement, with reason and who made it.
- **sales** / **sale_items** — transactions and their line items. `price_at_sale` is stored so historical totals survive later price changes.
- **refresh_tokens** — issued refresh tokens, so logout can revoke them.

---

## Deploying to Railway

You'll create three services in one Railway project: a MySQL database, the backend, and the frontend.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Coffee shop POS system"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

`.env` files are gitignored — Railway gets its values from the dashboard instead.

### 2. Add MySQL

In your Railway project: **New → Database → Add MySQL**. Railway provisions it and exposes `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, and `MYSQLDATABASE`.

### 3. Deploy the backend

**New → GitHub Repo**, pick your repo, then set **Root Directory** to `backend` in the service settings. Add these variables (the `${{...}}` syntax references the MySQL service):

```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
JWT_ACCESS_SECRET=<long random string>
JWT_REFRESH_SECRET=<a different long random string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
NODE_ENV=production
CORS_ORIGIN=https://your-frontend.up.railway.app
```

Leave `PORT` alone — Railway sets it. Generate a domain under **Settings → Networking → Generate Domain**.

### 4. Seed the production database

The seed script creates the database and tables, so run it once after the backend deploys. Using the Railway CLI:

```bash
npm i -g @railway/cli
railway login
railway link
railway run --service <backend-service-name> npm run db:seed
```

Railway's MySQL provisions a database named `railway` rather than `coffee_pos`, so before running this, change the `CREATE DATABASE` / `USE` lines at the top of `schema.sql` and `seeds.sql` to match `MYSQLDATABASE` — or simply set `DB_NAME=coffee_pos` and let the script create it, since the provisioned MySQL user has permission to.

**Immediately sign in as `admin` and change all three default passwords from the Users page.**

### 5. Deploy the frontend

**New → GitHub Repo** on the same repo, with **Root Directory** set to `frontend`. Add one variable pointing at your backend's domain:

```
VITE_API_URL=https://your-backend.up.railway.app
```

Vite inlines `VITE_*` variables at build time, so this must be set before the build runs — if you add it afterward, trigger a redeploy. Generate a domain for this service too.

### 6. Connect the two

Go back to the backend service and set `CORS_ORIGIN` to the frontend's real domain (no trailing slash), then redeploy. Multiple origins can be comma-separated.

Cross-origin cookies need `Secure` and `SameSite=None`, which the backend applies automatically when `NODE_ENV=production`. Both services must be on HTTPS, which Railway domains are by default.

Finally, load the frontend URL and sign in.

---

## Troubleshooting

**`ECONNREFUSED` when starting the backend.** MySQL isn't up yet. Run `docker compose ps` and wait for the health check to pass, then confirm the `DB_*` values in `backend/.env`.

**`npm run db:seed` fails with a duplicate-key error.** It shouldn't — the script is idempotent. If you're on an older copy of `schema.sql` that ends with standalone `CREATE INDEX` statements, pull the current version: MySQL has no `CREATE INDEX IF NOT EXISTS`, so those failed on the second run even though the `CREATE TABLE` statements were guarded. The indexes are now declared inline instead. To start over regardless: `npm run db:reset`.

**Login succeeds but every later request 401s.** The refresh cookie isn't reaching the API. Locally, use `http://localhost:5173` (not `127.0.0.1`, which is a different origin to the browser) and leave `VITE_API_URL` empty so the dev proxy handles it. In production, check that `CORS_ORIGIN` exactly matches the frontend origin and that both sides are HTTPS.

**A cashier sees "You can only access your own branch."** Expected — cashiers are locked to the branch on their account. Reassign them from the admin Users page if that's wrong.

**Checkout fails with "Insufficient stock."** A recipe ingredient has run out at that branch. Restock it from the admin Inventory page, or check the product's recipe if the amounts look wrong.

**Selling a product doesn't change any inventory.** That product has no recipe lines. Add them under admin → Recipes.
