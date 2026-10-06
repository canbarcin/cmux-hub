import React from "react";
import type { DiffLine as DiffLineType } from "../lib/diff-parser.ts";

type Props = {
  line: DiffLineType;
  filePath: string;
  reviewMode?: boolean;
  isNewFile?: boolean;
  selected?: boolean;
  canComment?: boolean;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
};

const LINE_BG: Record<DiffLineType["type"], string> = {
  add: "bg-[#2ea043]/10",
  delete: "bg-[#f85149]/[0.08]",
  context: "",
  header: "bg-[#388bfd]/[0.08]",
};

const GUTTER_BG: Record<DiffLineType["type"], string> = {
  add: "bg-[#2ea043]/[0.16]",
  delete: "bg-[#f85149]/[0.14]",
  context: "",
  header: "bg-[#388bfd]/[0.08]",
};

const GUTTER_TEXT: Record<DiffLineType["type"], string> = {
  add: "text-[#3fb950]/70",
  delete: "text-[#f85149]/70",
  context: "text-[#6e7681]",
  header: "text-[#58a6ff]/60",
};

const PREFIX_COLOR: Record<DiffLineType["type"], string> = {
  add: "text-[#3fb950]/80",
  delete: "text-[#f85149]/80",
  context: "text-transparent",
  header: "text-[#58a6ff]",
};

const LINE_TEXT: Record<DiffLineType["type"], string> = {
  add: "text-[#c9d1d9]",
  delete: "text-[#c9d1d9]",
  context: "text-[#c9d1d9]",
  header: "text-[#58a6ff]",
};

const SELECTED_BG = "!bg-[#264f78]";
const ROW_TEXT = "font-mono text-[12px] leading-[18px]";
const GUTTER_BASE =
  "w-px min-w-[2.5rem] whitespace-nowrap text-right px-2 select-none align-top text-[11px] tabular-nums";
const COMMENT_HOVER = "cursor-pointer hover:!bg-[#1f6feb]/30";

type LineStyle = {
  bg: string;
  gutterBg: string;
  gutterText: string;
  prefixColor: string;
  textColor: string;
};

function lineStyle(line: DiffLineType, reviewMode?: boolean, isNewFile?: boolean): LineStyle {
  const hasTokens = !!line.tokens && line.tokens.length > 0;
  // Review mode: neutral colors (no diff background tinting).
  // New files keep a faint green gutter as a reminder that everything is added.
  if (reviewMode) {
    return {
      bg: "",
      gutterBg: isNewFile ? "bg-[#2ea043]/[0.08]" : "",
      gutterText: "text-[#6e7681]",
      prefixColor: "text-transparent",
      textColor: hasTokens ? "" : "text-[#c9d1d9]",
    };
  }
  return {
    bg: LINE_BG[line.type],
    gutterBg: GUTTER_BG[line.type],
    gutterText: GUTTER_TEXT[line.type],
    prefixColor: PREFIX_COLOR[line.type],
    textColor: hasTokens ? "" : LINE_TEXT[line.type],
  };
}

function prefixFor(line: DiffLineType): string {
  return line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
}

function LineContent({ line }: { line: DiffLineType }) {
  if (line.tokens && line.tokens.length > 0) {
    return (
      <>
        {line.tokens.map((token, i) => (
          <span key={i} style={token.color ? { color: token.color } : undefined}>
            {token.content}
          </span>
        ))}
      </>
    );
  }
  return <>{line.content}</>;
}

function mouseDownHandler(onMouseDown?: () => void) {
  return (e: React.MouseEvent) => {
    if (onMouseDown) {
      e.preventDefault();
      onMouseDown();
    }
  };
}

export function DiffLine({
  line,
  reviewMode,
  isNewFile,
  selected,
  canComment,
  onMouseDown,
  onMouseEnter,
}: Props) {
  const s = lineStyle(line, reviewMode, isNewFile);
  const handleMouseDown = mouseDownHandler(onMouseDown);
  const gutterClass = `${s.gutterBg} ${s.gutterText} ${GUTTER_BASE} ${canComment ? COMMENT_HOVER : ""}`;

  return (
    <tr className={`${s.bg} ${selected ? SELECTED_BG : ""} group ${ROW_TEXT}`}>
      <td className={gutterClass} onMouseDown={handleMouseDown} onMouseEnter={onMouseEnter}>
        {line.oldLineNumber ?? ""}
      </td>
      <td className={gutterClass} onMouseDown={handleMouseDown} onMouseEnter={onMouseEnter}>
        {line.newLineNumber ?? ""}
      </td>
      <td className={`${s.prefixColor} w-4 text-center select-none align-top`}>
        {prefixFor(line)}
      </td>
      <td className={`${s.textColor} pr-3 align-top whitespace-pre-wrap break-all`}>
        <LineContent line={line} />
      </td>
    </tr>
  );
}

export type SplitSide = {
  line: DiffLineType;
  selected: boolean;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
};

type SplitProps = {
  left: SplitSide | null;
  right: SplitSide | null;
  reviewMode?: boolean;
  isNewFile?: boolean;
  canComment?: boolean;
};

const EMPTY_SIDE_BG = "bg-[#161b22]/70";

function SplitHalf({
  side,
  lineNumber,
  reviewMode,
  isNewFile,
  canComment,
  isRight,
}: {
  side: SplitSide | null;
  lineNumber: number | null;
  reviewMode?: boolean;
  isNewFile?: boolean;
  canComment?: boolean;
  isRight: boolean;
}) {
  const divider = isRight ? "border-l border-[#30363d]/70" : "";
  if (!side) {
    return (
      <>
        <td className={`${EMPTY_SIDE_BG} ${GUTTER_BASE} ${divider}`} />
        <td className={EMPTY_SIDE_BG} />
      </>
    );
  }
  const s = lineStyle(side.line, reviewMode, isNewFile);
  const selected = side.selected ? SELECTED_BG : "";
  return (
    <>
      <td
        className={`${s.gutterBg} ${s.gutterText} ${GUTTER_BASE} ${divider} ${selected} ${canComment ? COMMENT_HOVER : ""}`}
        onMouseDown={mouseDownHandler(side.onMouseDown)}
        onMouseEnter={side.onMouseEnter}
      >
        {lineNumber ?? ""}
      </td>
      <td
        className={`${s.bg} ${s.textColor} ${selected} relative pl-5 pr-3 align-top whitespace-pre-wrap break-all`}
      >
        <span className={`${s.prefixColor} absolute left-0 top-0 w-5 text-center select-none`}>
          {prefixFor(side.line)}
        </span>
        <LineContent line={side.line} />
      </td>
    </>
  );
}

/** One side-by-side row: old file on the left, new file on the right. */
export function SplitDiffLine({ left, right, reviewMode, isNewFile, canComment }: SplitProps) {
  return (
    <tr className={`group ${ROW_TEXT}`}>
      <SplitHalf
        side={left}
        lineNumber={left?.line.oldLineNumber ?? null}
        reviewMode={reviewMode}
        isNewFile={isNewFile}
        canComment={canComment}
        isRight={false}
      />
      <SplitHalf
        side={right}
        lineNumber={right?.line.newLineNumber ?? null}
        reviewMode={reviewMode}
        isNewFile={isNewFile}
        canComment={canComment}
        isRight
      />
    </tr>
  );
}
