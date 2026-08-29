/**
 * POST /api/subscribe — "Stay on frequency" signups.
 *
 * Cloudflare Pages Function. This is the server-side proxy that keeps the
 * SureContact credential off the page: a static site has no server, so any key
 * in client JS would be public. Nothing here is ever sent to the browser.
 *
 * Configure in the Pages project (Settings → Variables / Bindings). Any
 * combination works; the endpoint only 501s when NONE are set, which makes the
 * page fall back to a mailto link rather than silently dropping signups.
 *
 *   SC_API_KEY      SureContact API key. Upserts the contact and sets tag,
 *                   list and consent timestamp. Richest option.
 *   SC_WEBHOOK_URL  A SureContact automation's Incoming Webhook URL. No key
 *                   needed; starts the automation directly. Unauthenticated by
 *                   design — safe only because it is called from here, never
 *                   from the browser.
 *   SUBSCRIBERS     KV namespace binding. Durable local record, written first
 *                   so a SureContact outage can never lose a signup.
 */

const SC_BASE = "https://api.surecontact.com/api/v1";

// Workspace-specific UUIDs — these are Flavour Frequency's and won't match
// another workspace. Human names kept alongside so this stays readable.
const SC = {
  tags: {
    subscribed: "8495b510-be54-4df0-92b0-17cb732c03a2", // "newsletter-subscribed"
  },
  lists: {
    newsletter: "ec4e7e9f-5749-44fa-8c07-661bb8aa59ac", // "Newsletter"
  },
  // NOTE: the upsert endpoint keys custom_fields by field NAME, not UUID
  // (per https://api.surecontact.com/docs). The workspace field is named
  // "consent_timestamp" (uuid e91857ed-3894-4fd1-908d-2e0dcc13b3fb, kept here
  // for reference — the MCP tools and other endpoints DO use uuids).
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Fail loudly: status + start of body, so a wrong route or header is obvious in the logs. */
async function scFetch(path, apiKey, payload) {
  const res = await fetch(SC_BASE + path, {
    method: "POST",
    headers: {
      // NOT "Authorization: Bearer" — SureContact uses X-API-Key.
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SureContact POST ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

async function sendToSureContact(env, record) {
  // Contacts are matched on email, so this is an upsert — re-submitting the
  // same address updates rather than duplicating. Request shape per the
  // official docs (https://api.surecontact.com/docs): identity fields nested
  // under primary_fields; tag/list UUID arrays top-level (appended, never
  // removed); custom_fields keyed by field NAME.
  const primary_fields = {
    email: record.email,
    source: "form", // docs enum: manual, import, api, form, integration
  };
  // The upsert status enum is active/unsubscribed/bounced/invalid/complained —
  // only send one when explicitly configured (e.g. a double-opt-in status),
  // otherwise let the server default apply.
  if (env.SC_CONTACT_STATUS) primary_fields.status = env.SC_CONTACT_STATUS;

  return scFetch("/public/contacts/upsert", env.SC_API_KEY, {
    primary_fields,
    metadata: { signup_page: "flavourfrequency.com", country: record.country || "unknown" },
    custom_fields: { consent_timestamp: record.ts },
    tag_uuids: [SC.tags.subscribed],
    list_uuids: [SC.lists.newsletter],
  });
}

export async function onRequestPost({ request, env, waitUntil }) {
  let data;
  try {
    const type = request.headers.get("content-type") || "";
    if (type.includes("application/json")) data = await request.json();
    else data = Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  // Honeypot: humans never see this field, bots fill everything. Answer 200 so
  // the bot learns nothing from the response.
  if (data.frequency_check) return json({ ok: true });

  const email = String(data.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, error: "Enter a valid email address." }, 422);
  }

  // Marketing may only go to consented contacts, and the tick box is that
  // consent. Without it there is no mailing list to join, so say so plainly
  // rather than storing an address we are not allowed to email.
  const consented = data.updates === true || data.updates === "yes" || data.updates === "on";
  if (!consented) {
    return json(
      { ok: false, error: "Tick “Send me event drops & menus” so we know it's OK to email you." },
      422
    );
  }

  const record = {
    email,
    consent: true,
    source: "flavourfrequency.com",
    country: request.headers.get("cf-ipcountry") || null,
    ts: new Date().toISOString(),
  };

  const hasKV = !!(env.SUBSCRIBERS && typeof env.SUBSCRIBERS.put === "function");
  const hasApi = typeof env.SC_API_KEY === "string" && env.SC_API_KEY.length > 0;
  const hasWebhook = typeof env.SC_WEBHOOK_URL === "string" && env.SC_WEBHOOK_URL.startsWith("https://");
  if (!hasKV && !hasApi && !hasWebhook) return json({ ok: false, error: "Signup isn't configured yet." }, 501);

  // KV first: it is the durable record. If SureContact is down afterwards we
  // still have the signup and can replay it, so the visitor never sees an error
  // caused by someone else's outage.
  let stored = false;
  if (hasKV) {
    try {
      await env.SUBSCRIBERS.put(`sub:${email}`, JSON.stringify(record));
      stored = true;
    } catch (err) {
      console.error("KV write failed:", err && err.message);
    }
  }

  const crmTasks = [];
  if (hasApi) crmTasks.push(sendToSureContact(env, record));
  if (hasWebhook) {
    crmTasks.push(
      fetch(env.SC_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((r) => {
        if (!r.ok) throw new Error(`SureContact webhook failed (${r.status})`);
      })
    );
  }

  if (!crmTasks.length) {
    // KV-only: nothing else to wait on.
    return stored ? json({ ok: true }) : json({ ok: false, error: "Couldn't save your signup — try again in a moment." }, 502);
  }

  if (stored) {
    // Already durably recorded — don't make the visitor wait on the CRM, and
    // don't fail them if it errors.
    const settle = Promise.allSettled(crmTasks).then((rs) =>
      rs.filter((r) => r.status === "rejected").forEach((r) => console.error(String(r.reason)))
    );
    if (typeof waitUntil === "function") waitUntil(settle);
    return json({ ok: true });
  }

  try {
    await Promise.all(crmTasks);
  } catch (err) {
    console.error(String(err && err.message));
    return json({ ok: false, error: "Couldn't save your signup — try again in a moment." }, 502);
  }
  return json({ ok: true });
}

export const onRequestGet = () => json({ ok: false, error: "Method not allowed." }, 405);
