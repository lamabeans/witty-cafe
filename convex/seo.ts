import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  DEFAULT_AUDIENCES,
  DEFAULT_FLAVORS,
  inferAudienceSlugs,
  inferFlavorSlug,
} from "./lib/taxonomy";
import { excerptFromText, titleFromContent } from "./lib/richText";

const DEFAULT_COLLECTION_LIMIT = 200;
const DEFAULT_IDEA_LIMIT = 50;
const MIN_INDEXABLE_POSTS = 2;
const MIN_HELPFUL_TEXT_LENGTH = 80;
const MIN_INDEXABLE_POSTS_WITHOUT_INTRO = 5;
const SITEMAP_POST_LIMIT = 1000;

const sortValidator = v.union(
  v.literal("popular"),
  v.literal("new"),
  v.literal("discussed")
);

type CollectionStats = {
  postCount: number;
  lastModified: number;
  indexable: boolean;
};

type SeoCtx = Pick<QueryCtx, "db" | "storage">;

type LegacyCollectionQuery = {
  collect: () => Promise<Array<Doc<"collections">>>;
  order: (direction: "asc" | "desc") => LegacyCollectionQuery;
};

type LegacyCollectionDb = {
  query: (tableName: "subreddits") => LegacyCollectionQuery;
};

type PostWithLegacyCollection = Doc<"posts"> & {
  collectionId?: string;
  subredditId?: string;
};

type SeoMediaType = "image" | "video" | "audio" | "model3d" | "game" | "unknown";

function legacyCollectionDb(db: unknown) {
  return db as LegacyCollectionDb;
}

function normalizeAssetUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed;
}

function inferLegacyMediaType(item: Doc<"mediaItems">): SeoMediaType {
  const mime = item.imageType?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("model") || mime.includes("obj") || mime.includes("gltf")) {
    return "model3d";
  }
  if (mime.includes("html")) return "game";
  if (item.mediaType) return item.mediaType;
  if (item.imageUrl || item.imageFile) return "image";
  return "unknown";
}

function normalizeMediaIdentity(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\s*\(\d+\)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+\d+$/i, "")
    .trim();
  return normalized || null;
}

function mediaIdentity(item: Doc<"mediaItems">) {
  const candidates = [
    item.filename,
    item.imageName,
    item.altText,
    item.importMatchText,
  ];
  for (const candidate of candidates) {
    const identity = normalizeMediaIdentity(candidate);
    if (identity) return `${inferLegacyMediaType(item)}:${identity}`;
  }
  return null;
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function collectionIntro(collection: Doc<"collections">) {
  return normalizeWhitespace(
    collection.description || collection.introduction || collection.conclusion
  );
}

function collectionDescription(collection: Doc<"collections">, postCount: number) {
  const intro = collectionIntro(collection);
  if (intro) {
    return intro.length > 160 ? `${intro.slice(0, 157).trimEnd()}...` : intro;
  }
  return `Explore ${postCount} community-ranked ideas in ${collection.name}, curated by Witty.Cafe.`;
}

function isIndexableCollection(collection: Doc<"collections">, postCount: number) {
  if (collection.nsfw) return false;
  if (postCount < MIN_INDEXABLE_POSTS) return false;

  const helpfulText = [
    collection.description,
    collection.introduction,
    collection.conclusion,
  ]
    .map(normalizeWhitespace)
    .join(" ");

  return (
    helpfulText.length >= MIN_HELPFUL_TEXT_LENGTH ||
    postCount >= MIN_INDEXABLE_POSTS_WITHOUT_INTRO
  );
}

function rankPost(post: Doc<"posts">, reactionTotal: number) {
  return (
    Math.max(post.score, 0) +
    reactionTotal +
    post.commentCount * 2 +
    post.createdAt / 100000000000
  );
}

function basePostRank(post: Doc<"posts">) {
  return rankPost(post, 0);
}

function sortPosts(
  posts: Array<Doc<"posts">>,
  sort: "popular" | "new" | "discussed"
) {
  return [...posts].sort((a, b) => {
    if (sort === "new") return b.createdAt - a.createdAt;
    if (sort === "discussed") {
      const commentDiff = b.commentCount - a.commentCount;
      if (commentDiff !== 0) return commentDiff;
      return basePostRank(b) - basePostRank(a);
    }
    return basePostRank(b) - basePostRank(a);
  });
}

function sortIdeas<
  T extends { rankScore: number; createdAt: number; commentCount: number },
>(ideas: T[], sort: "popular" | "new" | "discussed") {
  return [...ideas].sort((a, b) => {
    if (sort === "new") return b.createdAt - a.createdAt;
    if (sort === "discussed") {
      const commentDiff = b.commentCount - a.commentCount;
      if (commentDiff !== 0) return commentDiff;
      return b.rankScore - a.rankScore;
    }
    return b.rankScore - a.rankScore;
  });
}

function defaultFlavor(slug: string) {
  const flavor =
    DEFAULT_FLAVORS.find((item) => item.slug === slug) ??
    DEFAULT_FLAVORS.find((item) => item.slug === "other") ??
    DEFAULT_FLAVORS[0];
  return {
    name: flavor.name,
    slug: flavor.slug,
    description: flavor.description,
    color: flavor.color,
  };
}

function defaultAudiences(slugs: string[]) {
  const matched = slugs
    .map((slug) => DEFAULT_AUDIENCES.find((audience) => audience.slug === slug))
    .filter((audience): audience is (typeof DEFAULT_AUDIENCES)[number] =>
      Boolean(audience)
    )
    .map((audience) => ({
      name: audience.name,
      slug: audience.slug,
    }));

  return matched.length ? matched : [{ name: "Everyone", slug: "everyone" }];
}

async function flavorForCollection(ctx: SeoCtx, collection: Doc<"collections">) {
  if (collection.flavorId) {
    const flavor = await ctx.db.get(collection.flavorId);
    if (flavor) {
      return {
        name: flavor.name,
        slug: flavor.slug,
        description: flavor.description,
        color: flavor.color,
      };
    }
  }

  return defaultFlavor(inferFlavorSlug(collection.name));
}

async function audiencesForCollection(
  ctx: SeoCtx,
  collection: Doc<"collections">
) {
  if (collection.audienceIds?.length) {
    const audiences = (
      await Promise.all(collection.audienceIds.map((id) => ctx.db.get(id)))
    ).filter((audience): audience is Doc<"audiences"> => audience !== null);

    if (audiences.length) {
      return audiences.map((audience) => ({
        name: audience.name,
        slug: audience.slug,
      }));
    }
  }

  return defaultAudiences(inferAudienceSlugs(collection.name));
}

function statsFromPosts(
  collection: Doc<"collections">,
  posts: Array<Doc<"posts">>
): CollectionStats {
  const lastPostModified = posts.reduce(
    (latest: number, post: Doc<"posts">) =>
      Math.max(latest, post.modifiedAt ?? post.createdAt),
    collection.modifiedAt ?? collection.createdAt
  );

  return {
    postCount: posts.length,
    lastModified: lastPostModified,
    indexable: isIndexableCollection(collection, posts.length),
  };
}

function statsByCollection(
  collections: Array<Doc<"collections">>,
  posts: Array<Doc<"posts">>
) {
  const grouped = new Map<string, Array<Doc<"posts">>>();
  const collectionIds = new Set(collections.map((collection) => collection._id));

  for (const post of posts) {
    const rawPost = post as PostWithLegacyCollection;
    const key = rawPost.collectionId ?? rawPost.subredditId;
    if (!key || !collectionIds.has(key)) continue;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(post);
    } else {
      grouped.set(key, [post]);
    }
  }

  return new Map(
    collections.map((collection) => [
      collection._id,
      statsFromPosts(collection, grouped.get(collection._id) ?? []),
    ])
  );
}

function postBelongsToCollection(post: Doc<"posts">, collection: Doc<"collections">) {
  const rawPost = post as PostWithLegacyCollection;
  return rawPost.collectionId === collection._id || rawPost.subredditId === collection._id;
}

async function postsForCollection(ctx: SeoCtx, collection: Doc<"collections">) {
  const indexedPosts = await ctx.db
    .query("posts")
    .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
    .collect();

  if (indexedPosts.length > 0) return indexedPosts;

  const recentPosts = await ctx.db
    .query("posts")
    .withIndex("by_createdAt", (q) => q)
    .order("desc")
    .take(1000);
  return recentPosts.filter((post) => postBelongsToCollection(post, collection));
}

async function loadCollections(ctx: SeoCtx) {
  const collections = await ctx.db.query("collections").order("asc").collect();
  if (collections.length > 0) return collections;
  return await legacyCollectionDb(ctx.db)
    .query("subreddits")
    .order("asc")
    .collect();
}

async function summarizeCollection(
  ctx: SeoCtx,
  collection: Doc<"collections">,
  stats: CollectionStats
) {
  const flavor = await flavorForCollection(ctx, collection);
  const audiences = await audiencesForCollection(ctx, collection);

  return {
    _id: collection._id,
    name: collection.name,
    slug: collection.slug,
    description: collectionDescription(collection, stats.postCount),
    introduction: collection.introduction ?? null,
    conclusion: collection.conclusion ?? null,
    bannerImage: collection.bannerImage ?? null,
    nsfw: collection.nsfw ?? false,
    createdAt: collection.createdAt,
    modifiedAt: collection.modifiedAt ?? null,
    postCount: stats.postCount,
    lastModified: stats.lastModified,
    indexable: stats.indexable,
    flavor,
    audiences,
  };
}

async function ideaSummary(ctx: SeoCtx, post: Doc<"posts">) {
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const reactionTotal = reactions.length;
  const tagLinks = await ctx.db
    .query("postTags")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const tags = (
    await Promise.all(tagLinks.map((link: Doc<"postTags">) => ctx.db.get(link.tagId)))
  ).filter((tag): tag is Doc<"tags"> => tag !== null);
  const mediaItems = await ctx.db
    .query("mediaItems")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const media = [];

  const rankedMediaItems = [...mediaItems].sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.order ?? a.marker ?? 0) - (b.order ?? b.marker ?? 0);
  });

  const hasLegacyUrlMedia = mediaItems.some(
    (item) =>
      item.source !== "zip-import" &&
      (item.storageId ||
        normalizeAssetUrl(item.imageUrl) ||
        normalizeAssetUrl(item.imageFile))
  );
  const seenMedia = new Set<string>();

  for (const item of rankedMediaItems) {
    if (hasLegacyUrlMedia && item.source === "zip-import") continue;
    const storageUrl = item.storageId
      ? await ctx.storage.getUrl(item.storageId)
      : null;
    const url =
      storageUrl ??
      normalizeAssetUrl(item.imageUrl) ??
      normalizeAssetUrl(item.imageFile);
    if (!url) continue;
    const identity = mediaIdentity(item);
    if (identity && seenMedia.has(identity)) continue;
    if (identity) seenMedia.add(identity);
    const mediaReactions = await ctx.db
      .query("mediaReactions")
      .withIndex("by_media", (q) => q.eq("mediaItemId", item._id))
      .collect();
    media.push({
      _id: item._id,
      url,
      mediaType: item.mediaType ?? inferLegacyMediaType(item),
      altText: item.altText ?? item.imageName ?? item.filename ?? post.title,
      duration: item.duration ?? null,
      filename: item.filename ?? item.imageName ?? null,
      loveCount: mediaReactions.filter((reaction) => reaction.kind === "love").length,
    });
    if (media.length >= 3) break;
  }

  const title = titleFromContent(post.title, post.body ?? post.legacyBody);
  const excerpt =
    post.plainTextExcerpt ??
    excerptFromText(post.body ?? post.legacyBody ?? title);

  return {
    _id: post._id,
    title,
    href: `/post/${post._id}`,
    excerpt,
    createdAt: post.createdAt,
    modifiedAt: post.modifiedAt ?? null,
    score: post.score,
    commentCount: post.commentCount,
    reactionTotal,
    rankScore: rankPost(post, reactionTotal),
    vibes: tags.map((tag) => ({ name: tag.name, slug: tag.slug })),
    media,
  };
}

export const collectionSummaries = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const collections = await loadCollections(ctx);
    const posts = await ctx.db.query("posts").collect();
    const stats = statsByCollection(collections, posts);
    const summaries = [];

    for (const collection of collections.slice(0, args.limit ?? DEFAULT_COLLECTION_LIMIT)) {
      summaries.push(
        await summarizeCollection(
          ctx,
          collection,
          stats.get(collection._id) ?? statsFromPosts(collection, [])
        )
      );
    }

    return summaries.sort((a, b) => {
      if (a.indexable !== b.indexable) return a.indexable ? -1 : 1;
      if (b.postCount !== a.postCount) return b.postCount - a.postCount;
      return a.name.localeCompare(b.name);
    });
  },
});

export const collectionPage = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
    sort: v.optional(sortValidator),
  },
  handler: async (ctx, args) => {
    const sort = args.sort ?? "popular";
    const collection = await ctx.db
      .query("collections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    const legacyCollection = collection
      ? null
      : (await legacyCollectionDb(ctx.db).query("subreddits").collect()).find(
          (legacy) => legacy.slug === args.slug
        ) ?? null;

    const activeCollection = collection ?? legacyCollection;

    if (!activeCollection) return null;

    const posts = await postsForCollection(ctx, activeCollection);
    const summary = await summarizeCollection(
      ctx,
      activeCollection,
      statsFromPosts(activeCollection, posts)
    );
    const ideas = [];
    const ideaLimit = args.limit ?? DEFAULT_IDEA_LIMIT;
    const topPosts = sortPosts(posts, sort).slice(0, ideaLimit);

    for (const post of topPosts) {
      ideas.push(await ideaSummary(ctx, post));
    }

    const allCollections = await loadCollections(ctx);
    const allPosts = await ctx.db.query("posts").collect();
    const allStats = statsByCollection(allCollections, allPosts);
    const related = [];
    const audienceSlugs = new Set(summary.audiences.map((audience) => audience.slug));

    for (const candidate of allCollections) {
      if (candidate._id === activeCollection._id) continue;
      const candidateSummary = await summarizeCollection(
        ctx,
        candidate,
        allStats.get(candidate._id) ?? statsFromPosts(candidate, [])
      );
      const sharesFlavor = candidateSummary.flavor.slug === summary.flavor.slug;
      const sharesAudience = candidateSummary.audiences.some((audience) =>
        audienceSlugs.has(audience.slug)
      );
      if (sharesFlavor || sharesAudience) related.push(candidateSummary);
    }

    return {
      collection: summary,
      ideas: sortIdeas(ideas, sort).slice(0, args.limit ?? DEFAULT_IDEA_LIMIT),
      relatedCollections: related
        .filter((item) => item.indexable)
        .sort((a, b) => b.postCount - a.postCount)
        .slice(0, 6),
      sort,
    };
  },
});

export const postPage = query({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    const collection = post.collectionId ? await ctx.db.get(post.collectionId) : null;
    const fallbackCollection = collection
      ? null
      : await loadCollections(ctx).then((collections) =>
          collections.find((candidate) => postBelongsToCollection(post, candidate))
        );
    const activeCollection = collection ?? fallbackCollection ?? null;
    const collectionSummary = activeCollection
      ? await summarizeCollection(
          ctx,
          activeCollection,
          statsFromPosts(activeCollection, await postsForCollection(ctx, activeCollection))
        )
      : null;
    const idea = await ideaSummary(ctx, post);

    return {
      idea,
      collection: collectionSummary,
      nsfw: post.nsfw ?? false,
    };
  },
});

export const sitemapEntries = query({
  handler: async (ctx) => {
    const collections = await loadCollections(ctx);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_createdAt", (q) => q)
      .order("desc")
      .take(SITEMAP_POST_LIMIT);
    const stats = statsByCollection(collections, posts);
    const collectionSummaries = [];

    for (const collection of collections) {
      collectionSummaries.push(
        await summarizeCollection(
          ctx,
          collection,
          stats.get(collection._id) ?? statsFromPosts(collection, [])
        )
      );
    }

    const mediaItems = await ctx.db.query("mediaItems").collect();
    const postById = new Map(posts.map((post) => [post._id, post]));
    const mediaByPost = new Map<
      string,
      Array<{ url: string; mediaType: string; altText: string | null }>
    >();
    const mediaByCollection = new Map<
      string,
      Array<{ url: string; mediaType: string; altText: string | null }>
    >();
    for (const item of mediaItems) {
      const url =
        (item.storageId ? await ctx.storage.getUrl(item.storageId) : null) ??
        item.imageUrl ??
        item.imageFile ??
        null;
      if (!url) continue;
      const mediaEntry = {
        url,
        mediaType: item.mediaType ?? "unknown",
        altText: item.altText ?? item.imageName ?? item.filename ?? null,
      };
      const existing = mediaByPost.get(item.postId) ?? [];
      if (existing.length < 3) existing.push(mediaEntry);
      mediaByPost.set(item.postId, existing);

      const post = postById.get(item.postId);
      const rawPost = post as PostWithLegacyCollection | undefined;
      const collectionId = rawPost?.collectionId ?? rawPost?.subredditId;
      if (collectionId) {
        const collectionMedia = mediaByCollection.get(collectionId) ?? [];
        if (collectionMedia.length < 10) collectionMedia.push(mediaEntry);
        mediaByCollection.set(collectionId, collectionMedia);
      }
    }

    const indexableCollectionIds = new Set(
      collectionSummaries
        .filter((collection) => collection.indexable)
        .map((collection) => collection._id)
    );

    return {
      collections: collectionSummaries.map((collection) => ({
        ...collection,
        media: mediaByCollection.get(collection._id) ?? [],
      })),
      posts: posts
        .filter((post) => {
          const rawPost = post as PostWithLegacyCollection;
          const collectionId = rawPost.collectionId ?? rawPost.subredditId;
          return !post.nsfw && Boolean(collectionId && indexableCollectionIds.has(collectionId));
        })
        .map((post) => ({
          _id: post._id,
          lastModified: post.modifiedAt ?? post.createdAt,
          media: mediaByPost.get(post._id) ?? [],
        })),
    };
  },
});
