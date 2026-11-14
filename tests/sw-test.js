const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(process.argv[2], "utf8");
const store = new Map(); let online = true; const handlers = {};
const mkRes = (body, ok = true) => ({ ok, body, clone() { return this; } });
const sandbox = {
  URL, console,
  self: { location: { origin: "https://site.test" }, addEventListener: (t, f) => (handlers[t] = f), skipWaiting() {}, clients: { claim() {} } },
  caches: {
    open: async () => ({ put: async (req, res) => store.set(req.url, res), addAll: async () => {} }),
    match: async (req) => store.get(req.url) || [...store].find(([u]) => u.split("?")[0] === req.url.split("?")[0])?.[1],
    keys: async () => [],
  },
  fetch: async (req) => { if (!online) throw new Error("offline"); return mkRes("NETWORK:" + req.url); },
};
vm.createContext(sandbox); vm.runInContext(src, sandbox);
async function fire(url, method = "GET") {
  let responded = null;
  handlers.fetch({ request: { url, method }, respondWith: (p) => (responded = p) });
  return responded ? (await responded)?.body ?? "undefined" : "NOT-INTERCEPTED";
}
let fail = 0; const eq = (n, a, b) => { const ok = a === b; if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : ` (got ${a})`)); };
(async () => {
  eq("online: fresh network copy served", await fire("https://site.test/iptv/app.js?v=7"), "NETWORK:https://site.test/iptv/app.js?v=7");
  await new Promise((r) => setTimeout(r, 10));
  online = false;
  eq("offline: falls back to cached copy", await fire("https://site.test/iptv/app.js?v=7"), "NETWORK:https://site.test/iptv/app.js?v=7");
  eq("offline: cached copy found even if ?v changed", await fire("https://site.test/iptv/app.js?v=8"), "NETWORK:https://site.test/iptv/app.js?v=7");
  online = true;
  eq("api calls are not intercepted", await fire("https://site.test/iptv/api/heartbeat"), "NOT-INTERCEPTED");
  eq("POST not intercepted", await fire("https://site.test/iptv/app.js", "POST"), "NOT-INTERCEPTED");
  eq("cross-origin (playlist/streams) not intercepted", await fire("https://iptv-org.github.io/iptv/index.m3u"), "NOT-INTERCEPTED");
  process.exit(fail ? 1 : 0);
})();
