import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";

const reactionKindValidator = v.union(
  v.literal("like"),
  v.literal("funny"),
  v.literal("love"),
  v.literal("wow"),
  v.literal("keep"),
  v.literal("share")
);

export const togglePost = mutation({
  args: {
    postId: v.id("posts"),
    kind: reactionKindValidator,
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) throw new Error("You must be signed in to react.");

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found.");

    const existing = await ctx.db
      .query("postReactions")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", args.postId).eq("userId", user._id)
      )
      .unique();

    if (existing?.kind === args.kind) {
      await ctx.db.delete(existing._id);
      return { status: "removed", viewerReaction: null };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        modifiedAt: Date.now(),
      });
      return { status: "updated", viewerReaction: args.kind };
    }

    await ctx.db.insert("postReactions", {
      postId: args.postId,
      userId: user._id,
      kind: args.kind,
      createdAt: Date.now(),
    });

    return { status: "created", viewerReaction: args.kind };
  },
});

export const toggleMedia = mutation({
  args: {
    mediaItemId: v.id("mediaItems"),
    kind: reactionKindValidator,
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) throw new Error("You must be signed in to react.");

    const mediaItem = await ctx.db.get(args.mediaItemId);
    if (!mediaItem) throw new Error("Media item not found.");

    const existing = await ctx.db
      .query("mediaReactions")
      .withIndex("by_media_user", (q) =>
        q.eq("mediaItemId", args.mediaItemId).eq("userId", user._id)
      )
      .unique();

    if (existing?.kind === args.kind) {
      await ctx.db.delete(existing._id);
      return { status: "removed", viewerReaction: null };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        modifiedAt: Date.now(),
      });
      return { status: "updated", viewerReaction: args.kind };
    }

    await ctx.db.insert("mediaReactions", {
      mediaItemId: args.mediaItemId,
      userId: user._id,
      kind: args.kind,
      createdAt: Date.now(),
    });

    return { status: "created", viewerReaction: args.kind };
  },
});
