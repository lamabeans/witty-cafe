import type { MetadataRoute } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "../convex/_generated/api";
import { absoluteUrl } from "./lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const collections = await fetchQuery(api.seo.collectionSummaries, {});
  const now = new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/collections"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...collections
      .filter((collection) => collection.indexable)
      .map((collection) => ({
        url: absoluteUrl(`/collections/${collection.slug}`),
        lastModified: new Date(collection.lastModified),
        changeFrequency: "weekly" as const,
        priority: Math.min(0.85, 0.55 + collection.postCount / 100),
      })),
  ];
}
