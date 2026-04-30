import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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

type LegacyCollection = Doc<"collections"> & {
  _id: string;
  _creationTime?: number;
};

type LegacyMember = {
  _id: string;
  userId: Id<"users">;
  subredditId: string;
};

type LegacyPost = Doc<"posts"> & {
  collectionId?: Id<"collections">;
  subredditId?: string;
};

type LegacyCollectQuery<T> = {
  collect: () => Promise<T[]>;
};

type LegacyMigrationDb = {
  query: {
    (tableName: "subreddits"): LegacyCollectQuery<LegacyCollection>;
    (tableName: "subredditMembers"): LegacyCollectQuery<LegacyMember>;
    (tableName: "posts"): LegacyCollectQuery<LegacyPost>;
  };
  replace: (id: Id<"posts">, value: Record<string, unknown>) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

function legacyMigrationDb(db: unknown) {
  return db as LegacyMigrationDb;
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

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

    const collections = await ctx.db.query("collections").collect();
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

export const migrateCollectionsFromLegacy = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    deleteLegacy: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const deleteLegacy = args.deleteLegacy ?? false;
    const db = legacyMigrationDb(ctx.db);
    const now = Date.now();
    const legacyCollections = await db.query("subreddits").collect();
    const legacyMembers = await db.query("subredditMembers").collect();
    const posts = await db.query("posts").collect();
    const legacyToCollectionId = new Map<string, Id<"collections">>();
    const unresolvedPosts = [];
    let collectionsCreated = 0;
    let collectionsUpdated = 0;
    let postsPatched = 0;
    let membershipsCreated = 0;
    let membershipsSkipped = 0;
    let legacyCollectionsDeleted = 0;
    let legacyMembershipsDeleted = 0;

    for (const legacy of legacyCollections) {
      const existingByLegacy = legacy.legacyId
        ? await ctx.db
            .query("collections")
            .withIndex("by_legacyId", (q) => q.eq("legacyId", legacy.legacyId))
            .unique()
        : null;
      const existingBySlug = existingByLegacy
        ? null
        : await ctx.db
            .query("collections")
            .withIndex("by_slug", (q) => q.eq("slug", legacy.slug))
            .unique();
      const existing = existingByLegacy ?? existingBySlug;
      const collectionDoc = compactRecord({
        name: legacy.name,
        slug: legacy.slug,
        description: legacy.description,
        introduction: legacy.introduction,
        conclusion: legacy.conclusion,
        bannerImage: legacy.bannerImage,
        flavorId: legacy.flavorId,
        audienceIds: legacy.audienceIds,
        nsfw: legacy.nsfw,
        moderatorEmails: legacy.moderatorEmails,
        createdAt: legacy.createdAt ?? legacy._creationTime ?? now,
        modifiedAt: legacy.modifiedAt ?? now,
        legacyId: legacy.legacyId,
      });

      if (existing) {
        legacyToCollectionId.set(legacy._id, existing._id);
        if (!dryRun) {
          await ctx.db.patch(existing._id, collectionDoc);
        }
        collectionsUpdated += 1;
      } else {
        collectionsCreated += 1;
        if (!dryRun) {
          const collectionId = await ctx.db.insert("collections", collectionDoc);
          legacyToCollectionId.set(legacy._id, collectionId);
        }
      }
    }

    if (dryRun) {
      for (const legacy of legacyCollections) {
        if (!legacyToCollectionId.has(legacy._id)) {
          legacyToCollectionId.set(legacy._id, legacy._id);
        }
      }
    }

    for (const post of posts) {
      const collectionId =
        post.collectionId ??
        (post.subredditId ? legacyToCollectionId.get(post.subredditId) : null);
      if (!collectionId) {
        unresolvedPosts.push(post._id);
        continue;
      }
      if (post.collectionId === collectionId && post.subredditId === undefined) {
        continue;
      }

      postsPatched += 1;
      if (!dryRun) {
        await db.replace(
          post._id,
          compactRecord({
            title: post.title,
            body: post.body,
            contentJson: post.contentJson,
            legacyBody: post.legacyBody,
            plainTextExcerpt: post.plainTextExcerpt,
            collectionId,
            authorId: post.authorId,
            createdAt: post.createdAt,
            modifiedAt: post.modifiedAt,
            score: post.score,
            commentCount: post.commentCount,
            nsfw: post.nsfw,
            upvoteEmails: post.upvoteEmails,
            legacyId: post.legacyId,
            postContentLegacyId: post.postContentLegacyId,
          })
        );
      }
    }

    for (const member of legacyMembers) {
      const collectionId = legacyToCollectionId.get(member.subredditId);
      if (!collectionId) {
        membershipsSkipped += 1;
        continue;
      }

      const existing = await ctx.db
        .query("collectionMembers")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", member.userId).eq("collectionId", collectionId)
        )
        .unique();
      if (existing) {
        membershipsSkipped += 1;
      } else {
        membershipsCreated += 1;
        if (!dryRun) {
          await ctx.db.insert("collectionMembers", {
            userId: member.userId,
            collectionId,
          });
        }
      }

      if (!dryRun && deleteLegacy) {
        await db.delete(member._id);
        legacyMembershipsDeleted += 1;
      }
    }

    if (!dryRun && deleteLegacy) {
      for (const legacy of legacyCollections) {
        await db.delete(legacy._id);
        legacyCollectionsDeleted += 1;
      }
    }

    return {
      dryRun,
      deleteLegacy,
      legacyCollections: legacyCollections.length,
      legacyMemberships: legacyMembers.length,
      posts: posts.length,
      collectionsCreated,
      collectionsUpdated,
      postsPatched,
      membershipsCreated,
      membershipsSkipped,
      legacyCollectionsDeleted,
      legacyMembershipsDeleted,
      unresolvedPosts,
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
