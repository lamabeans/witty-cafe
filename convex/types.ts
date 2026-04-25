import type { Doc } from "./_generated/dataModel";

export type AuthorSummary = {
  name: string;
  imageUrl: string | null;
} | null;

export type SubredditSummary = Pick<Doc<"subreddits">, "name" | "slug"> | null;

export type TagSummary = Pick<Doc<"tags">, "name" | "slug">;

export type EnrichedPost = Doc<"posts"> & {
  subreddit: SubredditSummary;
  author: AuthorSummary;
  tags: TagSummary[];
};

export type EnrichedComment = Doc<"comments"> & {
  author: AuthorSummary;
};
