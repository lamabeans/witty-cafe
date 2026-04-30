import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";

const feedMediaLayoutValidator = v.union(v.literal("compact"), v.literal("hero"));
const darkModePreferenceValidator = v.union(
  v.literal("light"),
  v.literal("dark"),
  v.literal("system")
);

export const upsert = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
    });
  },
});

export const viewerPreferences = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        feedMediaLayout: "compact" as const,
        darkModePreference: "system" as const,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject)
      )
      .unique();

    return {
      feedMediaLayout: user?.feedMediaLayout ?? ("compact" as const),
      darkModePreference: user?.darkModePreference ?? ("system" as const),
    };
  },
});

export const setPreferences = mutation({
  args: {
    feedMediaLayout: v.optional(feedMediaLayoutValidator),
    darkModePreference: v.optional(darkModePreferenceValidator),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("You must be signed in to save preferences.");
    }

    await ctx.db.patch(user._id, {
      feedMediaLayout: args.feedMediaLayout ?? user.feedMediaLayout,
      darkModePreference: args.darkModePreference ?? user.darkModePreference,
      modifiedAt: Date.now(),
    });

    return user._id;
  },
});
