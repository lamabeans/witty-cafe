import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { absoluteUrl } from "../lib/site";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function imageTags(
  media: Array<{ url: string; mediaType: string; altText: string | null }>
) {
  return media
    .filter(
      (item) =>
        item.mediaType === "image" ||
        item.mediaType === "unknown" ||
        /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(item.url)
    )
    .map(
      (item) => `<image:image>
<image:loc>${escapeXml(item.url)}</image:loc>
${item.altText ? `<image:title>${escapeXml(item.altText)}</image:title>` : ""}
</image:image>`
    )
    .join("\n");
}

function urlEntry({
  loc,
  lastmod,
  changefreq,
  priority,
  media = [],
}: {
  loc: string;
  lastmod: Date;
  changefreq: "daily" | "weekly";
  priority: number;
  media?: Array<{ url: string; mediaType: string; altText: string | null }>;
}) {
  return `<url>
<loc>${escapeXml(loc)}</loc>
<lastmod>${lastmod.toISOString()}</lastmod>
<changefreq>${changefreq}</changefreq>
<priority>${priority.toFixed(2)}</priority>
${imageTags(media)}
</url>`;
}

export async function GET() {
  const entries = await fetchQuery(api.seo.sitemapEntries, {});
  const now = new Date();
  const urls = [
    urlEntry({
      loc: absoluteUrl("/"),
      lastmod: now,
      changefreq: "daily",
      priority: 1,
    }),
    urlEntry({
      loc: absoluteUrl("/collections"),
      lastmod: now,
      changefreq: "daily",
      priority: 0.9,
    }),
    ...entries.collections
      .filter((collection) => collection.indexable)
      .map((collection) =>
        urlEntry({
          loc: absoluteUrl(`/collections/${collection.slug}`),
          lastmod: new Date(collection.lastModified),
          changefreq: "weekly",
          priority: Math.min(0.85, 0.55 + collection.postCount / 100),
          media: collection.media,
        })
      ),
    ...entries.posts.map((post) =>
      urlEntry({
        loc: absoluteUrl(`/post/${post._id}`),
        lastmod: new Date(post.lastModified),
        changefreq: "weekly",
        priority: 0.45,
        media: post.media,
      })
    ),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    }
  );
}
