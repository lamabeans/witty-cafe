import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const batchSize = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 100);

if (!convexUrl) {
  console.error("NEXT_PUBLIC_CONVEX_URL is required.");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const convertLegacyBodies = makeFunctionReference("migrations:convertLegacyBodies");
let totalConverted = 0;
let totalSkipped = 0;

for (;;) {
  const result = await client.mutation(convertLegacyBodies, {
    limit: batchSize,
  });
  totalConverted += result.converted;
  totalSkipped = result.skipped;
  console.log(
    `converted=${result.converted} skipped=${result.skipped} totalConverted=${totalConverted}`
  );

  if (result.converted === 0) break;
}

console.log(`done converted=${totalConverted} skipped=${totalSkipped}`);
