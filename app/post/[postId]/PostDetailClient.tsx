"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  EnrichedComment,
  EnrichedPost,
  ReactionKind,
} from "../../../convex/types";
import {
  MediaStrip,
  MediaViewer,
  ReactionBar,
  formatCount,
  reactionTotal,
} from "../../components/WittyMedia";
import { RichTextContent } from "../../components/RichTextContent";

type ThemeMode = "light" | "dark";
type GenerationMediaType = "image" | "audio" | "video" | "model3d" | "game";
type GenerationProvider =
  | "openai"
  | "gemini"
  | "elevenlabs"
  | "kimi"
  | "anthropic";
type GenerationStatus = "queued" | "processing" | "completed" | "failed";

type GenerationJob = {
  _id: Id<"mediaGenerations">;
  mediaType: GenerationMediaType;
  provider: string;
  preset: string;
  model: string;
  status: GenerationStatus;
  progress: number | null;
  error: string | null;
  mediaItemId: Id<"mediaItems"> | null;
  createdAt: number;
  completedAt: number | null;
};

type GenerationViewerStatus = {
  canGenerate: boolean;
  reason: string | null;
  quotaLimit: number;
  quotaUsed: number;
  quotaRemaining: number;
  jobs: GenerationJob[];
};

const GENERATION_PRESETS: Record<
  GenerationMediaType,
  Array<{ value: string; label: string }>
> = {
  image: [
    { value: "poster", label: "Poster" },
    { value: "playful", label: "Playful" },
    { value: "minimal", label: "Minimal" },
  ],
  audio: [
    { value: "warm", label: "Warm voice" },
    { value: "bright", label: "Bright voice" },
    { value: "dramatic", label: "Dramatic voice" },
  ],
  video: [
    { value: "animated-text", label: "Animated text" },
    { value: "cafe", label: "Cafe mood" },
    { value: "cinematic", label: "Cinematic" },
  ],
  model3d: [
    { value: "prop", label: "Prop" },
    { value: "character", label: "Character" },
    { value: "scene", label: "Scene" },
  ],
  game: [
    { value: "arcade", label: "Arcade" },
    { value: "puzzle", label: "Puzzle" },
    { value: "story", label: "Story" },
  ],
};

const MEDIA_TYPE_LABELS: Record<GenerationMediaType, string> = {
  image: "Image",
  audio: "Spoken Audio",
  video: "Video",
  model3d: "3D Model",
  game: "Video Game",
};

const PROVIDER_LABELS: Record<GenerationProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  elevenlabs: "ElevenLabs",
  kimi: "Kimi + OpenAI",
  anthropic: "Anthropic + OpenAI",
};

const GENERATION_PROVIDERS: Record<
  GenerationMediaType,
  Array<{ value: GenerationProvider; label: string; description: string }>
> = {
  image: [
    { value: "openai", label: "OpenAI image", description: "GPT image model" },
    { value: "gemini", label: "Gemini image", description: "Gemini image model" },
    { value: "kimi", label: "Kimi assisted", description: "Kimi prompt, OpenAI render" },
    {
      value: "anthropic",
      label: "Anthropic assisted",
      description: "Claude prompt, OpenAI render",
    },
  ],
  audio: [
    { value: "openai", label: "OpenAI voice", description: "OpenAI TTS" },
    { value: "gemini", label: "Gemini voice", description: "Gemini TTS" },
    { value: "elevenlabs", label: "ElevenLabs", description: "ElevenLabs TTS" },
    { value: "kimi", label: "Kimi assisted", description: "Kimi script, OpenAI voice" },
    {
      value: "anthropic",
      label: "Anthropic assisted",
      description: "Claude script, OpenAI voice",
    },
  ],
  video: [
    { value: "openai", label: "OpenAI video", description: "Sora model" },
    { value: "gemini", label: "Gemini video", description: "Veo model" },
    { value: "kimi", label: "Kimi assisted", description: "Kimi prompt, OpenAI render" },
    {
      value: "anthropic",
      label: "Anthropic assisted",
      description: "Claude prompt, OpenAI render",
    },
  ],
  model3d: [
    { value: "openai", label: "OpenAI 3D model", description: "OBJ artifact" },
    { value: "gemini", label: "Gemini 3D model", description: "OBJ artifact" },
    { value: "kimi", label: "Kimi assisted", description: "Kimi prompt, OpenAI artifact" },
    {
      value: "anthropic",
      label: "Anthropic assisted",
      description: "Claude prompt, OpenAI artifact",
    },
  ],
  game: [
    { value: "openai", label: "OpenAI game", description: "Playable HTML" },
    { value: "gemini", label: "Gemini game", description: "Playable HTML" },
    { value: "kimi", label: "Kimi assisted", description: "Kimi prompt, OpenAI game" },
    {
      value: "anthropic",
      label: "Anthropic assisted",
      description: "Claude prompt, OpenAI game",
    },
  ],
};

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function postReactionTotal(post: EnrichedPost) {
  return reactionTotal(post.reactionCounts);
}

function visibleMedia(post: EnrichedPost | null | undefined) {
  return post?.media.filter((item) => item.url) ?? [];
}

function statusLabel(status: GenerationStatus, progress: number | null) {
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "processing") {
    return progress ? `Processing ${Math.round(progress)}%` : "Processing";
  }
  return "Queued";
}

function AiMediaPanel({
  postId,
  canWrite,
  authPending,
}: {
  postId: Id<"posts">;
  canWrite: boolean;
  authPending: boolean;
}) {
  const status = useQuery(api.mediaGeneration.viewerStatus, { postId }) as
    | GenerationViewerStatus
    | undefined;
  const requestGeneration = useAction(api.mediaGeneration.request);
  const [mediaType, setMediaType] = useState<GenerationMediaType>("image");
  const [presetByType, setPresetByType] = useState<
    Record<GenerationMediaType, string>
  >({
    image: "poster",
    audio: "warm",
    video: "animated-text",
    model3d: "prop",
    game: "arcade",
  });
  const [providerByType, setProviderByType] = useState<
    Record<GenerationMediaType, GenerationProvider>
  >({
    image: "openai",
    audio: "openai",
    video: "openai",
    model3d: "openai",
    game: "openai",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const activePreset = presetByType[mediaType];
  const activeProvider = providerByType[mediaType];
  const disabled =
    !canWrite || !status?.canGenerate || isGenerating || status === undefined;
  const reason = authPending
    ? "Finishing sign-in."
    : status?.reason ??
      (!canWrite ? "Sign in to generate AI media." : null);

  const handleGenerate = async () => {
    setGenerationError(null);
    if (disabled) {
      if (reason) setGenerationError(reason);
      return;
    }

    setIsGenerating(true);
    try {
      await requestGeneration({
        postId,
        mediaType,
        preset: activePreset,
        provider: activeProvider,
      });
    } catch (error) {
      setGenerationError(errorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="wc-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-black">AI Media</h2>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
            Generate from this post text. Free beta:{" "}
            {status ? `${status.quotaRemaining}/${status.quotaLimit}` : "..."} left today.
          </p>
        </div>
        <span className="rounded-full border-2 border-black bg-[var(--yellow)] px-2 py-1 text-[10px] font-black text-black">
          beta
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(MEDIA_TYPE_LABELS) as GenerationMediaType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setMediaType(type)}
            className={`wc-button min-h-9 px-2 py-1 text-[11px] ${
              mediaType === type ? "wc-button-active" : ""
            }`}
          >
            {MEDIA_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <select
        value={activeProvider}
        onChange={(event) =>
          setProviderByType((current) => ({
            ...current,
            [mediaType]: event.target.value as GenerationProvider,
          }))
        }
        className="wc-input mt-3 h-10 w-full text-sm font-bold"
      >
        {GENERATION_PROVIDERS[mediaType].map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label} - {provider.description}
          </option>
        ))}
      </select>

      <select
        value={activePreset}
        onChange={(event) =>
          setPresetByType((current) => ({
            ...current,
            [mediaType]: event.target.value,
          }))
        }
        className="wc-input mt-3 h-10 w-full text-sm font-bold"
      >
        {GENERATION_PRESETS[mediaType].map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={disabled}
        onClick={handleGenerate}
        className="wc-button wc-button-primary mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating
          ? mediaType === "video"
            ? "Starting video"
            : "Generating"
          : `Generate ${MEDIA_TYPE_LABELS[mediaType]}`}
      </button>

      {reason ? (
        <p className="mt-3 text-xs font-bold leading-5 text-[var(--muted)]">
          {reason}
        </p>
      ) : null}
      {generationError ? (
        <p className="mt-3 rounded-lg border-2 border-[var(--stroke)] bg-[var(--magenta-soft)] px-3 py-2 text-xs font-bold text-black">
          {generationError}
        </p>
      ) : null}

      {status?.jobs.length ? (
        <div className="mt-4 space-y-2 border-t-2 border-dashed border-[var(--stroke-soft)] pt-3">
          {status.jobs.slice(0, 4).map((job) => (
            <div
              key={job._id}
              className="rounded-lg border-2 border-[var(--stroke)] bg-[var(--canvas-2)] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-black">
                <span>{MEDIA_TYPE_LABELS[job.mediaType]}</span>
                <span>{statusLabel(job.status, job.progress)}</span>
              </div>
              <p className="mt-1 truncate text-[11px] font-bold text-[var(--muted)]">
                {job.preset} ·{" "}
                {PROVIDER_LABELS[job.provider as GenerationProvider] ??
                  job.provider}{" "}
                · {job.model}
              </p>
              {job.error ? (
                <p className="mt-1 text-[11px] font-bold text-[var(--magenta)]">
                  {job.error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] font-bold leading-5 text-[var(--faint)]">
        Generated media is AI-created and attaches to this public post when ready.
      </p>
    </section>
  );
}

type PostDetailClientProps = {
  postId: Id<"posts">;
  initialPost: EnrichedPost | null;
};

export default function PostDetailClient({
  postId,
  initialPost,
}: PostDetailClientProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } =
    useConvexAuth();
  const canWrite = Boolean(isLoaded && isSignedIn && isConvexAuthenticated);
  const authPending = Boolean(isLoaded && isSignedIn && isConvexLoading);

  const livePost = useQuery(api.posts.get, { postId }) as
    | EnrichedPost
    | null
    | undefined;
  const post = livePost === undefined ? initialPost : livePost;
  const comments = useQuery(api.comments.listByPost, { postId }) as
    | EnrichedComment[]
    | undefined;
  const preferences = useQuery(api.users.viewerPreferences);
  const createComment = useMutation(api.comments.create);
  const togglePostReaction = useMutation(api.reactions.togglePost);
  const toggleMediaReaction = useMutation(api.reactions.toggleMedia);
  const setPreferences = useMutation(api.users.setPreferences);

  const [theme, setTheme] = useState<ThemeMode>("light");
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [isCommenting, setIsCommenting] = useState(false);
  const [busyReaction, setBusyReaction] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!preferences) return;
    setTheme(preferences.darkModePreference === "dark" ? "dark" : "light");
  }, [preferences]);

  useEffect(() => {
    document.documentElement.setAttribute("data-witty-theme", theme);
  }, [theme]);

  const mediaItems = useMemo(() => visibleMedia(post), [post]);
  const activeMedia = mediaIndex === null ? null : mediaItems[mediaIndex] ?? null;

  const handleThemeToggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (canWrite) {
      await setPreferences({ darkModePreference: next });
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCommentError(null);
    if (!canWrite) {
      setCommentError(
        authPending
          ? "Finishing sign-in. Try again in a moment."
          : "Sign in to comment."
      );
      return;
    }
    if (!commentBody.trim()) return;

    setIsCommenting(true);
    try {
      await createComment({ postId, body: commentBody.trim() });
      setCommentBody("");
    } catch (error) {
      setCommentError(errorMessage(error));
    } finally {
      setIsCommenting(false);
    }
  };

  const handlePostReaction = async (kind: ReactionKind) => {
    setReactionError(null);
    if (!canWrite) {
      setReactionError(
        authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to react."
      );
      return;
    }

    setBusyReaction(`post:${postId}`);
    try {
      await togglePostReaction({ postId, kind });
    } catch (error) {
      setReactionError(errorMessage(error));
    } finally {
      setBusyReaction(null);
    }
  };

  const handleMediaReaction = async (
    mediaItemId: Id<"mediaItems">,
    kind: ReactionKind
  ) => {
    setReactionError(null);
    if (!canWrite) {
      setReactionError(
        authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to react."
      );
      return;
    }

    setBusyReaction(`media:${mediaItemId}`);
    try {
      await toggleMediaReaction({ mediaItemId, kind });
    } catch (error) {
      setReactionError(errorMessage(error));
    } finally {
      setBusyReaction(null);
    }
  };

  if (post === null) {
    return (
      <div
        data-witty-theme={theme}
        className="min-h-screen bg-[var(--canvas)] px-4 py-16 text-[var(--ink)]"
      >
        <div className="wc-card mx-auto max-w-xl p-10 text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            Post not found
          </p>
          <Link href="/" className="wc-button mt-6 inline-flex">
            Back to the cafe
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-witty-theme={theme}
      className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]"
    >
      <header className="sticky top-0 z-40 border-b-2 border-[var(--stroke)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 w-full max-w-[1040px] items-center gap-3 px-4">
          <Link href="/" className="block min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/witty-cafe-logo.png"
              alt="Witty.Cafe"
              className="h-10 w-[158px] object-contain object-left"
            />
          </Link>
          <Link href="/" className="wc-button ml-auto">
            Feed
          </Link>
          <button type="button" onClick={handleThemeToggle} className="wc-button">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button className="wc-button">Sign in</button>
            </SignInButton>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1040px] gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-5">
          {post ? (
            <article className="wc-card overflow-hidden">
              <div className="border-b-2 border-[var(--stroke)] bg-[var(--surface)] px-5 py-5 sm:px-7">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full border-2 border-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-black"
                    style={{ background: post.flavor.color ?? "var(--yellow)" }}
                  >
                    {post.flavor.name}
                  </span>
                  {post.collection ? (
                    <Link
                      href={`/collections/${post.collection.slug}`}
                      className="text-xs font-black text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      {post.collection.name}
                    </Link>
                  ) : (
                    <span className="text-xs font-black text-[var(--muted)]">
                      Unsorted collection
                    </span>
                  )}
                  <span className="text-xs font-bold text-[var(--faint)]">
                    {formatDate(post.createdAt)}
                  </span>
                  {post.author?.name ? (
                    <span className="text-xs font-bold text-[var(--faint)]">
                      by {post.author.name}
                    </span>
                  ) : null}
                </div>
                <h1 className="font-display text-4xl font-black leading-none tracking-tight sm:text-5xl">
                  {post.title}
                </h1>
              </div>

              <div className="px-5 py-5 sm:px-7">
                <RichTextContent
                  content={post.contentJson}
                  fallback={post.legacyBody ?? post.body}
                  className="font-semibold text-[var(--ink)]"
                />

                <MediaStrip
                  items={post.media}
                  layout="hero"
                  onOpen={(index) => setMediaIndex(index)}
                />

                <div className="mt-6 flex flex-col gap-3 border-t-2 border-[var(--stroke)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <ReactionBar
                    counts={post.reactionCounts}
                    viewerReaction={post.viewerReaction}
                    canWrite={canWrite}
                    busy={busyReaction === `post:${post._id}`}
                    onReact={handlePostReaction}
                  />
                  <div className="flex flex-wrap gap-3 text-xs font-black text-[var(--muted)]">
                    <span>{formatCount(postReactionTotal(post))} reactions</span>
                    <span>{post.commentCount ?? 0} comments</span>
                    <span>{mediaItems.length} media</span>
                  </div>
                </div>
                {reactionError ? (
                  <p className="mt-3 rounded-lg border-2 border-[var(--stroke)] bg-[var(--magenta-soft)] px-3 py-2 text-sm font-bold text-black">
                    {reactionError}
                  </p>
                ) : null}
              </div>
            </article>
          ) : (
            <div className="wc-card p-10 text-center text-sm font-bold text-[var(--muted)]">
              Loading idea...
            </div>
          )}

          <section className="wc-card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-black">Discussion</h2>
              <span className="text-sm font-black text-[var(--muted)]">
                {comments?.length ?? 0} comments
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder={canWrite ? "Add to the conversation" : "Sign in to comment"}
                rows={4}
                disabled={!canWrite || isCommenting}
                className="wc-input w-full resize-y text-sm font-semibold leading-6 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {commentError ? (
                <p className="rounded-lg border-2 border-[var(--stroke)] bg-[var(--magenta-soft)] px-3 py-2 text-sm font-bold text-black">
                  {commentError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!canWrite || isCommenting || !commentBody.trim()}
                className="wc-button wc-button-primary"
              >
                {isCommenting ? "Posting" : authPending ? "Signing in" : "Comment"}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {(comments ?? []).map((comment) => (
                <div key={comment._id} className="wc-card-sm bg-[var(--canvas-2)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                    <span className="font-black text-[var(--ink)]">
                      {comment.author?.name ?? "Anonymous"}
                    </span>
                    <span>{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--muted)]">
                    {comment.body}
                  </p>
                </div>
              ))}
              {comments && comments.length === 0 ? (
                <p className="text-sm font-bold text-[var(--muted)]">
                  No comments yet.
                </p>
              ) : null}
            </div>
          </section>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AiMediaPanel
            postId={postId}
            canWrite={canWrite}
            authPending={authPending}
          />

          <section className="wc-card p-4">
            <h2 className="font-display text-2xl font-black">Idea Card</h2>
            <div className="mt-4 space-y-3 text-sm font-bold text-[var(--muted)]">
              <div className="flex items-center justify-between">
                <span>Collection</span>
                {post?.collection ? (
                  <Link
                    href={`/collections/${post.collection.slug}`}
                    className="text-right text-[var(--ink)] hover:text-[var(--magenta)]"
                  >
                    {post.collection.name}
                  </Link>
                ) : (
                  <span className="text-right text-[var(--ink)]">...</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span>Flavour</span>
                <span className="text-[var(--ink)]">{post?.flavor.name ?? "..."}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Audience</span>
                <span className="text-right text-[var(--ink)]">
                  {post?.audiences.map((audience) => audience.name).join(", ") ?? "..."}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Score</span>
                <span className="text-[var(--ink)]">{post?.score ?? "..."}</span>
              </div>
            </div>
          </section>

          {post?.vibes.length ? (
            <section className="wc-card p-4">
              <h2 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                Vibes
              </h2>
              <div className="flex flex-wrap gap-2">
                {post.vibes.map((vibe) => (
                  <span key={vibe.slug} className="wc-button pointer-events-none">
                    {vibe.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </main>

      {post && mediaIndex !== null ? (
        <MediaViewer
          items={post.media}
          activeIndex={mediaIndex}
          title={post.title}
          canWrite={canWrite}
          busy={activeMedia ? busyReaction === `media:${activeMedia._id}` : false}
          onClose={() => setMediaIndex(null)}
          onSelect={setMediaIndex}
          onReact={handleMediaReaction}
        />
      ) : null}
    </div>
  );
}
