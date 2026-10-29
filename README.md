# Web developer portfolio

A responsive portfolio built with HTML, CSS, JavaScript, Bootstrap, and a small Node.js server. The server provides sign-up, login, session cookies, and a protected endpoint for additional projects. Accounts are stored in MySQL.

## Run locally

1. Install Node.js 18 or newer and make sure your MySQL server is running.
2. Open `.env` (copy `.env.example` to create it if needed) and set `MYSQL_USER` and `MYSQL_PASSWORD` to your local MySQL credentials. The database name is already set to `connect_to_me`.
3. Install the project packages with `npm install`.
4. Start the app with `npm start`.
5. Open `http://127.0.0.1:3000`. Do not open `index.html` directly; sign-up and login require the server.

If port 3000 is already in use, run `node server.js 3001` and open `http://127.0.0.1:3001` instead.

The app expects an existing `users` table in `connect_to_me` with `id`, `name`, `email`, `password`, and `created_at` columns. The server checks the table when it starts. Its MySQL account needs permission to select and insert rows. The `password` column stores a salted scrypt hash record, never a plain-text password.

Bootstrap, Google Fonts, and the rotating light-mode photo backgrounds load from CDNs, so an internet connection is needed for those styles, fonts, and photos. The background rotates among three web-development photos from Unsplash; the [Unsplash License](https://unsplash.com/license) permits free use.

## Customize the portfolio

1. Edit the name, bio, and social links in `index.html`.
2. Update the public project cards in `index.html` and the additional project cards in `data/private-projects.json`.
3. Replace `assets/tamiru-chalchisa.jpg` to change the profile photo.
4. Add document or video resources to `documents.html` and `videos.html` when they are ready.
5. Update the page title and description in the `<head>` of `index.html`.
6. Change the contact recipient in `script.js` and the dashboard links if needed.

## Account storage and deployment

The `users` table stores each account's name, email, a salted scrypt password hash, and its creation time. Passwords are never stored in plain text. The table should have a unique email constraint, and account queries use parameters. `.env` is excluded from Git; keep your database credentials there and do not publish them.

Login sessions use HTTP-only, same-site cookies and expire after eight hours. Active sessions are held in memory, so members need to log in again after a server restart. For production, set `PORTFOLIO_HOST=0.0.0.0`, use HTTPS, set `APP_ORIGIN` to the full public origin, and set `COOKIE_SECURE=true`. Email verification and password reset are not configured.
