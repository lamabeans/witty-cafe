"use client";

import { useMutation, useConvexAuth } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ReactionKind } from "../../../convex/types";

type CollectionAction = {
  kind: Extract<ReactionKind, "like" | "love" | "keep" | "share">;
  label: string;
  icon: "thumb" | "heart" | "bookmark" | "share";
};

const ACTIONS: CollectionAction[] = [
  { kind: "like", label: "Like", icon: "thumb" },
  { kind: "love", label: "Love", icon: "heart" },
  { kind: "keep", label: "Keep", icon: "bookmark" },
  { kind: "share", label: "Share", icon: "share" },
];

function ActionIcon({ icon }: { icon: CollectionAction["icon"] }) {
  if (icon === "heart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path
          d="M12 20.2s-7.4-4.4-9.4-9.4C1 6.8 3.4 3.8 7 3.8c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3 4.4 7-2 5-9.4 9.4-9.4 9.4Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (icon === "bookmark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path
          d="M6 3.8h12v16.4l-6-3.5-6 3.5V3.8Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      </svg>
    );
  }

  if (icon === "share") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path
          d="M8.2 12.7 15.8 17M15.8 7 8.2 11.3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
        <circle cx="6" cy="12" r="2.6" fill="currentColor" />
        <circle cx="18" cy="6" r="2.6" fill="currentColor" />
        <circle cx="18" cy="18" r="2.6" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M8.5 20H5.2V9.7h3.3V20Zm3.2-10.3 1.4-5.8c.2-.8 1-1.3 1.8-1.1 1.5.4 2.4 1.8 2 3.3l-.8 3.1H20c1 0 1.8.9 1.6 1.9l-1.2 6.2c-.3 1.6-1.7 2.7-3.3 2.7h-6.8a1.8 1.8 0 0 1-1.8-1.8v-6.1c0-.5.2-.9.5-1.2l2.7-1.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CollectionIdeaActions({ postId }: { postId: Id<"posts"> }) {
  const togglePostReaction = useMutation(api.reactions.togglePost);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [selected, setSelected] = useState<CollectionAction["kind"] | null>(null);
  const [busy, setBusy] = useState<CollectionAction["kind"] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canWrite = isAuthenticated && !isLoading;

  async function handleAction(kind: CollectionAction["kind"]) {
    setMessage(null);
    if (!canWrite) {
      setMessage(isLoading ? "Finishing sign-in." : "Sign in to react.");
      return;
    }

    setBusy(kind);
    const previous = selected;
    setSelected((value) => (value === kind ? null : kind));
    try {
      const result = await togglePostReaction({ postId, kind });
      setSelected(result.viewerReaction as CollectionAction["kind"] | null);
    } catch (error) {
      setSelected(previous);
      setMessage(error instanceof Error ? error.message : "Could not save reaction.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {ACTIONS.map((action) => {
        const active = selected === action.kind;
        return (
          <button
            key={action.kind}
            type="button"
            aria-label={action.label}
            title={action.label}
            disabled={busy !== null}
            onClick={() => void handleAction(action.kind)}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--stroke)] bg-[var(--surface)] text-[var(--ink)] shadow-[2px_2px_0_var(--stroke)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-[var(--yellow)] text-black shadow-[2px_2px_0_var(--magenta)]" : "",
            ].join(" ")}
          >
            <ActionIcon icon={action.icon} />
          </button>
        );
      })}
      {message ? (
        <span className="text-xs font-bold text-[var(--muted)]">{message}</span>
      ) : null}
    </div>
  );
}
