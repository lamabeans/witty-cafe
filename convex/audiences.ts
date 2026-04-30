import { mutation, query } from "./_generated/server";
import { DEFAULT_AUDIENCES } from "./lib/taxonomy";
import { slugify } from "./lib/slugify";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    const stored = await ctx.db.query("audiences").order("asc").collect();
    if (stored.length > 0) {
      return stored
        .filter((audience) => audience.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    }

    return DEFAULT_AUDIENCES.map((audience) => ({
      _id: null,
      _creationTime: 0,
      ...audience,
      isActive: true,
    }));
  },
});

export const seedDefaults = mutation({
  handler: async (ctx) => {
    let created = 0;
    let updated = 0;

    for (const audience of DEFAULT_AUDIENCES) {
      const existing = await ctx.db
        .query("audiences")
        .withIndex("by_slug", (q) => q.eq("slug", audience.slug))
        .unique();

      const patch = {
        name: audience.name,
        aliases: audience.aliases,
        sortOrder: audience.sortOrder,
        isActive: true,
        modifiedAt: Date.now(),
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated += 1;
      } else {
        await ctx.db.insert("audiences", {
          slug: audience.slug,
          ...patch,
          createdAt: Date.now(),
        });
        created += 1;
      }
    }

    return { created, updated };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = slugify(args.name);
    const existing = await ctx.db
      .query("audiences")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("audiences", {
      name: args.name,
      slug,
      description: args.description,
      isActive: true,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    });
  },
});
