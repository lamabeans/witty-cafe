import { RAG } from "@convex-dev/rag";
import { google } from "@ai-sdk/google";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { components } from "./_generated/api";

const rag = new RAG(components.rag, {
  textEmbeddingModel: google.embedding("gemini-embedding-2-preview"),
  embeddingDimension: 3072,
});

const DEFAULT_NAMESPACE = "default";

export const add = action({
  args: {
    id: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await rag.add(ctx, {
      key: args.id,
      namespace: DEFAULT_NAMESPACE,
      text: args.text,
    });
    return { ok: true };
  },
});

export const search = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await rag.search(ctx, {
      query: args.query,
      namespace: DEFAULT_NAMESPACE,
      limit: args.limit ?? 5,
    });
    return results;
  },
});

export const seed = action({
  args: {},
  handler: async (ctx) => {
    const docs = [
      {
        id: "welcome",
        text: "Welcome to Witty Cafe. We serve espresso, matcha, and seasonal pastries.",
      },
      {
        id: "menu",
        text: "Menu: espresso, latte, cortado, matcha, chai, and house-made pastries.",
      },
      {
        id: "hours",
        text: "Hours: Monday to Friday 7am to 5pm, Saturday 8am to 3pm.",
      },
    ];

    for (const doc of docs) {
      await rag.add(ctx, {
        key: doc.id,
        namespace: DEFAULT_NAMESPACE,
        text: doc.text,
      });
    }

    return { ok: true, count: docs.length };
  },
});

export const demoSearch = action({
  args: {},
  handler: async (ctx) => {
    const results = await rag.search(ctx, {
      query: "What are your hours?",
      namespace: DEFAULT_NAMESPACE,
      limit: 3,
    });
    return results;
  },
});
