export const DEFAULT_SITE_URL = "https://witty-cafe-vgbe.vercel.app";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, "");
}

export function absoluteUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${normalizedPath}`;
}

export function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function stripBbCode(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\[(\/?)(b|i|u|color)(?:=([^\]]+))?\]/gi, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanMediaAltText(
  value: string | null | undefined,
  fallback: string
) {
  const cleaned = stripBbCode(value)
    .replace(/\.(jpe?g|png|gif|webp|avif|mp4|mov|webm|mp3|wav|ogg)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return truncateText(cleaned || fallback, 180);
}
