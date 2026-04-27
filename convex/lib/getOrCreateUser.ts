import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function getOrCreateUser(
  ctx: MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  const email = identity.email?.toLowerCase();

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) =>
      q.eq("clerkUserId", identity.subject)
    )
    .unique();

  if (existing) {
    return existing;
  }

  if (email) {
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existingByEmail) {
      await ctx.db.patch(existingByEmail._id, {
        clerkUserId: identity.subject,
        email,
        name: identity.name ?? existingByEmail.name,
        imageUrl: identity.pictureUrl ?? existingByEmail.imageUrl,
        username: existingByEmail.username ?? identity.nickname ?? undefined,
      });
      return await ctx.db.get(existingByEmail._id);
    }
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email,
    name: identity.name ?? undefined,
    username: identity.nickname ?? undefined,
    imageUrl: identity.pictureUrl ?? undefined,
  });

  return await ctx.db.get(userId);
}
