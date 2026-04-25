import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import type { EnrichedComment } from "./types";

export const listByPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc")
      .collect();

    const enriched: EnrichedComment[] = [];
    for (const comment of comments) {
      const author = comment.authorId
        ? await ctx.db.get(comment.authorId)
        : null;
      enriched.push({
        ...comment,
        author: author
          ? {
              name: author.name ?? "Anonymous",
              imageUrl: author.imageUrl ?? null,
            }
          : null,
      });
    }

    return enriched;
  },
});

export const create = mutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    parentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to comment.");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found.");
    }

    const commentId = await ctx.db.insert("comments", {
      postId: args.postId,
      parentId: args.parentId,
      authorId: user._id,
      body: args.body,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.postId, {
      commentCount: post.commentCount + 1,
    });

    return commentId;
  },
});
