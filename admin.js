(() => {
  "use strict";

  const TOKEN_KEY = "iptv_admin_token";
  const PAGE_SIZE = 80;
  const VIEWERS_POLL_MS = 3000;

  const el = {
    loginScreen: document.getElementById("loginScreen"),
    loginForm: document.getElementById("loginForm"),
    password: document.getElementById("password"),
    loginError: document.getElementById("loginError"),
    adminApp: document.getElementById("adminApp"),
    logoutBtn: document.getElementById("logoutBtn"),
    viewerCount: document.getElementById("viewerCount"),
    viewersEmpty: document.getElementById("viewersEmpty"),
    viewersTable: document.getElementById("viewersTable"),
    viewersBody: document.getElementById("viewersBody"),
    disabledCount: document.getElementById("disabledCount"),
    channelSearch: document.getElementById("channelSearch"),
    disabledOnly: document.getElementById("disabledOnly"),
    channelStatus: document.getElementById("channelStatus"),
    channelResultCount: document.getElementById("channelResultCount"),
    channelList: document.getElementById("channelList"),
    loadMoreChannels: document.getElementById("loadMoreChannels"),
  };

  let token = localStorage.getItem(TOKEN_KEY) || "";
  let allChannels = [];
  let filteredChannels = [];
  let disabledChannels = new Set();
  let languageNames = {};
  let visibleCount = PAGE_SIZE;
  let viewersPollTimer = null;

  function authHeaders() {
    return { Authorization: "Bearer " + token };
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), ...authHeaders() },
    });
    if (res.status === 401) {
      logout();
      throw new Error("Unauthorized");
    }
    return res;
  }

  function showLogin(message) {
    el.loginScreen.hidden = false;
    el.adminApp.hidden = true;
    el.loginError.textContent = message || "";
    stopViewersPolling();
  }

  function showApp() {
    el.loginScreen.hidden = true;
    el.adminApp.hidden = false;
  }

  function logout() {
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  el.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    el.loginError.textContent = "";
    try {
      const res = await fetch("api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: el.password.value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        el.loginError.textContent = data.error || "Login failed";
        return;
      }
      const data = await res.json();
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      el.password.value = "";
      showApp();
      init();
    } catch {
      el.loginError.textContent = "Could not reach the server.";
    }
  });

  el.logoutBtn.addEventListener("click", async () => {
    try {
      await apiFetch("api/admin/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    logout();
  });

  // --- Live viewers ---

  function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m " + (s % 60) + "s";
    const h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }

  async function pollViewers() {
    try {
      const res = await apiFetch("api/admin/viewers");
      const data = await res.json();
      renderViewers(data.viewers || []);
    } catch {
      /* logout() already handled 401; otherwise just retry next tick */
    }
  }

  function renderViewers(viewers) {
    const now = Date.now();
    el.viewerCount.textContent = viewers.length;
    el.viewersEmpty.classList.toggle("show", viewers.length === 0);
    el.viewersTable.hidden = viewers.length === 0;

    el.viewersBody.innerHTML = "";
    for (const v of viewers) {
      const tr = document.createElement("tr");
      const cells = [
        v.channelName || "(unknown)",
        v.viewerId.slice(0, 10),
        v.ip || "—",
        formatDuration(now - v.joinedAt),
        formatDuration(now - v.lastSeen) + " ago",
      ];
      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        td.title = text;
        tr.appendChild(td);
      }
      el.viewersBody.appendChild(tr);
    }
  }

  function startViewersPolling() {
    stopViewersPolling();
    pollViewers();
    viewersPollTimer = setInterval(pollViewers, VIEWERS_POLL_MS);
  }
  function stopViewersPolling() {
    if (viewersPollTimer) clearInterval(viewersPollTimer);
    viewersPollTimer = null;
  }

  // --- Channel access ---

  function setChannelStatus(msg, show = true) {
    el.channelStatus.textContent = msg || "";
    el.channelStatus.classList.toggle("show", show && !!msg);
  }

  async function loadChannels() {
    setChannelStatus("Loading channel list…");
    try {
      const res = await fetch(IPTV.PLAYLIST_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      allChannels = IPTV.parseM3U(text).filter((c) => c.url);
      allChannels.sort((a, b) => a.name.localeCompare(b.name));
      setChannelStatus("", false);
      applyChannelFilter();
      loadLanguages();
    } catch (err) {
      setChannelStatus("Couldn't load the channel list (" + err.message + ").");
    }
  }

  async function loadLanguages() {
    try {
      const res = await fetch("api/languages");
      const data = await res.json();
      languageNames = data.names || {};
      const channelLanguages = data.channels || {};
      for (const ch of allChannels) {
        ch.languages = channelLanguages[IPTV.baseChannelId(ch.id)] || [];
      }
      renderChannelList();
    } catch {
      /* language data unavailable */
    }
  }

  function languageName(code) {
    return languageNames[code] || code;
  }

  async function loadDisabledList() {
    try {
      const res = await fetch("api/disabled");
      const data = await res.json();
      disabledChannels = new Set(data.disabled || []);
      el.disabledCount.textContent = disabledChannels.size + " disabled";
    } catch {
      /* keep previous */
    }
  }

  function applyChannelFilter() {
    const term = el.channelSearch.value.trim().toLowerCase();
    const onlyDisabled = el.disabledOnly.checked;

    filteredChannels = allChannels.filter((ch) => {
      if (onlyDisabled && !disabledChannels.has(ch.url)) return false;
      if (term) {
        const langText = (ch.languages || []).map(languageName).join(" ");
        const hay = (ch.name + " " + ch.group + " " + langText).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    visibleCount = PAGE_SIZE;
    renderChannelList();
  }

  function renderChannelList() {
    el.channelList.innerHTML = "";
    const slice = filteredChannels.slice(0, visibleCount);

    el.channelResultCount.textContent =
      filteredChannels.length.toLocaleString() + " channel" + (filteredChannels.length === 1 ? "" : "s");

    const frag = document.createDocumentFragment();
    for (const ch of slice) {
      frag.appendChild(buildChannelRow(ch));
    }
    el.channelList.appendChild(frag);
    el.loadMoreChannels.hidden = visibleCount >= filteredChannels.length;
  }

  function buildChannelRow(ch) {
    const row = document.createElement("div");
    const isDisabled = disabledChannels.has(ch.url);
    row.className = "admin-channel-row" + (isDisabled ? " is-disabled" : "");

    const logo = document.createElement("img");
    logo.className = "ac-logo";
    logo.loading = "lazy";
    logo.src = ch.logo || "";
    logo.alt = "";
    logo.onerror = () => (logo.style.visibility = "hidden");

    const meta = document.createElement("div");
    meta.className = "ac-meta";
    const name = document.createElement("div");
    name.className = "ac-name";
    name.textContent = ch.name;
    const group = document.createElement("div");
    group.className = "ac-group";
    const langLabel = (ch.languages || []).map(languageName).join(", ");
    group.textContent = langLabel ? `${ch.group} · ${langLabel}` : ch.group;
    meta.appendChild(name);
    meta.appendChild(group);

    const toggle = document.createElement("button");
    toggle.className = "ac-toggle " + (isDisabled ? "is-disabled-state" : "is-enabled");
    toggle.textContent = isDisabled ? "Disabled — allow" : "Enabled — disallow";
    toggle.addEventListener("click", () => toggleChannel(ch, toggle, row));

    row.appendChild(logo);
    row.appendChild(meta);
    row.appendChild(toggle);
    return row;
  }

  async function toggleChannel(ch, toggleBtn, row) {
    const isDisabled = disabledChannels.has(ch.url);
    const action = isDisabled ? "enable" : "disable";
    toggleBtn.disabled = true;
    try {
      await apiFetch("api/admin/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ch.url }),
      });
      if (isDisabled) disabledChannels.delete(ch.url);
      else disabledChannels.add(ch.url);
      el.disabledCount.textContent = disabledChannels.size + " disabled";

      const nowDisabled = disabledChannels.has(ch.url);
      row.classList.toggle("is-disabled", nowDisabled);
      toggleBtn.className = "ac-toggle " + (nowDisabled ? "is-disabled-state" : "is-enabled");
      toggleBtn.textContent = nowDisabled ? "Disabled — allow" : "Enabled — disallow";

      if (el.disabledOnly.checked && !nowDisabled) {
        applyChannelFilter();
      }
    } catch {
      /* 401 already redirected to login; other errors: leave state unchanged */
    } finally {
      toggleBtn.disabled = false;
    }
  }

  el.channelSearch.addEventListener("input", debounce(applyChannelFilter, 150));
  el.disabledOnly.addEventListener("change", applyChannelFilter);
  el.loadMoreChannels.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderChannelList();
  });

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function init() {
    await loadDisabledList();
    startViewersPolling();
    loadChannels();
  }

  if (!token) {
    showLogin();
  } else {
    showApp();
    init();
  }
})();
