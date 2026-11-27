# Store Ratings Assignment

A React frontend, an Express API, and a PostgreSQL database.

## Start on Windows

Install Node.js 22+ and start Docker Desktop. Open PowerShell and run:

```powershell
cd D:\projects\assignment
Copy-Item .env.example .env
docker compose up -d --wait
npm.cmd ci
npm.cmd run setup
npm.cmd run build
npm.cmd run dev
```

Visit http://localhost:3000. The example administrator is `admin@example.com` with password `ChangeMe!123`. Change the password in .env before first setup if using this outside a local demo. Rerunning setup preserves an existing administrator's password.

If you already have PostgreSQL, create an empty database and set DATABASE_URL in .env to its connection string. You can skip the Docker command. Keep .env private.

## Add sample cafes and restaurants

After setting up the database, run `npm.cmd run seed`. This adds six fictional stores. You can rerun the command without duplicating them. Log in as a normal user to submit or update a rating.


## Try all three roles

1. Log in as administrator. In **Users**, add a Store Owner. You can also add normal users and other administrators here.
2. In **Stores**, create a store and select the owner. Example store name: Maple Street Bakery Shop. Names need 20–60 characters.
3. Log out. Click **Create an account** and register a normal user. Log in using that account.
4. Search by store name or address. Select 5 stars and write an optional review. Edit your rating and review, then reload to verify they persisted.
5. Log out and log in as the owner. Check the average, rating breakdown, recent activity, and ratings and reviews. Use the photo form to upload a storefront image.
6. Log back in as administrator. Check the dashboard totals and open the owner's details. Editing the shopper's rating should leave the submitted rating count at one.
7. Try sorting any table by clicking a column heading. Click again to reverse the order. Try changing your password from the navigation.

## Files to read

- `src.jsx` contains forms, tables, and the dashboards.
- `server.js` contains login, role checks, and API routes.
- `schema.sql` defines the tables and the view that calculates averages.
- `setup.js` applies the schema and creates the first administrator.

Each store can have one owner, and each owner can be assigned to one store. Administrators create owner accounts. Admins can edit store details and assign or change the owner from the Stores table. Owners can upload or replace their assigned store photo on the Store dashboard (JPEG, PNG, or WebP up to 5 MB). Photos appear in the store listings. The admin users table includes all roles. Role filtering applies to user accounts.

The browser uses one login page and an HTTP-only session cookie. The API checks role permissions. Passwords are hashed, and changing a password signs out all existing sessions. For HTTPS deployment, set COOKIE_SECURE=true. This project runs locally by default.

For frontend development with hot reloading, keep the server running and use `npm.cmd run client` in another terminal. Open the address printed by Vite.
