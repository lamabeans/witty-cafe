import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { slugify } from "./lib/slugify";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("tags").order("asc").collect();
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const slug = slugify(args.name);
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("tags", {
      name: args.name,
      slug,
    });
  },
});
