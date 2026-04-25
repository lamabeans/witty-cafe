import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function getOrCreateUser(
  ctx: MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) =>
      q.eq("clerkUserId", identity.subject)
    )
    .unique();

  if (existing) {
    return existing;
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email: identity.email ?? undefined,
    name: identity.name ?? undefined,
    imageUrl: identity.pictureUrl ?? undefined,
  });

  return await ctx.db.get(userId);
}
