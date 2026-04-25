"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default function Home() {
  const { isSignedIn } = useAuth();
  const subreddits = useQuery(api.subreddits.list);
  const tags = useQuery(api.tags.list);
  const [activeSubreddit, setActiveSubreddit] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const posts = useQuery(api.posts.list, {
    subredditSlug: activeSubreddit ?? undefined,
    tagSlug: activeTag ?? undefined,
    limit: 60,
  });

  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    const query = search.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post: any) => {
      const haystack = [
        post.title,
        post.body,
        post.subreddit?.name,
        post.tags?.map((tag: any) => tag.name).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [posts, search]);

  const createPost = useMutation(api.posts.create);
  const castVote = useMutation(api.votes.cast);
  const createSubreddit = useMutation(api.subreddits.create);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [selectedSubredditId, setSelectedSubredditId] = useState<string | null>(null);

  const [communityName, setCommunityName] = useState("");
  const [communityDesc, setCommunityDesc] = useState("");

  useEffect(() => {
    if (!selectedSubredditId && subreddits && subreddits.length > 0) {
      setSelectedSubredditId(subreddits[0]._id);
    }
  }, [selectedSubredditId, subreddits]);

  const handleCreatePost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSignedIn) return;
    if (!selectedSubredditId) return;
    const tagNames = tagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    await createPost({
      title: title.trim(),
      body: body.trim() || undefined,
      subredditId: selectedSubredditId as any,
      tagNames,
    });

    setTitle("");
    setBody("");
    setTagInput("");
  };

  const handleCreateCommunity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSignedIn) return;
    if (!communityName.trim()) return;
    await createSubreddit({
      name: communityName.trim(),
      description: communityDesc.trim() || undefined,
    });
    setCommunityName("");
    setCommunityDesc("");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fcefd7_0%,_#f8f1e8_42%,_#f4ede2_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="animate-fade-up flex flex-col gap-6 rounded-[32px] border border-slate-200/60 bg-white/80 p-8 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.7)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-700">
                Witty Cafe
              </p>
              <h1 className="mt-3 text-4xl font-serif text-slate-900 md:text-5xl">
                Pour-over publishing for sharp takes
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600 md:text-lg">
                Build communities, launch posts, and keep the conversation warm.
                Every cup comes with a thread.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <UserButton />
              ) : (
                <SignInButton mode="modal">
                  <button className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                    Sign in
                  </button>
                </SignInButton>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search posts, tags, or communities"
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-amber-400"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setActiveSubreddit(null);
                  setActiveTag(null);
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  !activeSubreddit && !activeTag
                    ? "bg-amber-500 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200"
                }`}
              >
                All pours
              </button>
              {activeSubreddit ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
                  r/{activeSubreddit}
                </span>
              ) : null}
              {activeTag ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
                  #{activeTag}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <main className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
          <aside className="flex flex-col gap-6">
            <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Communities
              </h2>
              <div className="mt-4 flex flex-col gap-2">
                {(subreddits ?? []).map((community: any) => (
                  <button
                    key={community._id}
                    onClick={() => {
                      setActiveSubreddit(community.slug);
                      setActiveTag(null);
                    }}
                    className={`rounded-2xl px-3 py-2 text-left text-sm font-semibold transition ${
                      activeSubreddit === community.slug
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    r/{community.slug}
                  </button>
                ))}
                {subreddits && subreddits.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No communities yet. Create the first one.
                  </p>
                ) : null}
              </div>
            </section>
            <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Start a community
              </h2>
              {isSignedIn ? (
                <form onSubmit={handleCreateCommunity} className="mt-4 flex flex-col gap-3">
                  <input
                    value={communityName}
                    onChange={(event) => setCommunityName(event.target.value)}
                    placeholder="Community name"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    value={communityDesc}
                    onChange={(event) => setCommunityDesc(event.target.value)}
                    placeholder="Short description"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Create community
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Sign in to create a new community.
                </p>
              )}
            </section>
          </aside>

          <section className="flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                Start a new thread
              </h2>
              {isSignedIn ? (
                <form onSubmit={handleCreatePost} className="mt-4 flex flex-col gap-3">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Post title"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    required
                  />
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Share the story, link, or question"
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  />
                  <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      placeholder="Tags (comma separated)"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                    <select
                      value={selectedSubredditId ?? ""}
                      onChange={(event) => setSelectedSubredditId(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                      required
                    >
                      <option value="" disabled>
                        Choose community
                      </option>
                      {(subreddits ?? []).map((community: any) => (
                        <option key={community._id} value={community._id}>
                          r/{community.slug}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="self-start rounded-2xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
                  >
                    Publish post
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Sign in to publish posts and join the discussion.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Fresh pours</h2>
              <p className="text-sm text-slate-500">
                {filteredPosts.length} posts
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {filteredPosts.map((post: any, index: number) => (
                <article
                  key={post._id}
                  className="animate-fade-up rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={() =>
                          isSignedIn ? castVote({ postId: post._id, value: 1 }) : null
                        }
                        disabled={!isSignedIn}
                        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                        aria-label="Upvote"
                      >
                        ▲
                      </button>
                      <span className="text-sm font-semibold text-slate-700">
                        {post.score ?? 0}
                      </span>
                      <button
                        onClick={() =>
                          isSignedIn ? castVote({ postId: post._id, value: -1 }) : null
                        }
                        disabled={!isSignedIn}
                        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600"
                        aria-label="Downvote"
                      >
                        ▼
                      </button>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">
                          r/{post.subreddit?.slug ?? "unknown"}
                        </span>
                        <span>{formatDate(post.createdAt)}</span>
                        {post.author?.name ? (
                          <span className="text-slate-400">by {post.author.name}</span>
                        ) : null}
                      </div>
                      <Link
                        href={`/post/${post._id}`}
                        className="mt-3 block text-xl font-semibold text-slate-900 transition hover:text-amber-600"
                      >
                        {post.title}
                      </Link>
                      {post.body ? (
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                          {post.body}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {(post.tags ?? []).map((tag: any) => (
                          <button
                            key={tag.slug}
                            onClick={() => {
                              setActiveTag(tag.slug);
                              setActiveSubreddit(null);
                            }}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700"
                          >
                            #{tag.slug}
                          </button>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                        <span>{post.commentCount ?? 0} comments</span>
                        <Link
                          href={`/post/${post._id}`}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-amber-200"
                        >
                          Open discussion
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {posts && filteredPosts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
                  No posts yet. Be the first to pour a fresh take.
                </div>
              ) : null}
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Tags
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(tags ?? []).map((tag: any) => (
                  <button
                    key={tag._id}
                    onClick={() => {
                      setActiveTag(tag.slug);
                      setActiveSubreddit(null);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      activeTag === tag.slug
                        ? "bg-emerald-600 text-white"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                    }`}
                  >
                    #{tag.slug}
                  </button>
                ))}
                {tags && tags.length === 0 ? (
                  <p className="text-sm text-slate-500">Tags appear as posts land.</p>
                ) : null}
              </div>
            </section>
            <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                How to pour
              </h2>
              <ol className="mt-4 flex list-decimal flex-col gap-2 pl-4 text-sm text-slate-600">
                <li>Pick a community on the left.</li>
                <li>Write a headline that hooks curiosity.</li>
                <li>Tag the flavor so others can find it.</li>
              </ol>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
