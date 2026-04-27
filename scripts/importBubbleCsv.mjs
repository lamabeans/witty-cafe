import fs from "fs";
import path from "path";

const DEFAULT_LIVE_DIR = "/Users/macofchris/Desktop/witty cafe live database";
const DEFAULT_DEV_DIR = "/Users/macofchris/Desktop/witty cafe cvs development database";
const BUBBLE_ID_RE = /\b\d{13}x\d{15,18}\b/g;
const EXPECTED_LIVE_COUNTS = {
  subreddits: 45,
  tags: 13,
  users: 8,
  posts: 684,
  postContents: 684,
  galleries: 4104,
  imageContents: 4104,
};
const POST_BATCH_SIZE = 75;
const MEDIA_BATCH_SIZE = 500;

function parseArgs(argv) {
  const args = {
    dataDir: DEFAULT_LIVE_DIR,
    dryRun: true,
    expectedLiveCounts: true,
    writePayload: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--import") {
      args.dryRun = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--dev") {
      args.dataDir = DEFAULT_DEV_DIR;
      args.expectedLiveCounts = false;
    } else if (arg === "--live") {
      args.dataDir = DEFAULT_LIVE_DIR;
      args.expectedLiveCounts = true;
    } else if (arg === "--no-live-counts") {
      args.expectedLiveCounts = false;
    } else if (arg === "--write-payload") {
      args.writePayload = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--dir") {
      args.dataDir = path.resolve(argv[index + 1] ?? "");
      args.expectedLiveCounts = false;
      index += 1;
    } else if (!arg.startsWith("--")) {
      args.dataDir = path.resolve(arg);
      args.expectedLiveCounts = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const [headers, ...rows] = parseCsv(text);
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function findCsv(dataDir, includes) {
  const files = fs
    .readdirSync(dataDir)
    .filter((file) => file.endsWith(".csv") && file.includes(includes))
    .sort();
  if (!files.length) {
    throw new Error(`Missing CSV matching "${includes}" in ${dataDir}`);
  }
  return path.join(dataDir, files[0]);
}

function readTables(dataDir) {
  return {
    galleries: readCsv(findCsv(dataDir, "All-Galleries")),
    imageContents: readCsv(findCsv(dataDir, "All-Image-Contents")),
    postContents: readCsv(findCsv(dataDir, "All-Post-Contents")),
    posts: readCsv(findCsv(dataDir, "All-Posts")),
    subreddits: readCsv(findCsv(dataDir, "All-Subreddits-modified")),
    tags: readCsv(findCsv(dataDir, "All-Tags")),
    users: readCsv(findCsv(dataDir, "All-Users")),
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function extractIds(value) {
  return String(value ?? "").match(BUBBLE_ID_RE) ?? [];
}

function splitList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function numberOrUndefined(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolFromBubble(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (["yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return undefined;
}

function parseBubbleDate(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  const match = normalized.match(
    /^([A-Za-z]{3}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) ([ap]m)$/i
  );
  if (!match) return undefined;
  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const [, monthName, day, year, hourText, minute, meridiem] = match;
  const month = months[monthName.toLowerCase()];
  if (month === undefined) return undefined;
  let hour = Number(hourText);
  if (meridiem.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (meridiem.toLowerCase() === "am" && hour === 12) hour = 0;
  const timestamp = new Date(
    Number(year),
    month,
    Number(day),
    hour,
    Number(minute)
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function normalizeAssetUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

function sentenceFromBody(body) {
  const normalized = String(body ?? "")
    .replace(/\[\/?b\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const firstSentence = normalized.match(/^.{1,80}?(?:[.!?]|$)/)?.[0] ?? normalized;
  return firstSentence.replace(/[.!?]\s*$/, "").slice(0, 80).trim();
}

function collectIds(rows, columns) {
  return unique(
    rows.flatMap((row) => columns.flatMap((column) => extractIds(row[column])))
  );
}

function inferIdsForRows(rows, ids, label, warnings, errors) {
  if (rows.length !== ids.length) {
    errors.push(`${label}: row count ${rows.length} does not match ID count ${ids.length}`);
  }

  const sortedIds = [...ids].sort((a, b) => {
    const timeDiff = Number(a.slice(0, 13)) - Number(b.slice(0, 13));
    return timeDiff || a.localeCompare(b);
  });
  const rowOrder = rows
    .map((row, index) => ({
      index,
      createdAt: parseBubbleDate(row["Creation Date"]) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
  const rowToId = new Array(rows.length);

  for (let index = 0; index < Math.min(rowOrder.length, sortedIds.length); index += 1) {
    rowToId[rowOrder[index].index] = sortedIds[index];
  }

  let distantMatches = 0;
  for (const { index } of rowOrder) {
    const legacyId = rowToId[index];
    const createdAt = parseBubbleDate(rows[index]["Creation Date"]);
    if (!legacyId || !createdAt) continue;
    if (Math.abs(Number(legacyId.slice(0, 13)) - createdAt) > 5 * 60 * 1000) {
      distantMatches += 1;
    }
  }
  if (distantMatches) {
    warnings.push(
      `${label}: ${distantMatches} inferred IDs are more than five minutes from row creation time`
    );
  }

  return rowToId;
}

function buildPayload(tables) {
  const warnings = [];
  const errors = [];

  const subredditRefs = collectIds(tables.posts, ["OG-subreddit"]).concat(
    collectIds(tables.users, ["Joined-subreddits"])
  );
  const tagRefs = collectIds(tables.postContents, ["OG-tags"]);
  const postContentRefs = collectIds(tables.galleries, ["OG-post-content"]);

  const subredditIds = inferIdsForRows(
    tables.subreddits,
    unique(subredditRefs),
    "subreddits",
    warnings,
    errors
  );
  const tagIds = inferIdsForRows(tables.tags, tagRefs, "tags", warnings, errors);
  const postContentIds = inferIdsForRows(
    tables.postContents,
    postContentRefs,
    "postContents",
    warnings,
    errors
  );

  if (tables.posts.length !== tables.postContents.length) {
    errors.push(
      `posts: row count ${tables.posts.length} does not match post-content count ${tables.postContents.length}`
    );
  }
  if (tables.galleries.length !== tables.imageContents.length) {
    errors.push(
      `galleries: row count ${tables.galleries.length} does not match image-content count ${tables.imageContents.length}`
    );
  }

  const subredditIdSet = new Set(subredditIds.filter(Boolean));
  const tagIdSet = new Set(tagIds.filter(Boolean));
  const postLegacyIds = tables.postContents.map((row) => extractIds(row["OG-post"])[0]);
  const postLegacyIdSet = new Set(postLegacyIds.filter(Boolean));
  const postContentIdSet = new Set(postContentIds.filter(Boolean));
  const galleryLegacyIds = tables.imageContents.map(
    (row) => extractIds(row["OG-gallery"])[0]
  );
  const galleryLegacyIdSet = new Set(galleryLegacyIds.filter(Boolean));

  const frameTypeByLegacy = new Map([
    ["1676116595677x673900726864162300", "Image"],
    ["1676116595668x746539010130706400", "Video"],
  ]);

  const users = tables.users.map((row) => {
    const email = String(row.email ?? "").trim().toLowerCase();
    const firstName = String(row["First Name"] ?? "").trim();
    const lastName = String(row["Last Name"] ?? "").trim();
    return {
      legacyId: email ? `legacy:${email}` : `legacy:user:${row.Username}`,
      clerkUserId: email ? `legacy:${email}` : `legacy:user:${row.Username}`,
      email: email || undefined,
      name: [firstName, lastName].filter(Boolean).join(" ") || row.Username || undefined,
      username: String(row.Username ?? "").trim() || undefined,
      createdAt: parseBubbleDate(row["Creation Date"]),
      modifiedAt: parseBubbleDate(row["Modified Date"]),
      joinedSubredditLegacyIds: splitList(row["Joined-subreddits"]).filter((id) =>
        subredditIdSet.has(id)
      ),
    };
  });
  const userEmails = new Set(users.map((user) => user.email).filter(Boolean));

  const subreddits = tables.subreddits.map((row, index) => ({
    legacyId: subredditIds[index],
    name: String(row.Name ?? "").trim() || `Community ${index + 1}`,
    slug: slugify(row.Name || `Community ${index + 1}`),
    description: String(row.Description ?? "").trim() || undefined,
    introduction: String(row.Introduction ?? "").trim() || undefined,
    conclusion: String(row.Conclusion ?? "").trim() || undefined,
    bannerImage: normalizeAssetUrl(row["Banner Image"]),
    nsfw: boolFromBubble(row.NSFW),
    moderatorEmails: splitList(row.Moderators).map((email) => email.toLowerCase()),
    createdAt: parseBubbleDate(row["Creation Date"]),
  }));

  const tags = tables.tags.map((row, index) => ({
    legacyId: tagIds[index],
    name: String(row.Name ?? "").trim() || `Tag ${index + 1}`,
    slug: slugify(row.Name || `Tag ${index + 1}`),
  }));

  const postContentLegacyToPostLegacy = new Map();
  const posts = tables.posts.map((postRow, index) => {
    const contentRow = tables.postContents[index] ?? {};
    const legacyId = extractIds(contentRow["OG-post"])[0];
    const postContentLegacyId = postContentIds[index];
    const body = String(contentRow["Post-text"] ?? "").trim();
    const title =
      String(postRow.Title ?? "").trim() ||
      sentenceFromBody(body) ||
      `Imported post ${index + 1}`;
    const tagLegacyIds = unique(splitList(contentRow["OG-tags"])).filter((id) =>
      tagIdSet.has(id)
    );
    const upvoteEmails = unique(splitList(postRow.Upvotes)).map((email) =>
      email.toLowerCase()
    );

    if (legacyId && postContentLegacyId) {
      postContentLegacyToPostLegacy.set(postContentLegacyId, legacyId);
    }

    return {
      legacyId,
      postContentLegacyId,
      title,
      body: body || undefined,
      subredditLegacyId: extractIds(postRow["OG-subreddit"])[0] ?? "",
      createdAt: parseBubbleDate(postRow["Creation Date"]),
      modifiedAt: parseBubbleDate(postRow["Modified Date"]),
      score: numberOrUndefined(postRow.TotalVotes) ?? 0,
      commentCount: 0,
      nsfw: boolFromBubble(contentRow.NSFW),
      upvoteEmails,
      tagLegacyIds,
    };
  });

  const mediaItems = tables.galleries.map((galleryRow, index) => {
    const imageRow = tables.imageContents[index] ?? {};
    const legacyGalleryId = galleryLegacyIds[index];
    const postContentLegacyId = extractIds(galleryRow["OG-post-content"])[0];
    const postLegacyId = postContentLegacyToPostLegacy.get(postContentLegacyId) ?? "";
    const frameTypeLegacyId = extractIds(galleryRow["OG-frame-type"])[0];
    const imageUrl = normalizeAssetUrl(imageRow.Image) ?? normalizeAssetUrl(imageRow["Image-file"]);

    return {
      legacyGalleryId,
      postLegacyId,
      postContentLegacyId,
      frameTypeLegacyId,
      frameType: frameTypeByLegacy.get(frameTypeLegacyId),
      marker: numberOrUndefined(galleryRow.Marker),
      score: numberOrUndefined(galleryRow.Score),
      shortId: String(galleryRow["Short-id"] ?? "").trim() || undefined,
      imageUrl,
      imageFile: normalizeAssetUrl(imageRow["Image-file"]),
      imageName: String(imageRow["Image-name"] ?? "").trim() || undefined,
      imageType: String(imageRow["Image-type"] ?? "").trim() || undefined,
      nsfw: boolFromBubble(imageRow.NSFW),
      createdAt: parseBubbleDate(galleryRow["Creation Date"]),
      modifiedAt: parseBubbleDate(galleryRow["Modified Date"]),
    };
  });

  for (const [index, post] of posts.entries()) {
    if (!post.legacyId) errors.push(`post ${index + 1}: missing OG-post legacy ID`);
    if (!post.title.trim()) errors.push(`post ${index + 1}: blank generated title`);
    if (!subredditIdSet.has(post.subredditLegacyId)) {
      errors.push(`post ${post.legacyId}: unresolved subreddit ${post.subredditLegacyId}`);
    }
    for (const tagLegacyId of splitList(tables.postContents[index]?.["OG-tags"])) {
      if (!tagIdSet.has(tagLegacyId)) {
        errors.push(`post ${post.legacyId}: unresolved tag ${tagLegacyId}`);
      }
    }
    for (const email of post.upvoteEmails) {
      if (!userEmails.has(email)) {
        errors.push(`post ${post.legacyId}: unresolved upvote email ${email}`);
      }
    }
  }

  for (const [index, legacyId] of postContentIds.entries()) {
    if (!legacyId) errors.push(`post-content row ${index + 1}: missing inferred legacy ID`);
    if (!postLegacyIdSet.has(posts[index]?.legacyId)) {
      errors.push(`post-content row ${index + 1}: unresolved post`);
    }
  }

  for (const [index, mediaItem] of mediaItems.entries()) {
    if (!mediaItem.legacyGalleryId) {
      errors.push(`gallery row ${index + 1}: missing inferred gallery legacy ID`);
    }
    if (!postContentIdSet.has(mediaItem.postContentLegacyId)) {
      errors.push(
        `gallery ${mediaItem.legacyGalleryId}: unresolved post content ${mediaItem.postContentLegacyId}`
      );
    }
    if (!postLegacyIdSet.has(mediaItem.postLegacyId)) {
      errors.push(
        `gallery ${mediaItem.legacyGalleryId}: unresolved post ${mediaItem.postLegacyId}`
      );
    }
  }

  for (const [index, legacyId] of galleryLegacyIds.entries()) {
    if (!legacyId) errors.push(`image-content row ${index + 1}: missing OG-gallery`);
    if (!galleryLegacyIdSet.has(legacyId)) {
      errors.push(`image-content row ${index + 1}: unresolved gallery ${legacyId}`);
    }
  }

  for (const [name, collection] of [
    ["subreddits", subreddits],
    ["tags", tags],
    ["posts", posts],
    ["mediaItems", mediaItems],
  ]) {
    const ids = collection.map((item) => item.legacyId ?? item.legacyGalleryId);
    const duplicates = ids.filter((id, index) => id && ids.indexOf(id) !== index);
    if (duplicates.length) {
      errors.push(`${name}: duplicate legacy IDs ${unique(duplicates).slice(0, 5).join(", ")}`);
    }
  }

  const malformedDates = [];
  for (const [tableName, rows] of Object.entries(tables)) {
    for (const [index, row] of rows.entries()) {
      for (const column of ["Creation Date", "Modified Date"]) {
        if (row[column] && parseBubbleDate(row[column]) === undefined) {
          malformedDates.push(`${tableName} row ${index + 1} ${column}: ${row[column]}`);
        }
      }
    }
  }
  errors.push(...malformedDates);

  return {
    payload: { users, subreddits, tags, posts, mediaItems },
    report: {
      counts: {
        subreddits: subreddits.length,
        tags: tags.length,
        users: users.length,
        posts: posts.length,
        postContents: tables.postContents.length,
        galleries: tables.galleries.length,
        imageContents: tables.imageContents.length,
        mediaItems: mediaItems.length,
      },
      relationIds: {
        subreddits: subredditIdSet.size,
        tags: tagIdSet.size,
        posts: postLegacyIdSet.size,
        postContents: postContentIdSet.size,
        galleries: galleryLegacyIdSet.size,
      },
      generatedTitleCount: posts.filter((post, index) => !tables.posts[index]?.Title).length,
      imageUrlCount: mediaItems.filter((item) => item.imageUrl).length,
      warnings,
      errors,
    },
  };
}

function assertExpectedLiveCounts(report) {
  const errors = [];
  for (const [key, expected] of Object.entries(EXPECTED_LIVE_COUNTS)) {
    if (report.counts[key] !== expected) {
      errors.push(`${key}: expected ${expected}, got ${report.counts[key]}`);
    }
  }
  return errors;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function mergeImportStats(target, next) {
  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value)) {
      target[key] = [...(target[key] ?? []), ...value];
    } else if (typeof value === "number") {
      target[key] = (target[key] ?? 0) + value;
    } else {
      target[key] = value;
    }
  }
  return target;
}

async function main() {
  const args = parseArgs(process.argv);
  const tables = readTables(args.dataDir);
  const { payload, report } = buildPayload(tables);

  if (args.expectedLiveCounts) {
    report.errors.push(...assertExpectedLiveCounts(report));
  }

  if (args.writePayload) {
    fs.writeFileSync(args.writePayload, JSON.stringify(payload, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length) {
    console.error(`Dry-run failed with ${report.errors.length} validation error(s).`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log("Dry-run passed. Re-run with --import to write to Convex.");
    return;
  }

  const envFile = readEnvFile(path.join(process.cwd(), ".env.local"));
  const convexUrl =
    process.env.CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    envFile.CONVEX_URL ||
    envFile.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL or NEXT_PUBLIC_CONVEX_URL.");
  }

  const [{ ConvexHttpClient }, { api }] = await Promise.all([
    import("convex/browser"),
    import("../convex/_generated/api.js"),
  ]);
  const client = new ConvexHttpClient(convexUrl);
  const result = {};

  mergeImportStats(
    result,
    await client.mutation(api.importer.importAll, {
      users: payload.users,
      subreddits: payload.subreddits,
      tags: payload.tags,
      posts: [],
      mediaItems: [],
    })
  );

  for (const [index, posts] of chunks(payload.posts, POST_BATCH_SIZE).entries()) {
    console.log(`Importing post batch ${index + 1}...`);
    mergeImportStats(
      result,
      await client.mutation(api.importer.importAll, {
        users: [],
        subreddits: [],
        tags: [],
        posts,
        mediaItems: [],
      })
    );
  }

  for (const [index, mediaItems] of chunks(
    payload.mediaItems,
    MEDIA_BATCH_SIZE
  ).entries()) {
    console.log(`Importing media batch ${index + 1}...`);
    mergeImportStats(
      result,
      await client.mutation(api.importer.importAll, {
        users: [],
        subreddits: [],
        tags: [],
        posts: [],
        mediaItems,
      })
    );
  }

  console.log("Import complete:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
