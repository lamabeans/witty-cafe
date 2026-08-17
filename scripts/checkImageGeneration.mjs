import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Live check for the AI image generation path.
//
// It replays the exact requests convex/mediaGeneration.ts sends, using the same
// env var names and defaults, so a pass here means the Convex action will work
// with the same keys. Providers without a key are skipped, not failed.
//
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/checkImageGeneration.mjs
//   node scripts/checkImageGeneration.mjs --provider openai --out /tmp/witty-image-check

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const PROMPT = [
  "Create a bold square social poster with strong typography, cafe energy, and a clean composition.",
  "",
  "Title: Witty Cafe image generation check",
  "Text: A short smoke test that confirms AI image generation still works.",
  "",
  "Do not depict real people or copyrighted characters. Make it suitable for all audiences.",
].join("\n");

const args = process.argv.slice(2);
const outDir = readFlag("--out");
const only = readFlag("--provider");

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function envSecret(name) {
  return process.env[name]?.trim() || undefined;
}

function envString(name, fallback) {
  return envSecret(name) || fallback;
}

async function providerError(response, provider) {
  let detail = "";
  try {
    const json = await response.json();
    detail =
      json.error?.message ?? json.message ?? json.error?.code ?? json.error?.type ?? "";
  } catch {
    detail = await response.text().catch(() => "");
  }
  return detail || `${provider} request failed with status ${response.status}.`;
}

async function generateOpenAiImage(apiKey, prompt, model) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    }),
  });

  if (!response.ok) throw new Error(await providerError(response, "OpenAI"));

  const result = await response.json();
  const item = Array.isArray(result.data) ? result.data[0] : null;
  if (item?.b64_json) {
    return { bytes: Buffer.from(item.b64_json, "base64"), contentType: "image/png" };
  }
  if (item?.url) {
    const download = await fetch(item.url);
    if (!download.ok) throw new Error("Could not download generated image.");
    return {
      bytes: Buffer.from(await download.arrayBuffer()),
      contentType: download.headers.get("content-type") ?? "image/png",
    };
  }
  throw new Error("OpenAI did not return an image.");
}

async function generateGeminiImage(apiKey, prompt, model) {
  const segment = model.replace(/^models\//, "");
  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${segment}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: envString("AI_GEMINI_IMAGE_SIZE", "1K"),
          },
        },
      }),
    }
  );

  if (!response.ok) throw new Error(await providerError(response, "Gemini"));

  const result = await response.json();
  for (const candidate of result.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inlineData = part.inlineData ?? part.inline_data;
      if (inlineData?.data) {
        return {
          bytes: Buffer.from(inlineData.data, "base64"),
          contentType: inlineData.mimeType ?? inlineData.mime_type ?? "image/png",
        };
      }
    }
  }
  throw new Error("Gemini did not return an image.");
}

async function enhancePromptWithKimi(apiKey, prompt) {
  const baseUrl = envString("MOONSHOT_BASE_URL", "https://api.moonshot.ai/v1");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: envString("AI_KIMI_MODEL", "kimi-k2.6"),
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "Rewrite Witty.Cafe post text into a concise, production-ready media generation prompt. Preserve the user's meaning. Return only the improved prompt.",
        },
        { role: "user", content: `Media type: image\n\nPrompt:\n${prompt}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(await providerError(response, "Kimi"));
  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (!text) throw new Error("Kimi did not return a refined prompt.");
  return text;
}

async function enhancePromptWithAnthropic(apiKey, prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: envString("AI_ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: `Rewrite this Witty.Cafe post into a concise, production-ready image generation prompt. Preserve the meaning, avoid copyrighted characters and real people, and return only the improved prompt.\n\n${prompt}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(await providerError(response, "Anthropic"));
  const result = await response.json();
  const text = result.content?.find((block) => block.type === "text" && block.text)?.text;
  if (!text) throw new Error("Anthropic did not return a refined prompt.");
  return text;
}

function sniffImage(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

const checks = [
  {
    name: "openai",
    label: "OpenAI image",
    key: () => envSecret("OPENAI_API_KEY"),
    missing: "OPENAI_API_KEY",
    run: async (apiKey) => {
      const model = envString("AI_IMAGE_MODEL", "gpt-image-1.5");
      return { model, ...(await generateOpenAiImage(apiKey, PROMPT, model)) };
    },
  },
  {
    name: "gemini",
    label: "Gemini image",
    key: () => envSecret("GEMINI_API_KEY") ?? envSecret("GOOGLE_GENERATIVE_AI_API_KEY"),
    missing: "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY",
    run: async (apiKey) => {
      const model = envString("AI_GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image");
      return { model, ...(await generateGeminiImage(apiKey, PROMPT, model)) };
    },
  },
  {
    name: "kimi",
    label: "Kimi prompt assist + OpenAI render",
    key: () => (envSecret("MOONSHOT_API_KEY") && envSecret("OPENAI_API_KEY") ? "ok" : undefined),
    missing: "MOONSHOT_API_KEY and OPENAI_API_KEY",
    run: async () => {
      const prompt = await enhancePromptWithKimi(envSecret("MOONSHOT_API_KEY"), PROMPT);
      const model = envString("AI_IMAGE_MODEL", "gpt-image-1.5");
      return {
        model: `${envString("AI_KIMI_MODEL", "kimi-k2.6")} -> ${model}`,
        ...(await generateOpenAiImage(envSecret("OPENAI_API_KEY"), prompt, model)),
      };
    },
  },
  {
    name: "anthropic",
    label: "Anthropic prompt assist + OpenAI render",
    key: () => (envSecret("ANTHROPIC_API_KEY") && envSecret("OPENAI_API_KEY") ? "ok" : undefined),
    missing: "ANTHROPIC_API_KEY and OPENAI_API_KEY",
    run: async () => {
      const prompt = await enhancePromptWithAnthropic(
        envSecret("ANTHROPIC_API_KEY"),
        PROMPT
      );
      const model = envString("AI_IMAGE_MODEL", "gpt-image-1.5");
      return {
        model: `${envString("AI_ANTHROPIC_MODEL", "claude-sonnet-4-20250514")} -> ${model}`,
        ...(await generateOpenAiImage(envSecret("OPENAI_API_KEY"), prompt, model)),
      };
    },
  },
];

if (outDir) mkdirSync(outDir, { recursive: true });

let failed = 0;
let ran = 0;

for (const check of checks) {
  if (only && only !== check.name) continue;
  if (!check.key()) {
    console.log(`- ${check.label}: skipped (set ${check.missing})`);
    continue;
  }

  ran += 1;
  const startedAt = Date.now();
  try {
    const { bytes, contentType, model } = await check.run(check.key());
    const format = sniffImage(bytes);
    if (!format) {
      throw new Error(
        `Response was not a recognisable image (${bytes.length} bytes, ${contentType}).`
      );
    }
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `- ${check.label}: OK (${model}, ${format}, ${bytes.length} bytes, ${seconds}s)`
    );
    if (outDir) {
      const file = path.join(outDir, `${check.name}.${format}`);
      writeFileSync(file, bytes);
      console.log(`    wrote ${file}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`- ${check.label}: FAILED - ${error.message}`);
  }
}

if (ran === 0) {
  console.log("\nNo providers were checked. Set at least one provider API key.");
  process.exit(1);
}

console.log(`\n${ran - failed}/${ran} image provider checks passed.`);
process.exit(failed ? 1 : 0);
