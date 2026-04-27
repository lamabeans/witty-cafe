import type {
  RichTextDocument,
  RichTextInline,
  RichTextMark,
} from "../../convex/types";

type RichTextContentProps = {
  content?: RichTextDocument | null;
  fallback?: string | null;
  compact?: boolean;
  className?: string;
};

const BB_TAG_PATTERN = /\[(\/?)(b|i|u|color)(?:=([^\]]+))?\]/gi;
const UNKNOWN_BB_TAG_PATTERN = /\[[^\]]+\]/g;

function cleanFallback(value: string | null | undefined) {
  return (value ?? "")
    .replace(BB_TAG_PATTERN, "")
    .replace(UNKNOWN_BB_TAG_PATTERN, "")
    .replace(/\r/g, "")
    .trim();
}

function colorFromMarks(marks: RichTextMark[] | undefined) {
  return marks?.find((mark) => mark.type === "textStyle")?.attrs?.color;
}

function classNameFromMarks(marks: RichTextMark[] | undefined) {
  const classes = [];
  if (marks?.some((mark) => mark.type === "bold")) classes.push("font-semibold");
  if (marks?.some((mark) => mark.type === "italic")) classes.push("italic");
  if (marks?.some((mark) => mark.type === "underline")) classes.push("underline");
  return classes.join(" ");
}

function InlineNode({ node, index }: { node: RichTextInline; index: number }) {
  if (node.type === "hardBreak") return <br key={index} />;

  return (
    <span
      key={index}
      className={classNameFromMarks(node.marks)}
      style={{ color: colorFromMarks(node.marks) }}
    >
      {node.text}
    </span>
  );
}

export function RichTextContent({
  content,
  fallback,
  compact = false,
  className = "",
}: RichTextContentProps) {
  const fallbackText = cleanFallback(fallback);
  const blocks =
    content?.content?.length && content.type === "doc"
      ? content.content
      : fallbackText
        ? fallbackText.split(/\n{2,}/).map((paragraph) => ({
            type: "paragraph" as const,
            content: paragraph.split(/\n/).flatMap((line, index) =>
              index === 0
                ? [{ type: "text" as const, text: line }]
                : [
                    { type: "hardBreak" as const },
                    { type: "text" as const, text: line },
                  ]
            ),
          }))
        : [];

  if (blocks.length === 0) return null;

  return (
    <div
      className={[
        compact ? "space-y-2 text-sm leading-6" : "space-y-4 text-base leading-7",
        className,
      ].join(" ")}
    >
      {blocks.map((block, blockIndex) => (
        <p key={blockIndex}>
          {(block.content ?? []).map((node, nodeIndex) => (
            <InlineNode key={nodeIndex} node={node} index={nodeIndex} />
          ))}
        </p>
      ))}
    </div>
  );
}
