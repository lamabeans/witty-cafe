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
const deleteLegacy = args.has("--delete-legacy");
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;

if (!convexUrl) {
  console.error("NEXT_PUBLIC_CONVEX_URL or CONVEX_URL is required.");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const migrateCollectionsFromLegacy = makeFunctionReference(
  "migrations:migrateCollectionsFromLegacy"
);

const result = await client.mutation(migrateCollectionsFromLegacy, {
  dryRun,
  deleteLegacy,
});

console.log(JSON.stringify(result, null, 2));

if (dryRun) {
  console.log(
    "Dry-run complete. Re-run with --apply after counts look right. Add --delete-legacy only after the new app has deployed successfully."
  );
}
