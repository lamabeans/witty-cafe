import fs from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const DEFAULT_DATA_DIR = "/Users/macofchris/Desktop/json witty cafe data";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    env[key] = value.replace(/^"|"$/g, "");
  }
  return env;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) return [];
  return JSON.parse(content);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function pickValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return undefined;
}

function toLegacyId(obj, fallback) {
  const value = pickValue(obj, ["id", "_id", "uuid", "legacyId", "slug"]);
  return value ? String(value) : fallback;
}

function toTimestamp(value) {
  if (!value) return undefined;
  if (typeof value === "number") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",");
  return [];
}

const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DATA_DIR;

const envFile = readEnvFile(path.join(process.cwd(), ".env.local"));
const convexUrl =
  process.env.CONVEX_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  envFile.CONVEX_URL ||
  envFile.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  console.error("Missing CONVEX_URL. Set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL.");
  process.exit(1);
}

const collectionsRaw = readJson(path.join(dataDir, "subreddits.json"));
const tagsRaw = readJson(path.join(dataDir, "tags.json"));
const postsRaw = readJson(path.join(dataDir, "posts.json"));
const postContentRaw = readJson(path.join(dataDir, "postcontent.json"));

const collectionLookup = new Map();
const collections = collectionsRaw.map((row, index) => {
  const name =
    pickValue(row, ["name", "title", "subreddit", "community"]) ||
    `Community ${index + 1}`;
  const slug = pickValue(row, ["slug"]) || slugify(name);
  const legacyId = toLegacyId(row, slug || String(index));
  const record = {
    legacyId,
    name: String(name),
    slug: String(slug),
    description: pickValue(row, ["description", "about"]) || undefined,
    createdAt: toTimestamp(pickValue(row, ["createdAt", "created_at"])) || undefined,
  };
  collectionLookup.set(legacyId, record);
  collectionLookup.set(String(slug), record);
  collectionLookup.set(String(name).toLowerCase(), record);
  return record;
});

const tagLookup = new Map();
const tags = tagsRaw.map((row, index) => {
  const name = pickValue(row, ["name", "tag"]) || `Tag ${index + 1}`;
  const slug = pickValue(row, ["slug"]) || slugify(name);
  const legacyId = toLegacyId(row, slug || String(index));
  const record = {
    legacyId,
    name: String(name),
    slug: String(slug),
  };
  tagLookup.set(legacyId, record);
  tagLookup.set(String(slug), record);
  tagLookup.set(String(name).toLowerCase(), record);
  return record;
});

const contentByPostId = new Map();
for (const row of postContentRaw) {
  const legacyId = toLegacyId(row, undefined);
  if (!legacyId) continue;
  const body = pickValue(row, ["body", "content", "text"]) || "";
  contentByPostId.set(String(legacyId), String(body));
}

const posts = postsRaw.map((row, index) => {
  const legacyId = toLegacyId(row, String(index));
  const title = pickValue(row, ["title", "headline", "name"]) || "Untitled post";
  const body =
    pickValue(row, ["body", "content", "text"]) ||
    contentByPostId.get(String(legacyId)) ||
    undefined;
  const collectionRef = pickValue(row, [
    "subredditId",
    "subreddit_id",
    "communityId",
    "community_id",
    "subreddit",
    "community",
  ]);
  const collectionRecord =
    collectionLookup.get(String(collectionRef)) ||
    collectionLookup.get(String(collectionRef ?? "").toLowerCase());
  const collectionLegacyId = collectionRecord
    ? collectionRecord.legacyId
    : collections[0]?.legacyId;

  const tagRefs = ensureArray(
    pickValue(row, ["tags", "tagIds", "tag_ids", "tagSlugs"])
  );
  const tagLegacyIds = tagRefs
    .map((tag) => tagLookup.get(String(tag)) || tagLookup.get(String(tag).toLowerCase()))
    .filter(Boolean)
    .map((record) => record.legacyId);

  return {
    legacyId: String(legacyId),
    title: String(title),
    body: body ? String(body) : undefined,
    collectionLegacyId: String(collectionLegacyId || ""),
    createdAt: toTimestamp(pickValue(row, ["createdAt", "created_at"])) || undefined,
    score: Number(pickValue(row, ["score", "votes"])) || 0,
    commentCount: Number(pickValue(row, ["commentCount", "comments"])) || 0,
    tagLegacyIds: tagLegacyIds.length ? tagLegacyIds : undefined,
  };
});

if (!collections.length || !posts.length) {
  console.warn(
    "Import skipped: subreddits.json or posts.json is empty. Check your data files."
  );
  process.exit(0);
}

const client = new ConvexHttpClient(convexUrl);

const result = await client.mutation(api.importer.importAll, {
  collections,
  tags,
  posts,
  comments: [],
});

console.log("Import complete:", result);
