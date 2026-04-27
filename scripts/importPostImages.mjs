import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const DEFAULT_ZIPS = [
  "/Users/macofchris/Desktop/Examples.zip",
  "/Users/macofchris/Desktop/Watermarked.zip",
];
const DEFAULT_REPORT = "/tmp/witty-cafe-post-image-import-report.json";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const GENERIC_PATH_PARTS = new Set([
  "great",
  "unchecked",
  "modified",
  "watermarked",
  "watermarks",
  "new folder",
  "done change fonts",
]);

const listPostsForImageImport = makeFunctionReference(
  "media:listPostsForImageImport"
);
const findImportedByLegacyId = makeFunctionReference(
  "media:findImportedByLegacyId"
);
const generateImportUploadUrl = makeFunctionReference(
  "media:generateImportUploadUrl"
);
const attachImportedImage = makeFunctionReference("media:attachImportedImage");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    import: false,
    report: DEFAULT_REPORT,
    zips: DEFAULT_ZIPS,
    limit: Number.POSITIVE_INFINITY,
  };

  for (const arg of args) {
    if (arg === "--import") options.import = true;
    if (arg === "--dry-run") options.import = false;
    if (arg.startsWith("--report=")) options.report = arg.slice("--report=".length);
    if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    if (arg.startsWith("--zips=")) {
      options.zips = arg
        .slice("--zips=".length)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return options;
}

function fixText(value) {
  return value
    .replace(/\uFFFD\?\?/g, "'")
    .replace(/�\?\?/g, "'")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, " and ");
}

function stripImageSuffixes(value) {
  return fixText(value)
    .replace(/\bcopy of\b/gi, " ")
    .replace(/\s+\(\d+\)\s*$/g, " ")
    .replace(/\bwatermarks?\b/gi, " ")
    .replace(/\bwatermarked\b/gi, " ");
}

function normalizeText(value) {
  return stripImageSuffixes(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function humanText(value) {
  return stripImageSuffixes(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function words(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length > 1)
  );
}

function containmentScore(queryWords, targetWords) {
  if (queryWords.size === 0 || targetWords.size === 0) return 0;
  let hits = 0;
  for (const word of queryWords) {
    if (targetWords.has(word)) hits += 1;
  }
  return hits / queryWords.size;
}

function zipSourceName(zipPath) {
  return path.basename(zipPath);
}

function isWatermarkedEntry(entry) {
  return (
    entry.sourceZip.toLowerCase().includes("watermarked") ||
    entry.zipPath.toLowerCase().split("/").includes("watermarked") ||
    entry.zipPath.toLowerCase().split("/").includes("watermarks")
  );
}

function mediaTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function extensionPriority(entry) {
  const ext = path.extname(entry.zipPath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return 3;
  if (ext === ".webp") return 2;
  if (ext === ".png") return 1;
  return 0;
}

function entryPriority(entry) {
  return (entry.isWatermarked ? 100 : 0) + extensionPriority(entry);
}

function listZipEntries(zipPath) {
  if (!existsSync(zipPath)) {
    throw new Error(`Zip file not found: ${zipPath}`);
  }

  const output = execFileSync("bsdtar", ["-tf", zipPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  const sourceZip = zipSourceName(zipPath);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((zipPathEntry) => !zipPathEntry.endsWith("/"))
    .filter((zipPathEntry) =>
      IMAGE_EXTENSIONS.has(path.extname(zipPathEntry).toLowerCase())
    )
    .map((zipPathEntry) => {
      const filename = path.basename(zipPathEntry);
      const basename = filename.replace(/\.[^.]+$/, "");
      const folderText = zipPathEntry
        .split("/")
        .slice(0, -1)
        .map((part) => normalizeText(part))
        .filter((part) => part && !GENERIC_PATH_PARTS.has(part))
        .join(" ");
      const entry = {
        zipFile: zipPath,
        sourceZip,
        zipPath: zipPathEntry,
        filename,
        basename,
        displayText: humanText(basename),
        normalizedText: normalizeText(basename),
        folderText,
      };
      return {
        ...entry,
        isWatermarked: isWatermarkedEntry(entry),
      };
    })
    .filter((entry) => entry.normalizedText.length > 0);
}

function groupEntries(entries) {
  const groupsByKey = new Map();
  for (const entry of entries) {
    const key = entry.normalizedText;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        normalizedText: entry.normalizedText,
        displayText: entry.displayText,
        folderText: entry.folderText,
        entries: [],
      });
    }
    groupsByKey.get(key).entries.push(entry);
  }

  return [...groupsByKey.values()].map((group) => {
    const selected = [...group.entries].sort((a, b) => {
      const priority = entryPriority(b) - entryPriority(a);
      if (priority !== 0) return priority;
      return b.normalizedText.length - a.normalizedText.length;
    })[0];
    return { ...group, selected };
  });
}

function normalizePost(post) {
  const title = normalizeText(post.title ?? "");
  const body = normalizeText(post.body ?? post.legacyBody ?? "");
  const excerpt = normalizeText(post.plainTextExcerpt ?? "");
  const community = normalizeText(
    `${post.subreddit?.name ?? ""} ${post.subreddit?.slug ?? ""}`
  );
  const combined = normalizeText(`${post.title ?? ""} ${post.body ?? ""} ${post.legacyBody ?? ""} ${post.plainTextExcerpt ?? ""}`);

  return {
    ...post,
    titleNorm: title,
    bodyNorm: body,
    excerptNorm: excerpt,
    communityNorm: community,
    combinedNorm: combined,
    titleWords: words(title),
    bodyWords: words(body),
    excerptWords: words(excerpt),
    communityWords: words(community),
    combinedWords: words(combined),
  };
}

function scoreGroupToPost(group, post) {
  const query = group.normalizedText;
  const queryWords = words(query);
  let score = 0;
  const reasons = [];

  if (post.titleNorm && post.titleNorm === query) {
    score = Math.max(score, 100);
    reasons.push("title-exact");
  }
  if (query.length >= 10 && post.bodyNorm.includes(query)) {
    score = Math.max(score, 96);
    reasons.push("body-contains-filename");
  }
  if (query.length >= 10 && post.excerptNorm.includes(query)) {
    score = Math.max(score, 92);
    reasons.push("excerpt-contains-filename");
  }
  if (
    post.titleNorm.length >= 12 &&
    query.includes(post.titleNorm) &&
    query.length >= post.titleNorm.length
  ) {
    score = Math.max(score, 86);
    reasons.push("filename-contains-title");
  }

  const titleContainment = containmentScore(queryWords, post.titleWords);
  const bodyContainment = containmentScore(queryWords, post.bodyWords);
  const excerptContainment = containmentScore(queryWords, post.excerptWords);
  const combinedContainment = containmentScore(queryWords, post.combinedWords);
  const lexicalScore = Math.round(
    Math.max(
      titleContainment * 72,
      bodyContainment * 82,
      excerptContainment * 78,
      combinedContainment * 74
    )
  );
  if (lexicalScore > score) {
    score = lexicalScore;
    reasons.push("word-overlap");
  }

  const folderWords = words(group.folderText);
  const communityContainment = containmentScore(folderWords, post.communityWords);
  if (communityContainment > 0) {
    const bonus = Math.round(Math.min(12, communityContainment * 12));
    score += bonus;
    reasons.push("community-path-bonus");
  }

  return {
    score: Math.min(100, score),
    reasons,
  };
}

function confidenceFor(score) {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function matchGroup(group, posts) {
  const ranked = posts
    .map((post) => ({
      post,
      ...scoreGroupToPost(group, post),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!best) {
    return { group, best: null, second: null, ambiguous: false };
  }

  return {
    group,
    best,
    second,
    ambiguous: Boolean(second && best.score - second.score <= 3),
  };
}

function chooseMatchedGroups(matches) {
  const selected = [];
  const noCandidate = [];

  for (const match of matches) {
    if (!match.best) {
      noCandidate.push(match);
      continue;
    }

    selected.push(match);
  }

  return {
    selected: assignImportOrders(selected),
    noCandidate,
  };
}

function assignImportOrders(matches) {
  const countsByPost = new Map();
  return matches.map((match) => {
    const postId = match.best.post._id;
    const count = countsByPost.get(postId) ?? 0;
    countsByPost.set(postId, count + 1);
    return {
      ...match,
      importOrder: -100 + count,
    };
  });
}

function countDuplicatePostGroups(matches) {
  const countsByPost = new Map();
  for (const match of matches) {
    const postId = match.best.post._id;
    countsByPost.set(postId, (countsByPost.get(postId) ?? 0) + 1);
  }
  let duplicateGroups = 0;
  for (const count of countsByPost.values()) {
    if (count > 1) duplicateGroups += count - 1;
  }
  return duplicateGroups;
}

function legacyGalleryIdFor(match) {
  return `zip-image:${sha1(`${match.best.post._id}:${match.group.normalizedText}`).slice(0, 20)}`;
}

function safeReportMatch(match) {
  return {
    legacyGalleryId: match.best ? legacyGalleryIdFor(match) : null,
    imageText: match.group.displayText,
    normalizedText: match.group.normalizedText,
    selectedZip: match.group.selected.sourceZip,
    selectedPath: match.group.selected.zipPath,
    variantCount: match.group.entries.length,
    postId: match.best?.post._id ?? null,
    postTitle: match.best?.post.title ?? null,
    community: match.best?.post.subreddit?.name ?? null,
    importOrder: match.importOrder ?? null,
    score: match.best?.score ?? null,
    confidence: match.best ? confidenceFor(match.best.score) : null,
    reasons: match.best?.reasons ?? [],
    ambiguous: match.ambiguous,
    secondPostId: match.second?.post._id ?? null,
    secondPostTitle: match.second?.post.title ?? null,
    secondScore: match.second?.score ?? null,
  };
}

function readZipEntryBuffer(entry) {
  return execFileSync("bsdtar", ["-xOf", entry.zipFile, entry.zipPath], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 40,
  });
}

async function uploadSelectedImage(client, token, match) {
  const entry = match.group.selected;
  const legacyGalleryId = legacyGalleryIdFor(match);
  const existing = await client.query(findImportedByLegacyId, {
    token,
    legacyGalleryId,
  });
  if (existing) {
    return { status: "already-attached", mediaItemId: existing._id };
  }

  const buffer = readZipEntryBuffer(entry);
  const uploadUrl = await client.mutation(generateImportUploadUrl, { token });
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mediaTypeForPath(entry.zipPath) },
    body: buffer,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `Upload failed for ${entry.zipPath}: ${uploadResponse.status} ${uploadResponse.statusText}`
    );
  }

  const { storageId } = await uploadResponse.json();
  return await client.mutation(attachImportedImage, {
    token,
    postId: match.best.post._id,
    storageId,
    legacyGalleryId,
    filename: entry.filename,
    size: buffer.length,
    altText: entry.displayText,
    order: match.importOrder ?? -100,
    importSourceZip: entry.sourceZip,
    importZipPath: entry.zipPath,
    importMatchText: match.group.displayText,
    importMatchConfidence: confidenceFor(match.best.score),
    importMatchScore: match.best.score,
  });
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env.test.local"));

const options = parseArgs();
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://avid-walrus-331.convex.cloud";
const token = process.env.IMAGE_IMPORT_TOKEN;
if (!token) {
  throw new Error("IMAGE_IMPORT_TOKEN is required.");
}

const client = new ConvexHttpClient(convexUrl);
const entries = options.zips.flatMap((zipPath) => listZipEntries(zipPath));
const groups = groupEntries(entries);
const posts = (await client.query(listPostsForImageImport, { token })).map(
  normalizePost
);
const matches = groups.map((group) => matchGroup(group, posts));
const { selected, noCandidate } = chooseMatchedGroups(matches);

const selectedLimited = selected.slice(0, options.limit);
const dryRunExisting = [];
for (const match of selectedLimited) {
  const existing = await client.query(findImportedByLegacyId, {
    token,
    legacyGalleryId: legacyGalleryIdFor(match),
  });
  if (existing) dryRunExisting.push(match);
}

const importResults = [];
if (options.import) {
  for (const [index, match] of selectedLimited.entries()) {
    const result = await uploadSelectedImage(client, token, match);
    importResults.push({ match, result });
    if ((index + 1) % 20 === 0 || index + 1 === selectedLimited.length) {
      console.log(`Imported ${index + 1}/${selectedLimited.length}`);
    }
  }
}

const confidenceCounts = { high: 0, medium: 0, low: 0 };
for (const match of selected) {
  confidenceCounts[confidenceFor(match.best.score)] += 1;
}

const report = {
  mode: options.import ? "import" : "dry-run",
  generatedAt: new Date().toISOString(),
  convexUrl,
  zips: options.zips,
  summary: {
    totalImageEntries: entries.length,
    uniqueNormalizedGroups: groups.length,
    selectedForImport: selected.length,
    selectedLimited: selectedLimited.length,
    duplicatePostMatchGroups: countDuplicatePostGroups(selected),
    skippedDuplicatePostMatches: 0,
    noCandidate: noCandidate.length,
    ambiguousMatches: selected.filter((match) => match.ambiguous).length,
    alreadyAttachedBeforeRun: dryRunExisting.length,
    created: importResults.filter((entry) => entry.result.status === "created")
      .length,
    skippedDuringImport: importResults.filter(
      (entry) => entry.result.status !== "created"
    ).length,
    confidence: confidenceCounts,
  },
  selected: selected.map(safeReportMatch),
  droppedDuplicatePostMatches: [],
  noCandidate: noCandidate.map(safeReportMatch),
  importResults: importResults.map(({ match, result }) => ({
    ...safeReportMatch(match),
    importStatus: result.status,
    mediaItemId: result.mediaItemId,
  })),
};

writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Report written to ${options.report}`);
