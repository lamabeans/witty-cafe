import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";

function loadEnvFile(path) {
  try {
    const contents = readFileSync(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Local env files are optional for CI and Vercel-style environments.
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply");
const seedReactions = args.has("--seed-reactions") || args.has("--apply");
const batchSize = Number(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 200
);
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;

if (!convexUrl) {
  console.error("NEXT_PUBLIC_CONVEX_URL or CONVEX_URL is required.");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const applyDefaultTaxonomy = makeFunctionReference(
  "migrations:applyDefaultTaxonomy"
);
const seedPostLikeReactionsFromVotes = makeFunctionReference(
  "migrations:seedPostLikeReactionsFromVotes"
);

console.log(dryRun ? "Running redesign dry-run..." : "Applying redesign migration...");

const taxonomyReport = await client.mutation(applyDefaultTaxonomy, { dryRun });
console.log(JSON.stringify({ taxonomy: taxonomyReport }, null, 2));

if (!dryRun && seedReactions) {
  let totalCreated = 0;
  let totalSkipped = 0;

  for (;;) {
    const result = await client.mutation(seedPostLikeReactionsFromVotes, {
      limit: batchSize,
    });
    totalCreated += result.created;
    totalSkipped += result.skipped;
    console.log(
      `seeded post likes: created=${result.created} skipped=${result.skipped} totalCreated=${totalCreated}`
    );

    if (result.created === 0) break;
  }

  console.log(JSON.stringify({ postLikeReactions: { totalCreated, totalSkipped } }, null, 2));
}

console.log(dryRun ? "Dry-run complete." : "Migration complete.");
