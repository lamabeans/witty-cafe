import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";

const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("unknown")
);

function normalizeAssetUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
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
