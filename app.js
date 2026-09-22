(() => {
  "use strict";

  const PLAYLIST_URL = IPTV.PLAYLIST_URL;
  const PAGE_SIZE = 60;
  const FAV_KEY = "iptv_favorites_v1";
  const VIEWER_ID_KEY = "iptv_viewer_id";
  const HEARTBEAT_INTERVAL_MS = 5000;

  const el = {
    search: document.getElementById("search"),
    menuToggle: document.getElementById("menuToggle"),
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    categoryList: document.getElementById("categoryList"),
    languageList: document.getElementById("languageList"),
    favCount: document.getElementById("favCount"),
    video: document.getElementById("video"),
    playerPlaceholder: document.getElementById("playerPlaceholder"),
    playerStatus: document.getElementById("playerStatus"),
    npLogo: document.getElementById("npLogo"),
    npName: document.getElementById("npName"),
    npGroup: document.getElementById("npGroup"),
    npFav: document.getElementById("npFav"),
    sectionTitle: document.getElementById("sectionTitle"),
    resultCount: document.getElementById("resultCount"),
    sortSelect: document.getElementById("sortSelect"),
    status: document.getElementById("status"),
    channelGrid: document.getElementById("channelGrid"),
    loadMore: document.getElementById("loadMore"),
  };

  let allChannels = [];
  let filtered = [];
  let visibleCount = PAGE_SIZE;
  let activeCategory = "__all__";
  let activeLanguage = "__any__";
  let languageNames = {};
  let searchTerm = "";
  let sortMode = "name";
  let currentChannel = null;
  let hls = null;
  let favorites = loadFavorites();
  let disabledChannels = new Set();
  let heartbeatTimer = null;
  const viewerId = getViewerId();

  function getViewerId() {
    let id = localStorage.getItem(VIEWER_ID_KEY);
    if (!id) {
      id = "v-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(VIEWER_ID_KEY, id);
    }
    return id;
  }

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
    } catch {
      /* storage unavailable; favorites stay session-only */
    }
    el.favCount.textContent = favorites.size;
  }

  function channelKey(ch) {
    return ch.url;
  }

  function setStatus(msg, show = true) {
    el.status.textContent = msg || "";
    el.status.classList.toggle("show", show && !!msg);
  }

  async function loadPlaylist() {
    setStatus("Loading channel list…");
    try {
      const res = await fetch(PLAYLIST_URL, { cache: "default" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      allChannels = IPTV.parseM3U(text).filter((c) => c.url);
      buildCategoryList();
      setStatus("", false);
      applyFilters();
      refreshDisabled();
      setInterval(refreshDisabled, 20000);
      loadLanguages();
    } catch (err) {
      console.error(err);
      setStatus(
        "Couldn't load the channel list (" + err.message + "). Check your connection and reload."
      );
    }
  }

  async function refreshDisabled() {
    try {
      const res = await fetch("/api/disabled");
      const data = await res.json();
      const next = new Set(data.disabled || []);
      const changed =
        next.size !== disabledChannels.size || [...next].some((u) => !disabledChannels.has(u));
      disabledChannels = next;
      if (currentChannel && disabledChannels.has(channelKey(currentChannel))) {
        stopPlayback("This channel has been disabled by the admin");
      }
      if (changed) applyFilters();
    } catch {
      /* offline or server unreachable; keep last known list */
    }
  }

  function buildCategoryList() {
    const counts = new Map();
    for (const ch of allChannels) {
      for (const tag of ch.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const groups = [...counts.keys()].sort((a, b) => a.localeCompare(b));

    el.categoryList.innerHTML = "";
    for (const g of groups) {
      const btn = document.createElement("button");
      btn.className = "cat-item";
      btn.dataset.cat = g;
      btn.innerHTML = `<span>${escapeHtml(g)}</span><span class="badge">${counts.get(g)}</span>`;
      btn.addEventListener("click", () => selectCategory(g));
      el.categoryList.appendChild(btn);
    }
  }

  function selectCategory(cat) {
    activeCategory = cat;
    document.querySelectorAll(".cat-item[data-cat]").forEach((b) => {
      b.classList.toggle("active", b.dataset.cat === cat);
    });
    closeSidebar();
    visibleCount = PAGE_SIZE;
    applyFilters();
  }

  function buildLanguageList() {
    const counts = new Map();
    for (const ch of allChannels) {
      for (const code of ch.languages || []) {
        counts.set(code, (counts.get(code) || 0) + 1);
      }
    }
    const codes = [...counts.keys()].sort((a, b) =>
      languageName(a).localeCompare(languageName(b))
    );

    el.languageList.innerHTML = "";
    for (const code of codes) {
      const btn = document.createElement("button");
      btn.className = "cat-item lang-item";
      btn.dataset.lang = code;
      btn.innerHTML = `<span>${escapeHtml(languageName(code))}</span><span class="badge">${counts.get(code)}</span>`;
      btn.addEventListener("click", () => selectLanguage(code));
      el.languageList.appendChild(btn);
    }
  }

  function languageName(code) {
    return languageNames[code] || code;
  }

  function selectLanguage(lang) {
    activeLanguage = lang;
    document.querySelectorAll(".lang-item[data-lang]").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === lang);
    });
    closeSidebar();
    visibleCount = PAGE_SIZE;
    applyFilters();
  }

  async function loadLanguages() {
    try {
      const res = await fetch("/api/languages");
      const data = await res.json();
      languageNames = data.names || {};
      const channelLanguages = data.channels || {};
      for (const ch of allChannels) {
        ch.languages = channelLanguages[IPTV.baseChannelId(ch.id)] || [];
      }
      buildLanguageList();
      applyFilters();
    } catch {
      /* language data unavailable; category/search filtering still works */
    }
  }

  function applyFilters() {
    const term = searchTerm.trim().toLowerCase();

    filtered = allChannels.filter((ch) => {
      if (disabledChannels.has(channelKey(ch))) return false;
      if (activeLanguage !== "__any__" && !(ch.languages || []).includes(activeLanguage)) {
        return false;
      }
      if (activeCategory === "__fav__") {
        if (!favorites.has(channelKey(ch))) return false;
      } else if (activeCategory === "__club__") {
        if (!ch.tags.includes("Movies")) return false;
      } else if (activeCategory !== "__all__") {
        if (!ch.tags.includes(activeCategory)) return false;
      }
      if (term) {
        const langText = (ch.languages || []).map(languageName).join(" ");
        const hay = (ch.name + " " + ch.group + " " + ch.id + " " + langText).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    if (sortMode === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      filtered.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    }

    renderGrid();
  }

  function renderGrid() {
    const isClub = activeCategory === "__club__";
    el.sectionTitle.hidden = !isClub;
    el.channelGrid.classList.toggle("video-club", isClub);

    el.channelGrid.innerHTML = "";
    const slice = filtered.slice(0, visibleCount);

    el.resultCount.textContent =
      filtered.length === 0
        ? "No channels found"
        : `${filtered.length.toLocaleString()} channel${filtered.length === 1 ? "" : "s"}`;

    const frag = document.createDocumentFragment();
    for (const ch of slice) {
      frag.appendChild(buildCard(ch, isClub));
    }
    el.channelGrid.appendChild(frag);

    el.loadMore.hidden = visibleCount >= filtered.length;
  }

  function buildCard(ch, posterMode) {
    const card = document.createElement("button");
    card.className = posterMode ? "channel-card channel-card-poster" : "channel-card";
    if (currentChannel && channelKey(currentChannel) === channelKey(ch)) {
      card.classList.add("playing");
    }

    const logo = document.createElement("img");
    logo.className = "ch-logo";
    logo.loading = "lazy";
    logo.src = ch.logo || fallbackLogo();
    logo.alt = "";
    logo.onerror = () => {
      logo.src = fallbackLogo();
    };

    const meta = document.createElement("div");
    meta.className = "ch-meta";
    const name = document.createElement("div");
    name.className = "ch-name";
    name.textContent = ch.name;
    const group = document.createElement("div");
    group.className = "ch-group";
    const langLabel = (ch.languages || []).map(languageName).join(", ");
    group.textContent = langLabel ? `${ch.group} · ${langLabel}` : ch.group;
    meta.appendChild(name);
    meta.appendChild(group);

    const favBtn = document.createElement("button");
    favBtn.className = "ch-fav";
    const isFav = favorites.has(channelKey(ch));
    favBtn.classList.toggle("active", isFav);
    favBtn.textContent = isFav ? "★" : "☆";
    favBtn.title = "Toggle favorite";
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(ch);
      favBtn.classList.toggle("active", favorites.has(channelKey(ch)));
      favBtn.textContent = favorites.has(channelKey(ch)) ? "★" : "☆";
      if (activeCategory === "__fav__") applyFilters();
    });

    card.appendChild(logo);
    card.appendChild(meta);
    card.appendChild(favBtn);

    card.addEventListener("click", () => playChannel(ch));
    return card;
  }

  function fallbackLogo() {
    return (
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="14" fill="#1e222b"/><text x="50" y="62" font-size="46" text-anchor="middle">📺</text></svg>'
      )
    );
  }

  function toggleFavorite(ch) {
    const key = channelKey(ch);
    if (favorites.has(key)) favorites.delete(key);
    else favorites.add(key);
    saveFavorites();
    if (currentChannel && channelKey(currentChannel) === key) updateFavButton();
  }

  function updateFavButton() {
    const isFav = currentChannel && favorites.has(channelKey(currentChannel));
    el.npFav.classList.toggle("active", !!isFav);
    el.npFav.textContent = isFav ? "★" : "☆";
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function playChannel(ch) {
    if (disabledChannels.has(channelKey(ch))) {
      setPlayerStatus("This channel has been disabled by the admin", "error");
      return;
    }

    currentChannel = ch;
    el.playerPlaceholder.style.display = "none";
    el.npName.textContent = ch.name;
    el.npGroup.textContent = ch.group;
    el.npLogo.src = ch.logo || fallbackLogo();
    el.npLogo.onerror = () => (el.npLogo.src = fallbackLogo());
    updateFavButton();
    renderGrid();

    setPlayerStatus("Loading…", "loading");

    if (hls) {
      hls.destroy();
      hls = null;
    }
    el.video.removeAttribute("src");
    el.video.load();

    const url = ch.url;
    const isM3U8 = /\.m3u8($|\?)/i.test(url) || url.includes("m3u8");

    if (isM3U8 && window.Hls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(url);
      hls.attachMedia(el.video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        el.video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setPlayerStatus("Stream unavailable — try another channel", "error");
        }
      });
    } else if (isM3U8 && el.video.canPlayType("application/vnd.apple.mpegurl")) {
      el.video.src = url;
      el.video.play().catch(() => {});
    } else {
      el.video.src = url;
      el.video.play().catch(() => {});
    }

    el.video.onplaying = () => setPlayerStatus("", "", false);
    el.video.onwaiting = () => setPlayerStatus("Buffering…", "loading");
    el.video.onerror = () => setPlayerStatus("Stream unavailable — try another channel", "error");

    startHeartbeat(ch);
  }

  function stopPlayback(message) {
    stopHeartbeat();
    if (hls) {
      hls.destroy();
      hls = null;
    }
    el.video.pause();
    el.video.removeAttribute("src");
    el.video.load();
    setPlayerStatus(message || "", "error");
  }

  function startHeartbeat(ch) {
    stopHeartbeat();
    sendHeartbeat(ch);
    heartbeatTimer = setInterval(() => sendHeartbeat(ch), HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function sendHeartbeat(ch) {
    try {
      const res = await fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId, channelUrl: ch.url, channelName: ch.name }),
      });
      const data = await res.json();
      if (!data.allowed && currentChannel && channelKey(currentChannel) === ch.url) {
        disabledChannels.add(ch.url);
        stopPlayback("This channel has been disabled by the admin");
        applyFilters();
      }
    } catch {
      /* server unreachable; keep playing locally, retry next tick */
    }
  }

  function setPlayerStatus(msg, kind, show = true) {
    el.playerStatus.textContent = msg;
    el.playerStatus.className = "player-status";
    if (show && msg) {
      el.playerStatus.classList.add("show");
      if (kind) el.playerStatus.classList.add(kind);
    }
  }

  window.addEventListener("pagehide", () => {
    if (!currentChannel) return;
    try {
      navigator.sendBeacon(
        "/api/leave",
        new Blob([JSON.stringify({ viewerId })], { type: "application/json" })
      );
    } catch {
      /* best-effort only */
    }
  });

  // Events
  let searchDebounce = null;
  el.search.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchTerm = el.search.value;
      visibleCount = PAGE_SIZE;
      applyFilters();
    }, 150);
  });

  el.sortSelect.addEventListener("change", () => {
    sortMode = el.sortSelect.value;
    applyFilters();
  });

  el.loadMore.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderGrid();
  });

  el.npFav.addEventListener("click", () => {
    if (!currentChannel) return;
    toggleFavorite(currentChannel);
    updateFavButton();
    renderGrid();
  });

  document.querySelector('.cat-item[data-cat="__all__"]').addEventListener("click", () => selectCategory("__all__"));
  document.querySelector('.cat-item[data-cat="__fav__"]').addEventListener("click", () => selectCategory("__fav__"));
  document.querySelector('.cat-item[data-cat="__club__"]').addEventListener("click", () => selectCategory("__club__"));
  document.querySelector('.lang-item[data-lang="__any__"]').addEventListener("click", () => selectLanguage("__any__"));

  function openSidebar() {
    el.sidebar.classList.add("open");
    el.sidebarOverlay.classList.add("show");
  }
  function closeSidebar() {
    el.sidebar.classList.remove("open");
    el.sidebarOverlay.classList.remove("show");
  }
  el.menuToggle.addEventListener("click", () => {
    el.sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  el.sidebarOverlay.addEventListener("click", closeSidebar);

  el.favCount.textContent = favorites.size;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  loadPlaylist();
})();
