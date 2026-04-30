import { cleanMediaAltText } from "./site";

export type StructuredMediaItem = {
  url: string | null;
  mediaType: "image" | "video" | "audio" | "model3d" | "game" | "unknown";
  altText?: string | null;
  duration?: number | null;
};

export function mediaObjectFor(
  item: StructuredMediaItem,
  fallbackName: string
) {
  if (!item.url) return null;

  const name = cleanMediaAltText(item.altText, fallbackName);
  const base = {
    url: item.url,
    contentUrl: item.url,
    name,
    caption: name,
  };

  if (item.mediaType === "image" || item.mediaType === "unknown") {
    return {
      "@type": "ImageObject",
      ...base,
    };
  }

  if (item.mediaType === "video") {
    return {
      "@type": "VideoObject",
      ...base,
      description: name,
      uploadDate: undefined,
    };
  }

  if (item.mediaType === "audio") {
    return {
      "@type": "AudioObject",
      ...base,
      description: name,
      duration: item.duration ?? undefined,
    };
  }

  return {
    "@type": "MediaObject",
    ...base,
    encodingFormat: item.mediaType === "model3d" ? "model/obj" : "text/html",
  };
}

export function mediaObjectsFor(
  items: StructuredMediaItem[],
  fallbackName: string
) {
  return items
    .map((item) => mediaObjectFor(item, fallbackName))
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export function imageUrlsFor(items: StructuredMediaItem[]) {
  return items
    .filter(
      (item) =>
        item.url && (item.mediaType === "image" || item.mediaType === "unknown")
    )
    .map((item) => item.url as string);
}
