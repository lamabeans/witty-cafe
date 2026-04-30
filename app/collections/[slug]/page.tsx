import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { absoluteUrl, cleanMediaAltText, stripBbCode, truncateText } from "../../lib/site";
import { imageUrlsFor, mediaObjectsFor } from "../../lib/structuredData";

type CollectionPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ sort?: string | string[] }>;
};

type CollectionSort = "popular" | "new" | "discussed";

const SORT_OPTIONS: Array<{ value: CollectionSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "new", label: "Newest" },
  { value: "discussed", label: "Most Discussed" },
];

function normalizeSort(value: string | string[] | undefined): CollectionSort {
  const sort = Array.isArray(value) ? value[0] : value;
  if (sort === "new" || sort === "discussed") return sort;
  return "popular";
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function sortHref(slug: string, sort: CollectionSort) {
  return sort === "popular"
    ? `/collections/${slug}`
    : `/collections/${slug}?sort=${sort}`;
}

function MediaPreview({
  item,
  title,
}: {
  item: {
    url: string | null;
    mediaType: "image" | "video" | "audio" | "model3d" | "game" | "unknown";
    altText?: string | null;
  };
  title: string;
}) {
  if (!item.url) return null;
  const label = cleanMediaAltText(item.altText, title);

  if (item.mediaType === "image" || item.mediaType === "unknown") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt={label}
        className="h-28 w-36 shrink-0 rounded-lg border-2 border-[var(--stroke)] object-cover sm:h-32 sm:w-44"
      />
    );
  }

  if (item.mediaType === "video") {
    return (
      <video
        src={item.url}
        controls
        preload="metadata"
        aria-label={label}
        className="h-28 w-36 shrink-0 rounded-lg border-2 border-[var(--stroke)] bg-black object-cover sm:h-32 sm:w-44"
      />
    );
  }

  if (item.mediaType === "audio") {
    return (
      <div className="flex h-28 w-64 shrink-0 flex-col justify-center gap-2 rounded-lg border-2 border-[var(--stroke)] bg-[var(--yellow-soft)] p-3 text-black sm:h-32">
        <span className="text-xs font-black uppercase tracking-[0.14em]">
          Audio
        </span>
        <audio src={item.url} controls preload="metadata" className="w-full" />
      </div>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex h-28 w-44 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[var(--stroke)] bg-[var(--yellow-soft)] p-3 text-center text-xs font-black uppercase tracking-[0.12em] text-black sm:h-32"
    >
      <span>{item.mediaType === "model3d" ? "3D Model" : "Playable Game"}</span>
      <span className="mt-2 normal-case tracking-normal">Open media</span>
    </a>
  );
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchQuery(api.seo.collectionPage, { slug, limit: 12 });

  if (!data) {
    return {
      title: "Collection not found",
      robots: { index: false, follow: true },
    };
  }

  const { collection, ideas } = data;
  const title = collection.name;
  const socialTitle = `${collection.name} | Witty.Cafe`;
  const description = truncateText(stripBbCode(collection.description), 155);
  const image = ideas.find((idea) => idea.media[0]?.url)?.media[0]?.url;

  return {
    title,
    description,
    alternates: {
      canonical: `/collections/${collection.slug}`,
    },
    robots: {
      index: collection.indexable,
      follow: true,
    },
    openGraph: {
      title: socialTitle,
      description,
      url: absoluteUrl(`/collections/${collection.slug}`),
      siteName: "Witty.Cafe",
      type: "website",
      images: image ? [{ url: image, alt: collection.name }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: socialTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const { slug } = await params;
  const { sort: sortParam } = (await searchParams) ?? {};
  const sort = normalizeSort(sortParam);
  const data = await fetchQuery(api.seo.collectionPage, { slug, sort });

  if (!data) notFound();

  const { collection, ideas, relatedCollections } = data;
  const intro = stripBbCode(collection.introduction || collection.description);
  const conclusion = stripBbCode(collection.conclusion);
  const pageUrl = absoluteUrl(`/collections/${collection.slug}`);
  const ideaJsonLd = ideas.map((idea, index) => {
    const mediaObjects = mediaObjectsFor(idea.media, idea.title);
    const images = imageUrlsFor(idea.media);
    return {
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "CreativeWork",
        name: idea.title,
        url: absoluteUrl(idea.href),
        abstract: stripBbCode(idea.excerpt),
        datePublished: new Date(idea.createdAt).toISOString(),
        dateModified: new Date(idea.modifiedAt ?? idea.createdAt).toISOString(),
        image: images.length ? images : undefined,
        associatedMedia: mediaObjects.length ? mediaObjects : undefined,
        interactionStatistic: [
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/LikeAction",
            userInteractionCount: idea.reactionTotal,
          },
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/CommentAction",
            userInteractionCount: idea.commentCount,
          },
        ],
      },
    };
  });
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Collections",
          item: absoluteUrl("/collections"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: collection.name,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: collection.name,
      url: pageUrl,
      description: stripBbCode(collection.description),
      about: collection.flavor.name,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: ideaJsonLd,
      },
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-6 text-[var(--ink)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto w-full max-w-[1040px]">
        <nav className="mb-5 flex items-center gap-2 text-sm font-black text-[var(--muted)]">
          <Link href="/">Witty.Cafe</Link>
          <span>/</span>
          <Link href="/collections">Collections</Link>
        </nav>

        <header className="wc-card overflow-hidden">
          <div className="border-b-2 border-[var(--stroke)] bg-[var(--surface)] px-5 py-6 sm:px-7">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full border-2 border-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-black"
                style={{ background: collection.flavor.color ?? "var(--yellow)" }}
              >
                {collection.flavor.name}
              </span>
              <span className="text-xs font-black text-[var(--muted)]">
                {formatCount(collection.postCount)} ideas
              </span>
              <span className="text-xs font-black text-[var(--muted)]">
                {collection.audiences.map((audience) => audience.name).join(", ")}
              </span>
            </div>
            <h1 className="font-display mt-4 max-w-4xl text-4xl font-black leading-none tracking-tight sm:text-6xl">
              {collection.name}
            </h1>
            {intro ? (
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-base font-bold leading-7 text-[var(--muted)]">
                {intro}
              </p>
            ) : (
              <p className="mt-4 max-w-3xl text-base font-bold leading-7 text-[var(--muted)]">
                A focused Witty.Cafe collection where the most useful ideas rise
                through community ranking.
              </p>
            )}
          </div>
          {!collection.indexable ? (
            <div className="bg-[var(--yellow-soft)] px-5 py-3 text-xs font-black text-black sm:px-7">
              This collection is public, but it will wait for more useful content
              before appearing in search indexes.
            </div>
          ) : null}
        </header>

        <section className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-3xl font-black">Top Ideas</h2>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={sortHref(collection.slug, option.value)}
                  className={`wc-button ${
                    sort === option.value ? "wc-button-active" : ""
                  }`}
                >
                  {option.label}
                </Link>
              ))}
              <Link href="/" className="wc-button">
                Open Feed
              </Link>
            </div>
          </div>

          {ideas.map((idea, index) => (
            <article key={idea._id} className="wc-card overflow-hidden">
              <div className="px-5 py-5 sm:px-6">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-black text-[var(--muted)]">
                  <span>#{index + 1}</span>
                  <span>{formatDate(idea.createdAt)}</span>
                  <span>{formatCount(idea.reactionTotal)} reactions</span>
                  <span>{formatCount(idea.commentCount)} comments</span>
                </div>
                <Link
                  href={idea.href}
                  className="font-display text-2xl font-black leading-tight text-[var(--ink)] hover:text-[var(--magenta)]"
                >
                  {idea.title}
                </Link>
                {idea.excerpt ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--muted)]">
                    {stripBbCode(idea.excerpt)}
                  </p>
                ) : null}
                {idea.vibes.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {idea.vibes.map((vibe) => (
                      <span key={vibe.slug} className="wc-button pointer-events-none">
                        {vibe.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                {idea.media.length ? (
                  <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                    {idea.media.map((item) => (
                      <MediaPreview
                        key={item.url}
                        item={item}
                        title={idea.title}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}

          {ideas.length === 0 ? (
            <div className="wc-card p-10 text-center text-sm font-bold text-[var(--muted)]">
              This collection is waiting for its first ideas.
            </div>
          ) : null}
        </section>

        {conclusion ? (
          <section className="mt-6 wc-card p-5 sm:p-6">
            <h2 className="font-display text-3xl font-black">More About This Collection</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--muted)]">
              {conclusion}
            </p>
          </section>
        ) : null}

        {relatedCollections.length ? (
          <section className="mt-6 wc-card p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Related Collections
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {relatedCollections.map((related) => (
                <Link
                  key={related.slug}
                  href={`/collections/${related.slug}`}
                  className="wc-button"
                >
                  {related.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
