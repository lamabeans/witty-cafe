import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { slugify } from "./lib/slugify";

const DEFAULT_LIMIT = 40;

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

async function resolveTags(ctx: any, tagNames: string[] | undefined) {
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

  const tagIds = [];
  for (const name of uniqueNames) {
    const slug = slugify(name);
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
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

async function enrichPost(ctx: any, post: any) {
  const subreddit = await ctx.db.get(post.subredditId);
  const author = post.authorId ? await ctx.db.get(post.authorId) : null;
  const tagLinks = await ctx.db
    .query("postTags")
    .withIndex("by_post", (q: any) => q.eq("postId", post._id))
    .collect();

  const tags = (
    await Promise.all(tagLinks.map((link: any) => ctx.db.get(link.tagId)))
  ).filter(Boolean);

  return {
    ...post,
    subreddit: subreddit
      ? {
          name: subreddit.name,
          slug: subreddit.slug,
        }
      : null,
    author: author
      ? {
          name: author.name ?? "Anonymous",
          imageUrl: author.imageUrl ?? null,
        }
      : null,
    tags: tags.map((tag: any) => ({
      name: tag.name,
      slug: tag.slug,
    })),
  };
}

export const list = query({
  args: {
    subredditSlug: v.optional(v.string()),
    tagSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? DEFAULT_LIMIT;
    let posts: any[] = [];

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
      ).filter(Boolean);

      posts = linkedPosts
        .sort((a: any, b: any) => b.createdAt - a.createdAt)
        .slice(0, limit);
    } else {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_createdAt", (q) => q)
        .order("desc")
        .take(limit);
    }

    const enriched = [];
    for (const post of posts) {
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
    subredditId: v.id("subreddits"),
    tagNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to post.");
    }

    const subreddit = await ctx.db.get(args.subredditId);
    if (!subreddit) {
      throw new Error("Subreddit not found.");
    }

    const tagIds = await resolveTags(ctx, args.tagNames);

    const postId = await ctx.db.insert("posts", {
      title: args.title,
      body: args.body,
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

    return postId;
  },
});
