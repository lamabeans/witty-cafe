"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type {
  AudienceSummary,
  EnrichedPost,
  FlavorSummary,
  ReactionKind,
} from "../convex/types";
import {
  MediaStrip,
  MediaViewer,
  ReactionBar,
  formatCount,
  reactionTotal,
} from "./components/WittyMedia";

type MediaKind = "image" | "video" | "audio" | "model3d" | "game" | "unknown";
type SortMode = "hot" | "new" | "top";
type FeedMediaLayout = "compact" | "hero";
type ThemeMode = "light" | "dark";

type FlavorOption = FlavorSummary & {
  _creationTime?: number;
  sortOrder?: number;
};

type AudienceOption = AudienceSummary & {
  _creationTime?: number;
  sortOrder?: number;
};

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
  return `${plain.slice(0, 219).trimEnd()}...`;
}

function mediaKindFor(file: File): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.name.toLowerCase().endsWith(".obj") || file.name.toLowerCase().endsWith(".gltf") || file.name.toLowerCase().endsWith(".glb")) {
    return "model3d";
  }
  if (file.type === "text/html" || file.name.toLowerCase().endsWith(".html")) return "game";
  return "unknown";
}

function postReactionTotal(post: EnrichedPost) {
  return reactionTotal(post.reactionCounts);
}

function visibleMediaCount(post: EnrichedPost) {
  return post.media.filter((item) => item.url).length;
}

function AppHeader({
  search,
  setSearch,
  isSignedIn,
  dark,
  onToggleDark,
  onOpenCompose,
}: {
  search: string;
  setSearch: (value: string) => void;
  isSignedIn: boolean | undefined;
  dark: boolean;
  onToggleDark: () => void;
  onOpenCompose: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-[var(--stroke)] bg-[var(--surface)]">
      <div className="mx-auto flex h-16 w-full max-w-[920px] items-center gap-3 px-4">
        <Link href="/" className="block min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/witty-cafe-logo.png"
            alt="Witty.Cafe"
            className="h-10 w-[158px] object-contain object-left"
          />
        </Link>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search ideas, collections, vibes"
          className="wc-input hidden h-10 min-w-0 flex-1 px-3 text-sm sm:block"
        />
        <Link href="/collections" className="wc-button hidden sm:inline-flex">
          Collections
        </Link>
        <button type="button" onClick={onToggleDark} className="wc-button">
          {dark ? "Light" : "Dark"}
        </button>
        <button
          type="button"
          onClick={onOpenCompose}
          disabled={!isSignedIn}
          className="wc-button wc-button-primary"
        >
          + Post
        </button>
        {isSignedIn ? (
          <UserButton />
        ) : (
          <SignInButton mode="modal">
            <button className="wc-button">Sign in</button>
          </SignInButton>
        )}
      </div>
      <div className="mx-auto block max-w-[920px] px-4 pb-3 sm:hidden">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search Witty.Cafe"
          className="wc-input h-10 w-full px-3 text-sm"
        />
      </div>
    </header>
  );
}

function FlavorNav({
  flavors,
  activeFlavor,
  setActiveFlavor,
}: {
  flavors: FlavorOption[] | undefined;
  activeFlavor: string | null;
  setActiveFlavor: (slug: string | null) => void;
}) {
  return (
    <nav className="border-b-2 border-[var(--stroke)] bg-[var(--surface)]">
      <div className="mx-auto flex h-14 max-w-[920px] items-center gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => setActiveFlavor(null)}
          className={`wc-button shrink-0 ${!activeFlavor ? "wc-button-active" : ""}`}
        >
          All
        </button>
        {(flavors ?? []).map((flavor) => (
          <button
            key={flavor.slug}
            type="button"
            onClick={() => setActiveFlavor(flavor.slug)}
            className={`wc-button shrink-0 ${
              activeFlavor === flavor.slug ? "wc-button-active" : ""
            }`}
            title={flavor.description}
          >
            <span>{flavor.name}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function SortBar({
  sort,
  setSort,
  count,
}: {
  sort: SortMode;
  setSort: (mode: SortMode) => void;
  count: number;
}) {
  const sorts: SortMode[] = ["hot", "new", "top"];
  return (
    <div className="mb-5 flex items-center gap-2">
      <span className="flex-1 text-sm font-bold text-[var(--muted)]">
        {count} ideas brewing
      </span>
      {sorts.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setSort(mode)}
          className={`rounded-lg border-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] ${
            sort === mode
              ? "border-[var(--stroke)] bg-[var(--ink)] text-[var(--surface)]"
              : "border-transparent text-[var(--muted)]"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

function PostCard({
  post,
  canWrite,
  mediaLayout,
  busy,
  onReact,
  onOpenMedia,
}: {
  post: EnrichedPost;
  canWrite: boolean;
  mediaLayout: FeedMediaLayout;
  busy: boolean;
  onReact: (postId: Id<"posts">, kind: ReactionKind) => void;
  onOpenMedia: (post: EnrichedPost, index: number) => void;
}) {
  return (
    <article className="wc-card overflow-hidden transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--magenta)]">
      <div className="px-5 py-4 sm:px-6">
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
              className="text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)]"
            >
              {post.collection.name}
            </Link>
          ) : (
            <span className="text-xs font-bold text-[var(--muted)]">
              Unsorted collection
            </span>
          )}
          <span className="ml-auto text-xs font-bold text-[var(--faint)]">
            {formatDate(post.createdAt)}
          </span>
        </div>
        <Link
          href={`/post/${post._id}`}
          className="font-display block text-[1.45rem] font-black leading-tight text-[var(--ink)] sm:text-[1.65rem]"
        >
          {post.title}
        </Link>
        {post.plainTextExcerpt ? (
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[var(--muted)]">
            {post.plainTextExcerpt}
          </p>
        ) : null}
      </div>

      <div className="px-5 pb-4 sm:px-6">
        <MediaStrip
          items={post.media}
          layout={mediaLayout}
          onOpen={(index) => onOpenMedia(post, index)}
        />
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-[var(--stroke)] bg-[var(--canvas-2)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <ReactionBar
          counts={post.reactionCounts}
          viewerReaction={post.viewerReaction}
          canWrite={canWrite}
          busy={busy}
          compact
          onReact={(kind) => onReact(post._id, kind)}
        />
        <div className="flex flex-wrap gap-3 text-xs font-black text-[var(--muted)]">
          <Link href={`/post/${post._id}`}>{post.commentCount ?? 0} comments</Link>
          <span>{formatCount(postReactionTotal(post))} reactions</span>
          <span>{visibleMediaCount(post)} media</span>
        </div>
      </div>
    </article>
  );
}

function ComposePanel({
  collections,
  selectedCollectionId,
  setSelectedCollectionId,
  title,
  setTitle,
  body,
  setBody,
  vibeInput,
  setVibeInput,
  files,
  setFiles,
  filePreviews,
  canWrite,
  authPending,
  isPublishing,
  postError,
  onSubmit,
  onCancel,
}: {
  collections: Array<Doc<"collections">> | undefined;
  selectedCollectionId: Id<"collections"> | null;
  setSelectedCollectionId: (id: Id<"collections"> | null) => void;
  title: string;
  setTitle: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  vibeInput: string;
  setVibeInput: (value: string) => void;
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
  filePreviews: { file: File; kind: MediaKind; url: string | null }[];
  canWrite: boolean;
  authPending: boolean;
  isPublishing: boolean;
  postError: string | null;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <section className="wc-card p-4 sm:p-5">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="wc-input h-12 text-sm font-bold"
            required
          />
          <select
            value={selectedCollectionId ?? ""}
            onChange={(event) =>
              setSelectedCollectionId(
                event.target.value ? (event.target.value as Id<"collections">) : null
              )
            }
            className="wc-input h-12 text-sm font-bold"
            required
          >
            <option value="" disabled>
              Collection
            </option>
            {(collections ?? []).map((collection) => (
              <option key={collection._id} value={collection._id}>
                {collection.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write the idea, line, message, joke, quote, or prompt"
          rows={7}
          className="wc-input w-full resize-y text-sm font-semibold leading-6"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={vibeInput}
            onChange={(event) => setVibeInput(event.target.value)}
            placeholder="Vibes: funny, warm, formal"
            className="wc-input h-11 text-sm font-bold"
          />
          <label className="wc-button h-11 cursor-pointer rounded-[10px]">
            Attach media
            <input
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              className="sr-only"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>
        </div>
        {files.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filePreviews.map((preview) => (
              <div key={`${preview.file.name}-${preview.file.size}`} className="wc-card-sm overflow-hidden">
                {preview.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={preview.file.name}
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-32 place-items-center bg-[var(--yellow-soft)] text-sm font-black text-black">
                    {preview.kind.toUpperCase()}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 border-t-2 border-[var(--stroke)] bg-[var(--surface)] px-3 py-2">
                  <span className="truncate text-xs font-bold">{preview.file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((file) => file !== preview.file)
                      )
                    }
                    className="text-xs font-black text-[var(--muted)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {postError ? (
          <p className="rounded-lg border-2 border-[var(--stroke)] bg-[var(--magenta-soft)] px-3 py-2 text-sm font-bold text-black">
            {postError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="wc-button">
            Cancel
          </button>
          <button type="submit" disabled={!canWrite || isPublishing} className="wc-button wc-button-primary">
            {isPublishing ? "Publishing" : authPending ? "Signing in" : "Publish"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } =
    useConvexAuth();
  const canWrite = Boolean(isLoaded && isSignedIn && isConvexAuthenticated);
  const authPending = Boolean(isLoaded && isSignedIn && isConvexLoading);

  const flavors = useQuery(api.flavors.list) as FlavorOption[] | undefined;
  const audiences = useQuery(api.audiences.list) as AudienceOption[] | undefined;
  const collections = useQuery(api.collections.list) as
    | Array<Doc<"collections">>
    | undefined;
  const vibes = useQuery(api.tags.list) as Array<Doc<"tags">> | undefined;
  const preferences = useQuery(api.users.viewerPreferences);

  const [activeFlavor, setActiveFlavor] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [activeAudience, setActiveAudience] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortMode>("hot");
  const [search, setSearch] = useState("");
  const [feedLayout, setFeedLayout] = useState<FeedMediaLayout>("compact");
  const [theme, setTheme] = useState<ThemeMode>("light");

  const posts = useQuery(api.posts.list, {
    flavorSlug: activeFlavor ?? undefined,
    collectionSlug: activeCollection ?? undefined,
    tagSlug: activeVibe ?? undefined,
    audienceSlug: activeAudience ?? undefined,
    sort,
    limit: 70,
  }) as EnrichedPost[] | undefined;

  const createPost = useMutation(api.posts.create);
  const createCollection = useMutation(api.collections.create);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const togglePostReaction = useMutation(api.reactions.togglePost);
  const toggleMediaReaction = useMutation(api.reactions.toggleMedia);
  const setPreferences = useMutation(api.users.setPreferences);

  const activeCollectionDoc = collections?.find(
    (collection) => collection.slug === activeCollection
  );
  const [selectedCollectionIdOverride, setSelectedCollectionIdOverride] =
    useState<Id<"collections"> | null>(null);
  const selectedCollectionId =
    selectedCollectionIdOverride ??
    activeCollectionDoc?._id ??
    collections?.[0]?._id ??
    null;

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [vibeInput, setVibeInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<
    { file: File; kind: MediaKind; url: string | null }[]
  >([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [collectionName, setCollectionName] = useState("");
  const [collectionDesc, setCollectionDesc] = useState("");
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const [reactionError, setReactionError] = useState<string | null>(null);
  const [busyReaction, setBusyReaction] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ postId: Id<"posts">; index: number } | null>(
    null
  );

  useEffect(() => {
    const previews = files.map((file) => ({
      file,
      kind: mediaKindFor(file),
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setFilePreviews(previews);

    return () => {
      for (const preview of previews) {
        if (preview.url) URL.revokeObjectURL(preview.url);
      }
    };
  }, [files]);

  useEffect(() => {
    if (!preferences) return;
    setFeedLayout(preferences.feedMediaLayout ?? "compact");
    setTheme(preferences.darkModePreference === "dark" ? "dark" : "light");
  }, [preferences]);

  useEffect(() => {
    document.documentElement.setAttribute("data-witty-theme", theme);
  }, [theme]);

  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    const query = search.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.plainTextExcerpt,
        post.collection?.name,
        post.flavor.name,
        post.audiences.map((audience) => audience.name).join(" "),
        post.vibes.map((vibe) => `${vibe.name} ${vibe.slug}`).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [posts, search]);

  const viewerPost = viewer
    ? filteredPosts.find((post) => post._id === viewer.postId) ??
      posts?.find((post) => post._id === viewer.postId)
    : null;

  const handleCreatePost = async (event: FormEvent) => {
    event.preventDefault();
    setPostError(null);
    if (!canWrite) {
      setPostError(authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to post.");
      return;
    }
    if (!selectedCollectionId) {
      setPostError("Choose a Collection first.");
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
        if (!upload.ok) throw new Error(`Could not upload ${file.name}.`);
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

      const tagNames = vibeInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      await createPost({
        title: title.trim(),
        body: body.trim() || undefined,
        plainTextExcerpt: excerptFromBody(body),
        collectionId: selectedCollectionId,
        tagNames,
        mediaAttachments,
      });

      setTitle("");
      setBody("");
      setVibeInput("");
      setFiles([]);
      setComposeOpen(false);
    } catch (error) {
      setPostError(errorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateCollection = async (event: FormEvent) => {
    event.preventDefault();
    setCollectionError(null);
    if (!canWrite) {
      setCollectionError(
        authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to create Collections."
      );
      return;
    }
    if (!collectionName.trim()) return;

    setIsCreatingCollection(true);
    try {
      await createCollection({
        name: collectionName.trim(),
        description: collectionDesc.trim() || undefined,
      });
      setCollectionName("");
      setCollectionDesc("");
    } catch (error) {
      setCollectionError(errorMessage(error));
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handlePostReaction = async (postId: Id<"posts">, kind: ReactionKind) => {
    setReactionError(null);
    if (!canWrite) {
      setReactionError(authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to react.");
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
      setReactionError(authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to react.");
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

  const handleFeedLayout = async (layout: FeedMediaLayout) => {
    setFeedLayout(layout);
    if (canWrite) {
      await setPreferences({ feedMediaLayout: layout });
    }
  };

  const handleThemeToggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (canWrite) {
      await setPreferences({ darkModePreference: next });
    }
  };

  return (
    <div data-witty-theme={theme} className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <AppHeader
        search={search}
        setSearch={setSearch}
        isSignedIn={isSignedIn}
        dark={theme === "dark"}
        onToggleDark={handleThemeToggle}
        onOpenCompose={() => setComposeOpen((value) => !value)}
      />
      <FlavorNav
        flavors={flavors}
        activeFlavor={activeFlavor}
        setActiveFlavor={(slug) => {
          setActiveFlavor(slug);
          setActiveCollection(null);
        }}
      />

      <main className="relative z-10 mx-auto w-full max-w-[920px] px-4 py-8">
        <section className="mb-8">
          <div className="relative">
            <div className="absolute right-0 top-0 hidden h-16 w-16 rotate-[8deg] place-items-center rounded-full border-2 border-[var(--stroke)] bg-[var(--yellow)] text-xl font-black text-black shadow-[3px_3px_0_var(--magenta)] sm:grid">
              cafe
            </div>
            <h1 className="font-display max-w-2xl text-5xl font-black leading-none tracking-tight sm:text-6xl">
              Ideas worth sharing.
              <br />
              <span className="italic text-[var(--magenta)]">
                Media worth loving.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base font-bold leading-7 text-[var(--muted)]">
              Browse Flavours, Collections, Vibes and Audiences. Each post pairs
              useful wording with images, video, audio, 3D models, and video games.
            </p>
          </div>
        </section>

        <section className="mb-5 wc-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className="wc-button shrink-0"
            >
              {showFilters ? "Hide filters" : "Filters"}
            </button>
            <select
              value={activeCollection ?? ""}
              onChange={(event) => {
                setActiveCollection(event.target.value || null);
                setActiveFlavor(null);
              }}
              className="wc-input h-11 min-w-0 flex-1 text-sm font-bold"
            >
              <option value="">All Collections</option>
              {(collections ?? []).map((collection) => (
                <option key={collection._id} value={collection.slug}>
                  {collection.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleFeedLayout("compact")}
                className={`wc-button ${feedLayout === "compact" ? "wc-button-active" : ""}`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => handleFeedLayout("hero")}
                className={`wc-button ${feedLayout === "hero" ? "wc-button-active" : ""}`}
              >
                Hero
              </button>
            </div>
          </div>
          {showFilters ? (
            <div className="mt-4 grid gap-4 border-t-2 border-dashed border-[var(--stroke-soft)] pt-4 md:grid-cols-2">
              <div>
                <h2 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  Audience
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAudience(null)}
                    className={`wc-button ${!activeAudience ? "wc-button-active" : ""}`}
                  >
                    All
                  </button>
                  {(audiences ?? []).map((audience) => (
                    <button
                      key={audience.slug}
                      type="button"
                      onClick={() => setActiveAudience(audience.slug)}
                      className={`wc-button ${
                        activeAudience === audience.slug ? "wc-button-active" : ""
                      }`}
                    >
                      {audience.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  Vibe
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveVibe(null)}
                    className={`wc-button ${!activeVibe ? "wc-button-active" : ""}`}
                  >
                    All
                  </button>
                  {(vibes ?? []).map((vibe) => (
                    <button
                      key={vibe._id}
                      type="button"
                      onClick={() => setActiveVibe(vibe.slug)}
                      className={`wc-button ${
                        activeVibe === vibe.slug ? "wc-button-active" : ""
                      }`}
                    >
                      {vibe.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {composeOpen ? (
          <div className="mb-5">
            <ComposePanel
              collections={collections}
              selectedCollectionId={selectedCollectionId}
              setSelectedCollectionId={setSelectedCollectionIdOverride}
              title={title}
              setTitle={setTitle}
              body={body}
              setBody={setBody}
              vibeInput={vibeInput}
              setVibeInput={setVibeInput}
              files={files}
              setFiles={setFiles}
              filePreviews={filePreviews}
              canWrite={canWrite}
              authPending={authPending}
              isPublishing={isPublishing}
              postError={postError}
              onSubmit={handleCreatePost}
              onCancel={() => setComposeOpen(false)}
            />
          </div>
        ) : null}

        {reactionError ? (
          <p className="mb-4 rounded-lg border-2 border-[var(--stroke)] bg-[var(--magenta-soft)] px-4 py-3 text-sm font-black text-black">
            {reactionError}
          </p>
        ) : null}

        <SortBar sort={sort} setSort={setSort} count={filteredPosts.length} />

        <div className="space-y-5">
          {filteredPosts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              canWrite={canWrite}
              mediaLayout={feedLayout}
              busy={busyReaction === `post:${post._id}`}
              onReact={handlePostReaction}
              onOpenMedia={(targetPost, index) =>
                setViewer({ postId: targetPost._id, index })
              }
            />
          ))}
          {posts && filteredPosts.length === 0 ? (
            <div className="wc-card p-10 text-center text-sm font-bold text-[var(--muted)]">
              No ideas match this view yet.
            </div>
          ) : null}
          {!posts ? (
            <div className="wc-card p-10 text-center text-sm font-bold text-[var(--muted)]">
              Loading ideas...
            </div>
          ) : null}
        </div>

        <section className="mt-8 wc-card p-4">
          <h2 className="font-display text-2xl font-black">Create a Collection</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Collections are focused shelves inside the cafe, like Yo Mama Jokes
            or Engagement Congratulations.
          </p>
          <form onSubmit={handleCreateCollection} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              placeholder="Collection name"
              className="wc-input h-11 text-sm font-bold"
            />
            <input
              value={collectionDesc}
              onChange={(event) => setCollectionDesc(event.target.value)}
              placeholder="Description"
              className="wc-input h-11 text-sm font-bold"
            />
            <button
              type="submit"
              disabled={!canWrite || isCreatingCollection}
              className="wc-button wc-button-primary"
            >
              {isCreatingCollection ? "Creating" : "Create"}
            </button>
          </form>
          {collectionError ? (
            <p className="mt-3 rounded-lg bg-[var(--magenta-soft)] px-3 py-2 text-sm font-bold text-black">
              {collectionError}
            </p>
          ) : null}
        </section>
      </main>

      {viewerPost && viewer ? (
        <MediaViewer
          items={viewerPost.media}
          activeIndex={viewer.index}
          title={viewerPost.title}
          canWrite={canWrite}
          busy={
            Boolean(viewerPost.media[viewer.index]) &&
            busyReaction === `media:${viewerPost.media[viewer.index]._id}`
          }
          onClose={() => setViewer(null)}
          onSelect={(index) => setViewer({ postId: viewerPost._id, index })}
          onReact={handleMediaReaction}
        />
      ) : null}
    </div>
  );
}
