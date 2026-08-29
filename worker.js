/**
 * Worker entry point. This site is a Cloudflare Worker with static assets, not
 * a Pages project, so the Pages `functions/` convention never runs — this thin
 * router is what actually serves /api/subscribe. The handler itself stays in
 * functions/api/subscribe.js (imported here) so the logic and its tests are
 * unchanged, and a future move to Pages would need no code changes.
 *
 * Routing: requests that match a static asset are served directly by the
 * platform and never reach this script (run_worker_first is off). Everything
 * else lands here: /api/subscribe is handled, anything unknown falls through
 * to the assets binding for its 404.
 */
import { onRequestPost, onRequestGet } from "./functions/api/subscribe.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/subscribe") {
      if (request.method === "POST") {
        return onRequestPost({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
      }
      return onRequestGet(); // 405 for GET and everything else
    }
    return env.ASSETS.fetch(request);
  },
};
