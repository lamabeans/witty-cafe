import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import {
  bbcodeToRichText,
  excerptFromText,
  plainTextToRichText,
  titleFromContent,
} from "./lib/richText";
import { slugify } from "./lib/slugify";
import type { EnrichedPost, MediaSummary, RichTextDocument } from "./types";

const DEFAULT_LIMIT = 40;

const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("unknown")
);

const mediaAttachmentInput = v.object({
  storageId: v.id("_storage"),
  mediaType: mediaTypeValidator,
  filename: v.optional(v.string()),
  size: v.optional(v.number()),
  altText: v.optional(v.string()),
  duration: v.optional(v.number()),
  order: v.optional(v.number()),
});

type DbContext =
  | Pick<QueryCtx, "db" | "auth" | "storage">
  | Pick<MutationCtx, "db" | "auth" | "storage">;

async function resolveTags(
  ctx: MutationCtx,
  tagNames: string[] | undefined
): Promise<Array<Id<"tags">>> {
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

  const tagIds: Array<Id<"tags">> = [];
  for (const name of uniqueNames) {
    const slug = slugify(name);
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
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

function normalizeAssetUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed;
}

function inferLegacyMediaType(item: Doc<"mediaItems">): MediaSummary["mediaType"] {
  const mime = item.imageType?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (item.mediaType) return item.mediaType;
  if (item.imageUrl || item.imageFile) return "image";
  return "unknown";
}

async function currentUserId(ctx: DbContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (byClerkId) return byClerkId._id;

  const email = identity.email?.toLowerCase();
  if (!email) return null;

  const byEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return byEmail?._id ?? null;
}

async function mediaForPost(
  ctx: DbContext,
  postId: Id<"posts">
): Promise<MediaSummary[]> {
  const media = await ctx.db
    .query("mediaItems")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();

  const sorted = media.sort((a, b) => {
    const aOrder = a.order ?? a.marker ?? 0;
    const bOrder = b.order ?? b.marker ?? 0;
    return aOrder - bOrder;
  });

  const summaries: MediaSummary[] = [];
  for (const item of sorted) {
    const storageUrl = item.storageId
      ? await ctx.storage.getUrl(item.storageId)
      : null;
    const url =
      storageUrl ??
      normalizeAssetUrl(item.imageUrl) ??
      normalizeAssetUrl(item.imageFile);

    summaries.push({
      _id: item._id,
      url,
      source: item.source ?? (item.storageId ? "upload" : "legacy"),
      mediaType: item.mediaType ?? inferLegacyMediaType(item),
      filename: item.filename ?? item.imageName ?? item.shortId ?? null,
      altText: item.altText ?? item.imageName ?? item.shortId ?? null,
      order: item.order ?? item.marker ?? 0,
      marker: item.marker ?? null,
      nsfw: item.nsfw ?? false,
    });
  }

  return summaries;
}

async function enrichPost(
  ctx: DbContext,
  post: Doc<"posts">
): Promise<EnrichedPost> {
  const subreddit = await ctx.db.get(post.subredditId);
  const author = post.authorId ? await ctx.db.get(post.authorId) : null;
  const tagLinks = await ctx.db
    .query("postTags")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();

  const tags = (
    await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId)))
  ).filter((tag): tag is Doc<"tags"> => tag !== null);

  const userId = await currentUserId(ctx);
  const viewerVote = userId
    ? await ctx.db
        .query("votes")
        .withIndex("by_post_user", (q) =>
          q.eq("postId", post._id).eq("userId", userId)
        )
        .unique()
    : null;

  const contentJson =
    (post.contentJson as RichTextDocument | undefined) ??
    (post.body ? bbcodeToRichText(post.body) : undefined);

  return {
    ...post,
    title: titleFromContent(post.title, post.body),
    contentJson,
    plainTextExcerpt: post.plainTextExcerpt ?? excerptFromText(post.body),
    subreddit: subreddit
      ? {
          name: subreddit.name,
          slug: subreddit.slug,
        }
      : null,
    author: author
      ? {
          name: author.name ?? author.username ?? "Anonymous",
          imageUrl: author.imageUrl ?? null,
        }
      : null,
    tags: tags.map((tag) => ({
      name: tag.name,
      slug: tag.slug,
    })),
    media: await mediaForPost(ctx, post._id),
    viewerVote: viewerVote?.value ?? null,
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
    let posts: Array<Doc<"posts">> = [];

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
      ).filter((post): post is Doc<"posts"> => post !== null);

      posts = linkedPosts
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    } else {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_createdAt", (q) => q)
        .order("desc")
        .take(limit);
    }

    const enriched: EnrichedPost[] = [];
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
    contentJson: v.optional(v.any()),
    plainTextExcerpt: v.optional(v.string()),
    subredditId: v.id("subreddits"),
    tagNames: v.optional(v.array(v.string())),
    mediaAttachments: v.optional(v.array(mediaAttachmentInput)),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to post.");
    }

    const subreddit = await ctx.db.get(args.subredditId);
    if (!subreddit) {
      throw new Error("Community not found.");
    }

    const title = titleFromContent(args.title, args.body);
    const body = args.body?.trim();
    const contentJson =
      (args.contentJson as RichTextDocument | undefined) ??
      plainTextToRichText(body);
    const plainTextExcerpt = args.plainTextExcerpt ?? excerptFromText(body);

    if (!title.trim()) {
      throw new Error("Post title is required.");
    }

    const tagIds = await resolveTags(ctx, args.tagNames);

    const postId = await ctx.db.insert("posts", {
      title,
      body,
      contentJson,
      plainTextExcerpt,
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

    for (const [index, media] of (args.mediaAttachments ?? []).entries()) {
      await ctx.db.insert("mediaItems", {
        postId,
        legacyGalleryId: `upload:${media.storageId}`,
        source: "upload",
        mediaType: media.mediaType,
        storageId: media.storageId,
        order: media.order ?? index,
        filename: media.filename,
        size: media.size,
        altText: media.altText,
        duration: media.duration,
        status: "ready",
        createdAt: Date.now(),
      });
    }

    return postId;
  },
});
