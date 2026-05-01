"use client";

import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Provider = "kimi" | "zai";

type CollectionOption = {
  _id: Id<"collections">;
  name: string;
  slug?: string;
};

type AiCampaign = {
  _id: Id<"aiContentCampaigns">;
  provider: Provider;
  model: string;
  status: "queued" | "processing" | "completed" | "failed";
  keywords: string[];
  targetIdeaCount: number;
  collectionId?: Id<"collections">;
  collectionName?: string;
  collectionSlug?: string | null;
  createdPostIds?: Array<Id<"posts">>;
  error?: string;
  createdAt: number;
};

type FixedCollectionProps = {
  mode: "fixedCollection";
  collection: CollectionOption;
  eyebrow?: string;
  title?: string;
  description?: string;
  hideIfUnauthorized?: boolean;
  recentLimit?: number;
};

type SelectableCollectionProps = {
  mode: "selectableCollection";
  eyebrow?: string;
  title?: string;
  description?: string;
  hideIfUnauthorized?: boolean;
  recentLimit?: number;
};

type AiCreationStudioProps = FixedCollectionProps | SelectableCollectionProps;

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function statusLabel(status: string) {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Processing";
  if (status === "completed") return "Completed";
  return "Failed";
}

function providerLabel(provider: Provider) {
  return provider === "zai" ? "Z.ai / GLM" : "Kimi / Moonshot";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not start campaign.";
}

export function AiCreationStudio(props: AiCreationStudioProps) {
  const fixedCollection =
    props.mode === "fixedCollection" ? props.collection : null;
  const campaignArgs = fixedCollection
    ? { limit: props.recentLimit ?? 10, collectionId: fixedCollection._id }
    : { limit: props.recentLimit ?? 10 };
  const viewer = useQuery(api.aiContent.viewer);
  const campaigns = useQuery(api.aiContent.campaigns, campaignArgs) as
    | AiCampaign[]
    | undefined;
  const collections = useQuery(api.collections.list) as
    | CollectionOption[]
    | undefined;
  const createCampaign = useAction(api.aiContent.createCampaign);
  const upsertUser = useMutation(api.users.upsert);
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const hasSyncedRef = useRef(false);
  const [provider, setProvider] = useState<Provider>("kimi");
  const [collectionMode, setCollectionMode] = useState<"new" | "existing">(
    fixedCollection ? "existing" : "new"
  );
  const [collectionId, setCollectionId] = useState<string>("");
  const [collectionName, setCollectionName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [targetIdeaCount, setTargetIdeaCount] = useState(6);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const providerDetails = viewer?.providers[provider];
  const keywordList = useMemo(
    () =>
      keywords
        .split(/[\n,]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    [keywords]
  );

  useEffect(() => {
    if (!isSignedIn || !user || hasSyncedRef.current) {
      return;
    }

    hasSyncedRef.current = true;
    void upsertUser({
      clerkUserId: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
    });
  }, [isSignedIn, upsertUser, user]);

  if (viewer === undefined) {
    if (props.hideIfUnauthorized) return null;
    return (
      <section className="wc-card p-6">
        <p className="text-sm font-black text-[var(--muted)]">
          Loading AI studio...
        </p>
      </section>
    );
  }

  if (!viewer.isAdmin) {
    if (props.hideIfUnauthorized) return null;
    return (
      <section className="wc-card p-6">
        <h2 className="font-display text-3xl font-black">
          {props.title ?? "Create with AI"}
        </h2>
        <p className="mt-3 text-sm font-bold leading-6 text-[var(--muted)]">
          AI creation is limited to invited beta accounts.
        </p>
      </section>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!keywordList.length) {
      setMessage("Add at least one keyword.");
      return;
    }

    if (!fixedCollection && collectionMode === "new" && !collectionName.trim()) {
      setMessage("Name the new collection, or choose an existing one.");
      return;
    }

    if (!fixedCollection && collectionMode === "existing" && !collectionId) {
      setMessage("Choose a collection.");
      return;
    }

    setBusy(true);
    try {
      await createCampaign({
        provider,
        keywords: keywordList,
        targetIdeaCount,
        collectionName:
          !fixedCollection && collectionMode === "new"
            ? collectionName.trim()
            : undefined,
        collectionId: fixedCollection
          ? fixedCollection._id
          : collectionMode === "existing"
            ? (collectionId as Id<"collections">)
            : undefined,
      });
      setMessage("Campaign queued. It will keep running in the background.");
      setKeywords("");
      if (!fixedCollection && collectionMode === "new") setCollectionName("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const title =
    props.title ??
    (fixedCollection
      ? `AI ideas for ${fixedCollection.name}`
      : "Create with AI");
  const description =
    props.description ??
    (fixedCollection
      ? "Generate fresh public ideas directly into this collection. Add AI media from each post page after the ideas are published."
      : "Generate public ideas into a new collection or an existing one. Add AI media from each post page after the ideas are published.");

  return (
    <section className="wc-card overflow-hidden">
      <div className="border-b-2 border-[var(--stroke)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              {props.eyebrow ?? (fixedCollection ? "Beta creation" : "Admin beta")}
            </p>
            <h2 className="font-display mt-1 text-3xl font-black leading-tight">
              {title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-[var(--muted)]">
              {description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="wc-button pointer-events-none">
              Kimi {viewer.providers.kimi.configured ? "ready" : "missing key"}
            </span>
            <span className="wc-button pointer-events-none">
              Z.ai {viewer.providers.zai.configured ? "ready" : "missing key"}
            </span>
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="grid gap-4 p-5 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-black">
            Provider
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
              className="wc-input"
            >
              <option value="kimi">{providerLabel("kimi")}</option>
              <option value="zai">{providerLabel("zai")}</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-black">
            Ideas
            <input
              type="number"
              min={1}
              max={20}
              value={targetIdeaCount}
              onChange={(event) => setTargetIdeaCount(Number(event.target.value))}
              className="wc-input"
            />
          </label>
        </div>

        {fixedCollection ? (
          <div className="rounded-lg border-2 border-[var(--stroke)] bg-[var(--yellow-soft)] p-3 text-sm font-black text-black">
            Collection: {fixedCollection.name}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCollectionMode("new")}
                className={`wc-button ${
                  collectionMode === "new" ? "wc-button-active" : ""
                }`}
              >
                New collection
              </button>
              <button
                type="button"
                onClick={() => setCollectionMode("existing")}
                className={`wc-button ${
                  collectionMode === "existing" ? "wc-button-active" : ""
                }`}
              >
                Existing collection
              </button>
            </div>

            {collectionMode === "new" ? (
              <label className="grid gap-2 text-sm font-black">
                Collection name
                <input
                  value={collectionName}
                  onChange={(event) => setCollectionName(event.target.value)}
                  placeholder="Funny birthday wishes"
                  className="wc-input"
                />
              </label>
            ) : (
              <label className="grid gap-2 text-sm font-black">
                Collection
                <select
                  value={collectionId}
                  onChange={(event) => setCollectionId(event.target.value)}
                  className="wc-input"
                >
                  <option value="">Choose collection</option>
                  {(collections ?? []).map((collection) => (
                    <option key={collection._id} value={collection._id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <label className="grid gap-2 text-sm font-black">
          Keywords
          <textarea
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder={
              fixedCollection
                ? "fresh angles for this collection\nshort shareable ideas\nhelpful wording"
                : "funny birthday wishes\nbirthday message for coworker\nshort birthday jokes"
            }
            rows={5}
            className="wc-input resize-y"
          />
        </label>

        {providerDetails?.configured ? null : (
          <p className="rounded-lg border-2 border-[var(--stroke)] bg-[var(--yellow-soft)] p-3 text-xs font-black text-black">
            This provider needs its Convex API key before campaigns can run.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !providerDetails?.configured}
            className="wc-button wc-button-primary"
          >
            {busy ? "Queuing..." : "Generate Ideas"}
          </button>
          {message ? (
            <span className="text-sm font-bold text-[var(--muted)]">
              {message}
            </span>
          ) : null}
        </div>
      </form>

      <div className="border-t-2 border-[var(--stroke)] bg-[var(--canvas-2)] p-5 sm:p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--muted)]">
          Recent campaigns
        </h3>
        <div className="mt-4 grid gap-3">
          {(campaigns ?? []).map((campaign) => (
            <article
              key={campaign._id}
              className="wc-card-sm bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="wc-button pointer-events-none">
                  {statusLabel(campaign.status)}
                </span>
                <span className="text-xs font-black text-[var(--muted)]">
                  {campaign.provider} / {campaign.model}
                </span>
                <span className="ml-auto text-xs font-black text-[var(--muted)]">
                  {formatDate(campaign.createdAt)}
                </span>
              </div>
              <p className="mt-3 text-sm font-black">
                {campaign.collectionSlug ? (
                  <Link
                    href={`/collections/${campaign.collectionSlug}`}
                    className="hover:text-[var(--magenta)]"
                  >
                    {campaign.collectionName ?? "Collection"}
                  </Link>
                ) : (
                  (campaign.collectionName ?? "New collection")
                )}
              </p>
              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {campaign.keywords.join(", ")}
              </p>
              {campaign.error ? (
                <p className="mt-2 text-xs font-bold text-red-600">
                  {campaign.error}
                </p>
              ) : null}
              {campaign.createdPostIds?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {campaign.createdPostIds.slice(0, 6).map((postId, index) => (
                    <Link
                      key={postId}
                      href={`/post/${postId}`}
                      className="wc-button"
                    >
                      Idea {index + 1}
                    </Link>
                  ))}
                  {campaign.createdPostIds.length > 6 ? (
                    <span className="text-xs font-bold text-[var(--muted)]">
                      +{campaign.createdPostIds.length - 6} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {campaigns?.length === 0 ? (
            <p className="text-sm font-bold text-[var(--muted)]">
              No campaigns yet.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AiCreateCta() {
  const viewer = useQuery(api.aiContent.viewer);

  if (!viewer?.isAdmin) return null;

  return (
    <section className="mb-8 wc-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
            Beta creation
          </p>
          <h2 className="font-display mt-1 text-2xl font-black">
            Create collection ideas with AI
          </h2>
        </div>
        <Link href="/create/ai" className="wc-button wc-button-primary">
          Open AI Creator
        </Link>
      </div>
    </section>
  );
}
