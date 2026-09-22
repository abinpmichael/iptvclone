// Shared between app.js (viewer) and admin.js (admin panel).
const IPTV = (() => {
  const PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u";

  function parseM3U(text) {
    const lines = text.split(/\r?\n/);
    const channels = [];
    let current = null;
    const attrRegex = /([\w-]+)="([^"]*)"/g;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("#EXTINF")) {
        const attrs = {};
        attrRegex.lastIndex = 0;
        let m;
        while ((m = attrRegex.exec(line))) attrs[m[1]] = m[2];
        const nameMatch = line.match(/,(.*)$/);
        const groupRaw = attrs["group-title"] || "Other";
        current = {
          id: attrs["tvg-id"] || "",
          logo: attrs["tvg-logo"] || "",
          group: groupRaw,
          tags: groupRaw
            .split(";")
            .map((t) => t.trim())
            .filter(Boolean),
          name: (nameMatch ? nameMatch[1] : "Unknown").trim() || "Unknown",
          url: "",
        };
      } else if (line.startsWith("#")) {
        continue;
      } else {
        if (current) {
          current.url = line;
          channels.push(current);
          current = null;
        }
      }
    }
    return channels;
  }

  // tvg-id is "<channelId>@<feedId>" (e.g. "00sReplay.us@SD"); the iptv-org
  // language API keys on the channel id alone.
  function baseChannelId(tvgId) {
    return (tvgId || "").split("@")[0];
  }

  return { PLAYLIST_URL, parseM3U, baseChannelId };
})();
