import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import { slugify } from "./lib/slugify";

type LegacyCollectionQuery = {
  collect: () => Promise<Array<Doc<"collections">>>;
  order: (direction: "asc" | "desc") => LegacyCollectionQuery;
};

type LegacyCollectionDb = {
  query: (tableName: "subreddits") => LegacyCollectionQuery;
};

function legacyCollectionDb(db: unknown) {
  return db as LegacyCollectionDb;
}

export const list = query({
  handler: async (ctx) => {
    const collections = await ctx.db.query("collections").order("asc").collect();
    if (collections.length > 0) return collections;
    return await legacyCollectionDb(ctx.db)
      .query("subreddits")
      .order("asc")
      .collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const collection = await ctx.db
      .query("collections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (collection) return collection;
    const legacyCollections = await legacyCollectionDb(ctx.db)
      .query("subreddits")
      .collect();
    return (
      legacyCollections.find(
        (legacyCollection: { slug?: string }) =>
          legacyCollection.slug === args.slug
      ) ?? null
    );
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
      throw new Error("You must be signed in to create a Collection.");
    }

    const slug = slugify(args.name);
    const existing = await ctx.db
      .query("collections")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("collections", {
      name: args.name,
      slug,
      description: args.description,
      createdAt: Date.now(),
    });
  },
});
