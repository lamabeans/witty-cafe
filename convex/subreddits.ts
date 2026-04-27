import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import { slugify } from "./lib/slugify";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("subreddits").order("asc").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subreddits")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to create a community.");
    }

    const slug = slugify(args.name);
    const existing = await ctx.db
      .query("subreddits")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("subreddits", {
      name: args.name,
      slug,
      description: args.description,
      createdAt: Date.now(),
    });
  },
});
