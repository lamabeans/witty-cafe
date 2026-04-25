import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { slugify } from "./lib/slugify";

export const importAll = mutation({
  args: {
    subreddits: v.array(
      v.object({
        legacyId: v.string(),
        name: v.string(),
        slug: v.optional(v.string()),
        description: v.optional(v.string()),
        createdAt: v.optional(v.number()),
      })
    ),
    tags: v.array(
      v.object({
        legacyId: v.string(),
        name: v.string(),
        slug: v.optional(v.string()),
      })
    ),
    posts: v.array(
      v.object({
        legacyId: v.string(),
        title: v.string(),
        body: v.optional(v.string()),
        subredditLegacyId: v.string(),
        createdAt: v.optional(v.number()),
        score: v.optional(v.number()),
        commentCount: v.optional(v.number()),
        tagLegacyIds: v.optional(v.array(v.string())),
      })
    ),
    comments: v.optional(
      v.array(
        v.object({
          legacyId: v.string(),
          postLegacyId: v.string(),
          body: v.string(),
          createdAt: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const subredditIdByLegacy = new Map<string, string>();
    const tagIdByLegacy = new Map<string, string>();
    const postIdByLegacy = new Map<string, string>();

    let subredditsCreated = 0;
    let tagsCreated = 0;
    let postsCreated = 0;
    let commentsCreated = 0;

    for (const subreddit of args.subreddits) {
      const existing = await ctx.db
        .query("subreddits")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", subreddit.legacyId))
        .unique();

      if (existing) {
        subredditIdByLegacy.set(subreddit.legacyId, existing._id);
        continue;
      }

      const slug = subreddit.slug ?? slugify(subreddit.name);
      const maybeSlug = await ctx.db
        .query("subreddits")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();

      if (maybeSlug) {
        subredditIdByLegacy.set(subreddit.legacyId, maybeSlug._id);
        await ctx.db.patch(maybeSlug._id, {
          legacyId: maybeSlug.legacyId ?? subreddit.legacyId,
        });
        continue;
      }

      const subredditId = await ctx.db.insert("subreddits", {
        name: subreddit.name,
        slug,
        description: subreddit.description,
        createdAt: subreddit.createdAt ?? Date.now(),
        legacyId: subreddit.legacyId,
      });
      subredditIdByLegacy.set(subreddit.legacyId, subredditId);
      subredditsCreated += 1;
    }

    for (const tag of args.tags) {
      const existing = await ctx.db
        .query("tags")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", tag.legacyId))
        .unique();

      if (existing) {
        tagIdByLegacy.set(tag.legacyId, existing._id);
        continue;
      }

      const slug = tag.slug ?? slugify(tag.name);
      const maybeSlug = await ctx.db
        .query("tags")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();

      if (maybeSlug) {
        tagIdByLegacy.set(tag.legacyId, maybeSlug._id);
        await ctx.db.patch(maybeSlug._id, {
          legacyId: maybeSlug.legacyId ?? tag.legacyId,
        });
        continue;
      }

      const tagId = await ctx.db.insert("tags", {
        name: tag.name,
        slug,
        legacyId: tag.legacyId,
      });
      tagIdByLegacy.set(tag.legacyId, tagId);
      tagsCreated += 1;
    }

    for (const post of args.posts) {
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", post.legacyId))
        .unique();

      if (existing) {
        postIdByLegacy.set(post.legacyId, existing._id);
        continue;
      }

      const subredditId = subredditIdByLegacy.get(post.subredditLegacyId);
      if (!subredditId) {
        continue;
      }

      const postId = await ctx.db.insert("posts", {
        title: post.title,
        body: post.body,
        subredditId,
        authorId: undefined,
        createdAt: post.createdAt ?? Date.now(),
        score: post.score ?? 0,
        commentCount: post.commentCount ?? 0,
        legacyId: post.legacyId,
      });
      postIdByLegacy.set(post.legacyId, postId);
      postsCreated += 1;

      const tagIds = (post.tagLegacyIds ?? [])
        .map((tagLegacyId) => tagIdByLegacy.get(tagLegacyId))
        .filter(Boolean) as string[];

      for (const tagId of tagIds) {
        await ctx.db.insert("postTags", {
          postId,
          tagId,
        });
      }
    }

    for (const comment of args.comments ?? []) {
      const existing = await ctx.db
        .query("comments")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", comment.legacyId))
        .unique();

      if (existing) {
        continue;
      }

      const postId = postIdByLegacy.get(comment.postLegacyId);
      if (!postId) {
        continue;
      }

      await ctx.db.insert("comments", {
        postId,
        parentId: undefined,
        authorId: undefined,
        body: comment.body,
        createdAt: comment.createdAt ?? Date.now(),
        legacyId: comment.legacyId,
      });
      commentsCreated += 1;
    }

    return {
      subredditsCreated,
      tagsCreated,
      postsCreated,
      commentsCreated,
    };
  },
});
