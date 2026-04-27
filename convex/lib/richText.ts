import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInline,
  RichTextMark,
} from "../types";

const BB_TAG_PATTERN = /\[(\/?)(b|i|u|color)(?:=([^\]]+))?\]/gi;
const UNKNOWN_BB_TAG_PATTERN = /\[[^\]]+\]/g;
const MAX_EXCERPT_LENGTH = 220;

type ActiveStyle = {
  type: "bold" | "italic" | "underline" | "textStyle";
  color?: string;
};

function normalizeColor(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
  if (/^rgb(a)?\([0-9\s,./%]+\)$/i.test(trimmed)) return trimmed;
  if (/^[a-z]+$/i.test(trimmed)) return trimmed.toLowerCase();
  return undefined;
}

function marksFromActive(active: ActiveStyle[]): RichTextMark[] | undefined {
  const marks: RichTextMark[] = [];
  let color: string | undefined;

  for (const style of active) {
    if (style.type === "bold" && !marks.some((mark) => mark.type === "bold")) {
      marks.push({ type: "bold" });
    }
    if (
      style.type === "italic" &&
      !marks.some((mark) => mark.type === "italic")
    ) {
      marks.push({ type: "italic" });
    }
    if (
      style.type === "underline" &&
      !marks.some((mark) => mark.type === "underline")
    ) {
      marks.push({ type: "underline" });
    }
    if (style.type === "textStyle" && style.color) {
      color = style.color;
    }
  }

  if (color) marks.push({ type: "textStyle", attrs: { color } });
  return marks.length > 0 ? marks : undefined;
}

function textNode(text: string, active: ActiveStyle[]): RichTextInline | null {
  if (!text) return null;
  return {
    type: "text",
    text,
    marks: marksFromActive(active),
  };
}

function parseInline(value: string): RichTextInline[] {
  const nodes: RichTextInline[] = [];
  const active: ActiveStyle[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(BB_TAG_PATTERN)) {
    const index = match.index ?? 0;
    const before = value.slice(lastIndex, index);
    const beforeNode = textNode(before, active);
    if (beforeNode) nodes.push(beforeNode);

    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const color = normalizeColor(match[3]);

    if (!closing) {
      if (tag === "b") active.push({ type: "bold" });
      if (tag === "i") active.push({ type: "italic" });
      if (tag === "u") active.push({ type: "underline" });
      if (tag === "color") active.push({ type: "textStyle", color });
    } else {
      const type =
        tag === "b"
          ? "bold"
          : tag === "i"
            ? "italic"
            : tag === "u"
              ? "underline"
              : "textStyle";
      const reverseIndex = [...active]
        .reverse()
        .findIndex((style) => style.type === type);
      if (reverseIndex >= 0) {
        active.splice(active.length - 1 - reverseIndex, 1);
      }
    }

    lastIndex = index + match[0].length;
  }

  const tailNode = textNode(value.slice(lastIndex), active);
  if (tailNode) nodes.push(tailNode);
  return nodes;
}

function paragraphFromText(paragraph: string): RichTextBlock {
  const lines = paragraph.split(/\r?\n/);
  const content: RichTextInline[] = [];

  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    content.push(...parseInline(line));
  });

  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

export function stripBbcode(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(BB_TAG_PATTERN, "")
    .replace(UNKNOWN_BB_TAG_PATTERN, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function excerptFromText(value: string | undefined): string {
  const plain = stripBbcode(value)
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= MAX_EXCERPT_LENGTH) return plain;
  return `${plain.slice(0, MAX_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

export function titleFromContent(title: string, body: string | undefined): string {
  const cleanTitle = stripBbcode(title).trim();
  if (cleanTitle) return cleanTitle;

  const cleanBody = stripBbcode(body);
  const firstLine = cleanBody
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "Untitled post";
  return firstLine.length > 88 ? `${firstLine.slice(0, 87).trimEnd()}…` : firstLine;
}

export function bbcodeToRichText(value: string | undefined): RichTextDocument {
  const source = value?.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!source) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const paragraphs = source
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs.map(paragraphFromText) : [{ type: "paragraph" }],
  };
}

export function plainTextToRichText(value: string | undefined): RichTextDocument {
  const source = value?.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!source) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return {
    type: "doc",
    content: source
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
        const lines = paragraph.split("\n");
        const content: RichTextInline[] = [];
        lines.forEach((line, index) => {
          if (index > 0) content.push({ type: "hardBreak" });
          content.push({ type: "text", text: line });
        });
        return { type: "paragraph", content };
      }),
  };
}
