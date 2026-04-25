import { mutation } from "./_generated/server";
import { v } from "convex/values";

async function getOrCreateUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", identity.subject))
    .unique();

  if (existing) {
    return existing;
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email: identity.email ?? undefined,
    name: identity.name ?? undefined,
    imageUrl: identity.pictureUrl ?? undefined,
  });

  return await ctx.db.get(userId);
}

export const cast = mutation({
  args: {
    postId: v.id("posts"),
    value: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.value !== 1 && args.value !== -1) {
      throw new Error("Vote value must be 1 or -1.");
    }

    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to vote.");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found.");
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", args.postId).eq("userId", user._id)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("votes", {
        postId: args.postId,
        userId: user._id,
        value: args.value,
      });

      await ctx.db.patch(args.postId, {
        score: post.score + args.value,
      });

      return { status: "created" };
    }

    if (existing.value === args.value) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.postId, {
        score: post.score - args.value,
      });
      return { status: "removed" };
    }

    await ctx.db.patch(existing._id, {
      value: args.value,
    });
    await ctx.db.patch(args.postId, {
      score: post.score - existing.value + args.value,
    });

    return { status: "updated" };
  },
});
