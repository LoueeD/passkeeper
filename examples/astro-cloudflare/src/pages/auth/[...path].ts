import type { APIRoute } from "astro";
import { createPasskeeperRoutes } from "@passkeeper/cloudflare";
import { d1Adapter } from "@passkeeper/d1";

export const prerender = false;

export const ALL: APIRoute = async ({ locals, request }) => {
  const db = locals.runtime?.env.DB;

  if (db === undefined) {
    return Response.json(
      { code: "missing_binding", message: "The DB binding is not available." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const routes = createPasskeeperRoutes({
    rpName: "Passkeeper Astro Example",
    rpId: locals.runtime?.env.RP_ID ?? url.hostname,
    origin: locals.runtime?.env.RP_ORIGIN ?? url.origin,
    storage: d1Adapter(db),
    inviteRequired: true,
    sessionCookie: {
      secure: url.protocol === "https:",
    },
  });

  return routes.handle(request);
};
