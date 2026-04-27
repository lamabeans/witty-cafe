import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
  }),
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    legacyId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_legacyId", ["legacyId"]),
  subreddits: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    introduction: v.optional(v.string()),
    conclusion: v.optional(v.string()),
    bannerImage: v.optional(v.string()),
    nsfw: v.optional(v.boolean()),
    moderatorEmails: v.optional(v.array(v.string())),
    createdAt: v.number(),
    modifiedAt: v.optional(v.number()),
    legacyId: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_legacyId", ["legacyId"]),
  posts: defineTable({
    title: v.string(),
    body: v.optional(v.string()),
    contentJson: v.optional(v.any()),
    legacyBody: v.optional(v.string()),
    plainTextExcerpt: v.optional(v.string()),
    subredditId: v.id("subreddits"),
    authorId: v.optional(v.id("users")),
    createdAt: v.number(),
    modifiedAt: v.optional(v.number()),
    score: v.number(),
    commentCount: v.number(),
    nsfw: v.optional(v.boolean()),
    upvoteEmails: v.optional(v.array(v.string())),
    legacyId: v.optional(v.string()),
    postContentLegacyId: v.optional(v.string()),
  })
    .index("by_subreddit", ["subredditId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_legacyId", ["legacyId"]),
  comments: defineTable({
    postId: v.id("posts"),
    parentId: v.optional(v.id("comments")),
    authorId: v.optional(v.id("users")),
    body: v.string(),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_post", ["postId"])
    .index("by_parent", ["parentId"])
    .index("by_legacyId", ["legacyId"]),
  tags: defineTable({
    name: v.string(),
    slug: v.string(),
    legacyId: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_legacyId", ["legacyId"]),
  postTags: defineTable({
    postId: v.id("posts"),
    tagId: v.id("tags"),
  })
    .index("by_post", ["postId"])
    .index("by_tag", ["tagId"])
    .index("by_post_tag", ["postId", "tagId"]),
  votes: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    value: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_post_user", ["postId", "userId"]),
  subredditMembers: defineTable({
    subredditId: v.id("subreddits"),
    userId: v.id("users"),
  })
    .index("by_subreddit", ["subredditId"])
    .index("by_user", ["userId"])
    .index("by_user_subreddit", ["userId", "subredditId"]),
  mediaItems: defineTable({
    postId: v.id("posts"),
    legacyGalleryId: v.string(),
    source: v.optional(v.union(v.literal("legacy"), v.literal("upload"))),
    mediaType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("unknown")
      )
    ),
    storageId: v.optional(v.id("_storage")),
    order: v.optional(v.number()),
    filename: v.optional(v.string()),
    size: v.optional(v.number()),
    altText: v.optional(v.string()),
    duration: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("ready"), v.literal("processing"), v.literal("hidden"))
    ),
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
    createdAt: v.number(),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_legacyGalleryId", ["legacyGalleryId"])
    .index("by_storageId", ["storageId"])
    .index("by_post_marker", ["postId", "marker"]),
});
