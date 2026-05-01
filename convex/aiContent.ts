import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import { slugify } from "./lib/slugify";
import {
  excerptFromText,
  plainTextToRichText,
  titleFromContent,
} from "./lib/richText";

const DEFAULT_TARGET_IDEA_COUNT = 6;
const MAX_TARGET_IDEA_COUNT = 20;

const providerValidator = v.union(v.literal("kimi"), v.literal("zai"));

type AiTextProvider = "kimi" | "zai";

type ProviderConfig = {
  provider: AiTextProvider;
  label: string;
  apiKeyName: string;
  apiKey: string | undefined;
  endpoint: string;
  model: string;
  bodyExtras?: Record<string, unknown>;
};

type CampaignPlan = {
  collection?: {
    name?: string;
    description?: string;
    introduction?: string;
    conclusion?: string;
  };
  keywordResearch?: Array<{
    keyword?: string;
    intent?: string;
    angle?: string;
  }>;
  ideas?: Array<{
    title?: string;
    body?: string;
    tags?: string[];
  }>;
};

function envString(name: string, fallback: string) {
  const value = envSecret(name);
  return value || fallback;
}

function unwrapEnvValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.replace(/^[`'"\u2018\u2019\u201c\u201d]+|[`'"\u2018\u2019\u201c\u201d]+$/g, "");
}

function envSecret(name: string) {
  return unwrapEnvValue(process.env[name]);
}

function adminEmails() {
  return new Set(
    (process.env.AI_GENERATION_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => unwrapEnvValue(email).toLowerCase())
      .filter(Boolean)
  );
}

function cleanList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0)
    )
  ).slice(0, 20);
}

function truncate(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}...`;
}

function targetIdeaCount(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_TARGET_IDEA_COUNT;
  return Math.max(1, Math.min(MAX_TARGET_IDEA_COUNT, Math.floor(value ?? 0)));
}

function providerConfig(provider: AiTextProvider): ProviderConfig {
  if (provider === "zai") {
    const baseUrl = envString(
      "ZAI_BASE_URL",
      "https://api.z.ai/api/paas/v4"
    ).replace(/\/$/, "");
    return {
      provider,
      label: "Z.ai",
      apiKeyName: "ZAI_API_KEY",
      apiKey: envSecret("ZAI_API_KEY"),
      endpoint: `${baseUrl}/chat/completions`,
      model: envString("AI_ZAI_TEXT_MODEL", "glm-5.1"),
      bodyExtras: { thinking: { type: "disabled" } },
    };
  }

  const baseUrl = envString("MOONSHOT_BASE_URL", "https://api.moonshot.ai/v1")
    .replace(/\/$/, "");
  return {
    provider,
    label: "Kimi",
    apiKeyName: "MOONSHOT_API_KEY",
    apiKey: envSecret("MOONSHOT_API_KEY"),
    endpoint: `${baseUrl}/chat/completions`,
    model: envString("AI_KIMI_TEXT_MODEL", "kimi-k2.6"),
    bodyExtras: { thinking: { type: "disabled" } },
  };
}

async function currentAdminEmail(ctx: Pick<QueryCtx | MutationCtx, "auth" | "db">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  const email = (identity.email ?? byClerkId?.email)?.toLowerCase();
  if (!email || !adminEmails().has(email)) return null;
  return email;
}

async function currentAdminMutationUser(ctx: MutationCtx) {
  const user = await getOrCreateUser(ctx as Parameters<typeof getOrCreateUser>[0]);
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().has(email)) return null;
  return user;
}

async function currentAdminQueryUser(ctx: QueryCtx) {
  const email = await currentAdminEmail(ctx);
  if (!email) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

function systemPrompt() {
  return [
    "You are an SEO content strategist for Witty.Cafe, a community-ranked idea site.",
    "Create useful, original, safe-for-work content that feels witty without being thin or spammy.",
    "Research the supplied ranking keywords by inferring search intent, content gaps, and long-tail angles.",
    "Return strict JSON only. Do not wrap it in markdown.",
    "Schema: { collection: { name, description, introduction, conclusion }, keywordResearch: [{ keyword, intent, angle }], ideas: [{ title, body, tags }] }.",
    "Each idea body should be plain text, 3-7 short paragraphs, with practical value and natural keyword coverage.",
    "Avoid medical, legal, financial, hateful, adult, copyrighted character, or celebrity-imitation content.",
  ].join(" ");
}

function userPrompt(args: {
  keywords: string[];
  targetIdeaCount: number;
  collectionName?: string;
  existingCollection?: Pick<Doc<"collections">, "name" | "description" | "introduction" | "conclusion"> | null;
}) {
  return [
    `Target idea count: ${args.targetIdeaCount}`,
    `Keywords to rank for: ${args.keywords.join(", ")}`,
    args.collectionName ? `Requested collection name: ${args.collectionName}` : null,
    args.existingCollection
      ? [
          `Existing collection: ${args.existingCollection.name}`,
          args.existingCollection.description
            ? `Description: ${args.existingCollection.description}`
            : null,
          args.existingCollection.introduction
            ? `Introduction: ${args.existingCollection.introduction}`
            : null,
          args.existingCollection.conclusion
            ? `Conclusion: ${args.existingCollection.conclusion}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "If no existing collection is supplied, create a search-friendly collection concept.",
    "Generate enough ideas to publish directly with minimal admin editing.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function parsePlan(text: string): CampaignPlan {
  const source = stripJsonFence(text);
  try {
    return JSON.parse(source) as CampaignPlan;
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(source.slice(start, end + 1)) as CampaignPlan;
    }
    throw new Error("AI provider did not return valid campaign JSON.");
  }
}

async function chatJson(config: ProviderConfig, prompt: string) {
  if (!config.apiKey?.trim()) {
    throw new Error(`Set Convex env ${config.apiKeyName} to use ${config.label}.`);
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.75,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: prompt },
      ],
      ...config.bodyExtras,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const json = (await response.json()) as {
        error?: { message?: string; code?: string; type?: string };
        message?: string;
      };
      detail = json.error?.message ?? json.message ?? json.error?.code ?? "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail || `${config.label} request failed with status ${response.status}.`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${config.label} did not return content.`);
  }
  return parsePlan(content);
}

async function resolveTags(ctx: Pick<MutationCtx, "db">, tagNames: string[]) {
  const tagIds: Array<Id<"tags">> = [];
  for (const name of cleanList(tagNames).slice(0, 8)) {
    const slug = slugify(name);
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      tagIds.push(existing._id);
      continue;
    }
    tagIds.push(await ctx.db.insert("tags", { name, slug }));
  }
  return tagIds;
}

async function collectionBySlug(ctx: Pick<MutationCtx, "db">, name: string) {
  const slug = slugify(name);
  return await ctx.db
    .query("collections")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export const viewer = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.toLowerCase();
    const isAdmin = Boolean(email && adminEmails().has(email));
    const kimi = providerConfig("kimi");
    const zai = providerConfig("zai");
    return {
      isAdmin,
      providers: {
        kimi: {
          configured: Boolean(kimi.apiKey?.trim()),
          model: kimi.model,
        },
        zai: {
          configured: Boolean(zai.apiKey?.trim()),
          model: zai.model,
        },
      },
    };
  },
});

export const campaigns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await currentAdminQueryUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("aiContentCampaigns")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(args.limit ?? 12);
  },
});

export const startCampaign = internalMutation({
  args: {
    provider: providerValidator,
    keywords: v.array(v.string()),
    targetIdeaCount: v.optional(v.number()),
    collectionId: v.optional(v.id("collections")),
    collectionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await currentAdminMutationUser(ctx);
    if (!user) {
      throw new Error("Only admin users can generate AI content campaigns.");
    }

    const keywords = cleanList(args.keywords);
    if (!keywords.length) {
      throw new Error("Add at least one keyword to research.");
    }

    const existingCollection = args.collectionId
      ? await ctx.db.get(args.collectionId)
      : null;
    const count = targetIdeaCount(args.targetIdeaCount);
    const config = providerConfig(args.provider);
    const prompt = userPrompt({
      keywords,
      targetIdeaCount: count,
      collectionName: args.collectionName,
      existingCollection,
    });
    const now = Date.now();

    return await ctx.db.insert("aiContentCampaigns", {
      requesterId: user._id,
      provider: args.provider,
      model: config.model,
      status: "queued",
      keywords,
      targetIdeaCount: count,
      collectionId: args.collectionId,
      collectionName: args.collectionName?.trim() || existingCollection?.name,
      prompt,
      createdAt: now,
      modifiedAt: now,
    });
  },
});

export const createCampaign = action({
  args: {
    provider: providerValidator,
    keywords: v.array(v.string()),
    targetIdeaCount: v.optional(v.number()),
    collectionId: v.optional(v.id("collections")),
    collectionName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ campaignId: Id<"aiContentCampaigns"> }> => {
    const config = providerConfig(args.provider);
    if (!config.apiKey?.trim()) {
      throw new Error(`Set Convex env ${config.apiKeyName} to use ${config.label}.`);
    }

    const campaignId = (await ctx.runMutation(
      internal.aiContent.startCampaign,
      args
    )) as Id<"aiContentCampaigns">;
    await ctx.scheduler.runAfter(0, internal.aiContent.runCampaign, { campaignId });
    return { campaignId };
  },
});

export const getCampaign = internalQuery({
  args: { campaignId: v.id("aiContentCampaigns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.campaignId);
  },
});

export const nextQueuedCampaigns = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiContentCampaigns")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .take(args.limit);
  },
});

export const markProcessing = internalMutation({
  args: { campaignId: v.id("aiContentCampaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.status === "completed") return false;
    await ctx.db.patch(args.campaignId, {
      status: "processing",
      error: undefined,
      modifiedAt: Date.now(),
    });
    return true;
  },
});

export const markFailed = internalMutation({
  args: {
    campaignId: v.id("aiContentCampaigns"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, {
      status: "failed",
      error: args.error,
      modifiedAt: Date.now(),
    });
  },
});

export const publishPlan = internalMutation({
  args: {
    campaignId: v.id("aiContentCampaigns"),
    plan: v.any(),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      throw new Error("AI content campaign not found.");
    }
    if (campaign.status === "completed") {
      return {
        collectionId: campaign.collectionId,
        postIds: campaign.createdPostIds ?? [],
      };
    }

    const plan = args.plan as CampaignPlan;
    const plannedCollection = plan.collection ?? {};
    const now = Date.now();
    const name = truncate(
      campaign.collectionName ||
        plannedCollection.name ||
        `${campaign.keywords[0]} Ideas`,
      90
    );
    const description = truncate(plannedCollection.description ?? "", 260);
    const introduction = truncate(plannedCollection.introduction ?? description, 1800);
    const conclusion = truncate(plannedCollection.conclusion ?? "", 1200);

    let collectionId = campaign.collectionId;
    if (!collectionId) {
      const existing = await collectionBySlug(ctx, name);
      collectionId =
        existing?._id ??
        (await ctx.db.insert("collections", {
          name,
          slug: slugify(name),
          description: description || undefined,
          introduction: introduction || undefined,
          conclusion: conclusion || undefined,
          createdAt: now,
          modifiedAt: now,
        }));
    } else {
      const collection = await ctx.db.get(collectionId);
      if (collection) {
        await ctx.db.patch(collectionId, {
          description: collection.description || description || undefined,
          introduction: collection.introduction || introduction || undefined,
          conclusion: collection.conclusion || conclusion || undefined,
          modifiedAt: now,
        });
      }
    }
    const resolvedCollectionId = collectionId;

    const ideas = (plan.ideas ?? [])
      .filter((idea) => idea.title?.trim() && idea.body?.trim())
      .slice(0, campaign.targetIdeaCount);
    if (!ideas.length) {
      throw new Error("AI provider did not return publishable ideas.");
    }

    const postIds: Array<Id<"posts">> = [];
    for (const idea of ideas) {
      const title = titleFromContent(truncate(idea.title ?? "", 110), idea.body);
      const body = (idea.body ?? "").trim();
      const postId = await ctx.db.insert("posts", {
        title,
        body,
        contentJson: plainTextToRichText(body),
        plainTextExcerpt: excerptFromText(body),
        collectionId: resolvedCollectionId,
        authorId: campaign.requesterId,
        createdAt: now,
        modifiedAt: now,
        score: 0,
        commentCount: 0,
      });
      postIds.push(postId);

      const tagIds = await resolveTags(ctx, [
        ...(idea.tags ?? []),
        ...campaign.keywords.slice(0, 4),
      ]);
      for (const tagId of tagIds) {
        await ctx.db.insert("postTags", { postId, tagId });
      }
    }

    await ctx.db.patch(args.campaignId, {
      status: "completed",
      collectionId: resolvedCollectionId,
      collectionName: name,
      keywordResearch: plan.keywordResearch ?? [],
      createdPostIds: postIds,
      modifiedAt: now,
      completedAt: now,
    });

    return { collectionId: resolvedCollectionId, postIds };
  },
});

export const runCampaign = internalAction({
  args: { campaignId: v.id("aiContentCampaigns") },
  handler: async (ctx, args): Promise<void> => {
    const started = await ctx.runMutation(internal.aiContent.markProcessing, args);
    if (!started) return;

    const campaign = await ctx.runQuery(internal.aiContent.getCampaign, args);
    if (!campaign) return;

    try {
      const config = providerConfig(campaign.provider as AiTextProvider);
      const plan = await chatJson(config, campaign.prompt);
      await ctx.runMutation(internal.aiContent.publishPlan, {
        campaignId: args.campaignId,
        plan,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.aiContent.markFailed, {
        campaignId: args.campaignId,
        error: message || "AI content campaign failed.",
      });
    }
  },
});

export const runPendingCampaigns = action({
  args: {
    secret: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ scheduled: number }> => {
    const expected =
      envSecret("AI_CONTENT_CRON_SECRET") || envSecret("CRON_SECRET");
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized.");
    }

    const campaigns = (await ctx.runQuery(
      internal.aiContent.nextQueuedCampaigns,
      {
        limit: Math.max(1, Math.min(5, args.limit ?? 2)),
      }
    )) as Array<Doc<"aiContentCampaigns">>;

    for (const campaign of campaigns) {
      await ctx.scheduler.runAfter(0, internal.aiContent.runCampaign, {
        campaignId: campaign._id,
      });
    }

    return { scheduled: campaigns.length };
  },
});
