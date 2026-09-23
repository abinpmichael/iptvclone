# iptvclone

A free IPTV viewer built on the [iptv-org](https://github.com/iptv-org/iptv) playlist, with:

- Live channel browsing, search, favorites, and category/language filters
- A "Video Club" section for movie-genre channels
- An admin panel (`/admin.html`) showing who's currently watching what, and letting you enable/disable individual channels

## This needs a live backend — it will not work on GitHub Pages

The admin panel and language filter depend on shared, real-time state (who's
watching, which channels are disabled) that a static file host cannot provide.
This repo ships **two interchangeable backends** that do the same job — pick
whichever matches your hosting:

- **`server.js`** — Node/Express backend
- **`api/` + `.htaccess`** — PHP backend (for shared hosting without Node)

The front-end (`index.html`, `app.js`, `admin.html`, `admin.js`, etc.) is
identical either way — both backends expose the same `/api/...` routes, so
you only need to pick one.

## Option A: PHP hosting (shared hosting, cPanel, etc.)

Most cheap/shared hosting plans support this — no SSH or npm needed.

1. Edit `config.php` and set your own admin password (or set an
   `ADMIN_PASSWORD` environment variable if your host's control panel supports
   one).
2. Upload everything **except** `server.js`, `package.json`,
   `package-lock.json`, `node_modules/`, and `render.yaml` to your host via
   FTP or the file manager (they're harmless to leave out — the PHP backend
   doesn't use them).
3. Make sure the `data/` folder is writable by PHP (usually `755` or `775`
   via your host's file manager — right-click → permissions).
4. Visit your domain. The `.htaccess` file routes `/api/...` requests to
   `api/index.php` automatically (requires Apache with `mod_rewrite`, which
   is the default on nearly all shared PHP hosting).

Notes:
- The language list is fetched from iptv-org and cached in
  `data/languages_cache.json` for 24 hours; the very first request after
  that cache expires will take a few seconds while it re-fetches.
- Requires PHP 7.4+ (JSON and cURL extensions, both on by default almost everywhere).

## Option B: Node hosting (local machine, VPS, Render, etc.)

```bash
npm install
npm start
```

Then open `http://localhost:8123` (viewer) and `http://localhost:8123/admin.html` (admin).

Set a real admin password instead of the default:

```bash
ADMIN_PASSWORD=your-password npm start
```

### Deploy for free (Render.com)

This repo includes a `render.yaml` for a one-click deploy:

1. Go to [Render](https://render.com) and sign in with GitHub.
2. **New > Blueprint**, pick this repo (`iptvclone`).
3. Render reads `render.yaml` automatically — set the `ADMIN_PASSWORD` env var when prompted.
4. Deploy. You'll get a public URL like `https://iptv-clone.onrender.com`.

Notes on the free tier:
- The service spins down after inactivity and takes ~30–60s to wake up on the next visit.
- The free plan has no persistent disk, so the disabled-channels list resets on redeploy/restart. Add a paid persistent disk mounted at `/data` if you need that to survive restarts.
