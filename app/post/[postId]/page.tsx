"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EnrichedComment, EnrichedPost } from "../../../convex/types";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default function PostPage() {
  const { isSignedIn } = useAuth();
  const params = useParams<{ postId: string }>();
  const postId = params.postId as Id<"posts">;
  const post = useQuery(api.posts.get, { postId }) as
    | EnrichedPost
    | null
    | undefined;
  const comments = useQuery(api.comments.listByPost, { postId }) as
    | EnrichedComment[]
    | undefined;
  const createComment = useMutation(api.comments.create);
  const castVote = useMutation(api.votes.cast);

  const [commentBody, setCommentBody] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSignedIn) return;
    if (!commentBody.trim()) return;
    await createComment({ postId, body: commentBody.trim() });
    setCommentBody("");
  };

  if (post === null) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fcefd7_0%,_#f8f1e8_42%,_#f4ede2_100%)] px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white/90 p-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Post not found
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fcefd7_0%,_#f8f1e8_42%,_#f4ede2_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
          >
            Back to pours
          </Link>
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Sign in
              </button>
            </SignInButton>
          )}
        </header>

        {post ? (
          <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]">
                r/{post.subreddit?.slug ?? "unknown"}
              </span>
              <span>{formatDate(post.createdAt)}</span>
              {post.author?.name ? (
                <span className="text-slate-400">by {post.author.name}</span>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-serif text-slate-900">
              {post.title}
            </h1>
            {post.body ? (
              <p className="mt-4 text-base text-slate-600">{post.body}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {(post.tags ?? []).map((tag) => (
                <span
                  key={tag.slug}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                >
                  #{tag.slug}
                </span>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() =>
                  isSignedIn ? castVote({ postId: post._id, value: 1 }) : null
                }
                disabled={!isSignedIn}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                ▲ Upvote
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {post.score ?? 0}
              </span>
              <button
                onClick={() =>
                  isSignedIn ? castVote({ postId: post._id, value: -1 }) : null
                }
                disabled={!isSignedIn}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600"
              >
                ▼ Downvote
              </button>
            </div>
          </article>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
            Loading post…
          </div>
        )}

        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Discussion</h2>
            <span className="text-sm text-slate-500">
              {comments?.length ?? 0} comments
            </span>
          </div>

          {isSignedIn ? (
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Add to the conversation"
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="self-start rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Post comment
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Sign in to add a comment.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-4">
            {(comments ?? []).map((comment) => (
              <div
                key={comment._id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{comment.author?.name ?? "Anonymous"}</span>
                  <span>{formatDate(comment.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{comment.body}</p>
              </div>
            ))}
            {comments && comments.length === 0 ? (
              <p className="text-sm text-slate-500">
                No comments yet. Start the thread.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
