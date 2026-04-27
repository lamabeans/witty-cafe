"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { EnrichedPost } from "../convex/types";
import { MediaGallery } from "./components/MediaGallery";

type MediaKind = "image" | "video" | "audio" | "unknown";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function excerptFromBody(body: string) {
  const plain = body.replace(/\s+/g, " ").trim();
  if (plain.length <= 220) return plain;
  return `${plain.slice(0, 219).trimEnd()}…`;
}

function mediaKindFor(file: File): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "unknown";
}

function VoteRail({
  post,
  canWrite,
  busy,
  onVote,
}: {
  post: EnrichedPost;
  canWrite: boolean;
  busy: boolean;
  onVote: (value: 1 | -1) => void;
}) {
  const base =
    "grid h-8 w-8 place-items-center rounded-lg border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-2">
      <button
        type="button"
        onClick={() => onVote(1)}
        disabled={!canWrite || busy}
        className={`${base} ${
          post.viewerVote === 1
            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
        }`}
        aria-label="Upvote"
      >
        ▲
      </button>
      <span className="text-sm font-bold tabular-nums text-slate-900">
        {post.score ?? 0}
      </span>
      <button
        type="button"
        onClick={() => onVote(-1)}
        disabled={!canWrite || busy}
        className={`${base} ${
          post.viewerVote === -1
            ? "border-rose-500 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-rose-400 hover:text-rose-700"
        }`}
        aria-label="Downvote"
      >
        ▼
      </button>
    </div>
  );
}

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } =
    useConvexAuth();
  const canWrite = Boolean(isLoaded && isSignedIn && isConvexAuthenticated);
  const authPending = Boolean(isLoaded && isSignedIn && isConvexLoading);

  const subreddits = useQuery(api.subreddits.list) as
    | Array<Doc<"subreddits">>
    | undefined;
  const tags = useQuery(api.tags.list) as Array<Doc<"tags">> | undefined;
  const [activeSubreddit, setActiveSubreddit] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");

  const posts = useQuery(api.posts.list, {
    subredditSlug: activeSubreddit ?? undefined,
    tagSlug: activeTag ?? undefined,
    limit: 70,
  }) as EnrichedPost[] | undefined;

  const createPost = useMutation(api.posts.create);
  const castVote = useMutation(api.votes.cast);
  const createSubreddit = useMutation(api.subreddits.create);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);

  const activeSubredditDoc = subreddits?.find(
    (community) => community.slug === activeSubreddit
  );
  const [selectedSubredditIdOverride, setSelectedSubredditIdOverride] =
    useState<Id<"subreddits"> | null>(null);
  const selectedSubredditId =
    selectedSubredditIdOverride ?? activeSubredditDoc?._id ?? subreddits?.[0]?._id ?? null;

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [communityName, setCommunityName] = useState("");
  const [communityDesc, setCommunityDesc] = useState("");
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);

  const [voteError, setVoteError] = useState<string | null>(null);
  const [votingPostId, setVotingPostId] = useState<Id<"posts"> | null>(null);

  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    const query = search.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.plainTextExcerpt,
        post.subreddit?.name,
        post.subreddit?.slug,
        post.tags?.map((tag) => `${tag.name} ${tag.slug}`).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [posts, search]);

  const handleCreatePost = async (event: React.FormEvent) => {
    event.preventDefault();
    setPostError(null);
    if (!canWrite) {
      setPostError(authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to post.");
      return;
    }
    if (!selectedSubredditId) {
      setPostError("Choose a community first.");
      return;
    }

    setIsPublishing(true);
    try {
      const mediaAttachments = [];
      for (const [index, file] of files.entries()) {
        const uploadUrl = await generateUploadUrl();
        const upload = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!upload.ok) {
          throw new Error(`Could not upload ${file.name}.`);
        }
        const { storageId } = (await upload.json()) as {
          storageId: Id<"_storage">;
        };
        mediaAttachments.push({
          storageId,
          mediaType: mediaKindFor(file),
          filename: file.name,
          size: file.size,
          order: index,
        });
      }

      const tagNames = tagInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      await createPost({
        title: title.trim(),
        body: body.trim() || undefined,
        plainTextExcerpt: excerptFromBody(body),
        subredditId: selectedSubredditId,
        tagNames,
        mediaAttachments,
      });

      setTitle("");
      setBody("");
      setTagInput("");
      setFiles([]);
      setComposeOpen(false);
    } catch (error) {
      setPostError(errorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateCommunity = async (event: React.FormEvent) => {
    event.preventDefault();
    setCommunityError(null);
    if (!canWrite) {
      setCommunityError(
        authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to create communities."
      );
      return;
    }
    if (!communityName.trim()) return;

    setIsCreatingCommunity(true);
    try {
      await createSubreddit({
        name: communityName.trim(),
        description: communityDesc.trim() || undefined,
      });
      setCommunityName("");
      setCommunityDesc("");
    } catch (error) {
      setCommunityError(errorMessage(error));
    } finally {
      setIsCreatingCommunity(false);
    }
  };

  const handleVote = async (postId: Id<"posts">, value: 1 | -1) => {
    setVoteError(null);
    if (!canWrite) {
      setVoteError(authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to vote.");
      return;
    }

    setVotingPostId(postId);
    try {
      await castVote({ postId, value });
    } catch (error) {
      setVoteError(errorMessage(error));
    } finally {
      setVotingPostId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Witty.Cafe
          </Link>
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Witty.Cafe"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen((value) => !value)}
            disabled={!isSignedIn}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            New post
          </button>
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-300">
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)_280px]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Communities</h2>
              <button
                type="button"
                onClick={() => {
                  setActiveSubreddit(null);
                  setActiveTag(null);
                }}
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                All
              </button>
            </div>
            <div className="mt-3 space-y-1">
              {(subreddits ?? []).map((community) => (
                <button
                  key={community._id}
                  type="button"
                  onClick={() => {
                    setActiveSubreddit(community.slug);
                    setActiveTag(null);
                    setSelectedSubredditIdOverride(community._id);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                    activeSubreddit === community.slug
                      ? "bg-slate-950 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="truncate">{community.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-bold text-slate-900">Create community</h2>
            <form onSubmit={handleCreateCommunity} className="mt-3 space-y-2">
              <input
                value={communityName}
                onChange={(event) => setCommunityName(event.target.value)}
                placeholder="Name"
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              />
              <textarea
                value={communityDesc}
                onChange={(event) => setCommunityDesc(event.target.value)}
                placeholder="Description"
                rows={3}
                className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              {communityError ? (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {communityError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!canWrite || isCreatingCommunity}
                className="h-9 w-full rounded-md bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isCreatingCommunity ? "Creating…" : authPending ? "Signing in…" : "Create"}
              </button>
            </form>
          </section>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  {activeSubredditDoc?.name ?? "All Witty.Cafe"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {filteredPosts.length} posts
                  {activeTag ? ` filtered by ${activeTag}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((value) => !value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                >
                  Filters
                </button>
                <button
                  type="button"
                  onClick={() => setComposeOpen((value) => !value)}
                  className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Post
                </button>
              </div>
            </div>

            {showFilters ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTag(null);
                      setActiveSubreddit(null);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      !activeTag && !activeSubreddit
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 text-slate-700"
                    }`}
                  >
                    Everything
                  </button>
                  {(tags ?? []).map((tag) => (
                    <button
                      key={tag._id}
                      type="button"
                      onClick={() => {
                        setActiveTag(tag.slug);
                        setActiveSubreddit(null);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                        activeTag === tag.slug
                          ? "bg-slate-950 text-white"
                          : "border border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {composeOpen ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <form onSubmit={handleCreatePost} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Title"
                    className="h-11 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                    required
                  />
                  <select
                    value={selectedSubredditId ?? ""}
                    onChange={(event) =>
                      setSelectedSubredditIdOverride(
                        event.target.value
                          ? (event.target.value as Id<"subreddits">)
                          : null
                      )
                    }
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                    required
                  >
                    <option value="" disabled>
                      Community
                    </option>
                    {(subreddits ?? []).map((community) => (
                      <option key={community._id} value={community._id}>
                        {community.name}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write your post"
                  rows={8}
                  className="w-full resize-y rounded-md border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-slate-400"
                />
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder="Optional tags"
                    className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                  />
                  <label className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    Attach media
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*"
                      multiple
                      className="sr-only"
                      onChange={(event) =>
                        setFiles(Array.from(event.target.files ?? []))
                      }
                    />
                  </label>
                </div>
                {files.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {files.map((file) => (
                      <span
                        key={`${file.name}-${file.size}`}
                        className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                {postError ? (
                  <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {postError}
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setComposeOpen(false)}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canWrite || isPublishing}
                    className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isPublishing ? "Publishing…" : authPending ? "Signing in…" : "Publish"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {voteError ? (
            <p className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {voteError}
            </p>
          ) : null}

          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <article
                key={post._id}
                className="rounded-lg border border-slate-200 bg-white transition hover:border-slate-300"
              >
                <div className="flex gap-3 p-3 sm:p-4">
                  <VoteRail
                    post={post}
                    canWrite={canWrite}
                    busy={votingPostId === post._id}
                    onVote={(value) => handleVote(post._id, value)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => {
                          if (post.subreddit?.slug) {
                            setActiveSubreddit(post.subreddit.slug);
                            setActiveTag(null);
                          }
                        }}
                        className="font-bold text-slate-700 hover:text-slate-950"
                      >
                        {post.subreddit?.name ?? "Unknown community"}
                      </button>
                      <span>{formatDate(post.createdAt)}</span>
                      {post.author?.name ? <span>by {post.author.name}</span> : null}
                    </div>
                    <Link
                      href={`/post/${post._id}`}
                      className="mt-2 block text-lg font-bold leading-snug text-slate-950 hover:text-slate-700"
                    >
                      {post.title}
                    </Link>
                    {post.plainTextExcerpt ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                        {post.plainTextExcerpt}
                      </p>
                    ) : null}
                    <MediaGallery items={post.media} compact />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <Link
                        href={`/post/${post._id}`}
                        className="rounded-md px-2 py-1 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        {post.commentCount ?? 0} comments
                      </Link>
                      <Link
                        href={`/post/${post._id}`}
                        className="rounded-md px-2 py-1 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {posts && filteredPosts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No posts match this view.
              </div>
            ) : null}
            {!posts ? (
              <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Loading posts…
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Live status</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Auth</span>
                <span className="font-semibold text-slate-900">
                  {canWrite ? "Ready" : authPending ? "Syncing" : "Browse"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Communities</span>
                <span className="font-semibold text-slate-900">
                  {subreddits?.length ?? "…"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Showing</span>
                <span className="font-semibold text-slate-900">
                  {filteredPosts.length}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Current view</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeSubredditDoc ? (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {activeSubredditDoc.name}
                </span>
              ) : null}
              {activeTag ? (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {activeTag}
                </span>
              ) : null}
              {!activeSubredditDoc && !activeTag ? (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Everything
                </span>
              ) : null}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
