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
  let cinema = { loaded: false, loading: false };

  const q = (id) => document.getElementById(id);
  const el = {};

  function init(options) {
    opts = options;
    el.tabs = q("clubTabs");
    el.panel = q("clubPanel");
    el.filters = q("clubFilters");
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
    if (tab === "films") {
      if (films.items.length === 0 && !films.loading) loadFilms(true);
      else paintFilms();
    } else if (tab === "cinema") {
      el.more.hidden = true;
      if (!cinema.loaded && !cinema.loading) loadCinema();
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
    let query = "collection:feature_films AND mediatype:movies";
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
    cinema.loading = true;
    setStatus("Loading films now in cinemas…");
    try {
      const res = await fetch("api/cinema");
      const data = await res.json();
      cinema = { loaded: true, loading: false, data };
    } catch {
      cinema = { loaded: false, loading: false };
      setStatus("Couldn't reach the server for cinema listings.");
      return;
    }
    paintCinema();
  }

  function paintCinema() {
    el.grid.innerHTML = "";
    const data = cinema.data;
    if (!data) return;
    if (data.configured === false) {
      setStatus(
        "Cinema listings need a free TMDB API key. Set TMDB_API_KEY (Node) or tmdb_api_key in config.php (PHP), then reload."
      );
      return;
    }
    if (data.error || !Array.isArray(data.movies)) {
      setStatus(data.error || "Cinema listings are unavailable right now.");
      return;
    }
    setStatus(data.movies.length ? "" : "No films found.");
    const frag = document.createDocumentFragment();
    for (const m of data.movies) {
      const card = buildCard({
        poster: m.poster,
        title: m.title,
        sub: [m.release, m.rating ? "★ " + m.rating : ""].filter(Boolean).join(" · "),
        tooltip: m.overview,
        onClick: () => playTrailer(m),
      });
      frag.appendChild(card);
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
