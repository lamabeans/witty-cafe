import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { getOrCreateUser } from "./lib/getOrCreateUser";
import { excerptFromText, titleFromContent } from "./lib/richText";

const DEFAULT_PROVIDER = "openai";
const DEFAULT_DAILY_LIMIT = 5;
const VIDEO_POLL_DELAY_MS = 15000;
const VIDEO_MAX_ATTEMPTS = 80;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("audio"),
  v.literal("video"),
  v.literal("model3d"),
  v.literal("game")
);

const providerValidator = v.union(
  v.literal("openai"),
  v.literal("gemini"),
  v.literal("elevenlabs"),
  v.literal("kimi"),
  v.literal("anthropic")
);

const IMAGE_PRESETS: Record<string, string> = {
  poster:
    "Create a bold square social poster with strong typography, cafe energy, and a clean composition.",
  playful:
    "Create a playful, colourful square image that feels witty, friendly, and highly shareable.",
  minimal:
    "Create a minimal square image with elegant spacing, crisp type, and a restrained modern look.",
};

const AUDIO_PRESETS: Record<string, string> = {
  warm:
    "Speak warmly and naturally, like a friendly cafe host. Make it clearly AI-generated narration.",
  bright:
    "Speak with bright, upbeat energy and clear pacing. Make it clearly AI-generated narration.",
  dramatic:
    "Speak with a lightly dramatic, expressive delivery without overacting. Make it clearly AI-generated narration.",
};

const VIDEO_PRESETS: Record<string, string> = {
  "animated-text":
    "Create an 8-second animated typography clip where the key words appear with charming motion.",
  cafe:
    "Create an 8-second cafe-inspired visual clip with warm creative energy and readable text moments.",
  cinematic:
    "Create an 8-second cinematic social video with tasteful motion, strong lighting, and no real people.",
};

type CollectionLike = Pick<Doc<"collections">, "name" | "slug">;

type LegacyCollectionDb = {
  get: (id: string) => Promise<CollectionLike | null>;
};

function legacyCollectionDb(db: unknown) {
  return db as LegacyCollectionDb;
}

const MODEL3D_PRESETS: Record<string, string> = {
  prop:
    "Create a low-poly Wavefront OBJ model for a single charming prop inspired by the post.",
  character:
    "Create a simple low-poly Wavefront OBJ character or mascot inspired by the post.",
  scene:
    "Create a compact low-poly Wavefront OBJ scene inspired by the post.",
};

const GAME_PRESETS: Record<string, string> = {
  arcade:
    "Create a tiny playable browser arcade game inspired by the post.",
  puzzle:
    "Create a tiny playable browser puzzle game inspired by the post.",
  story:
    "Create a tiny playable browser story game inspired by the post.",
};

type GenerationMediaType = "image" | "audio" | "video" | "model3d" | "game";
type GenerationProvider =
  | "openai"
  | "gemini"
  | "elevenlabs"
  | "kimi"
  | "anthropic";
type OutputProvider = "openai" | "gemini" | "elevenlabs";

type StartedGeneration = {
  generationId: Id<"mediaGenerations">;
  mediaType: GenerationMediaType;
  provider: GenerationProvider;
  preset: string;
  prompt: string;
  model: string;
  renderModel: string;
  audioInstructions: string;
};

type GenerationRequestResult =
  | {
      generationId: Id<"mediaGenerations">;
      status: "processing";
    }
  | {
      generationId: Id<"mediaGenerations">;
      status: "completed";
      mediaItemId: Id<"mediaItems">;
    };

type ViewerGenerationStatus = {
  canGenerate: boolean;
  reason: string | null;
  quotaLimit: number;
  quotaUsed: number;
  quotaRemaining: number;
  providers: Record<
    GenerationProvider,
    {
      configured: boolean;
      missing: string[];
    }
  >;
  jobs: Array<{
    _id: Id<"mediaGenerations">;
    mediaType: GenerationMediaType;
    provider: string;
    preset: string;
    model: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress: number | null;
    error: string | null;
    mediaItemId: Id<"mediaItems"> | null;
    createdAt: number;
    completedAt: number | null;
  }>;
};

function envSecret(name: string) {
  return process.env[name]?.trim() || undefined;
}

function envString(name: string, fallback: string) {
  const value = envSecret(name);
  return value || fallback;
}

function dailyLimitFor(user: Doc<"users">) {
  const userLimit = user.aiGenerationDailyLimit;
  if (typeof userLimit === "number" && userLimit >= 0) return userLimit;
  const envLimit = Number(process.env.AI_GENERATION_DAILY_LIMIT);
  return Number.isFinite(envLimit) && envLimit >= 0
    ? envLimit
    : DEFAULT_DAILY_LIMIT;
}

function openAiModelFor(mediaType: GenerationMediaType) {
  if (mediaType === "image") {
    return envString("AI_IMAGE_MODEL", "gpt-image-1.5");
  }
  if (mediaType === "audio") {
    return envString("AI_AUDIO_MODEL", "gpt-4o-mini-tts");
  }
  if (mediaType === "model3d" || mediaType === "game") {
    return envString("AI_ARTIFACT_MODEL", "gpt-4.1-mini");
  }
  return envString("AI_VIDEO_MODEL", "sora-2");
}

function geminiModelFor(mediaType: GenerationMediaType) {
  if (mediaType === "image") {
    return envString("AI_GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image-preview");
  }
  if (mediaType === "audio") {
    return envString("AI_GEMINI_AUDIO_MODEL", "gemini-3.1-flash-tts-preview");
  }
  if (mediaType === "model3d" || mediaType === "game") {
    return envString("AI_GEMINI_ARTIFACT_MODEL", "gemini-3.1-flash");
  }
  return envString("AI_GEMINI_VIDEO_MODEL", "veo-3.1-generate-preview");
}

function elevenLabsModelFor() {
  return envString("AI_ELEVENLABS_MODEL", "eleven_multilingual_v2");
}

function promptAssistModelFor(provider: GenerationProvider) {
  if (provider === "kimi") return envString("AI_KIMI_MODEL", "kimi-k2.6");
  if (provider === "anthropic") {
    return envString("AI_ANTHROPIC_MODEL", "claude-sonnet-4-20250514");
  }
  return "";
}

function outputProviderFor(provider: GenerationProvider): OutputProvider {
  if (provider === "gemini") return "gemini";
  if (provider === "elevenlabs") return "elevenlabs";
  return "openai";
}

function renderModelFor(
  mediaType: GenerationMediaType,
  provider: GenerationProvider
) {
  const outputProvider = outputProviderFor(provider);
  if (outputProvider === "gemini") return geminiModelFor(mediaType);
  if (outputProvider === "elevenlabs") return elevenLabsModelFor();
  return openAiModelFor(mediaType);
}

function modelFor(mediaType: GenerationMediaType, provider: GenerationProvider) {
  const renderModel = renderModelFor(mediaType, provider);
  if (provider === "kimi" || provider === "anthropic") {
    return `${promptAssistModelFor(provider)} -> ${renderModel}`;
  }
  return renderModel;
}

function providerLabel(provider: GenerationProvider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  if (provider === "elevenlabs") return "ElevenLabs";
  if (provider === "kimi") return "Kimi + OpenAI";
  return "Anthropic + OpenAI";
}

function assertProviderSupports(
  provider: GenerationProvider,
  mediaType: GenerationMediaType
) {
  if (provider === "elevenlabs" && mediaType !== "audio") {
    throw new Error("ElevenLabs can only generate spoken audio in this version.");
  }
  if (mediaType === "model3d" || mediaType === "game") {
    if (provider === "elevenlabs") {
      throw new Error("ElevenLabs cannot generate 3D models or video games.");
    }
  }
}

function missingProviderEnv(
  provider: GenerationProvider,
  mediaType: GenerationMediaType
) {
  assertProviderSupports(provider, mediaType);
  const groups =
    provider === "openai"
      ? [["OPENAI_API_KEY"]]
      : provider === "gemini"
        ? [["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]]
        : provider === "elevenlabs"
          ? [["ELEVENLABS_API_KEY"]]
          : provider === "kimi"
            ? [["MOONSHOT_API_KEY"], ["OPENAI_API_KEY"]]
            : [["ANTHROPIC_API_KEY"], ["OPENAI_API_KEY"]];

  return groups
    .filter((names) => names.every((name) => !envSecret(name)))
    .map((names) => names.join(" or "));
}

function providerReadiness() {
  const providers: GenerationProvider[] = [
    "openai",
    "gemini",
    "elevenlabs",
    "kimi",
    "anthropic",
  ];

  return Object.fromEntries(
    providers.map((provider) => {
      const missing = missingProviderEnv(
        provider,
        provider === "elevenlabs" ? "audio" : "image"
      );
      return [provider, { configured: missing.length === 0, missing }];
    })
  ) as ViewerGenerationStatus["providers"];
}

function adminEmails() {
  return new Set(
    (process.env.AI_GENERATION_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function truncate(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}...`;
}

function presetInstruction(mediaType: GenerationMediaType, preset: string) {
  if (mediaType === "image") return IMAGE_PRESETS[preset] ?? IMAGE_PRESETS.poster;
  if (mediaType === "audio") return AUDIO_PRESETS[preset] ?? AUDIO_PRESETS.warm;
  if (mediaType === "model3d") return MODEL3D_PRESETS[preset] ?? MODEL3D_PRESETS.prop;
  if (mediaType === "game") return GAME_PRESETS[preset] ?? GAME_PRESETS.arcade;
  return VIDEO_PRESETS[preset] ?? VIDEO_PRESETS["animated-text"];
}

function contentTypeFor(
  mediaType: GenerationMediaType,
  provider: GenerationProvider = DEFAULT_PROVIDER
) {
  if (mediaType === "image") return "image/png";
  if (mediaType === "audio" && outputProviderFor(provider) === "gemini") {
    return "audio/wav";
  }
  if (mediaType === "audio") return "audio/mpeg";
  if (mediaType === "model3d") return "text/plain";
  if (mediaType === "game") return "text/html";
  return "video/mp4";
}

function extensionFor(mediaType: GenerationMediaType, contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("html")) return "html";
  if (mediaType === "image") return "png";
  if (mediaType === "audio") return "mp3";
  if (mediaType === "model3d") return "obj";
  if (mediaType === "game") return "html";
  return "mp4";
}

function labelFor(mediaType: GenerationMediaType) {
  if (mediaType === "image") return "AI image";
  if (mediaType === "audio") return "AI-generated spoken audio";
  if (mediaType === "model3d") return "AI-generated 3D model";
  if (mediaType === "game") return "AI-generated video game";
  return "AI video";
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64ToBlob(value: string, contentType: string) {
  const bytes = base64ToBytes(value);
  return new Blob([bytes], { type: contentType });
}

function pcmBase64ToWavBlob(value: string) {
  const pcm = base64ToBytes(value);
  const channels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);

  function writeString(offset: number, text: string) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: "audio/wav" });
}

async function openAiJson(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await openAiError(response));
  }

  return (await response.json()) as Record<string, unknown>;
}

async function openAiError(response: Response) {
  return providerError(response, "OpenAI");
}

async function providerError(response: Response, provider: string) {
  let detail = "";
  try {
    const json = (await response.json()) as {
      error?: { message?: string; code?: string; type?: string };
      message?: string;
    };
    detail =
      json.error?.message ?? json.message ?? json.error?.code ?? json.error?.type ?? "";
  } catch {
    detail = await response.text().catch(() => "");
  }
  return detail || `${provider} request failed with status ${response.status}.`;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/content|policy|moderation|safety|blocked|rejected/i.test(message)) {
    return "The selected AI provider could not generate this media because the prompt was blocked by safety rules.";
  }
  return message || "AI media generation failed.";
}

async function generateOpenAiImage(apiKey: string, prompt: string, model: string) {
  const result = await openAiJson("/images/generations", apiKey, {
    model,
    prompt,
    size: "1024x1024",
    quality: "low",
    n: 1,
  });
  const first = Array.isArray(result.data) ? result.data[0] : null;
  const item = first as { b64_json?: string; url?: string } | null;

  if (item?.b64_json) {
    return base64ToBlob(item.b64_json, "image/png");
  }
  if (item?.url) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error("Could not download generated image.");
    return await response.blob();
  }
  throw new Error("OpenAI did not return an image.");
}

async function generateOpenAiAudio(
  apiKey: string,
  input: string,
  instructions: string,
  model: string
) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: envString("AI_AUDIO_VOICE", "marin"),
      input,
      instructions,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(await openAiError(response));
  }

  return await response.blob();
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

function artifactSystemPrompt(mediaType: GenerationMediaType) {
  if (mediaType === "model3d") {
    return [
      "You generate valid Wavefront OBJ text for simple low-poly 3D models.",
      "Return only OBJ file contents.",
      "Include object/group names, vertices, normals if useful, and faces.",
      "Keep it compact, original, and suitable for all audiences.",
    ].join(" ");
  }

  return [
    "You generate complete, playable single-file browser games.",
    "Return only one HTML document with inline CSS and JavaScript.",
    "The game must be keyboard and pointer playable, self-contained, and suitable for all audiences.",
    "Do not include markdown fences or explanatory text.",
  ].join(" ");
}

function artifactBlob(mediaType: GenerationMediaType, text: string) {
  const content = stripCodeFence(text);
  const body =
    mediaType === "game" && !/<!doctype html|<html/i.test(content)
      ? `<!doctype html><html><head><meta charset="utf-8"><title>Witty.Cafe Game</title></head><body>${content}</body></html>`
      : content;
  return new Blob([body], { type: contentTypeFor(mediaType) });
}

async function generateOpenAiArtifact(
  apiKey: string,
  mediaType: GenerationMediaType,
  prompt: string,
  model: string
) {
  const result = await openAiJson("/chat/completions", apiKey, {
    model,
    temperature: mediaType === "game" ? 0.8 : 0.4,
    messages: [
      {
        role: "system",
        content: artifactSystemPrompt(mediaType),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const first = choices[0] as { message?: { content?: string } } | undefined;
  const content = first?.message?.content;
  if (!content) {
    throw new Error("OpenAI did not return a generated artifact.");
  }
  return artifactBlob(mediaType, content);
}

async function createOpenAiVideo(apiKey: string, prompt: string, model: string) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", envString("AI_VIDEO_SIZE", "1280x720"));
  form.set("seconds", envString("AI_VIDEO_SECONDS", "8"));

  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(await openAiError(response));
  }

  return (await response.json()) as {
    id: string;
    status?: string;
    progress?: number;
  };
}

async function retrieveOpenAiVideo(apiKey: string, videoId: string) {
  const response = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(await openAiError(response));
  }
  return (await response.json()) as {
    id: string;
    status?: string;
    progress?: number;
    error?: { message?: string };
  };
}

async function downloadOpenAiVideo(apiKey: string, videoId: string) {
  const response = await fetch(
    `https://api.openai.com/v1/videos/${videoId}/content`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  if (!response.ok) {
    throw new Error(await openAiError(response));
  }
  return await response.blob();
}

function geminiModelSegment(model: string) {
  return model.replace(/^models\//, "");
}

async function geminiJson(
  apiKey: string,
  path: string,
  body?: Record<string, unknown>
) {
  const response = await fetch(`${GEMINI_BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "x-goog-api-key": apiKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await providerError(response, "Gemini"));
  }

  return (await response.json()) as Record<string, unknown>;
}

function inlineDataFromGemini(result: Record<string, unknown>) {
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  for (const candidate of candidates) {
    const content = (candidate as { content?: { parts?: unknown[] } }).content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      const inlineData = (
        (part as { inlineData?: unknown }).inlineData ??
        (part as { inline_data?: unknown }).inline_data
      ) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
      const data = inlineData?.data;
      if (data) {
        return {
          data,
          mimeType: inlineData.mimeType ?? inlineData.mime_type,
        };
      }
    }
  }
  return null;
}

async function generateGeminiImage(
  apiKey: string,
  prompt: string,
  model: string
) {
  const result = await geminiJson(
    apiKey,
    `/models/${geminiModelSegment(model)}:generateContent`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["Image"],
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: envString("AI_GEMINI_IMAGE_SIZE", "1K"),
        },
      },
    }
  );
  const inlineData = inlineDataFromGemini(result);
  if (!inlineData?.data) {
    throw new Error("Gemini did not return an image.");
  }
  return base64ToBlob(inlineData.data, inlineData.mimeType ?? "image/png");
}

async function generateGeminiAudio(
  apiKey: string,
  input: string,
  instructions: string,
  model: string
) {
  const result = await geminiJson(
    apiKey,
    `/models/${geminiModelSegment(model)}:generateContent`,
    {
      contents: [
        {
          parts: [
            {
              text: `${instructions}\n\nRead this as spoken audio:\n${input}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: envString("AI_GEMINI_VOICE", "Kore"),
            },
          },
        },
      },
    }
  );
  const inlineData = inlineDataFromGemini(result);
  if (!inlineData?.data) {
    throw new Error("Gemini did not return audio.");
  }
  if (inlineData.mimeType?.includes("wav")) {
    return base64ToBlob(inlineData.data, "audio/wav");
  }
  return pcmBase64ToWavBlob(inlineData.data);
}

function textFromGemini(result: Record<string, unknown>) {
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  for (const candidate of candidates) {
    const content = (candidate as { content?: { parts?: unknown[] } }).content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const text = parts
      .map((part) => (part as { text?: string }).text)
      .filter((part): part is string => Boolean(part))
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

async function generateGeminiArtifact(
  apiKey: string,
  mediaType: GenerationMediaType,
  prompt: string,
  model: string
) {
  const result = await geminiJson(
    apiKey,
    `/models/${geminiModelSegment(model)}:generateContent`,
    {
      contents: [
        {
          parts: [
            {
              text: `${artifactSystemPrompt(mediaType)}\n\n${prompt}`,
            },
          ],
        },
      ],
    }
  );
  const text = textFromGemini(result);
  if (!text) {
    throw new Error("Gemini did not return a generated artifact.");
  }
  return artifactBlob(mediaType, text);
}

async function createGeminiVideo(apiKey: string, prompt: string, model: string) {
  const result = await geminiJson(
    apiKey,
    `/models/${geminiModelSegment(model)}:predictLongRunning`,
    {
      instances: [{ prompt }],
      parameters: {
        aspectRatio: envString("AI_GEMINI_VIDEO_ASPECT_RATIO", "16:9"),
        resolution: envString("AI_GEMINI_VIDEO_RESOLUTION", "720p"),
      },
    }
  );
  const operationName = typeof result.name === "string" ? result.name : "";
  if (!operationName) {
    throw new Error("Gemini did not return a video operation ID.");
  }
  return { id: operationName, progress: 0 };
}

async function retrieveGeminiVideo(apiKey: string, operationName: string) {
  const path = operationName.startsWith("/")
    ? operationName
    : `/${operationName}`;
  const result = await geminiJson(apiKey, path);
  const metadata = result.metadata as { progressPercentage?: number } | undefined;
  const response = result.response as
    | {
        generateVideoResponse?: {
          generatedSamples?: Array<{ video?: { uri?: string } }>;
        };
      }
    | undefined;
  const error = result.error as { message?: string } | undefined;
  const uri =
    response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? null;

  return {
    done: result.done === true,
    progress: metadata?.progressPercentage,
    uri,
    error,
  };
}

async function downloadGeminiVideo(apiKey: string, uri: string) {
  const response = await fetch(uri, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(await providerError(response, "Gemini"));
  }
  return await response.blob();
}

async function generateElevenLabsAudio(
  apiKey: string,
  input: string,
  instructions: string,
  model: string
) {
  const voiceId = envString("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: `${instructions}\n\n${input}`,
        model_id: model,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await providerError(response, "ElevenLabs"));
  }

  return await response.blob();
}

async function enhancePromptWithKimi(
  apiKey: string,
  mediaType: GenerationMediaType,
  prompt: string
) {
  const baseUrl = envString("MOONSHOT_BASE_URL", "https://api.moonshot.ai/v1");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: promptAssistModelFor("kimi"),
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "Rewrite Witty.Cafe post text into a concise, production-ready media generation prompt. Preserve the user's meaning. Return only the improved prompt.",
        },
        {
          role: "user",
          content: `Media type: ${mediaType}\n\nPrompt:\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await providerError(response, "Kimi"));
  }
  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return truncate(result.choices?.[0]?.message?.content ?? prompt, 4000);
}

async function enhancePromptWithAnthropic(
  apiKey: string,
  mediaType: GenerationMediaType,
  prompt: string
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: promptAssistModelFor("anthropic"),
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: `Rewrite this Witty.Cafe post into a concise, production-ready ${mediaType} generation prompt. Preserve the meaning, avoid copyrighted characters and real people, and return only the improved prompt.\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await providerError(response, "Anthropic"));
  }
  const result = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text =
    result.content?.find((part) => part.type === "text" && part.text)?.text ??
    prompt;
  return truncate(text, 4000);
}

async function maybeEnhancePrompt(generation: StartedGeneration) {
  if (generation.provider === "kimi") {
    const apiKey = envSecret("MOONSHOT_API_KEY");
    if (!apiKey) throw new Error("MOONSHOT_API_KEY is not configured in Convex.");
    return enhancePromptWithKimi(apiKey, generation.mediaType, generation.prompt);
  }
  if (generation.provider === "anthropic") {
    const apiKey = envSecret("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured in Convex.");
    }
    return enhancePromptWithAnthropic(apiKey, generation.mediaType, generation.prompt);
  }
  return generation.prompt;
}

function apiKeyForOutputProvider(provider: OutputProvider) {
  if (provider === "gemini") {
    return envSecret("GEMINI_API_KEY") ?? envSecret("GOOGLE_GENERATIVE_AI_API_KEY");
  }
  if (provider === "elevenlabs") return envSecret("ELEVENLABS_API_KEY");
  return envSecret("OPENAI_API_KEY");
}

async function generateImageWithProvider(
  provider: OutputProvider,
  apiKey: string,
  prompt: string,
  model: string
) {
  if (provider === "gemini") return generateGeminiImage(apiKey, prompt, model);
  return generateOpenAiImage(apiKey, prompt, model);
}

async function generateAudioWithProvider(
  provider: OutputProvider,
  apiKey: string,
  input: string,
  instructions: string,
  model: string
) {
  if (provider === "gemini") {
    return generateGeminiAudio(apiKey, input, instructions, model);
  }
  if (provider === "elevenlabs") {
    return generateElevenLabsAudio(apiKey, input, instructions, model);
  }
  return generateOpenAiAudio(apiKey, input, instructions, model);
}

async function createVideoWithProvider(
  provider: OutputProvider,
  apiKey: string,
  prompt: string,
  model: string
) {
  if (provider === "gemini") return createGeminiVideo(apiKey, prompt, model);
  return createOpenAiVideo(apiKey, prompt, model);
}

async function generateArtifactWithProvider(
  provider: OutputProvider,
  apiKey: string,
  mediaType: GenerationMediaType,
  prompt: string,
  model: string
) {
  if (provider === "gemini") {
    return generateGeminiArtifact(apiKey, mediaType, prompt, model);
  }
  return generateOpenAiArtifact(apiKey, mediaType, prompt, model);
}

export const viewerStatus = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<ViewerGenerationStatus> => {
    const identity = await ctx.auth.getUserIdentity();
    const post = await ctx.db.get(args.postId);
    const now = Date.now();
    const today = dayKey(now);
    const providers = providerReadiness();

    if (!post) {
      return {
        canGenerate: false,
        reason: "Post not found.",
        quotaLimit: DEFAULT_DAILY_LIMIT,
        quotaUsed: 0,
        quotaRemaining: 0,
        providers,
        jobs: [],
      };
    }

    if (!identity) {
      return {
        canGenerate: false,
        reason: "Sign in to generate AI media.",
        quotaLimit: DEFAULT_DAILY_LIMIT,
        quotaUsed: 0,
        quotaRemaining: 0,
        providers,
        jobs: [],
      };
    }

    const email = identity.email?.toLowerCase();
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    const user =
      byClerkId ??
      (email
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .unique()
        : null);
    const isAdmin = Boolean(email && adminEmails().has(email));
    const isAuthor = Boolean(user && post.authorId === user._id);
    const quotaLimit = user ? dailyLimitFor(user) : DEFAULT_DAILY_LIMIT;
    const todaysJobs = user
      ? await ctx.db
          .query("mediaGenerations")
          .withIndex("by_requester_day", (q) =>
            q.eq("requesterId", user._id).eq("dayKey", today)
          )
          .collect()
      : [];
    const quotaUsed = todaysJobs.filter((job) => job.counted).length;
    const jobs = user
      ? await ctx.db
          .query("mediaGenerations")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .order("desc")
          .take(12)
      : [];

    const canGenerate = Boolean((isAuthor || isAdmin) && quotaUsed < quotaLimit);
    const reason =
      isAuthor || isAdmin
        ? quotaUsed >= quotaLimit
          ? "Daily free beta quota used."
          : null
        : "Only the post author or an admin can generate media for this post.";

    return {
      canGenerate,
      reason,
      quotaLimit,
      quotaUsed,
      quotaRemaining: Math.max(0, quotaLimit - quotaUsed),
      providers,
      jobs: jobs.map((job) => ({
        _id: job._id,
        mediaType: job.mediaType,
        provider: job.provider,
        preset: job.preset,
        model: job.model,
        status: job.status,
        progress: job.progress ?? null,
        error: job.error ?? null,
        mediaItemId: job.mediaItemId ?? null,
        createdAt: job.createdAt,
        completedAt: job.completedAt ?? null,
      })),
    };
  },
});

export const startGeneration = internalMutation({
  args: {
    postId: v.id("posts"),
    mediaType: mediaTypeValidator,
    preset: v.string(),
    provider: v.optional(providerValidator),
  },
  handler: async (ctx, args) => {
    const provider: GenerationProvider = args.provider ?? DEFAULT_PROVIDER;
    assertProviderSupports(provider, args.mediaType);

    const user = await getOrCreateUser(ctx);
    if (!user) {
      throw new Error("Sign in to generate AI media.");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found.");
    }

    const email = user.email?.toLowerCase();
    const isAdmin = Boolean(email && adminEmails().has(email));
    const isAuthor = post.authorId === user._id;
    if (!isAuthor && !isAdmin) {
      throw new Error("Only the post author or an admin can generate media for this post.");
    }

    const now = Date.now();
    const today = dayKey(now);
    const quotaLimit = dailyLimitFor(user);
    const todaysJobs = await ctx.db
      .query("mediaGenerations")
      .withIndex("by_requester_day", (q) =>
        q.eq("requesterId", user._id).eq("dayKey", today)
      )
      .collect();
    const quotaUsed = todaysJobs.filter((job) => job.counted).length;
    if (quotaUsed >= quotaLimit) {
      throw new Error("Daily free beta quota used. Try again tomorrow.");
    }

    const rawPost = post as Doc<"posts"> & { subredditId?: string };
    const collection = post.collectionId
      ? await ctx.db.get(post.collectionId)
      : rawPost.subredditId
        ? await legacyCollectionDb(ctx.db).get(rawPost.subredditId)
        : null;
    const tagLinks = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .collect();
    const tags = (
      await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId)))
    ).filter((tag): tag is Doc<"tags"> => tag !== null);
    const title = titleFromContent(post.title, post.body ?? post.legacyBody);
    const body = truncate(
      post.plainTextExcerpt ??
        excerptFromText(post.body ?? post.legacyBody ?? title),
      args.mediaType === "audio" ? 3500 : 1200
    );
    const metadata = [
      collection?.name ? `Collection: ${collection.name}` : null,
      tags.length ? `Vibes: ${tags.map((tag) => tag.name).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const instruction = presetInstruction(args.mediaType, args.preset);
    const prompt =
      args.mediaType === "audio"
        ? truncate(`${title}\n\n${body}`, 4000)
        : args.mediaType === "model3d"
          ? truncate(
              `${instruction}\n\nTitle: ${title}\nText: ${body}\n${metadata}\n\nGenerate a valid Wavefront OBJ file only. Keep the mesh simple enough for browser preview tools, use original geometry, and do not include real people or copyrighted characters.`,
              3000
            )
          : args.mediaType === "game"
            ? truncate(
                `${instruction}\n\nTitle: ${title}\nText: ${body}\n${metadata}\n\nGenerate a complete single-file HTML game only. It must be playable with keyboard and pointer controls, include clear win/score feedback, use no external assets, and avoid real people or copyrighted characters.`,
                3000
              )
            : truncate(
                `${instruction}\n\nTitle: ${title}\nText: ${body}\n${metadata}\n\nDo not depict real people or copyrighted characters. Make it suitable for all audiences.`,
                2200
              );
    const model = modelFor(args.mediaType, provider);
    const renderModel = renderModelFor(args.mediaType, provider);

    const generationId = await ctx.db.insert("mediaGenerations", {
      postId: args.postId,
      requesterId: user._id,
      mediaType: args.mediaType,
      preset: args.preset,
      provider,
      model,
      status: "queued",
      prompt,
      dayKey: today,
      counted: true,
      progress: 0,
      attempts: 0,
      createdAt: now,
      modifiedAt: now,
    });

    return {
      generationId,
      mediaType: args.mediaType,
      provider,
      preset: args.preset,
      prompt,
      model,
      renderModel,
      audioInstructions: `${instruction} ${metadata}`,
    };
  },
});

export const markProcessing = internalMutation({
  args: {
    generationId: v.id("mediaGenerations"),
    openAiJobId: v.optional(v.string()),
    progress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.generationId, {
      status: "processing",
      openAiJobId: args.openAiJobId,
      progress: args.progress ?? 0,
      modifiedAt: Date.now(),
    });
  },
});

export const updatePrompt = internalMutation({
  args: {
    generationId: v.id("mediaGenerations"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.generationId, {
      prompt: args.prompt,
      modifiedAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: {
    generationId: v.id("mediaGenerations"),
    error: v.string(),
    counted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.generationId, {
      status: "failed",
      error: args.error,
      counted: args.counted ?? true,
      modifiedAt: Date.now(),
    });
  },
});

export const completeGeneration = internalMutation({
  args: {
    generationId: v.id("mediaGenerations"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const generation = await ctx.db.get(args.generationId);
    if (!generation) {
      throw new Error("Generation not found.");
    }
    if (generation.mediaItemId) {
      return { mediaItemId: generation.mediaItemId };
    }

    const existing = await ctx.db
      .query("mediaItems")
      .withIndex("by_legacyGalleryId", (q) =>
        q.eq("legacyGalleryId", `ai:${args.generationId}`)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(args.generationId, {
        status: "completed",
        storageId: args.storageId,
        mediaItemId: existing._id,
        progress: 100,
        completedAt: Date.now(),
        modifiedAt: Date.now(),
      });
      return { mediaItemId: existing._id };
    }

    const existingMedia = await ctx.db
      .query("mediaItems")
      .withIndex("by_post", (q) => q.eq("postId", generation.postId))
      .collect();
    const mediaItemId = await ctx.db.insert("mediaItems", {
      postId: generation.postId,
      legacyGalleryId: `ai:${args.generationId}`,
      source: "ai-generated",
      mediaType: generation.mediaType,
      storageId: args.storageId,
      order: existingMedia.length,
      filename: args.filename,
      altText: `${labelFor(generation.mediaType)} for ${generation.preset}`,
      status: "ready",
      aiGenerationId: args.generationId,
      aiProvider: generation.provider,
      aiModel: generation.model,
      aiPreset: generation.preset,
      aiPrompt: generation.prompt,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.generationId, {
      status: "completed",
      storageId: args.storageId,
      mediaItemId,
      filename: args.filename,
      contentType: args.contentType,
      progress: 100,
      completedAt: Date.now(),
      modifiedAt: Date.now(),
    });

    return { mediaItemId };
  },
});

export const getGenerationForPoll = internalMutation({
  args: { generationId: v.id("mediaGenerations") },
  handler: async (ctx, args) => {
    const generation = await ctx.db.get(args.generationId);
    if (!generation) return null;
    await ctx.db.patch(args.generationId, {
      attempts: (generation.attempts ?? 0) + 1,
      modifiedAt: Date.now(),
    });
    return generation;
  },
});

export const request = action({
  args: {
    postId: v.id("posts"),
    mediaType: mediaTypeValidator,
    preset: v.string(),
    provider: v.optional(providerValidator),
  },
  handler: async (ctx, args): Promise<GenerationRequestResult> => {
    const provider: GenerationProvider = args.provider ?? DEFAULT_PROVIDER;
    const missing = missingProviderEnv(provider, args.mediaType);
    if (missing.length) {
      throw new Error(
        `Set Convex env ${missing.length === 1 ? "var" : "vars"} ${missing.join(
          ", "
        )} to use ${providerLabel(provider)}.`
      );
    }

    const generation = (await ctx.runMutation(
      internal.mediaGeneration.startGeneration,
      { ...args, provider }
    )) as StartedGeneration;

    try {
      await ctx.runMutation(internal.mediaGeneration.markProcessing, {
        generationId: generation.generationId,
      });

      const prompt = await maybeEnhancePrompt(generation);
      if (prompt !== generation.prompt) {
        await ctx.runMutation(internal.mediaGeneration.updatePrompt, {
          generationId: generation.generationId,
          prompt,
        });
      }

      const outputProvider = outputProviderFor(generation.provider);
      const apiKey = apiKeyForOutputProvider(outputProvider);
      if (!apiKey) {
        throw new Error(`${providerLabel(generation.provider)} is not configured in Convex.`);
      }

      if (generation.mediaType === "video") {
        const video = await createVideoWithProvider(
          outputProvider,
          apiKey,
          prompt,
          generation.renderModel
        );
        await ctx.runMutation(internal.mediaGeneration.markProcessing, {
          generationId: generation.generationId,
          openAiJobId: video.id,
          progress: video.progress ?? 0,
        });
        await ctx.scheduler.runAfter(
          VIDEO_POLL_DELAY_MS,
          internal.mediaGeneration.pollVideo,
          { generationId: generation.generationId }
        );
        return {
          generationId: generation.generationId,
          status: "processing" as const,
        };
      }

      const blob =
        generation.mediaType === "model3d" || generation.mediaType === "game"
          ? await generateArtifactWithProvider(
              outputProvider,
              apiKey,
              generation.mediaType,
              prompt,
              generation.renderModel
            )
          : generation.mediaType === "image"
          ? await generateImageWithProvider(
              outputProvider,
              apiKey,
              prompt,
              generation.renderModel
            )
          : await generateAudioWithProvider(
              outputProvider,
              apiKey,
              prompt,
              generation.audioInstructions,
              generation.renderModel
            );
      const contentType =
        blob.type || contentTypeFor(generation.mediaType, generation.provider);
      const storageId = await ctx.storage.store(
        new Blob([await blob.arrayBuffer()], { type: contentType })
      );
      const filename = `witty-ai-${generation.mediaType}-${Date.now()}.${extensionFor(
        generation.mediaType,
        contentType
      )}`;
      const completed = (await ctx.runMutation(
        internal.mediaGeneration.completeGeneration,
        {
          generationId: generation.generationId,
          storageId,
          filename,
          contentType,
        }
      )) as { mediaItemId: Id<"mediaItems"> };
      return {
        generationId: generation.generationId,
        status: "completed" as const,
        mediaItemId: completed.mediaItemId,
      };
    } catch (error) {
      const message = friendlyError(error);
      await ctx.runMutation(internal.mediaGeneration.markFailed, {
        generationId: generation.generationId,
        error: message,
      });
      throw new Error(message);
    }
  },
});

export const pollVideo = internalAction({
  args: { generationId: v.id("mediaGenerations") },
  handler: async (ctx, args) => {
    const generation = await ctx.runMutation(
      internal.mediaGeneration.getGenerationForPoll,
      args
    );
    if (!generation || generation.status === "completed" || generation.status === "failed") {
      return;
    }
    const provider = generation.provider as GenerationProvider;
    const outputProvider = outputProviderFor(provider);
    const apiKey = apiKeyForOutputProvider(outputProvider);
    if (!apiKey) {
      await ctx.runMutation(internal.mediaGeneration.markFailed, {
        generationId: args.generationId,
        error: `${providerLabel(provider)} is not configured in Convex.`,
        counted: false,
      });
      return;
    }
    if (!generation.openAiJobId) {
      await ctx.runMutation(internal.mediaGeneration.markFailed, {
        generationId: args.generationId,
        error: "Video job ID is missing.",
      });
      return;
    }
    if ((generation.attempts ?? 0) >= VIDEO_MAX_ATTEMPTS) {
      await ctx.runMutation(internal.mediaGeneration.markFailed, {
        generationId: args.generationId,
        error: "Video generation timed out before the provider returned a completed video.",
      });
      return;
    }

    try {
      if (outputProvider === "gemini") {
        const video = await retrieveGeminiVideo(apiKey, generation.openAiJobId);
        if (video.error) {
          await ctx.runMutation(internal.mediaGeneration.markFailed, {
            generationId: args.generationId,
            error: friendlyError(video.error.message ?? "Gemini video generation failed."),
          });
          return;
        }

        if (video.done && video.uri) {
          const blob = await downloadGeminiVideo(apiKey, video.uri);
          const contentType = blob.type || "video/mp4";
          const storageId = await ctx.storage.store(
            new Blob([await blob.arrayBuffer()], { type: contentType })
          );
          await ctx.runMutation(internal.mediaGeneration.completeGeneration, {
            generationId: args.generationId,
            storageId,
            filename: `witty-ai-video-${Date.now()}.${extensionFor(
              "video",
              contentType
            )}`,
            contentType,
          });
          return;
        }

        await ctx.runMutation(internal.mediaGeneration.markProcessing, {
          generationId: args.generationId,
          progress: video.progress ?? generation.progress ?? 0,
        });
        await ctx.scheduler.runAfter(
          VIDEO_POLL_DELAY_MS,
          internal.mediaGeneration.pollVideo,
          { generationId: args.generationId }
        );
        return;
      }

      const video = await retrieveOpenAiVideo(apiKey, generation.openAiJobId);
      if (video.status === "failed") {
        await ctx.runMutation(internal.mediaGeneration.markFailed, {
          generationId: args.generationId,
          error: friendlyError(video.error?.message ?? "OpenAI video generation failed."),
        });
        return;
      }

      if (video.status === "completed") {
        const blob = await downloadOpenAiVideo(apiKey, generation.openAiJobId);
        const storageId = await ctx.storage.store(
          new Blob([await blob.arrayBuffer()], { type: "video/mp4" })
        );
        await ctx.runMutation(internal.mediaGeneration.completeGeneration, {
          generationId: args.generationId,
          storageId,
          filename: `witty-ai-video-${Date.now()}.mp4`,
          contentType: "video/mp4",
        });
        return;
      }

      await ctx.runMutation(internal.mediaGeneration.markProcessing, {
        generationId: args.generationId,
        progress: video.progress ?? generation.progress ?? 0,
      });
      await ctx.scheduler.runAfter(
        VIDEO_POLL_DELAY_MS,
        internal.mediaGeneration.pollVideo,
        { generationId: args.generationId }
      );
    } catch (error) {
      await ctx.runMutation(internal.mediaGeneration.markFailed, {
        generationId: args.generationId,
        error: friendlyError(error),
      });
    }
  },
});
