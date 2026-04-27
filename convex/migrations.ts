import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  bbcodeToRichText,
  excerptFromText,
  titleFromContent,
} from "./lib/richText";

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
