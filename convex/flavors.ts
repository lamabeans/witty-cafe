import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_FLAVORS } from "./lib/taxonomy";
import { slugify } from "./lib/slugify";

export const list = query({
  handler: async (ctx) => {
    const stored = await ctx.db.query("flavors").order("asc").collect();
    if (stored.length > 0) {
      return stored
        .filter((flavor) => flavor.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    }

    return DEFAULT_FLAVORS.map((flavor) => ({
      _id: null,
      _creationTime: 0,
      ...flavor,
      isActive: true,
    }));
  },
});

export const seedDefaults = mutation({
  handler: async (ctx) => {
    let created = 0;
    let updated = 0;

    for (const flavor of DEFAULT_FLAVORS) {
      const existing = await ctx.db
        .query("flavors")
        .withIndex("by_slug", (q) => q.eq("slug", flavor.slug))
        .unique();

      const patch = {
        name: flavor.name,
        description: flavor.description,
        kind: flavor.kind,
        color: flavor.color,
        icon: flavor.icon,
        aliases: flavor.aliases,
        sortOrder: flavor.sortOrder,
        isActive: true,
        modifiedAt: Date.now(),
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated += 1;
      } else {
        await ctx.db.insert("flavors", {
          slug: flavor.slug,
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
    kind: v.optional(
      v.union(
        v.literal("type"),
        v.literal("theme"),
        v.literal("occasion"),
        v.literal("format"),
        v.literal("other")
      )
    ),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = slugify(args.name);
    const existing = await ctx.db
      .query("flavors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("flavors", {
      name: args.name,
      slug,
      description: args.description,
      kind: args.kind ?? "other",
      color: args.color,
      icon: args.icon,
      isActive: true,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    });
  },
});
