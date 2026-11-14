// Video Club: "Newly added films" (Internet Archive), "Now in cinemas" (TMDB
// trailers via the backend's api/cinema), and the live movie channels tab.
const VideoClub = (() => {
  "use strict";

  const ARCHIVE = "https://archive.org";
  const FILMS_PAGE_SIZE = 48;

  const SORTS = [
    { value: "addeddate desc", label: "Newly added" },
    { value: "date desc", label: "Release year (newest)" },
    { value: "downloads desc", label: "Most watched" },
  ];
  const GENRES = [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama",
    "Family", "Fantasy", "Horror", "Martial Arts", "Musical", "Mystery", "Noir",
    "Romance", "Sci-Fi", "Thriller", "War", "Western",
  ];

  let opts = null;
  let tab = "films";
  let search = "";
  let sort = SORTS[0].value;
  let genre = "";
  let films = { items: [], page: 0, total: 0, loading: false, key: "" };
  const LANG_KEY = "iptv_cinema_lang";
  const CINEMA_LANGS = [
    ["", "Now playing in my country"],
    ["ml", "Malayalam"], ["hi", "Hindi"], ["ta", "Tamil"], ["te", "Telugu"], ["kn", "Kannada"],
    ["en", "English"], ["ko", "Korean"], ["ja", "Japanese"], ["es", "Spanish"], ["fr", "French"],
    ["pa", "Punjabi"], ["bn", "Bengali"], ["mr", "Marathi"], ["zh", "Chinese"],
  ];
  let cinemaLang = "";
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (CINEMA_LANGS.some(([c]) => c === saved)) cinemaLang = saved;
  } catch {
    /* storage unavailable */
  }
  let cinema = { byLang: {}, loading: false };

  const q = (id) => document.getElementById(id);
  const el = {};

  function init(options) {
    opts = options;
    el.tabs = q("clubTabs");
    el.panel = q("clubPanel");
    el.filters = q("clubFilters");
    el.cinemaFilters = q("cinemaFilters");
    el.cinemaLang = q("cinemaLang");
    el.cinemaHint = q("cinemaHint");
    el.sort = q("clubSort");
    el.genre = q("clubGenre");
    el.status = q("clubStatus");
    el.grid = q("clubGrid");
    el.more = q("clubMore");

    for (const s of SORTS) el.sort.add(new Option(s.label, s.value));
    el.genre.add(new Option("All genres", ""));
    for (const g of GENRES) el.genre.add(new Option(g, g));

    el.tabs.querySelectorAll(".club-tab").forEach((b) =>
      b.addEventListener("click", () => setTab(b.dataset.tab))
    );
    el.sort.addEventListener("change", () => {
      sort = el.sort.value;
      resetFilms();
    });
    el.genre.addEventListener("change", () => {
      genre = el.genre.value;
      resetFilms();
    });
    for (const [code, label] of CINEMA_LANGS) el.cinemaLang.add(new Option(label, code));
    el.cinemaLang.value = cinemaLang;
    el.cinemaLang.addEventListener("change", () => {
      cinemaLang = el.cinemaLang.value;
      try {
        localStorage.setItem(LANG_KEY, cinemaLang);
      } catch {
        /* storage unavailable */
      }
      render();
    });
    el.more.addEventListener("click", () => loadFilms(false));
  }

  function getTab() {
    return tab;
  }

  function setTab(next) {
    tab = next;
    el.tabs.querySelectorAll(".club-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === next)
    );
    opts.onTabChange();
  }

  function setSearch(term) {
    search = term.trim();
    resetFilms();
  }

  function setStatus(msg) {
    el.status.textContent = msg || "";
    el.status.classList.toggle("show", !!msg);
  }

  // Called by app.js whenever the grid area is re-rendered while Video Club
  // is open on a non-channels tab. Only fetches when there is nothing loaded.
  function render() {
    el.filters.hidden = tab !== "films";
    el.cinemaFilters.hidden = tab !== "cinema";
    if (tab === "films") {
      if (films.items.length === 0 && !films.loading) loadFilms(true);
      else paintFilms();
    } else if (tab === "cinema") {
      el.more.hidden = true;
      if (!cinema.byLang[cinemaLang] && !cinema.loading) loadCinema();
      else paintCinema();
    }
  }

  // ---- Newly added films (Internet Archive) ----

  function resetFilms() {
    films = { items: [], page: 0, total: 0, loading: false, key: "" };
    el.grid.innerHTML = "";
    if (tab === "films") loadFilms(true);
  }

  function filmsQuery() {
    // Only titles that have a playable video file and aren't access-restricted;
    // brand-new uploads are often still processing and would show a dead player.
    let query =
      "collection:feature_films AND mediatype:movies" +
      ' AND (format:"h.264" OR format:MPEG4 OR format:"Ogg Video" OR format:WebM OR format:"512Kb MPEG4")' +
      " AND NOT access-restricted-item:true";
    const words = search
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6);
    if (words.length) query += " AND title:(" + words.join(" AND ") + ")";
    if (genre) query += ` AND subject:("${genre}")`;
    return query;
  }

  async function loadFilms(first) {
    if (films.loading) return;
    films.loading = true;
    const key = filmsQuery() + "|" + sort;
    films.key = key;
    if (first) setStatus("Loading films…");
    el.more.hidden = true;

    const params = new URLSearchParams();
    params.set("q", filmsQuery());
    for (const f of ["identifier", "title", "year", "addeddate"]) params.append("fl[]", f);
    params.append("sort[]", sort);
    params.set("rows", FILMS_PAGE_SIZE);
    params.set("page", films.page + 1);
    params.set("output", "json");

    try {
      const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (films.key !== key) return; // filters changed while loading
      films.page += 1;
      films.total = data.response.numFound;
      films.items.push(...data.response.docs);
      setStatus("");
    } catch (err) {
      if (films.key === key) {
        setStatus("Couldn't load films from the Internet Archive (" + err.message + ").");
      }
    } finally {
      if (films.key === key) films.loading = false;
      if (tab === "films") paintFilms();
    }
  }

  function formatAdded(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function paintFilms() {
    el.grid.innerHTML = "";
    if (!films.loading && films.items.length === 0 && !el.status.textContent) {
      setStatus("No films found.");
    }
    const frag = document.createDocumentFragment();
    for (const f of films.items) {
      const added = formatAdded(f.addeddate);
      frag.appendChild(
        buildCard({
          poster: `${ARCHIVE}/services/img/${encodeURIComponent(f.identifier)}`,
          title: f.title || f.identifier,
          sub: [f.year, added && "added " + added].filter(Boolean).join(" · "),
          onClick: () =>
            opts.onPlayEmbed({
              url: `${ARCHIVE}/details/${f.identifier}`,
              name: f.title || f.identifier,
              group: "Free film · Internet Archive",
              logo: `${ARCHIVE}/services/img/${encodeURIComponent(f.identifier)}`,
              embed: `${ARCHIVE}/embed/${encodeURIComponent(f.identifier)}`,
            }),
        })
      );
    }
    el.grid.appendChild(frag);
    el.more.hidden = films.items.length >= films.total || films.loading;
  }

  // ---- Now in cinemas (TMDB trailers through the backend) ----

  async function loadCinema() {
    const lang = cinemaLang;
    cinema.loading = true;
    el.grid.innerHTML = "";
    setStatus("Loading films…");
    try {
      const res = await fetch("api/cinema" + (lang ? "?lang=" + encodeURIComponent(lang) : ""));
      cinema.byLang[lang] = await res.json();
    } catch {
      cinema.loading = false;
      setStatus("Couldn't reach the server for cinema listings.");
      return;
    }
    cinema.loading = false;
    if (tab === "cinema") render(); // repaint, or reload if the language changed meanwhile
  }

  function paintCinema() {
    el.grid.innerHTML = "";
    const data = cinema.byLang[cinemaLang];
    if (!data) return;
    const langName = (CINEMA_LANGS.find(([c]) => c === cinemaLang) || [])[1] || "";
    el.cinemaHint.textContent = cinemaLang
      ? `Recent and upcoming ${langName} releases worldwide, newest first.`
      : `Currently in cinemas${data.region ? " in " + data.region : ""}.`;
    if (data.configured === false) {
      setStatus(
        "Cinema listings need a free TMDB API key. On PHP hosting put tmdb_api_key in config.local.php (copy config.local.php.example); on Node set TMDB_API_KEY. Then reload."
      );
      return;
    }
    if (data.error || !Array.isArray(data.movies)) {
      delete cinema.byLang[cinemaLang]; // allow a retry next time
      setStatus(data.error || "Cinema listings are unavailable right now.");
      return;
    }
    setStatus(data.movies.length ? "" : `No recent ${langName} releases found.`);
    const today = new Date().toISOString().slice(0, 10);
    const frag = document.createDocumentFragment();
    for (const m of data.movies) {
      const upcoming = m.release && m.release > today;
      frag.appendChild(
        buildCard({
          poster: m.poster,
          title: m.title,
          sub: [upcoming ? "Coming " + m.release : m.release, m.rating ? "★ " + m.rating : ""]
            .filter(Boolean)
            .join(" · "),
          tooltip: m.overview,
          onClick: () => playTrailer(m),
        })
      );
    }
    el.grid.appendChild(frag);
  }

  async function playTrailer(m) {
    setStatus("Finding trailer for " + m.title + "…");
    try {
      const res = await fetch("api/cinema?id=" + encodeURIComponent(m.id));
      const data = await res.json();
      if (!data.key) {
        setStatus("No trailer available for " + m.title + ".");
        return;
      }
      setStatus("");
      opts.onPlayEmbed({
        url: `https://www.youtube.com/watch?v=${data.key}`,
        name: `${m.title} — trailer`,
        group: "In cinemas · TMDB",
        logo: m.poster,
        embed: `https://www.youtube.com/embed/${encodeURIComponent(data.key)}?autoplay=1&rel=0`,
      });
    } catch {
      setStatus("Couldn't load the trailer.");
    }
  }

  // ---- shared poster card ----

  function buildCard({ poster, title, sub, tooltip, onClick }) {
    const card = document.createElement("button");
    card.className = "channel-card channel-card-poster";
    if (tooltip) card.title = tooltip;

    const img = document.createElement("img");
    img.className = "ch-logo";
    img.loading = "lazy";
    img.alt = "";
    img.src = poster || "";
    img.onerror = () => (img.style.visibility = "hidden");

    const meta = document.createElement("div");
    meta.className = "ch-meta";
    const name = document.createElement("div");
    name.className = "ch-name";
    name.textContent = title;
    const subEl = document.createElement("div");
    subEl.className = "ch-group";
    subEl.textContent = sub || "";
    meta.append(name, subEl);

    card.append(img, meta);
    card.addEventListener("click", onClick);
    return card;
  }

  return { init, getTab, setSearch, render };
})();
