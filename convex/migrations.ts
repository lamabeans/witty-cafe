import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  bbcodeToRichText,
  excerptFromText,
  titleFromContent,
} from "./lib/richText";
import {
  DEFAULT_AUDIENCES,
  DEFAULT_FLAVORS,
  inferAudienceSlugs,
  inferFlavorSlug,
} from "./lib/taxonomy";

export const convertLegacyBodies = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const posts = await ctx.db.query("posts").collect();
    let converted = 0;
    let skipped = 0;

    for (const post of posts) {
      if (post.contentJson && post.plainTextExcerpt && post.legacyBody) {
        skipped += 1;
        continue;
      }
      if (converted >= limit) break;

      const body = post.body ?? post.legacyBody;
      await ctx.db.patch(post._id, {
        title: titleFromContent(post.title, body),
        legacyBody: post.legacyBody ?? post.body,
        contentJson: post.contentJson ?? bbcodeToRichText(body),
        plainTextExcerpt: post.plainTextExcerpt ?? excerptFromText(body),
      });
      converted += 1;
    }

    return { converted, skipped };
  },
});

export const applyDefaultTaxonomy = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const flavorIds = new Map<string, Id<"flavors">>();
    const audienceIds = new Map<string, Id<"audiences">>();
    let flavorsCreated = 0;
    let audiencesCreated = 0;
    let collectionsUpdated = 0;
    const unresolvedCollections = [];

    for (const flavor of DEFAULT_FLAVORS) {
      const existing = await ctx.db
        .query("flavors")
        .withIndex("by_slug", (q) => q.eq("slug", flavor.slug))
        .unique();
      if (existing) {
        flavorIds.set(flavor.slug, existing._id);
      } else if (!dryRun) {
        const id = await ctx.db.insert("flavors", {
          ...flavor,
          isActive: true,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        });
        flavorIds.set(flavor.slug, id);
        flavorsCreated += 1;
      }
    }

    for (const audience of DEFAULT_AUDIENCES) {
      const existing = await ctx.db
        .query("audiences")
        .withIndex("by_slug", (q) => q.eq("slug", audience.slug))
        .unique();
      if (existing) {
        audienceIds.set(audience.slug, existing._id);
      } else if (!dryRun) {
        const id = await ctx.db.insert("audiences", {
          ...audience,
          isActive: true,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        });
        audienceIds.set(audience.slug, id);
        audiencesCreated += 1;
      }
    }

    const collections = await ctx.db.query("subreddits").collect();
    for (const collection of collections) {
      const flavorSlug = inferFlavorSlug(collection.name);
      const audienceSlugs = inferAudienceSlugs(collection.name);
      const flavorId = flavorIds.get(flavorSlug);
      const collectionAudienceIds = audienceSlugs
        .map((slug) => audienceIds.get(slug))
        .filter((id): id is Id<"audiences"> => Boolean(id));

      if (flavorSlug === "other") {
        unresolvedCollections.push({
          collectionId: collection._id,
          name: collection.name,
          inferredFlavor: flavorSlug,
          inferredAudiences: audienceSlugs,
        });
      }

      if (!dryRun && flavorId) {
        await ctx.db.patch(collection._id, {
          flavorId,
          audienceIds: collectionAudienceIds,
          modifiedAt: Date.now(),
        });
        collectionsUpdated += 1;
      }
    }

    return {
      dryRun,
      flavorsCreated,
      audiencesCreated,
      collectionsUpdated,
      unresolvedCollections,
    };
  },
});

export const seedPostLikeReactionsFromVotes = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const votes = await ctx.db.query("votes").collect();
    let created = 0;
    let skipped = 0;

    for (const vote of votes) {
      if (created >= limit) break;
      if (vote.value !== 1) {
        skipped += 1;
        continue;
      }

      const existing = await ctx.db
        .query("postReactions")
        .withIndex("by_post_user", (q) =>
          q.eq("postId", vote.postId).eq("userId", vote.userId)
        )
        .unique();

      if (existing) {
        skipped += 1;
        continue;
      }

      await ctx.db.insert("postReactions", {
        postId: vote.postId,
        userId: vote.userId,
        kind: "like",
        createdAt: Date.now(),
      });
      created += 1;
    }

    return { created, skipped };
  },
});
