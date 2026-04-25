import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }).index("by_clerkUserId", ["clerkUserId"]),
  subreddits: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_legacyId", ["legacyId"]),
  posts: defineTable({
    title: v.string(),
    body: v.optional(v.string()),
    subredditId: v.id("subreddits"),
    authorId: v.optional(v.id("users")),
    createdAt: v.number(),
    score: v.number(),
    commentCount: v.number(),
    legacyId: v.optional(v.string()),
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
    .index("by_tag", ["tagId"]),
  votes: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    value: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_post_user", ["postId", "userId"]),
});
