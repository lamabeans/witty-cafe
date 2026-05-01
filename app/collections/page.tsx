import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { AiCreateCta } from "../components/AiCreationStudio";
import { absoluteUrl } from "../lib/site";

type CollectionSummary = {
  name: string;
  slug: string;
  description: string;
  postCount: number;
  indexable: boolean;
  flavor: {
    name: string;
    color?: string;
  };
};

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Browse Witty.Cafe collections of community-ranked ideas, messages, poems, jokes, and creative wording.",
  alternates: {
    canonical: "/collections",
  },
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function CollectionsPage() {
  const collections = (await fetchQuery(
    api.seo.collectionSummaries,
    {}
  )) as CollectionSummary[];
  const indexableCollections = collections.filter((collection) => collection.indexable);
  const otherCollections = collections.filter((collection) => !collection.indexable);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Witty.Cafe Collections",
    url: absoluteUrl("/collections"),
    description: metadata.description,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: indexableCollections.map((collection, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: collection.name,
        url: absoluteUrl(`/collections/${collection.slug}`),
      })),
    },
  };

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-8 text-[var(--ink)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto w-full max-w-[1040px]">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-black text-[var(--muted)]">
              Witty.Cafe
            </Link>
            <h1 className="font-display mt-2 text-5xl font-black leading-none tracking-tight">
              Collections
            </h1>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-[var(--muted)]">
              Focused shelves of community-ranked ideas, messages, poems, jokes,
              and creative wording.
            </p>
          </div>
          <Link href="/" className="wc-button">
            Feed
          </Link>
        </header>

        <AiCreateCta />

        <section className="grid gap-4 md:grid-cols-2">
          {indexableCollections.map((collection) => (
            <Link
              key={collection.slug}
              href={`/collections/${collection.slug}`}
              className="wc-card block p-5 transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--magenta)]"
            >
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
              </div>
              <h2 className="font-display mt-3 text-2xl font-black leading-tight">
                {collection.name}
              </h2>
              <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[var(--muted)]">
                {collection.description}
              </p>
            </Link>
          ))}
        </section>

        {otherCollections.length ? (
          <section className="mt-8 wc-card p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Growing Collections
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherCollections.map((collection) => (
                <Link
                  key={collection.slug}
                  href={`/collections/${collection.slug}`}
                  className="wc-button"
                >
                  {collection.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
