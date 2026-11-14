# iptvclone

A free IPTV viewer built on the [iptv-org](https://github.com/iptv-org/iptv) playlist, with:

- Live channel browsing, search, favorites, and category/language filters
- A **Video Club** with three tabs:
  - *Newly added films* — free, legal films from the [Internet Archive](https://archive.org/details/feature_films), newest first, with search, genre and sort filters (no setup needed)
  - *Now in cinemas* — current cinema releases with posters and YouTube trailers (needs a free TMDB API key, see below)
  - *Movie channels* — live movie-genre TV channels
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

## Optional: "Now in cinemas" (TMDB key)

The easiest way: open `/admin.html`, scroll to **Settings**, paste your key and press Save. The key is checked against TMDB before it is stored and is never shown again (only its last 4 characters). The sections below are the alternative of setting it on the server.

Get a free API key at <https://www.themoviedb.org/settings/api>, then:

- **PHP:** put it in `config.local.php` as `tmdb_api_key` (and set `tmdb_region`, e.g. `CA`, to pick the country). See "Your settings" below.
- **Node:** set `TMDB_API_KEY` (and optionally `TMDB_REGION`) environment variables.

Without a key that tab shows a short setup message; everything else works. The key stays on the server — it is never sent to the browser. Listings are cached for 6 hours. The tab has a language dropdown (Malayalam, Hindi, Tamil, Telugu, ...) that lists recent worldwide releases in that language, newest first; the default shows what is playing in your `tmdb_region`.

Note: the Internet Archive films are public-domain/classic titles; current cinema releases can only be shown as trailers.

## Option A: PHP hosting (shared hosting, cPanel, etc.)

Most cheap/shared hosting plans support this — no SSH or npm needed.

1. Copy `config.local.php.example` to `config.local.php` on your server and set
   your own admin password (and TMDB key). This file is never part of the
   download, so uploading a new version won't overwrite your settings. (Or set
   `ADMIN_PASSWORD` / `TMDB_API_KEY` environment variables if your host's
   control panel supports them.)
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

## CI/CD (GitHub Actions)

`.github/workflows/ci-cd.yml` runs on every push and pull request:

1. **Check** — syntax-checks all JS and PHP, then starts both backends (Node and PHP) and runs `tests/smoke.mjs` against each (login, viewer tracking, disable/enable, etc.). Run it yourself with `node tests/smoke.mjs http://localhost:8123`.
2. **Deploy** — on pushes to `main`, if the checks pass, uploads the site to your hosting over FTPS. It stamps asset URLs with the commit id so your host's 7-day cache can never serve stale files. It never uploads or deletes `data/` or `config.local.php`, so your settings and disabled-channel list are safe.

To enable the deploy step, add these in GitHub → repo **Settings → Secrets and variables → Actions**:

| Name | Type | Example |
| --- | --- | --- |
| `FTP_SERVER` | secret | `ftp.cognitioit.ca` (hPanel → Files → FTP Accounts) |
| `FTP_USERNAME` | secret | your FTP username |
| `FTP_PASSWORD` | secret | your FTP password |
| `FTP_SERVER_DIR` | secret | `/public_html/iptv/` (must end with `/`; may be just `/` if the FTP account is already inside that folder) |
| `SITE_URL` | variable (optional) | `https://cognitioit.ca/iptv/` — enables a post-deploy health check |
| `FTP_PROTOCOL` | variable (optional) | `ftp` if your host rejects `ftps` (default is `ftps`) |

Without the secrets the deploy job is skipped (checks still run). Create `config.local.php` on the server once, by hand — the pipeline deliberately never touches it.

## Security notes

- **Change the default admin password** (`admin123`) in `config.local.php` / `ADMIN_PASSWORD` before going public.
- Stored data (`data/`) is private: each file is a `.php` file that answers 404 if requested directly, admin session tokens are stored hashed, and `data/.htaccess` denies direct access as a second layer. The Node server refuses to serve `data/`, `server.js` and config files. `tests/smoke.mjs` checks this on every push.
