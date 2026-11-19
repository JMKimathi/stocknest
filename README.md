# StockNest

A lightweight inventory tracker for a small shop: products, categories, suppliers, stock in/out history, and admin vs staff access.

## Stack

- **Backend:** Node.js + Express
- **Database:** MySQL
- **Frontend:** HTML, CSS, JavaScript (no build step)
- **Auth:** JWT (`admin` and `staff`)

## What you need installed

- [Node.js](https://nodejs.org/) (v18 or newer)
- [MySQL](https://dev.mysql.com/downloads/installer/) — MySQL Workbench is enough for running SQL in the console / query tab

## 1. Create the database (MySQL)

Open **MySQL Workbench**, connect to your local server, then open a new SQL tab.

### A. Create tables

Copy everything from `backend/database/schema.sql` into the SQL tab and click the lightning bolt (**Execute**).

That creates the `stocknest` database and these tables: `users`, `categories`, `suppliers`, `products`, `stock_transactions`.

### B. Load demo data

Open a **new** SQL tab (or clear the previous one). Copy everything from `backend/database/seed.sql` and execute it.

You should then have:

| Email | Password | Role |
|---|---|---|
| `admin@stocknest.com` | `Admin@12345` | admin |
| `staff@stocknest.com` | `Staff@12345` | staff |

Plus 5 categories, 3 suppliers, 12 products, and a short stock history so the dashboard is not empty.

If you prefer the MySQL command-line client instead of Workbench (from the folder that contains this README):

```sql
SOURCE C:/Users/Mwiti/Downloads/stocknest/backend/database/schema.sql;
SOURCE C:/Users/Mwiti/Downloads/stocknest/backend/database/seed.sql;
```

Adjust the path if your project lives somewhere else. Paths with backslashes can fail in MySQL — use forward slashes.

To start over (drops all data):

```sql
DROP DATABASE IF EXISTS stocknest;
```

Then run `schema.sql` and `seed.sql` again.

## 2. Configure and start the API

In **PowerShell** or **Command Prompt**:

```powershell
cd C:\Users\Mwiti\Downloads\stocknest\backend
npm install
copy .env.example .env
```

Open `.env` and set your MySQL password (and user if it is not `root`):

```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=stocknest
DB_PORT=3306
JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=8h
DEFAULT_ADMIN_NAME=Admin
DEFAULT_ADMIN_EMAIL=admin@stocknest.com
DEFAULT_ADMIN_PASSWORD=Admin@12345
```

Start the server:

```powershell
npm start
```

For auto-restart while editing backend files:

```powershell
npm run dev
```

You should see: `StockNest API running on http://localhost:5000`

If no admin user exists yet, the server creates one from `DEFAULT_ADMIN_*`. After `seed.sql`, that step is skipped because an admin is already there.

## 3. Open the website

The backend already serves the frontend. In the browser go to:

```
http://localhost:5000/pages/login.html
```

or

```
http://localhost:5000
```

Sign in with the demo admin (or staff) account above.

Leave the `npm start` terminal running while you use the site.

## Roles

- **Admin:** full access, including delete products and manage users
- **Staff:** view everything, add products, log stock in/out — cannot delete products or manage users

## API (short)

| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | logged in |
| GET/POST/PUT | `/api/products` | logged in |
| DELETE | `/api/products/:id` | admin |
| POST | `/api/products/:id/stock` | logged in |
| GET | `/api/products/:id/history` | logged in |
| GET | `/api/products/summary/dashboard` | logged in |
| GET/POST/PUT/DELETE | `/api/categories` | write = admin |
| GET/POST/PUT/DELETE | `/api/suppliers` | write = admin |
| GET/POST/PUT/DELETE | `/api/users` | admin |

## Project layout

```
stocknest/
├── backend/
│   ├── database/schema.sql
│   ├── database/seed.sql
│   ├── server.js
│   └── .env.example
└── frontend/
    ├── pages/
    ├── js/
    └── css/style.css
```
