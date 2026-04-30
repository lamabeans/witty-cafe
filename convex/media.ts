import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";

const importConfidenceValidator = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low")
);

const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("model3d"),
  v.literal("game"),
  v.literal("unknown")
);

function normalizeAssetUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

function requireImportToken(token: string) {
  const expected = process.env.IMAGE_IMPORT_TOKEN;
  if (!expected || token !== expected) {
    throw new Error("Invalid image import token.");
  }
}

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to upload media.");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const listPostsForImageImport = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    requireImportToken(args.token);

    const posts = await ctx.db.query("posts").collect();
    const results = [];
    for (const post of posts) {
      const subreddit = await ctx.db.get(post.subredditId);
      results.push({
        _id: post._id,
        title: post.title,
        body: post.body,
        legacyBody: post.legacyBody,
        plainTextExcerpt: post.plainTextExcerpt,
        createdAt: post.createdAt,
        subreddit: subreddit
          ? {
              name: subreddit.name,
              slug: subreddit.slug,
            }
          : null,
      });
    }

    return results;
  },
});

export const findImportedByLegacyId = query({
  args: {
    token: v.string(),
    legacyGalleryId: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportToken(args.token);

    const existing = await ctx.db
      .query("mediaItems")
      .withIndex("by_legacyGalleryId", (q) =>
        q.eq("legacyGalleryId", args.legacyGalleryId)
      )
      .unique();

    if (!existing) return null;
    return {
      _id: existing._id,
      postId: existing.postId,
      storageId: existing.storageId,
      legacyGalleryId: existing.legacyGalleryId,
    };
  },
});

export const generateImportUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    requireImportToken(args.token);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachImportedImage = mutation({
  args: {
    token: v.string(),
    postId: v.id("posts"),
    storageId: v.id("_storage"),
    legacyGalleryId: v.string(),
    filename: v.string(),
    size: v.optional(v.number()),
    altText: v.optional(v.string()),
    order: v.optional(v.number()),
    importSourceZip: v.string(),
    importZipPath: v.string(),
    importMatchText: v.string(),
    importMatchConfidence: importConfidenceValidator,
    importMatchScore: v.number(),
  },
  handler: async (ctx, args) => {
    requireImportToken(args.token);

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found.");
    }

    const existing = await ctx.db
      .query("mediaItems")
      .withIndex("by_legacyGalleryId", (q) =>
        q.eq("legacyGalleryId", args.legacyGalleryId)
      )
      .unique();
    if (existing) {
      return { status: "skipped" as const, mediaItemId: existing._id };
    }

    const mediaItemId = await ctx.db.insert("mediaItems", {
      postId: args.postId,
      legacyGalleryId: args.legacyGalleryId,
      source: "zip-import",
      mediaType: "image",
      storageId: args.storageId,
      order: args.order ?? 0,
      filename: args.filename,
      size: args.size,
      altText: args.altText,
      status: "ready",
      importSourceZip: args.importSourceZip,
      importZipPath: args.importZipPath,
      importMatchText: args.importMatchText,
      importMatchConfidence: args.importMatchConfidence,
      importMatchScore: args.importMatchScore,
      createdAt: Date.now(),
    });

    return { status: "created" as const, mediaItemId };
  },
});

export const attachToPost = mutation({
  args: {
    postId: v.id("posts"),
    storageId: v.id("_storage"),
    mediaType: mediaTypeValidator,
    filename: v.optional(v.string()),
    size: v.optional(v.number()),
    altText: v.optional(v.string()),
    duration: v.optional(v.number()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to attach media.");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found.");
    }
    if (post.authorId && post.authorId !== user._id) {
      throw new Error("Only the post author can attach media.");
    }

    return await ctx.db.insert("mediaItems", {
      postId: args.postId,
      legacyGalleryId: `upload:${args.storageId}`,
      source: "upload",
      mediaType: args.mediaType,
      storageId: args.storageId,
      order: args.order ?? 0,
      filename: args.filename,
      size: args.size,
      altText: args.altText,
      duration: args.duration,
      status: "ready",
      createdAt: Date.now(),
    });
  },
});

export const listByPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("mediaItems")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const enriched = [];
    for (const item of items) {
      enriched.push({
        ...item,
        url: item.storageId
          ? await ctx.storage.getUrl(item.storageId)
          : normalizeAssetUrl(item.imageUrl) ?? normalizeAssetUrl(item.imageFile),
      });
    }

    return enriched.sort((a, b) => {
      const aOrder = a.order ?? a.marker ?? 0;
      const bOrder = b.order ?? b.marker ?? 0;
      return aOrder - bOrder;
    });
  },
});
