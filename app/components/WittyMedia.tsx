"use client";

import type { MediaSummary, ReactionCounts, ReactionKind } from "../../convex/types";
import { cleanMediaAltText } from "../lib/site";

export const REACTIONS: Array<{ kind: ReactionKind; label: string }> = [
  { kind: "like", label: "Like" },
  { kind: "funny", label: "Funny" },
  { kind: "love", label: "Love" },
  { kind: "wow", label: "Wow" },
];

const REACTION_KINDS: ReactionKind[] = [
  "like",
  "funny",
  "love",
  "wow",
  "keep",
  "share",
];

export function formatCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

export function reactionTotal(counts: ReactionCounts) {
  return REACTION_KINDS.reduce((total, kind) => total + counts[kind], 0);
}

export function postAndMediaReactionTotal({
  media,
  reactionCounts,
}: {
  media: MediaSummary[];
  reactionCounts: ReactionCounts;
}) {
  return media.reduce(
    (total, item) => total + reactionTotal(item.reactionCounts),
    reactionTotal(reactionCounts)
  );
}

function mediaLabel(item: MediaSummary) {
  return cleanMediaAltText(
    item.altText ?? item.filename,
    item.aiGenerated ? "AI-generated media" : "Post media"
  );
}

function mediaTypeLabel(item: MediaSummary) {
  const prefix = item.aiGenerated ? "AI " : "";
  if (item.mediaType === "video") return `${prefix}VIDEO`;
  if (item.mediaType === "audio") return `${prefix}AUDIO`;
  if (item.mediaType === "model3d") return `${prefix}3D MODEL`;
  if (item.mediaType === "game") return `${prefix}VIDEO GAME`;
  if (item.mediaType === "image") return `${prefix}IMAGE`;
  return "MEDIA";
}

type ReactionBarProps = {
  counts: ReactionCounts;
  viewerReaction?: ReactionKind | null;
  canWrite: boolean;
  busy?: boolean;
  compact?: boolean;
  onReact: (kind: ReactionKind) => void;
};

export function ReactionBar({
  counts,
  viewerReaction,
  canWrite,
  busy = false,
  compact = false,
  onReact,
}: ReactionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {REACTIONS.map((reaction) => {
        const active = viewerReaction === reaction.kind;
        return (
          <button
            key={reaction.kind}
            type="button"
            disabled={!canWrite || busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onReact(reaction.kind);
            }}
            className={[
              "wc-button",
              active ? "wc-button-active" : "",
              compact ? "min-h-8 px-3 py-1 text-[11px]" : "",
            ].join(" ")}
          >
            <span>{reaction.label}</span>
            <span>{formatCount(counts[reaction.kind] ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

type MediaLoveButtonProps = {
  active: boolean;
  count: number;
  canWrite: boolean;
  busy?: boolean;
  onLove: () => void;
};

function MediaLoveButton({
  active,
  count,
  canWrite,
  busy = false,
  onLove,
}: MediaLoveButtonProps) {
  return (
    <button
      type="button"
      disabled={!canWrite || busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onLove();
      }}
      className={[
        "wc-button",
        active ? "wc-button-active" : "",
        "min-h-10",
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path
          d="M12 20.2s-7.4-4.4-9.4-9.4C1 6.8 3.4 3.8 7 3.8c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3 4.4 7-2 5-9.4 9.4-9.4 9.4Z"
          fill="currentColor"
        />
      </svg>
      <span>Love it</span>
      <span>{formatCount(count)}</span>
    </button>
  );
}

type MediaTileProps = {
  item: MediaSummary;
  active?: boolean;
  large?: boolean;
  onOpen?: () => void;
  canWrite?: boolean;
  busy?: boolean;
  onLove?: () => void;
};

export function MediaTile({
  item,
  active = false,
  large = false,
  onOpen,
  canWrite = false,
  busy = false,
  onLove,
}: MediaTileProps) {
  const hasUrl = Boolean(item.url);
  const className = large
    ? "relative flex h-full min-h-[280px] w-full items-center justify-center overflow-hidden rounded-[14px] border-2 border-[var(--stroke)] bg-[var(--canvas-2)]"
    : "relative flex h-28 w-36 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-[var(--stroke)] bg-[var(--canvas-2)] sm:h-32 sm:w-44";

  const content = (
    <>
      {hasUrl && (item.mediaType === "image" || item.mediaType === "unknown") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url!}
          alt={mediaLabel(item)}
          className={large ? "h-full max-h-[70vh] w-full object-contain" : "h-full w-full object-cover"}
        />
      ) : null}
      {hasUrl && item.mediaType === "video" ? (
        <video
          src={item.url!}
          controls={large}
          className={large ? "h-full max-h-[70vh] w-full bg-black object-contain" : "h-full w-full bg-black object-cover"}
        />
      ) : null}
      {hasUrl && item.mediaType === "audio" ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--yellow-soft)] px-4 text-[#0a0a0a]">
          <span className="text-xs font-black tracking-[0.18em]">
            {item.aiGenerated ? "AI AUDIO" : "AUDIO"}
          </span>
          {large ? <audio src={item.url!} controls className="w-full" /> : <span className="text-2xl font-black">PLAY</span>}
          {large && item.aiGenerated ? (
            <span className="text-xs font-bold">AI-generated voice</span>
          ) : null}
        </div>
      ) : null}
      {hasUrl && (item.mediaType === "model3d" || item.mediaType === "game") ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--yellow-soft)] px-4 text-center text-[#0a0a0a]">
          <span className="text-xs font-black tracking-[0.18em]">
            {mediaTypeLabel(item)}
          </span>
          <span className={large ? "text-2xl font-black" : "text-xl font-black"}>
            {item.mediaType === "model3d" ? "OBJ" : "HTML"}
          </span>
          {large ? (
            <a
              href={item.url!}
              target="_blank"
              rel="noreferrer"
              className="wc-button bg-black text-white"
              onClick={(event) => event.stopPropagation()}
            >
              {item.mediaType === "model3d" ? "Open 3D file" : "Play game"}
            </a>
          ) : null}
        </div>
      ) : null}
      {!hasUrl ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--canvas-3)] px-3 text-center text-[#0a0a0a]">
          <span className="text-xs font-black tracking-[0.18em]">{mediaTypeLabel(item)}</span>
          <span className="text-xs font-bold text-black/60">{mediaLabel(item)}</span>
        </div>
      ) : null}
      {!large ? (
        <span className="absolute right-2 top-2 rounded-full border-2 border-black bg-[var(--yellow)] px-2 py-0.5 text-[10px] font-black text-black">
          {formatCount(item.rankScore)}
        </span>
      ) : null}
      {large && onLove ? (
        <button
          type="button"
          aria-label="Love it"
          title="Love it"
          disabled={!canWrite || busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onLove();
          }}
          className={[
            "absolute right-3 top-3 inline-flex h-10 items-center gap-2 rounded-full border-2 border-black bg-white px-3 text-xs font-black text-black shadow-[2px_2px_0_var(--stroke)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
            item.viewerReaction === "love" ? "bg-[var(--yellow)] shadow-[2px_2px_0_var(--magenta)]" : "",
          ].join(" ")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
            <path
              d="M12 20.2s-7.4-4.4-9.4-9.4C1 6.8 3.4 3.8 7 3.8c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3 4.4 7-2 5-9.4 9.4-9.4 9.4Z"
              fill="currentColor"
            />
          </svg>
          <span>Love it</span>
          <span>{formatCount(item.reactionCounts.love)}</span>
        </button>
      ) : null}
    </>
  );

  const tileClassName = [
    className,
    active ? "shadow-[3px_3px_0_var(--magenta)]" : "shadow-[2px_2px_0_var(--stroke)]",
  ].join(" ");

  if (large) {
    return <div className={tileClassName}>{content}</div>;
  }

  return (
    <button type="button" onClick={onOpen} className={tileClassName}>
      {content}
    </button>
  );
}

type MediaStripProps = {
  items: MediaSummary[];
  layout: "compact" | "hero";
  onOpen: (index: number) => void;
  canWrite?: boolean;
  busyMediaItemId?: MediaSummary["_id"] | null;
  onLove?: (mediaItemId: MediaSummary["_id"]) => void;
};

export function MediaStrip({
  items,
  layout,
  onOpen,
  canWrite = false,
  busyMediaItemId = null,
  onLove,
}: MediaStripProps) {
  const visible = items.filter((item) => item.url);
  if (visible.length === 0) return null;

  if (layout === "hero") {
    const [lead, ...rest] = visible;
    return (
      <div className="mt-4 space-y-3">
        <MediaTile
          item={lead}
          large
          onOpen={() => onOpen(0)}
          canWrite={canWrite}
          busy={busyMediaItemId === lead._id}
          onLove={onLove ? () => onLove(lead._id) : undefined}
        />
        {rest.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {rest.map((item, index) => (
              <MediaTile key={item._id} item={item} onOpen={() => onOpen(index + 1)} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
      {visible.map((item, index) => (
        <MediaTile key={item._id} item={item} active={index === 0} onOpen={() => onOpen(index)} />
      ))}
    </div>
  );
}

type MediaViewerProps = {
  items: MediaSummary[];
  activeIndex: number;
  title: string;
  canWrite: boolean;
  busy?: boolean;
  onClose: () => void;
  onSelect: (index: number) => void;
  onReact: (mediaItemId: MediaSummary["_id"], kind: ReactionKind) => void;
};

export function MediaViewer({
  items,
  activeIndex,
  title,
  canWrite,
  busy = false,
  onClose,
  onSelect,
  onReact,
}: MediaViewerProps) {
  const visible = items.filter((item) => item.url);
  const active = visible[activeIndex] ?? visible[0];
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[18px] border-2 border-[var(--stroke)] bg-[var(--surface)] shadow-[8px_8px_0_var(--magenta)]">
        <div className="flex items-center gap-3 border-b-2 border-[var(--stroke)] bg-[var(--yellow)] px-4 py-3 text-black">
          <span className="rounded-full border-2 border-black bg-white px-3 py-1 text-xs font-black">
            {mediaTypeLabel(active)}
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-black">{title}</h2>
          <button type="button" onClick={onClose} className="wc-button bg-black text-white">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="relative h-[56vh] min-h-[260px]">
            <MediaTile item={active} large />
            {activeIndex > 0 ? (
              <button
                type="button"
                onClick={() => onSelect(activeIndex - 1)}
                className="wc-button absolute left-3 top-1/2 bg-black text-white"
              >
                Prev
              </button>
            ) : null}
            {activeIndex < visible.length - 1 ? (
              <button
                type="button"
                onClick={() => onSelect(activeIndex + 1)}
                className="wc-button absolute right-3 top-1/2 bg-black text-white"
              >
                Next
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <MediaLoveButton
              active={active.viewerReaction === "love"}
              count={active.reactionCounts.love}
              canWrite={canWrite}
              busy={busy}
              onLove={() => onReact(active._id, "love")}
            />
            <p className="text-sm font-bold text-[var(--muted)]">
              {activeIndex + 1} / {visible.length} media
            </p>
          </div>
          {visible.length > 1 ? (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {visible.map((item, index) => (
                <MediaTile
                  key={item._id}
                  item={item}
                  active={index === activeIndex}
                  onOpen={() => onSelect(index)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
