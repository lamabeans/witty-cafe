import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import {
  bbcodeToRichText,
  excerptFromText,
  plainTextToRichText,
  titleFromContent,
} from "./lib/richText";
import { slugify } from "./lib/slugify";
import {
  DEFAULT_AUDIENCES,
  DEFAULT_FLAVORS,
  inferAudienceSlugs,
  inferFlavorSlug,
} from "./lib/taxonomy";
import type {
  AudienceSummary,
  EnrichedPost,
  FlavorSummary,
  MediaSummary,
  ReactionCounts,
  ReactionKind,
  RichTextDocument,
} from "./types";

const DEFAULT_LIMIT = 40;

const REACTION_KINDS: ReactionKind[] = ["like", "funny", "love", "wow"];

const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("model3d"),
  v.literal("game"),
  v.literal("unknown")
);

const mediaAttachmentInput = v.object({
  storageId: v.id("_storage"),
  mediaType: mediaTypeValidator,
  filename: v.optional(v.string()),
  size: v.optional(v.number()),
  altText: v.optional(v.string()),
  duration: v.optional(v.number()),
  order: v.optional(v.number()),
});

type DbContext =
  | Pick<QueryCtx, "db" | "auth" | "storage">
  | Pick<MutationCtx, "db" | "auth" | "storage">;

function emptyReactionCounts(): ReactionCounts {
  return {
    like: 0,
    funny: 0,
    love: 0,
    wow: 0,
  };
}

function defaultFlavorSummary(slug: string): FlavorSummary {
  const flavor =
    DEFAULT_FLAVORS.find((item) => item.slug === slug) ??
    DEFAULT_FLAVORS.find((item) => item.slug === "other") ??
    DEFAULT_FLAVORS[0];
  return {
    _id: null,
    name: flavor.name,
    slug: flavor.slug,
    description: flavor.description,
    kind: flavor.kind,
    color: flavor.color,
    icon: flavor.icon,
  };
}

function defaultAudienceSummary(slug: string): AudienceSummary | null {
  const audience = DEFAULT_AUDIENCES.find((item) => item.slug === slug);
  if (!audience) return null;
  return {
    _id: null,
    name: audience.name,
    slug: audience.slug,
  };
}

async function flavorForCollection(
  ctx: DbContext,
  collection: Doc<"subreddits"> | null
): Promise<FlavorSummary> {
  if (collection?.flavorId) {
    const flavor = await ctx.db.get(collection.flavorId);
    if (flavor) {
      return {
        _id: flavor._id,
        name: flavor.name,
        slug: flavor.slug,
        description: flavor.description,
        kind: flavor.kind,
        color: flavor.color,
        icon: flavor.icon,
      };
    }
  }

  return defaultFlavorSummary(inferFlavorSlug(collection?.name));
}

async function audiencesForCollection(
  ctx: DbContext,
  collection: Doc<"subreddits"> | null
): Promise<AudienceSummary[]> {
  if (collection?.audienceIds?.length) {
    const audiences = (
      await Promise.all(collection.audienceIds.map((id) => ctx.db.get(id)))
    ).filter((audience): audience is Doc<"audiences"> => audience !== null);

    if (audiences.length > 0) {
      return audiences.map((audience) => ({
        _id: audience._id,
        name: audience.name,
        slug: audience.slug,
      }));
    }
  }

  const inferred = inferAudienceSlugs(collection?.name)
    .map(defaultAudienceSummary)
    .filter((audience): audience is AudienceSummary => audience !== null);

  return inferred.length > 0
    ? inferred
    : [{ _id: null, name: "Everyone", slug: "everyone" }];
}

function addReaction(counts: ReactionCounts, kind: ReactionKind) {
  counts[kind] += 1;
}

async function resolveTags(
  ctx: MutationCtx,
  tagNames: string[] | undefined
): Promise<Array<Id<"tags">>> {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }

  const uniqueNames = Array.from(
    new Set(
      tagNames
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    )
  );

  const tagIds: Array<Id<"tags">> = [];
  for (const name of uniqueNames) {
    const slug = slugify(name);
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      tagIds.push(existing._id);
      continue;
    }

    const tagId = await ctx.db.insert("tags", { name, slug });
    tagIds.push(tagId);
  }

  return tagIds;
}

function normalizeAssetUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed;
}

function inferLegacyMediaType(item: Doc<"mediaItems">): MediaSummary["mediaType"] {
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

async function currentUserId(ctx: DbContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (byClerkId) return byClerkId._id;

  const email = identity.email?.toLowerCase();
  if (!email) return null;

  const byEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return byEmail?._id ?? null;
}

async function mediaForPost(
  ctx: DbContext,
  postId: Id<"posts">,
  userId: Id<"users"> | null
): Promise<MediaSummary[]> {
  const media = await ctx.db
    .query("mediaItems")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();

  const summaries: MediaSummary[] = [];
  for (const item of media) {
    const reactionCounts = emptyReactionCounts();
    const reactions = await ctx.db
      .query("mediaReactions")
      .withIndex("by_media", (q) => q.eq("mediaItemId", item._id))
      .collect();
    for (const reaction of reactions) {
      addReaction(reactionCounts, reaction.kind);
    }
    const viewerReaction =
      userId && reactions.find((reaction) => reaction.userId === userId)?.kind;
    const reactionTotal = REACTION_KINDS.reduce(
      (total, kind) => total + reactionCounts[kind],
      0
    );
    const legacyScore = item.score ?? 0;
    const storageUrl = item.storageId
      ? await ctx.storage.getUrl(item.storageId)
      : null;
    const url =
      storageUrl ??
      normalizeAssetUrl(item.imageUrl) ??
      normalizeAssetUrl(item.imageFile);

    summaries.push({
      _id: item._id,
      url,
      source: item.source ?? (item.storageId ? "upload" : "legacy"),
      mediaType: item.mediaType ?? inferLegacyMediaType(item),
      filename: item.filename ?? item.imageName ?? item.shortId ?? null,
      altText: item.altText ?? item.imageName ?? item.shortId ?? null,
      order: item.order ?? item.marker ?? 0,
      marker: item.marker ?? null,
      nsfw: item.nsfw ?? false,
      aiGenerated: item.source === "ai-generated",
      aiModel: item.aiModel ?? null,
      aiPreset: item.aiPreset ?? null,
      legacyScore,
      rankScore: legacyScore + reactionTotal,
      reactionCounts,
      viewerReaction: viewerReaction ?? null,
    });
  }

  return summaries.sort((a, b) => {
    const rankDiff = b.rankScore - a.rankScore;
    if (rankDiff !== 0) return rankDiff;
    return a.order - b.order;
  });
}

async function enrichPost(
  ctx: DbContext,
  post: Doc<"posts">
): Promise<EnrichedPost> {
  const subreddit = await ctx.db.get(post.subredditId);
  const author = post.authorId ? await ctx.db.get(post.authorId) : null;
  const tagLinks = await ctx.db
    .query("postTags")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();

  const tags = (
    await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId)))
  ).filter((tag): tag is Doc<"tags"> => tag !== null);

  const userId = await currentUserId(ctx);
  const viewerVote = userId
    ? await ctx.db
        .query("votes")
        .withIndex("by_post_user", (q) =>
          q.eq("postId", post._id).eq("userId", userId)
        )
        .unique()
    : null;
  const postReactions = await ctx.db
    .query("postReactions")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const reactionCounts = emptyReactionCounts();
  for (const reaction of postReactions) {
    addReaction(reactionCounts, reaction.kind);
  }
  reactionCounts.like = Math.max(reactionCounts.like, Math.max(post.score, 0));
  const explicitViewerReaction =
    userId && postReactions.find((reaction) => reaction.userId === userId)?.kind;
  const viewerReaction =
    explicitViewerReaction ?? (viewerVote?.value === 1 ? "like" : null);
  const flavor = await flavorForCollection(ctx, subreddit);
  const audiences = await audiencesForCollection(ctx, subreddit);

  const contentJson =
    (post.contentJson as RichTextDocument | undefined) ??
    (post.body ? bbcodeToRichText(post.body) : undefined);

  return {
    ...post,
    title: titleFromContent(post.title, post.body),
    contentJson,
    plainTextExcerpt: post.plainTextExcerpt ?? excerptFromText(post.body),
    subreddit: subreddit
      ? {
          name: subreddit.name,
          slug: subreddit.slug,
        }
      : null,
    collection: subreddit
      ? {
          name: subreddit.name,
          slug: subreddit.slug,
        }
      : null,
    flavor,
    audiences,
    author: author
      ? {
          name: author.name ?? author.username ?? "Anonymous",
          imageUrl: author.imageUrl ?? null,
        }
      : null,
    tags: tags.map((tag) => ({
      name: tag.name,
      slug: tag.slug,
    })),
    vibes: tags.map((tag) => ({
      name: tag.name,
      slug: tag.slug,
    })),
    media: await mediaForPost(ctx, post._id, userId),
    viewerVote: viewerVote?.value ?? null,
    reactionCounts,
    viewerReaction,
  };
}

export const list = query({
  args: {
    subredditSlug: v.optional(v.string()),
    tagSlug: v.optional(v.string()),
    flavorSlug: v.optional(v.string()),
    audienceSlug: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("hot"), v.literal("new"), v.literal("top"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? DEFAULT_LIMIT;
    let posts: Array<Doc<"posts">> = [];

    if (args.subredditSlug) {
      const subreddit = await ctx.db
        .query("subreddits")
        .withIndex("by_slug", (q) => q.eq("slug", args.subredditSlug!))
        .unique();

      if (!subreddit) {
        return [];
      }

      posts = await ctx.db
        .query("posts")
        .withIndex("by_subreddit", (q) =>
          q.eq("subredditId", subreddit._id)
        )
        .order("desc")
        .take(limit);
    } else if (args.tagSlug) {
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_slug", (q) => q.eq("slug", args.tagSlug!))
        .unique();

      if (!tag) {
        return [];
      }

      const links = await ctx.db
        .query("postTags")
        .withIndex("by_tag", (q) => q.eq("tagId", tag._id))
        .collect();

      const linkedPosts = (
        await Promise.all(links.map((link) => ctx.db.get(link.postId)))
      ).filter((post): post is Doc<"posts"> => post !== null);

      posts = linkedPosts
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    } else {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_createdAt", (q) => q)
        .order("desc")
        .take(args.flavorSlug || args.audienceSlug ? 1000 : limit);
    }

    if (args.flavorSlug || args.audienceSlug) {
      const filtered: Array<Doc<"posts">> = [];
      for (const post of posts) {
        const collection = await ctx.db.get(post.subredditId);
        const flavor = await flavorForCollection(ctx, collection);
        const audiences = await audiencesForCollection(ctx, collection);
        const flavorMatches =
          !args.flavorSlug || flavor.slug === args.flavorSlug;
        const audienceMatches =
          !args.audienceSlug ||
          audiences.some((audience) => audience.slug === args.audienceSlug);
        if (flavorMatches && audienceMatches) filtered.push(post);
      }
      posts = filtered;
    }

    if (args.sort === "top") {
      posts = posts.sort((a, b) => b.score - a.score);
    } else if (args.sort === "hot") {
      posts = posts.sort(
        (a, b) =>
          b.score +
          b.commentCount * 2 +
          b.createdAt / 100000000000 -
          (a.score + a.commentCount * 2 + a.createdAt / 100000000000)
      );
    } else {
      posts = posts.sort((a, b) => b.createdAt - a.createdAt);
    }

    const enriched: EnrichedPost[] = [];
    for (const post of posts.slice(0, limit)) {
      enriched.push(await enrichPost(ctx, post));
    }

    return enriched;
  },
});

export const get = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) {
      return null;
    }
    return await enrichPost(ctx, post);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    contentJson: v.optional(v.any()),
    plainTextExcerpt: v.optional(v.string()),
    subredditId: v.id("subreddits"),
    tagNames: v.optional(v.array(v.string())),
    mediaAttachments: v.optional(v.array(mediaAttachmentInput)),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to post.");
    }

    const subreddit = await ctx.db.get(args.subredditId);
    if (!subreddit) {
      throw new Error("Collection not found.");
    }

    const title = titleFromContent(args.title, args.body);
    const body = args.body?.trim();
    const contentJson =
      (args.contentJson as RichTextDocument | undefined) ??
      plainTextToRichText(body);
    const plainTextExcerpt = args.plainTextExcerpt ?? excerptFromText(body);

    if (!title.trim()) {
      throw new Error("Post title is required.");
    }

    const tagIds = await resolveTags(ctx, args.tagNames);

    const postId = await ctx.db.insert("posts", {
      title,
      body,
      contentJson,
      plainTextExcerpt,
      subredditId: args.subredditId,
      authorId: user._id,
      createdAt: Date.now(),
      score: 0,
      commentCount: 0,
    });

    for (const tagId of tagIds) {
      await ctx.db.insert("postTags", {
        postId,
        tagId,
      });
    }

    for (const [index, media] of (args.mediaAttachments ?? []).entries()) {
      await ctx.db.insert("mediaItems", {
        postId,
        legacyGalleryId: `upload:${media.storageId}`,
        source: "upload",
        mediaType: media.mediaType,
        storageId: media.storageId,
        order: media.order ?? index,
        filename: media.filename,
        size: media.size,
        altText: media.altText,
        duration: media.duration,
        status: "ready",
        createdAt: Date.now(),
      });
    }

    return postId;
  },
});
