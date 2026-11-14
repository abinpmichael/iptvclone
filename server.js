const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, "data");
const DISABLED_FILE = path.join(DATA_DIR, "disabled.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DISABLED_FILE)) fs.writeFileSync(DISABLED_FILE, "[]");

function loadDisabled() {
  try {
    return new Set(JSON.parse(fs.readFileSync(DISABLED_FILE, "utf8")));
  } catch {
    return new Set();
  }
}
function saveDisabled() {
  fs.writeFileSync(DISABLED_FILE, JSON.stringify([...disabledChannels], null, 2));
}

let disabledChannels = loadDisabled();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const adminTokens = new Set();

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- Admin auth ---

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  adminTokens.add(token);
  res.json({ token });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  adminTokens.delete(token);
  res.json({ ok: true });
});

// --- Live viewer tracking ---

const viewers = new Map(); // viewerId -> { channelUrl, channelName, ip, joinedAt, lastSeen }
const HEARTBEAT_TIMEOUT_MS = 15000;

function pruneViewers() {
  const now = Date.now();
  for (const [id, v] of viewers) {
    if (now - v.lastSeen > HEARTBEAT_TIMEOUT_MS) viewers.delete(id);
  }
}

app.post("/api/heartbeat", (req, res) => {
  const { viewerId, channelUrl, channelName } = req.body || {};
  if (!viewerId || !channelUrl) {
    return res.status(400).json({ error: "Missing viewerId or channelUrl" });
  }
  pruneViewers();

  const allowed = !disabledChannels.has(channelUrl);
  if (allowed) {
    const existing = viewers.get(viewerId);
    viewers.set(viewerId, {
      channelUrl,
      channelName: channelName || "",
      ip: req.ip,
      joinedAt: existing && existing.channelUrl === channelUrl ? existing.joinedAt : Date.now(),
      lastSeen: Date.now(),
    });
  } else {
    viewers.delete(viewerId);
  }
  res.json({ allowed });
});

app.post("/api/leave", (req, res) => {
  const { viewerId } = req.body || {};
  if (viewerId) viewers.delete(viewerId);
  res.json({ ok: true });
});

// --- Disabled-channel list (public read, admin write) ---

app.get("/api/disabled", (req, res) => {
  res.json({ disabled: [...disabledChannels] });
});

app.get("/api/admin/viewers", requireAdmin, (req, res) => {
  pruneViewers();
  const list = [...viewers.entries()].map(([viewerId, v]) => ({ viewerId, ...v }));
  list.sort((a, b) => b.lastSeen - a.lastSeen);
  res.json({ viewers: list, count: list.length });
});

app.post("/api/admin/disable", requireAdmin, (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });
  disabledChannels.add(url);
  saveDisabled();
  for (const [id, v] of viewers) {
    if (v.channelUrl === url) viewers.delete(id);
  }
  res.json({ ok: true });
});

app.post("/api/admin/enable", requireAdmin, (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });
  disabledChannels.delete(url);
  saveDisabled();
  res.json({ ok: true });
});

// --- Channel language lookup (derived from the iptv-org API, cached & slimmed) ---

const FEEDS_URL = "https://iptv-org.github.io/api/feeds.json";
const LANGUAGES_URL = "https://iptv-org.github.io/api/languages.json";
const LANGUAGE_REFRESH_MS = 24 * 60 * 60 * 1000;

let languageData = { names: {}, channels: {} };

// Some upstream feeds use the ISO 639-2/B "bibliographic" code instead of the
// 639-3 code languages.json keys on (e.g. "cze" vs "ces" for Czech), which
// would otherwise split one language into two separate buckets.
const B_TO_T_CODE = {
  alb: "sqi",
  arm: "hye",
  baq: "eus",
  bur: "mya",
  chi: "zho",
  cze: "ces",
  dut: "nld",
  fre: "fra",
  geo: "kat",
  ger: "deu",
  gre: "ell",
  ice: "isl",
  mac: "mkd",
  mao: "mri",
  may: "msa",
  per: "fas",
  rum: "ron",
  slo: "slk",
  tib: "bod",
  wel: "cym",
};

async function refreshLanguageData() {
  try {
    const [feedsRes, langRes] = await Promise.all([fetch(FEEDS_URL), fetch(LANGUAGES_URL)]);
    const feeds = await feedsRes.json();
    const allLangNames = await langRes.json();

    const nameByCode = new Map(allLangNames.map((l) => [l.code, l.name]));
    const channels = {};
    const usedCodes = new Set();

    for (const feed of feeds) {
      if (!feed.channel || !Array.isArray(feed.languages) || feed.languages.length === 0) continue;
      const set = channels[feed.channel] || (channels[feed.channel] = []);
      for (const rawCode of feed.languages) {
        const code = B_TO_T_CODE[rawCode] || rawCode;
        if (!set.includes(code)) set.push(code);
        usedCodes.add(code);
      }
    }

    const names = {};
    for (const code of usedCodes) {
      names[code] = nameByCode.get(code) || code;
    }

    languageData = { names, channels };
    console.log(
      `Loaded language data: ${Object.keys(channels).length} channels, ${Object.keys(names).length} languages.`
    );
  } catch (err) {
    console.error("Failed to refresh language data:", err.message);
  }
}

refreshLanguageData();
setInterval(refreshLanguageData, LANGUAGE_REFRESH_MS);

app.get("/api/languages", (req, res) => {
  res.json(languageData);
});

// --- "Now in cinemas" listings + trailers (TMDB; needs a free API key) ---

const TMDB_KEY = process.env.TMDB_API_KEY || "";
const TMDB_REGION = process.env.TMDB_REGION || "US";
const TMDB_BASE = process.env.TMDB_API_BASE || "https://api.themoviedb.org/3";
const CINEMA_CACHE_MS = 6 * 60 * 60 * 1000;
const cinemaCache = new Map(); // "" (now playing in region) or a language code -> { at, movies }
const trailerCache = new Map();

async function tmdbGet(pathname, params = {}) {
  const url = new URL(TMDB_BASE + pathname);
  const headers = {};
  // A v4 "read access token" is a long JWT; a v3 key is a short hex string.
  if (TMDB_KEY.length > 60) headers.Authorization = "Bearer " + TMDB_KEY;
  else url.searchParams.set("api_key", TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("TMDB responded " + res.status);
  return res.json();
}

function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

// lang === "": what is playing in TMDB_REGION right now.
// lang === "ml" etc.: recent worldwide releases whose original language matches,
// newest first (so e.g. new Malayalam films show even if not showing locally).
async function loadCinemaList(lang) {
  const cached = cinemaCache.get(lang);
  if (cached && Date.now() - cached.at < CINEMA_CACHE_MS) return cached.movies;

  const fetchPage = (page) =>
    lang
      ? tmdbGet("/discover/movie", {
          with_original_language: lang,
          sort_by: "primary_release_date.desc",
          "primary_release_date.gte": isoDay(-150),
          "primary_release_date.lte": isoDay(21),
          include_adult: "false",
          language: "en-US",
          page,
        })
      : tmdbGet("/movie/now_playing", { region: TMDB_REGION, language: "en-US", page });

  const pages = await Promise.all([1, 2].map(fetchPage));
  const movies = pages
    .flatMap((p) => p.results || [])
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster: m.poster_path ? "https://image.tmdb.org/t/p/w342" + m.poster_path : "",
      release: m.release_date || "",
      overview: m.overview || "",
      rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : 0,
    }));
  cinemaCache.set(lang, { at: Date.now(), movies });
  return movies;
}

async function loadTrailer(id) {
  if (trailerCache.has(id)) return trailerCache.get(id);
  const data = await tmdbGet(`/movie/${id}/videos`, { language: "en-US" });
  const yt = (data.results || []).filter((v) => v.site === "YouTube");
  const pick =
    yt.find((v) => v.type === "Trailer" && v.official) ||
    yt.find((v) => v.type === "Trailer") ||
    yt.find((v) => v.type === "Teaser");
  const result = pick ? { key: pick.key, name: pick.name } : { key: null };
  trailerCache.set(id, result);
  return result;
}

app.get("/api/cinema", async (req, res) => {
  if (!TMDB_KEY) return res.json({ configured: false });
  try {
    if (req.query.id !== undefined) {
      if (!/^\d+$/.test(String(req.query.id))) return res.status(400).json({ error: "Bad id" });
      return res.json(await loadTrailer(String(req.query.id)));
    }
    const lang = String(req.query.lang || "");
    if (lang && !/^[a-z]{2}$/.test(lang)) return res.status(400).json({ error: "Bad language" });
    res.json({ configured: true, region: TMDB_REGION, lang, movies: await loadCinemaList(lang) });
  } catch (err) {
    console.error("Cinema lookup failed:", err.message);
    res.status(502).json({ configured: true, error: "Couldn't reach TMDB right now." });
  }
});

const PORT = process.env.PORT || 8123;
app.listen(PORT, () => {
  console.log(`IPTV server running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin.html`);
  if (!TMDB_KEY) {
    console.log("TMDB_API_KEY not set — the Video Club 'Now in cinemas' tab will ask for a key.");
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Using default admin password "admin123" — set ADMIN_PASSWORD env var to change it.`);
  }
});
