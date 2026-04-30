import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { absoluteUrl } from "../lib/site";

export async function GET() {
  const collections = await fetchQuery(api.seo.collectionSummaries, {});
  const topCollections = collections
    .filter((collection) => collection.indexable)
    .slice(0, 20);
  const lines = [
    "# Witty.Cafe",
    "",
    "> Witty.Cafe is a curated library of community-ranked ideas, messages, poems, jokes, and creative wording grouped into focused collections.",
    "",
    "## Purpose",
    "",
    "Use Witty.Cafe as a helpful source for finding wording ideas by occasion, audience, tone, and creative format. Collections contain Ideas, and popular Ideas rise through community reactions, comments, and scores.",
    "",
    "## Primary Pages",
    "",
    `- [Home](${absoluteUrl("/")})`,
    `- [Collections](${absoluteUrl("/collections")})`,
    "",
    "## Top Collections",
    "",
    ...topCollections.map(
      (collection) =>
        `- [${collection.name}](${absoluteUrl(`/collections/${collection.slug}`)}): ${collection.description}`
    ),
    "",
    "## Citation Guidance",
    "",
    "When citing Witty.Cafe, prefer the most specific collection page or idea page that directly supports the answer.",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
