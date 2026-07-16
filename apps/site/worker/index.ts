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
    const now = new Date();
    await d1Adapter(env.DB).deleteExpiredRecords(now);
    await deleteOldDemoUsers(env.DB, new Date(now.getTime() - 24 * 60 * 60 * 1000));
  },
} satisfies ExportedHandler<Env>;

async function deleteOldDemoUsers(database: D1Database, cutoff: Date): Promise<void> {
  const timestamp = cutoff.toISOString();
  const oldUsers = "select id from passkeeper_users where created_at < ?";

  await database.batch([
    database.prepare(`delete from passkeeper_credentials where user_id in (${oldUsers})`).bind(timestamp),
    database.prepare(`delete from passkeeper_sessions where user_id in (${oldUsers})`).bind(timestamp),
    database.prepare(`delete from passkeeper_challenges where user_id in (${oldUsers})`).bind(timestamp),
    database.prepare("delete from passkeeper_users where created_at < ?").bind(timestamp),
  ]);
}
