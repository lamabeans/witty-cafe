import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

export const runtime = "nodejs";

function envSecret(name: string) {
  return (process.env[name]?.trim() ?? "").replace(
    /^[`'"\u2018\u2019\u201c\u201d]+|[`'"\u2018\u2019\u201c\u201d]+$/g,
    ""
  );
}

export async function GET(request: Request) {
  const secret = envSecret("AI_CONTENT_CRON_SECRET") || envSecret("CRON_SECRET");
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json(
      { ok: false, error: "NEXT_PUBLIC_CONVEX_URL is not configured." },
      { status: 500 }
    );
  }

  const client = new ConvexHttpClient(convexUrl);
  const result = await client.action(api.aiContent.runPendingCampaigns, {
    secret,
    limit: 2,
  });

  return Response.json({ ok: true, ...result });
}
