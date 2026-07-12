import { createPasskeeperRoutes } from "@passkeeper/cloudflare";
import { d1Adapter } from "@passkeeper/d1";

const DEMO_AUTH_BASE_PATH = "/demo/auth";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(`${DEMO_AUTH_BASE_PATH}/`)) {
      return new Response("Not found", { status: 404 });
    }

    const routes = createPasskeeperRoutes({
      rpName: "Passkeeper Demo",
      rpId: env.RP_ID,
      origin: env.RP_ORIGIN,
      storage: d1Adapter(env.DB),
      basePath: DEMO_AUTH_BASE_PATH,
      inviteRequired: true,
      sessionCookie: {
        name: "pk_demo_session",
        path: "/demo",
        secure: url.protocol === "https:",
      },
    });

    return routes.handle(request);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await d1Adapter(env.DB).deleteExpiredRecords(new Date());
  },
} satisfies ExportedHandler<Env>;
