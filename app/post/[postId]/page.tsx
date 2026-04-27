"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EnrichedComment, EnrichedPost } from "../../../convex/types";
import { MediaGallery } from "../../components/MediaGallery";
import { RichTextContent } from "../../components/RichTextContent";

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

function VoteControls({
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
  const buttonClass =
    "h-10 rounded-lg border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onVote(1)}
        disabled={!canWrite || busy}
        className={`${buttonClass} ${
          post.viewerVote === 1
            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400"
        }`}
        aria-label="Upvote"
      >
        ▲
      </button>
      <span className="min-w-10 text-center text-sm font-bold tabular-nums text-slate-900">
        {post.score ?? 0}
      </span>
      <button
        type="button"
        onClick={() => onVote(-1)}
        disabled={!canWrite || busy}
        className={`${buttonClass} ${
          post.viewerVote === -1
            ? "border-rose-500 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-rose-400"
        }`}
        aria-label="Downvote"
      >
        ▼
      </button>
    </div>
  );
}

export default function PostPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } =
    useConvexAuth();
  const canWrite = Boolean(isLoaded && isSignedIn && isConvexAuthenticated);
  const authPending = Boolean(isLoaded && isSignedIn && isConvexLoading);

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
  const [commentError, setCommentError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [isCommenting, setIsCommenting] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCommentError(null);
    if (!canWrite) {
      setCommentError(
        authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to comment."
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

  const handleVote = async (value: 1 | -1) => {
    setVoteError(null);
    if (!canWrite) {
      setVoteError(authPending ? "Finishing sign-in. Try again in a moment." : "Sign in to vote.");
      return;
    }

    setIsVoting(true);
    try {
      await castVote({ postId, value });
    } catch (error) {
      setVoteError(errorMessage(error));
    } finally {
      setIsVoting(false);
    }
  };

  if (post === null) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Post not found
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="text-sm font-bold text-slate-700 hover:text-slate-950">
            ← Witty.Cafe
          </Link>
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

      <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-4">
          {post ? (
            <article className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-bold text-slate-700">
                    {post.subreddit?.name ?? "Unknown community"}
                  </span>
                  <span>{formatDate(post.createdAt)}</span>
                  {post.author?.name ? <span>by {post.author.name}</span> : null}
                </div>
                <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                  {post.title}
                </h1>
              </div>

              <div className="p-4 sm:p-6">
                <RichTextContent
                  content={post.contentJson}
                  fallback={post.legacyBody ?? post.body}
                  className="text-slate-800"
                />
                <MediaGallery items={post.media} />
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <VoteControls
                    post={post}
                    canWrite={canWrite}
                    busy={isVoting}
                    onVote={handleVote}
                  />
                  <span className="text-sm font-semibold text-slate-500">
                    {post.commentCount ?? 0} comments
                  </span>
                </div>
                {voteError ? (
                  <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {voteError}
                  </p>
                ) : null}
              </div>
            </article>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading post…
            </div>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Discussion</h2>
              <span className="text-sm text-slate-500">
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
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-3 text-sm leading-6 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              />
              {commentError ? (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {commentError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!canWrite || isCommenting || !commentBody.trim()}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isCommenting ? "Posting…" : authPending ? "Signing in…" : "Comment"}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {(comments ?? []).map((comment) => (
                <div
                  key={comment._id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span className="font-bold text-slate-700">
                      {comment.author?.name ?? "Anonymous"}
                    </span>
                    <span>{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {comment.body}
                  </p>
                </div>
              ))}
              {comments && comments.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No comments yet.
                </p>
              ) : null}
            </div>
          </section>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Post</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Score</span>
                <span className="font-semibold text-slate-900">
                  {post?.score ?? "…"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Comments</span>
                <span className="font-semibold text-slate-900">
                  {post?.commentCount ?? "…"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Media</span>
                <span className="font-semibold text-slate-900">
                  {post?.media.filter((item) => item.url).length ?? "…"}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
