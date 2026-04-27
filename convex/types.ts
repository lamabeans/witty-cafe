import type { Doc, Id } from "./_generated/dataModel";

export type AuthorSummary = {
  name: string;
  imageUrl: string | null;
} | null;

export type SubredditSummary = Pick<Doc<"subreddits">, "name" | "slug"> | null;

export type TagSummary = Pick<Doc<"tags">, "name" | "slug">;

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
  source: "legacy" | "upload" | "zip-import";
  mediaType: "image" | "video" | "audio" | "unknown";
  filename: string | null;
  altText: string | null;
  order: number;
  marker: number | null;
  nsfw: boolean;
};

export type EnrichedPost = Doc<"posts"> & {
  subreddit: SubredditSummary;
  author: AuthorSummary;
  tags: TagSummary[];
  media: MediaSummary[];
  viewerVote: number | null;
  contentJson?: RichTextDocument;
  plainTextExcerpt?: string;
};

export type EnrichedComment = Doc<"comments"> & {
  author: AuthorSummary;
};
