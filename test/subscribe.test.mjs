import { onRequestPost, onRequestGet } from "../functions/api/subscribe.js";

let pass = 0, fail = 0;
const req = (body) => new Request("https://x/api/subscribe", {
  method: "POST", headers: { "Content-Type": "application/json", "cf-ipcountry": "GB" },
  body: JSON.stringify(body),
});
async function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}
const run = async (body, env) => {
  const res = await onRequestPost({ request: req(body), env, waitUntil: (p) => p });
  return { status: res.status, body: await res.json() };
};
const mkKV = (opts = {}) => { const store = new Map(); return { store, put: async (k, v) => { if (opts.fail) throw new Error("kv down"); store.set(k, v); } }; };
const VALID = { email: "Ravi@Example.com ", updates: true, source: "flavourfrequency.com" };

// --- guards
await check("honeypot → 200 ok, nothing stored", await run({ ...VALID, frequency_check: "bot" }, {}), { status: 200, body: { ok: true } });
await check("bad email → 422", (await run({ email: "nope", updates: true }, { SUBSCRIBERS: mkKV() })).status, 422);
await check("consent unticked → 422", (await run({ email: "a@b.co", updates: false }, { SUBSCRIBERS: mkKV() })).status, 422);
await check("nothing configured → 501", (await run(VALID, {})).status, 501);
await check("GET → 405", (await onRequestGet()).status, 405);

// --- KV only
{
  const kv = mkKV();
  const r = await run(VALID, { SUBSCRIBERS: kv });
  await check("KV only → 200", r, { status: 200, body: { ok: true } });
  const rec = JSON.parse(kv.store.get("sub:ravi@example.com"));
  await check("email normalised + consent/country recorded",
    { email: rec.email, consent: rec.consent, country: rec.country, hasTs: !!rec.ts },
    { email: "ravi@example.com", consent: true, country: "GB", hasTs: true });
}

// --- webhook path
{
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
  const r = await run(VALID, { SC_WEBHOOK_URL: "https://hook.surecontact.com/abc" });
  await check("webhook only → 200", r, { status: 200, body: { ok: true } });
  await check("webhook received normalised email", calls[0]?.body.email, "ravi@example.com");
}

// --- API path sends the right shape (per https://api.surecontact.com/docs)
{
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response("{\"uuid\":\"u1\"}", { status: 200 }); };
  await run(VALID, { SC_API_KEY: "k_test" });
  const c = calls[0];
  await check("API: correct route", c.url, "https://api.surecontact.com/api/v1/public/contacts/upsert");
  await check("API: X-API-Key header (not Bearer)", { key: c.headers["X-API-Key"], auth: c.headers.Authorization }, { key: "k_test", auth: undefined });
  await check("API: email + source nested under primary_fields",
    { email: c.body.primary_fields.email, source: c.body.primary_fields.source, topLevelEmail: c.body.email },
    { email: "ravi@example.com", source: "form", topLevelEmail: undefined });
  await check("API: no status sent unless configured", c.body.primary_fields.status, undefined);
  await check("API: tags/lists by UUID, consent field by NAME",
    { tags: c.body.tag_uuids, lists: c.body.list_uuids, consentIsIso: /^\d{4}-\d{2}-\d{2}T.*Z$/.test(c.body.custom_fields.consent_timestamp) },
    { tags: ["8495b510-be54-4df0-92b0-17cb732c03a2"], lists: ["ec4e7e9f-5749-44fa-8c07-661bb8aa59ac"], consentIsIso: true });
}

// --- resilience: KV succeeded, CRM down → visitor still sees success
{
  const kv = mkKV();
  globalThis.fetch = async () => new Response("upstream boom", { status: 500 });
  const r = await run(VALID, { SUBSCRIBERS: kv, SC_API_KEY: "k" });
  await check("CRM down but KV stored → 200 (signup not lost)", r, { status: 200, body: { ok: true } });
  await check("  …and the record is in KV for replay", kv.store.has("sub:ravi@example.com"), true);
}

// --- no KV and CRM down → real error, so the page shows its mailto fallback
{
  globalThis.fetch = async () => new Response("upstream boom", { status: 500 });
  await check("no KV + CRM down → 502", (await run(VALID, { SC_API_KEY: "k" })).status, 502);
}

// --- double opt-in switch
{
  const calls = [];
  globalThis.fetch = async (u, i) => { calls.push(JSON.parse(i.body)); return new Response("{}", { status: 200 }); };
  await run(VALID, { SC_API_KEY: "k", SC_CONTACT_STATUS: "pending" });
  await check("SC_CONTACT_STATUS=pending honoured (in primary_fields)", calls[0].primary_fields.status, "pending");
}

// --- worker routing (worker.js is the Workers-with-assets entry point)
{
  const { default: worker } = await import("../worker.js");
  const ctx = { waitUntil: () => {} };
  const assetCalls = [];
  const env = { SUBSCRIBERS: mkKV(), ASSETS: { fetch: async (r) => { assetCalls.push(new URL(r.url).pathname); return new Response("asset", { status: 200 }); } } };

  const p = await worker.fetch(req(VALID), env, ctx);
  await check("worker: POST /api/subscribe → handler (200)", { status: p.status, body: await p.json() }, { status: 200, body: { ok: true } });

  const g = await worker.fetch(new Request("https://x/api/subscribe"), env, ctx);
  await check("worker: GET /api/subscribe → 405", g.status, 405);

  const a = await worker.fetch(new Request("https://x/menu-poster.jpg"), env, ctx);
  await check("worker: other paths fall through to ASSETS", { status: a.status, path: assetCalls[0] }, { status: 200, path: "/menu-poster.jpg" });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
