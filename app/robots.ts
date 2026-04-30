import type { MetadataRoute } from "next";
import { absoluteUrl } from "./lib/site";

export default function robots(): MetadataRoute.Robots {
  const allowTraining = process.env.AI_TRAINING_CRAWL_POLICY === "allow";
  const rules: MetadataRoute.Robots["rules"] = [
    { userAgent: "*", allow: "/" },
    { userAgent: "Googlebot", allow: "/" },
    { userAgent: "Bingbot", allow: "/" },
    { userAgent: "OAI-SearchBot", allow: "/" },
    { userAgent: "ChatGPT-User", allow: "/" },
    { userAgent: "PerplexityBot", allow: "/" },
    { userAgent: "Perplexity-User", allow: "/" },
    { userAgent: "Claude-SearchBot", allow: "/" },
    { userAgent: "Claude-User", allow: "/" },
  ];

  if (allowTraining) {
    rules.push({ userAgent: "GPTBot", allow: "/" });
    rules.push({ userAgent: "ClaudeBot", allow: "/" });
  } else {
    rules.push({ userAgent: "GPTBot", disallow: "/" });
    rules.push({ userAgent: "ClaudeBot", disallow: "/" });
  }

  return {
    rules,
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
