import type { Doc, Id } from "./_generated/dataModel";

export type AuthorSummary = {
  name: string;
  imageUrl: string | null;
} | null;

export type CollectionSummary = Pick<Doc<"collections">, "name" | "slug"> | null;

export type TagSummary = Pick<Doc<"tags">, "name" | "slug">;

export type ReactionKind = "like" | "funny" | "love" | "wow" | "keep" | "share";

export type ReactionCounts = Record<ReactionKind, number>;

export type FlavorSummary = {
  _id: Id<"flavors"> | null;
  name: string;
  slug: string;
  description?: string;
  kind?: "type" | "theme" | "occasion" | "format" | "other";
  color?: string;
  icon?: string;
};

export type AudienceSummary = {
  _id: Id<"audiences"> | null;
  name: string;
  slug: string;
};

export type RichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "textStyle"; attrs?: { color?: string } };

export type RichTextInline =
  | { type: "text"; text: string; marks?: RichTextMark[] }
  | { type: "hardBreak" };

export type RichTextBlock = {
  type: "paragraph";
  content?: RichTextInline[];
};

export type RichTextDocument = {
  type: "doc";
  content: RichTextBlock[];
};

export type MediaSummary = {
  _id: Id<"mediaItems">;
  url: string | null;
  source: "legacy" | "upload" | "zip-import" | "ai-generated";
  mediaType: "image" | "video" | "audio" | "model3d" | "game" | "unknown";
  filename: string | null;
  altText: string | null;
  order: number;
  marker: number | null;
  nsfw: boolean;
  aiGenerated: boolean;
  aiModel: string | null;
  aiPreset: string | null;
  legacyScore: number;
  rankScore: number;
  reactionCounts: ReactionCounts;
  viewerReaction: ReactionKind | null;
};

export type AiGenerationMediaType = "image" | "audio" | "video" | "model3d" | "game";

export type AiGenerationStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type EnrichedPost = Doc<"posts"> & {
  collection: CollectionSummary;
  flavor: FlavorSummary;
  audiences: AudienceSummary[];
  author: AuthorSummary;
  tags: TagSummary[];
  vibes: TagSummary[];
  media: MediaSummary[];
  viewerVote: number | null;
  reactionCounts: ReactionCounts;
  viewerReaction: ReactionKind | null;
  contentJson?: RichTextDocument;
  plainTextExcerpt?: string;
};

export type EnrichedComment = Doc<"comments"> & {
  author: AuthorSummary;
};
