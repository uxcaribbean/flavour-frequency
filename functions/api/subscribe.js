/**
 * POST /api/subscribe — "Stay on frequency" signups.
 *
 * Cloudflare Pages Function. Stores each signup in a KV namespace bound as
 * `SUBSCRIBERS` and/or forwards it to `SUBSCRIBE_WEBHOOK_URL` (Zapier, Make,
 * Mailchimp, your CRM…). Configure either in the Pages project:
 *   Settings → Bindings → KV namespace  → variable name: SUBSCRIBERS
 *   Settings → Variables → SUBSCRIBE_WEBHOOK_URL = https://…
 *
 * Until one of those exists the endpoint answers 501 and the page falls back
 * to a mailto: link, so nothing is silently lost.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  let data;
  try {
    const type = request.headers.get("content-type") || "";
    if (type.includes("application/json")) data = await request.json();
    else data = Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  // Honeypot: humans never see this field, bots fill everything.
  if (data.frequency_check) return json({ ok: true });

  const email = String(data.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, error: "Enter a valid email address." }, 422);
  }

  const record = {
    email,
    updates: data.updates === true || data.updates === "yes" || data.updates === "on",
    source: "flavourfrequency.com",
    country: request.headers.get("cf-ipcountry") || null,
    ts: new Date().toISOString(),
  };

  const hasKV = !!(env.SUBSCRIBERS && typeof env.SUBSCRIBERS.put === "function");
  const hasWebhook = typeof env.SUBSCRIBE_WEBHOOK_URL === "string" && env.SUBSCRIBE_WEBHOOK_URL.startsWith("https://");
  if (!hasKV && !hasWebhook) return json({ ok: false, error: "Signup isn't configured yet." }, 501);

  const tasks = [];
  if (hasKV) tasks.push(env.SUBSCRIBERS.put(`sub:${email}`, JSON.stringify(record)));
  if (hasWebhook) {
    tasks.push(
      fetch(env.SUBSCRIBE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((r) => { if (!r.ok) throw new Error(`webhook responded ${r.status}`); })
    );
  }

  try {
    await Promise.all(tasks);
  } catch (err) {
    console.error("subscribe failed:", err && err.message);
    return json({ ok: false, error: "Couldn't save your signup — try again in a moment." }, 502);
  }
  return json({ ok: true });
}

export const onRequestGet = () => json({ ok: false, error: "Method not allowed." }, 405);
