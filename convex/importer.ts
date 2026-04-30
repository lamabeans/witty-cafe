import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  bbcodeToRichText,
  excerptFromText,
  titleFromContent,
} from "./lib/richText";
import { slugify } from "./lib/slugify";

const userInput = v.object({
  legacyId: v.string(),
  clerkUserId: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  username: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  modifiedAt: v.optional(v.number()),
  joinedCollectionLegacyIds: v.optional(v.array(v.string())),
});

const collectionInput = v.object({
  legacyId: v.string(),
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  introduction: v.optional(v.string()),
  conclusion: v.optional(v.string()),
  bannerImage: v.optional(v.string()),
  nsfw: v.optional(v.boolean()),
  moderatorEmails: v.optional(v.array(v.string())),
  createdAt: v.optional(v.number()),
  modifiedAt: v.optional(v.number()),
});

const tagInput = v.object({
  legacyId: v.string(),
  name: v.string(),
  slug: v.optional(v.string()),
});

const postInput = v.object({
  legacyId: v.string(),
  postContentLegacyId: v.optional(v.string()),
  title: v.string(),
  body: v.optional(v.string()),
  collectionLegacyId: v.string(),
  createdAt: v.optional(v.number()),
  modifiedAt: v.optional(v.number()),
  score: v.optional(v.number()),
  commentCount: v.optional(v.number()),
  nsfw: v.optional(v.boolean()),
  upvoteEmails: v.optional(v.array(v.string())),
  tagLegacyIds: v.optional(v.array(v.string())),
});

const mediaItemInput = v.object({
  legacyGalleryId: v.string(),
  postLegacyId: v.string(),
  postContentLegacyId: v.optional(v.string()),
  frameTypeLegacyId: v.optional(v.string()),
  frameType: v.optional(v.string()),
  marker: v.optional(v.number()),
  score: v.optional(v.number()),
  shortId: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageFile: v.optional(v.string()),
  imageName: v.optional(v.string()),
  imageType: v.optional(v.string()),
  nsfw: v.optional(v.boolean()),
  createdAt: v.optional(v.number()),
  modifiedAt: v.optional(v.number()),
});

function inferMediaType(imageType: string | undefined, imageUrl: string | undefined) {
  const mime = imageType?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video" as const;
  if (mime.startsWith("audio/")) return "audio" as const;
  if (mime.startsWith("image/")) return "image" as const;
  if (imageUrl) return "image" as const;
  return "unknown" as const;
}

type Stats = {
  usersCreated: number;
  usersUpdated: number;
  collectionsCreated: number;
  collectionsUpdated: number;
  tagsCreated: number;
  tagsUpdated: number;
  postsCreated: number;
  postsUpdated: number;
  postTagsCreated: number;
  postTagsSkipped: number;
  votesCreated: number;
  votesUpdated: number;
  votesSkipped: number;
  membershipsCreated: number;
  membershipsSkipped: number;
  mediaCreated: number;
  mediaUpdated: number;
  unresolved: string[];
};

function cleanPatch<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

async function findUserByEmail(
  ctx: Pick<MutationCtx, "db">,
  email: string | undefined
) {
  if (!email) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

export const importAll = mutation({
  args: {
    users: v.optional(v.array(userInput)),
    collections: v.optional(v.array(collectionInput)),
    tags: v.optional(v.array(tagInput)),
    posts: v.optional(v.array(postInput)),
    mediaItems: v.optional(v.array(mediaItemInput)),
  },
  handler: async (ctx, args): Promise<Stats> => {
    const stats: Stats = {
      usersCreated: 0,
      usersUpdated: 0,
      collectionsCreated: 0,
      collectionsUpdated: 0,
      tagsCreated: 0,
      tagsUpdated: 0,
      postsCreated: 0,
      postsUpdated: 0,
      postTagsCreated: 0,
      postTagsSkipped: 0,
      votesCreated: 0,
      votesUpdated: 0,
      votesSkipped: 0,
      membershipsCreated: 0,
      membershipsSkipped: 0,
      mediaCreated: 0,
      mediaUpdated: 0,
      unresolved: [],
    };

    const userIdByEmail = new Map<string, Id<"users">>();
    const collectionIdByLegacy = new Map<string, Id<"collections">>();
    const tagIdByLegacy = new Map<string, Id<"tags">>();
    const postIdByLegacy = new Map<string, Id<"posts">>();

    async function resolveCollection(legacyId: string) {
      const cached = collectionIdByLegacy.get(legacyId);
      if (cached) return cached;
      const existing = await ctx.db
        .query("collections")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
        .unique();
      if (!existing) return null;
      collectionIdByLegacy.set(legacyId, existing._id);
      return existing._id;
    }

    async function resolveTag(legacyId: string) {
      const cached = tagIdByLegacy.get(legacyId);
      if (cached) return cached;
      const existing = await ctx.db
        .query("tags")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
        .unique();
      if (!existing) return null;
      tagIdByLegacy.set(legacyId, existing._id);
      return existing._id;
    }

    async function resolvePost(legacyId: string) {
      const cached = postIdByLegacy.get(legacyId);
      if (cached) return cached;
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
        .unique();
      if (!existing) return null;
      postIdByLegacy.set(legacyId, existing._id);
      return existing._id;
    }

    async function resolveUserByEmail(email: string) {
      const cached = userIdByEmail.get(email.toLowerCase());
      if (cached) return cached;
      const existing = await findUserByEmail(ctx, email.toLowerCase());
      if (!existing) return null;
      userIdByEmail.set(email.toLowerCase(), existing._id);
      return existing._id;
    }

    for (const user of args.users ?? []) {
      const existingByLegacy = await ctx.db
        .query("users")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", user.legacyId))
        .unique();
      const existingByClerk = existingByLegacy
        ? null
        : await ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (q) =>
              q.eq("clerkUserId", user.clerkUserId)
            )
            .unique();
      const existingByEmail = existingByLegacy || existingByClerk
        ? null
        : await findUserByEmail(ctx, user.email);
      const existing = existingByLegacy ?? existingByClerk ?? existingByEmail;
      const clerkUserId =
        existing?.clerkUserId && !existing.clerkUserId.startsWith("legacy:")
          ? existing.clerkUserId
          : user.clerkUserId;

      const patch = cleanPatch({
        clerkUserId,
        email: user.email,
        name: user.name,
        username: user.username,
        legacyId: user.legacyId,
        createdAt: user.createdAt,
        modifiedAt: user.modifiedAt,
      });

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        if (user.email) userIdByEmail.set(user.email.toLowerCase(), existing._id);
        stats.usersUpdated += 1;
      } else {
        const userId = await ctx.db.insert("users", {
          clerkUserId,
          email: user.email,
          name: user.name,
          username: user.username,
          legacyId: user.legacyId,
          createdAt: user.createdAt,
          modifiedAt: user.modifiedAt,
        });
        if (user.email) userIdByEmail.set(user.email.toLowerCase(), userId);
        stats.usersCreated += 1;
      }
    }

    for (const collection of args.collections ?? []) {
      const slug = collection.slug ?? slugify(collection.name);
      const existingByLegacy = await ctx.db
        .query("collections")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", collection.legacyId))
        .unique();
      const existingBySlug = existingByLegacy
        ? null
        : await ctx.db
            .query("collections")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .unique();
      const existing = existingByLegacy ?? existingBySlug;
      const patch = cleanPatch({
        name: collection.name,
        slug,
        description: collection.description,
        introduction: collection.introduction,
        conclusion: collection.conclusion,
        bannerImage: collection.bannerImage,
        nsfw: collection.nsfw,
        moderatorEmails: collection.moderatorEmails,
        createdAt: collection.createdAt ?? Date.now(),
        modifiedAt: collection.modifiedAt,
        legacyId: collection.legacyId,
      });

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        collectionIdByLegacy.set(collection.legacyId, existing._id);
        stats.collectionsUpdated += 1;
      } else {
        const collectionId = await ctx.db.insert("collections", {
          name: collection.name,
          slug,
          description: collection.description,
          introduction: collection.introduction,
          conclusion: collection.conclusion,
          bannerImage: collection.bannerImage,
          nsfw: collection.nsfw,
          moderatorEmails: collection.moderatorEmails,
          createdAt: collection.createdAt ?? Date.now(),
          modifiedAt: collection.modifiedAt,
          legacyId: collection.legacyId,
        });
        collectionIdByLegacy.set(collection.legacyId, collectionId);
        stats.collectionsCreated += 1;
      }
    }

    for (const tag of args.tags ?? []) {
      const slug = tag.slug ?? slugify(tag.name);
      const existingByLegacy = await ctx.db
        .query("tags")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", tag.legacyId))
        .unique();
      const existingBySlug = existingByLegacy
        ? null
        : await ctx.db
            .query("tags")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .unique();
      const existing = existingByLegacy ?? existingBySlug;
      const patch = cleanPatch({
        name: tag.name,
        slug,
        legacyId: tag.legacyId,
      });

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        tagIdByLegacy.set(tag.legacyId, existing._id);
        stats.tagsUpdated += 1;
      } else {
        const tagId = await ctx.db.insert("tags", {
          name: tag.name,
          slug,
          legacyId: tag.legacyId,
        });
        tagIdByLegacy.set(tag.legacyId, tagId);
        stats.tagsCreated += 1;
      }
    }

    for (const user of args.users ?? []) {
      if (!user.email) continue;
      const userId = userIdByEmail.get(user.email.toLowerCase());
      if (!userId) continue;

      for (const collectionLegacyId of user.joinedCollectionLegacyIds ?? []) {
        const collectionId = await resolveCollection(collectionLegacyId);
        if (!collectionId) {
          stats.unresolved.push(
            `membership:${user.email}->${collectionLegacyId}`
          );
          continue;
        }

        const existing = await ctx.db
          .query("collectionMembers")
          .withIndex("by_user_collection", (q) =>
            q.eq("userId", userId).eq("collectionId", collectionId)
          )
          .unique();
        if (existing) {
          stats.membershipsSkipped += 1;
          continue;
        }

        await ctx.db.insert("collectionMembers", { userId, collectionId });
        stats.membershipsCreated += 1;
      }
    }

    for (const post of args.posts ?? []) {
      const collectionId = await resolveCollection(post.collectionLegacyId);
      if (!collectionId) {
        stats.unresolved.push(`post:${post.legacyId}->${post.collectionLegacyId}`);
        continue;
      }

      const existing = await ctx.db
        .query("posts")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", post.legacyId))
        .unique();
      const title = titleFromContent(post.title, post.body);
      const patch = cleanPatch({
        title,
        body: post.body,
        legacyBody: post.body,
        contentJson: bbcodeToRichText(post.body),
        plainTextExcerpt: excerptFromText(post.body),
        collectionId,
        authorId: undefined,
        createdAt: post.createdAt ?? Date.now(),
        modifiedAt: post.modifiedAt,
        score: post.score ?? 0,
        commentCount: post.commentCount ?? 0,
        nsfw: post.nsfw,
        upvoteEmails: post.upvoteEmails,
        legacyId: post.legacyId,
        postContentLegacyId: post.postContentLegacyId,
      });

      const postId = existing
        ? existing._id
          : await ctx.db.insert("posts", {
            title,
            body: post.body,
            legacyBody: post.body,
            contentJson: bbcodeToRichText(post.body),
            plainTextExcerpt: excerptFromText(post.body),
            collectionId,
            authorId: undefined,
            createdAt: post.createdAt ?? Date.now(),
            modifiedAt: post.modifiedAt,
            score: post.score ?? 0,
            commentCount: post.commentCount ?? 0,
            nsfw: post.nsfw,
            upvoteEmails: post.upvoteEmails,
            legacyId: post.legacyId,
            postContentLegacyId: post.postContentLegacyId,
          });
      if (existing) {
        await ctx.db.patch(existing._id, patch);
        stats.postsUpdated += 1;
      } else {
        stats.postsCreated += 1;
      }
      postIdByLegacy.set(post.legacyId, postId);

      for (const tagLegacyId of post.tagLegacyIds ?? []) {
        const tagId = await resolveTag(tagLegacyId);
        if (!tagId) {
          stats.unresolved.push(`postTag:${post.legacyId}->${tagLegacyId}`);
          continue;
        }

        const existingTagLink = await ctx.db
          .query("postTags")
          .withIndex("by_post_tag", (q) =>
            q.eq("postId", postId).eq("tagId", tagId)
          )
          .unique();
        if (existingTagLink) {
          stats.postTagsSkipped += 1;
          continue;
        }

        await ctx.db.insert("postTags", { postId, tagId });
        stats.postTagsCreated += 1;
      }

      for (const email of post.upvoteEmails ?? []) {
        const userId = await resolveUserByEmail(email);
        if (!userId) {
          stats.unresolved.push(`vote:${post.legacyId}->${email}`);
          continue;
        }

        const existingVote = await ctx.db
          .query("votes")
          .withIndex("by_post_user", (q) =>
            q.eq("postId", postId).eq("userId", userId)
          )
          .unique();
        if (existingVote) {
          if (existingVote.value !== 1) {
            await ctx.db.patch(existingVote._id, { value: 1 });
            stats.votesUpdated += 1;
          } else {
            stats.votesSkipped += 1;
          }
          continue;
        }

        await ctx.db.insert("votes", { postId, userId, value: 1 });
        stats.votesCreated += 1;
      }
    }

    for (const mediaItem of args.mediaItems ?? []) {
      const postId = await resolvePost(mediaItem.postLegacyId);
      if (!postId) {
        stats.unresolved.push(
          `media:${mediaItem.legacyGalleryId}->${mediaItem.postLegacyId}`
        );
        continue;
      }

      const existing = await ctx.db
        .query("mediaItems")
        .withIndex("by_legacyGalleryId", (q) =>
          q.eq("legacyGalleryId", mediaItem.legacyGalleryId)
        )
        .unique();
      const patch = cleanPatch({
        postId,
        legacyGalleryId: mediaItem.legacyGalleryId,
        source: "legacy" as const,
        mediaType: inferMediaType(mediaItem.imageType, mediaItem.imageUrl),
        order: mediaItem.marker,
        filename: mediaItem.imageName,
        altText: mediaItem.imageName,
        status: "ready" as const,
        postContentLegacyId: mediaItem.postContentLegacyId,
        frameTypeLegacyId: mediaItem.frameTypeLegacyId,
        frameType: mediaItem.frameType,
        marker: mediaItem.marker,
        score: mediaItem.score,
        shortId: mediaItem.shortId,
        imageUrl: mediaItem.imageUrl,
        imageFile: mediaItem.imageFile,
        imageName: mediaItem.imageName,
        imageType: mediaItem.imageType,
        nsfw: mediaItem.nsfw,
        createdAt: mediaItem.createdAt ?? Date.now(),
        modifiedAt: mediaItem.modifiedAt,
      });

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        stats.mediaUpdated += 1;
      } else {
        await ctx.db.insert("mediaItems", {
          postId,
          legacyGalleryId: mediaItem.legacyGalleryId,
          source: "legacy" as const,
          mediaType: inferMediaType(mediaItem.imageType, mediaItem.imageUrl),
          order: mediaItem.marker,
          filename: mediaItem.imageName,
          altText: mediaItem.imageName,
          status: "ready" as const,
          postContentLegacyId: mediaItem.postContentLegacyId,
          frameTypeLegacyId: mediaItem.frameTypeLegacyId,
          frameType: mediaItem.frameType,
          marker: mediaItem.marker,
          score: mediaItem.score,
          shortId: mediaItem.shortId,
          imageUrl: mediaItem.imageUrl,
          imageFile: mediaItem.imageFile,
          imageName: mediaItem.imageName,
          imageType: mediaItem.imageType,
          nsfw: mediaItem.nsfw,
          createdAt: mediaItem.createdAt ?? Date.now(),
          modifiedAt: mediaItem.modifiedAt,
        });
        stats.mediaCreated += 1;
      }
    }

    return stats;
  },
});
