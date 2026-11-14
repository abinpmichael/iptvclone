// API smoke test, run against either backend: node tests/smoke.mjs http://localhost:8123
const base = (process.argv[2] || "http://localhost:8123").replace(/\/$/, "");
const password = process.env.SMOKE_ADMIN_PASSWORD || "admin123";
const testUrl = "https://example.invalid/smoke-test/stream.m3u8";
const viewerId = "v-smoke-" + Date.now();
let failures = 0;

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

function check(name, ok) {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) failures++;
}

const home = await fetch(base + "/");
const html = await home.text();
check("home page served with Video Club script", home.status === 200 && html.includes("videoclub.js"));

let r = await call("GET", "/api/disabled");
check("GET /api/disabled returns a list", r.status === 200 && Array.isArray(r.json?.disabled));

r = await call("POST", "/api/admin/login", { body: { password: "definitely-wrong" } });
check("wrong admin password rejected (401)", r.status === 401);

r = await call("POST", "/api/admin/login", { body: { password } });
const token = r.json?.token;
check("admin login returns a token", r.status === 200 && !!token);

r = await call("GET", "/api/admin/viewers");
check("viewers list requires auth (401)", r.status === 401);

r = await call("POST", "/api/heartbeat", { body: { viewerId, channelUrl: testUrl, channelName: "Smoke" } });
check("heartbeat allowed for a normal channel", r.status === 200 && r.json?.allowed === true);

r = await call("GET", "/api/admin/viewers", { token });
check("viewer shows up in admin list", r.json?.viewers?.some((v) => v.viewerId === viewerId));

r = await call("POST", "/api/admin/disable", { body: { url: testUrl }, token });
check("admin can disable a channel", r.status === 200);

r = await call("GET", "/api/admin/viewers", { token });
check("disabling kicks the current viewer", !r.json?.viewers?.some((v) => v.viewerId === viewerId));

r = await call("POST", "/api/heartbeat", { body: { viewerId, channelUrl: testUrl, channelName: "Smoke" } });
check("heartbeat refused for a disabled channel", r.json?.allowed === false);

r = await call("GET", "/api/disabled");
check("disabled list includes the channel", r.json?.disabled?.includes(testUrl));

r = await call("POST", "/api/admin/enable", { body: { url: testUrl }, token });
check("admin can re-enable the channel", r.status === 200);

r = await call("GET", "/api/disabled");
check("disabled list no longer includes it", !r.json?.disabled?.includes(testUrl));

await call("POST", "/api/leave", { body: { viewerId } });
r = await call("GET", "/api/cinema");
check("cinema endpoint answers (configured flag present)", r.status === 200 && "configured" in (r.json || {}));

await call("POST", "/api/admin/logout", { token });
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
