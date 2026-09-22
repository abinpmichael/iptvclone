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

const PORT = process.env.PORT || 8123;
app.listen(PORT, () => {
  console.log(`IPTV server running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin.html`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Using default admin password "admin123" — set ADMIN_PASSWORD env var to change it.`);
  }
});
