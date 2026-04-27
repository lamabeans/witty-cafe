import type { MediaSummary } from "../../convex/types";

type MediaGalleryProps = {
  items?: MediaSummary[];
  compact?: boolean;
};

function labelFor(item: MediaSummary) {
  return item.altText ?? item.filename ?? "Post media";
}

export function MediaGallery({ items = [], compact = false }: MediaGalleryProps) {
  const visible = items.filter((item) => item.url);
  if (visible.length === 0) return null;

  const shown = compact ? visible.slice(0, 3) : visible;

  return (
    <div
      className={
        compact
          ? "mt-3 grid gap-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:grid-cols-2"
          : "mt-6 grid gap-3"
      }
    >
      {shown.map((item, index) => {
        const url = item.url!;
        const isImage = item.mediaType === "image" || item.mediaType === "unknown";
        const isVideo = item.mediaType === "video";
        const isAudio = item.mediaType === "audio";
        const sharedClass = compact
          ? "h-44 w-full bg-slate-100 object-cover"
          : "max-h-[620px] w-full rounded-lg border border-slate-200 bg-slate-100 object-contain";

        return (
          <div
            key={item._id}
            className={compact && index === 0 && shown.length > 1 ? "sm:row-span-2" : ""}
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={labelFor(item)} className={sharedClass} />
            ) : null}
            {isVideo ? (
              <video src={url} controls className={sharedClass} />
            ) : null}
            {isAudio ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <audio src={url} controls className="w-full" />
              </div>
            ) : null}
          </div>
        );
      })}
      {compact && visible.length > shown.length ? (
        <div className="flex min-h-24 items-center justify-center bg-slate-900 px-4 py-6 text-sm font-semibold text-white">
          +{visible.length - shown.length} more
        </div>
      ) : null}
    </div>
  );
}
