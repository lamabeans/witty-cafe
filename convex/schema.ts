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
    feedMediaLayout: v.optional(v.union(v.literal("compact"), v.literal("hero"))),
    darkModePreference: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
    ),
    aiGenerationTier: v.optional(
      v.union(v.literal("free_beta"), v.literal("paid"), v.literal("admin"))
    ),
    aiGenerationDailyLimit: v.optional(v.number()),
    legacyId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_legacyId", ["legacyId"]),
  flavors: defineTable({
    name: v.string(),
    slug: v.string(),
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
    parentFlavorId: v.optional(v.id("flavors")),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_parent", ["parentFlavorId"])
    .index("by_sortOrder", ["sortOrder"]),
  audiences: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_sortOrder", ["sortOrder"]),
  collections: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    introduction: v.optional(v.string()),
    conclusion: v.optional(v.string()),
    bannerImage: v.optional(v.string()),
    flavorId: v.optional(v.id("flavors")),
    audienceIds: v.optional(v.array(v.id("audiences"))),
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
    collectionId: v.id("collections"),
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
    .index("by_collection", ["collectionId"])
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
  postReactions: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    kind: v.union(
      v.literal("like"),
      v.literal("funny"),
      v.literal("love"),
      v.literal("wow")
    ),
    createdAt: v.number(),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_user", ["userId"])
    .index("by_post_user", ["postId", "userId"]),
  mediaReactions: defineTable({
    mediaItemId: v.id("mediaItems"),
    userId: v.id("users"),
    kind: v.union(
      v.literal("like"),
      v.literal("funny"),
      v.literal("love"),
      v.literal("wow")
    ),
    createdAt: v.number(),
    modifiedAt: v.optional(v.number()),
  })
    .index("by_media", ["mediaItemId"])
    .index("by_user", ["userId"])
    .index("by_media_user", ["mediaItemId", "userId"]),
  collectionMembers: defineTable({
    collectionId: v.id("collections"),
    userId: v.id("users"),
  })
    .index("by_collection", ["collectionId"])
    .index("by_user", ["userId"])
    .index("by_user_collection", ["userId", "collectionId"]),
  mediaItems: defineTable({
    postId: v.id("posts"),
    legacyGalleryId: v.string(),
    source: v.optional(
      v.union(
        v.literal("legacy"),
        v.literal("upload"),
        v.literal("zip-import"),
        v.literal("ai-generated")
      )
    ),
    mediaType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("model3d"),
        v.literal("game"),
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
    aiGenerationId: v.optional(v.id("mediaGenerations")),
    aiProvider: v.optional(v.string()),
    aiModel: v.optional(v.string()),
    aiPreset: v.optional(v.string()),
    aiPrompt: v.optional(v.string()),
    importSourceZip: v.optional(v.string()),
    importZipPath: v.optional(v.string()),
    importMatchText: v.optional(v.string()),
    importMatchConfidence: v.optional(
      v.union(v.literal("high"), v.literal("medium"), v.literal("low"))
    ),
    importMatchScore: v.optional(v.number()),
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
    .index("by_aiGenerationId", ["aiGenerationId"])
    .index("by_post_marker", ["postId", "marker"]),
  mediaGenerations: defineTable({
    postId: v.id("posts"),
    requesterId: v.id("users"),
    mediaType: v.union(
      v.literal("image"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("model3d"),
      v.literal("game")
    ),
    preset: v.string(),
    provider: v.string(),
    model: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    prompt: v.string(),
    dayKey: v.string(),
    counted: v.boolean(),
    openAiJobId: v.optional(v.string()),
    progress: v.optional(v.number()),
    attempts: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    mediaItemId: v.optional(v.id("mediaItems")),
    filename: v.optional(v.string()),
    contentType: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    modifiedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_requester_day", ["requesterId", "dayKey"])
    .index("by_status", ["status"])
    .index("by_openAiJobId", ["openAiJobId"]),
}, {
  schemaValidation: false,
  strictTableNameTypes: false,
});
