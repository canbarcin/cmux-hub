import React, { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import type { DiffFile as DiffFileType, DiffLine as DiffLineType } from "../lib/diff-parser.ts";
import { countChanges } from "../lib/file-tree.ts";
import { buildSplitRows, type SplitItemKind } from "../lib/split-diff.ts";
import type { DiffViewMode } from "../lib/route.ts";
import { DiffLine, SplitDiffLine, type SplitSide } from "./DiffLine.tsx";
import { CommentForm } from "./CommentForm.tsx";
import type { CommentMode } from "./CommentForm.tsx";
import { InlinePRComment } from "./PRComments.tsx";
import { PendingComment } from "./PendingComment.tsx";
import { api } from "../lib/api.ts";
import { useReviewQueue } from "../hooks/useReviewQueue.tsx";
import type { PendingComment as PendingCommentData } from "../hooks/useReviewQueue.tsx";

type PRCommentData = {
  id: number;
  body: string;
  bodyHtml: string;
  user: string;
  path: string;
  line: number;
  createdAt: string;
  isResolved: boolean;
};

type FlatLine = {
  type: "line";
  line: DiffLineType;
  index: number;
};

type FlatHunkHeader = {
  type: "hunk-header";
  header: string;
  hunkIndex: number;
};

type FlatExpandButton = {
  type: "expand";
  direction: "up" | "down" | "both";
  fromLine: number;
  toLine: number;
  hunkIndex: number;
};

type FlatPRComment = {
  type: "pr-comment";
  comment: PRCommentData;
};

type FlatCommentForm = {
  type: "comment-form";
};

type FlatPendingComment = {
  type: "pending-comment";
  pendingComment: PendingCommentData;
};

type FlatCopyTooltip = {
  type: "copy-tooltip";
  file: string;
  startLine: number;
  endLine: number;
};

type FlatItem = FlatLine | FlatHunkHeader | FlatExpandButton;
type RenderItem = FlatItem | FlatPRComment | FlatCommentForm | FlatPendingComment | FlatCopyTooltip;

type Props = {
  file: DiffFileType;
  onComment?: (
    file: string,
    startLine: number,
    endLine: number,
    comment: string,
    mode: CommentMode,
  ) => void;
  prComments?: PRCommentData[];
  pendingComments?: PendingCommentData[];
  /** "card" (default) renders a bordered, collapsible card; "pane" fills a single-file diff pane */
  variant?: "card" | "pane";
  viewMode?: DiffViewMode;
  /** When provided, the header shows a Unified/Split toggle */
  onViewModeChange?: (mode: DiffViewMode) => void;
  /** Extra controls rendered at the end of the header (e.g. sidebar toggle) */
  headerTrailing?: React.ReactNode;
};

const EXPAND_LINES = 20;

function splitKind(item: RenderItem): SplitItemKind {
  switch (item.type) {
    case "line":
      return item.line.type === "add" ? "add" : item.line.type === "delete" ? "delete" : "context";
    case "hunk-header":
    case "expand":
      return "standalone";
    default:
      return "attachment";
  }
}

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
}) {
  return (
    <div
      className="flex items-center rounded border border-[#30363d] overflow-hidden text-[11px] leading-none"
      role="group"
      aria-label="Diff view mode"
    >
      {(["unified", "split"] as const).map((m) => (
        <button
          key={m}
          className={`px-2 py-1 capitalize transition-colors ${
            mode === m
              ? "bg-[#30363d] text-[#e6edf3]"
              : "text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
          }`}
          aria-pressed={mode === m}
          onClick={(e) => {
            e.stopPropagation();
            onChange(m);
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function DiffFile({
  file,
  onComment,
  prComments = [],
  pendingComments = [],
  variant = "card",
  viewMode = "unified",
  onViewModeChange,
  headerTrailing,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showFileComment, setShowFileComment] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Map<string, DiffLineType[]>>(new Map());
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const { updatePending, removePending, pending: allPending } = useReviewQueue();

  // Review mode: no diff coloring for new files or files with only additions
  const isReviewMode = useMemo(() => {
    if (file.isNew) return true;
    return file.hunks.every((hunk) => hunk.lines.every((line) => line.type === "add"));
  }, [file]);

  // Flatten all lines with sequential index, including expand buttons
  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    let idx = 0;

    for (let hi = 0; hi < file.hunks.length; hi++) {
      const hunk = file.hunks[hi];
      if (!hunk) continue;
      const prevHunk = hi > 0 ? (file.hunks[hi - 1] ?? null) : null;

      // Expand button before hunk
      if (hi === 0 && hunk.newStart > 1) {
        // Lines before the first hunk
        const expandKey = `before-${hi}`;
        const expanded = expandedLines.get(expandKey);
        if (expanded) {
          for (const line of expanded) {
            items.push({ type: "line", line, index: idx++ });
          }
        } else {
          items.push({
            type: "expand",
            direction: "up",
            fromLine: Math.max(1, hunk.newStart - EXPAND_LINES),
            toLine: hunk.newStart - 1,
            hunkIndex: hi,
          });
        }
      } else if (prevHunk) {
        const prevEnd = prevHunk.newStart + prevHunk.newCount;
        const gapStart = prevEnd;
        const gapEnd = hunk.newStart - 1;
        if (gapEnd >= gapStart) {
          const expandKey = `between-${hi}`;
          const expanded = expandedLines.get(expandKey);
          if (expanded) {
            for (const line of expanded) {
              items.push({ type: "line", line, index: idx++ });
            }
          } else {
            items.push({
              type: "expand",
              direction: "both",
              fromLine: gapStart,
              toLine: gapEnd,
              hunkIndex: hi,
            });
          }
        }
      }

      items.push({ type: "hunk-header", header: hunk.header, hunkIndex: hi });

      for (const line of hunk.lines) {
        items.push({ type: "line", line, index: idx++ });
      }

      // Expand button after last hunk
      if (hi === file.hunks.length - 1) {
        const lastEnd = hunk.newStart + hunk.newCount;
        const expandKey = `after-${hi}`;
        const expanded = expandedLines.get(expandKey);
        if (expanded) {
          for (const line of expanded) {
            items.push({ type: "line", line, index: idx++ });
          }
        } else {
          items.push({
            type: "expand",
            direction: "down",
            fromLine: lastEnd,
            toLine: lastEnd + EXPAND_LINES - 1,
            hunkIndex: hi,
          });
        }
      }
    }

    return items;
  }, [file.hunks, expandedLines]);

  // Group PR comments by line number
  const commentsByLine = useMemo(() => {
    const map = new Map<number, PRCommentData[]>();
    for (const c of prComments) {
      if (c.line === null) continue;
      const existing = map.get(c.line);
      if (existing) {
        existing.push(c);
      } else {
        map.set(c.line, [c]);
      }
    }
    return map;
  }, [prComments]);

  // Group pending comments by endLine
  const pendingByLine = useMemo(() => {
    const map = new Map<number, PendingCommentData[]>();
    for (const c of pendingComments) {
      const ln = c.endLine;
      const existing = map.get(ln);
      if (existing) {
        existing.push(c);
      } else {
        map.set(ln, [c]);
      }
    }
    return map;
  }, [pendingComments]);

  const selMin = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null;
  const selMax = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null;

  const selectedLineRange = useMemo((): [number, number] | null => {
    if (selMin === null || selMax === null) return null;
    let startLine: number | null = null;
    let endLine: number | null = null;
    for (const item of flatItems) {
      if (item.type !== "line") continue;
      if (item.index >= selMin && item.index <= selMax) {
        const ln = item.line.newLineNumber ?? item.line.oldLineNumber;
        if (ln !== null) {
          if (startLine === null) startLine = ln;
          endLine = ln;
        }
      }
    }
    if (startLine !== null && endLine !== null) return [startLine, endLine];
    return null;
  }, [flatItems, selMin, selMax]);

  // Flatten items with PR comments, pending comments, and comment form interleaved for rendering
  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    for (const item of flatItems) {
      items.push(item);
      if (item.type === "line") {
        const lineNum = item.line.newLineNumber;
        const lineComments = lineNum !== null ? commentsByLine.get(lineNum) : undefined;
        if (lineComments) {
          for (const c of lineComments) {
            items.push({ type: "pr-comment", comment: c });
          }
        }
        const linePending = lineNum !== null ? pendingByLine.get(lineNum) : undefined;
        if (linePending) {
          for (const p of linePending) {
            items.push({ type: "pending-comment", pendingComment: p });
          }
        }
        if (showComment && selMax !== null && item.index === selMax) {
          if (selectedLineRange) {
            items.push({
              type: "copy-tooltip",
              file: file.newPath,
              startLine: selectedLineRange[0],
              endLine: selectedLineRange[1],
            });
          }
          items.push({ type: "comment-form" });
        }
      }
    }
    return items;
  }, [
    flatItems,
    commentsByLine,
    pendingByLine,
    showComment,
    selMax,
    selectedLineRange,
    file.newPath,
  ]);

  const handleMouseDown = useCallback(
    (index: number) => {
      if (!onComment) return;
      setSelStart(index);
      setSelEnd(index);
      setDragging(true);
      setShowComment(false);
    },
    [onComment],
  );

  const handleMouseEnter = useCallback(
    (index: number) => {
      if (dragging) {
        setSelEnd(index);
      }
    },
    [dragging],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMouseUp = () => {
      setDragging(false);
      setShowComment(true);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [dragging]);

  const handleCancelComment = useCallback(() => {
    setSelStart(null);
    setSelEnd(null);
    setShowComment(false);
  }, []);

  const handleSubmitComment = useCallback(
    (comment: string, mode: CommentMode) => {
      if (onComment && selectedLineRange) {
        onComment(file.newPath, selectedLineRange[0], selectedLineRange[1], comment, mode);
      }
      handleCancelComment();
    },
    [onComment, file.newPath, selectedLineRange, handleCancelComment],
  );

  const handleSubmitFileComment = useCallback(
    (comment: string, mode: CommentMode) => {
      if (onComment) {
        onComment(file.newPath, 0, 0, comment, mode);
      }
      setShowFileComment(false);
    },
    [onComment, file.newPath],
  );

  const handleExpand = useCallback(
    async (direction: string, fromLine: number, toLine: number, hunkIndex: number) => {
      const key =
        direction === "up"
          ? `before-${hunkIndex}`
          : direction === "down"
            ? `after-${hunkIndex}`
            : `between-${hunkIndex}`;

      setLoadingExpand(key);
      try {
        const { lines, tokenLines } = await api.getFileLines(file.newPath, fromLine, toLine);
        const contextLines: DiffLineType[] = lines.map((content, i) => ({
          type: "context" as const,
          content,
          oldLineNumber: fromLine + i,
          newLineNumber: fromLine + i,
          tokens: tokenLines[i],
        }));
        setExpandedLines((prev) => new Map(prev).set(key, contextLines));
      } catch {
        // ignore
      } finally {
        setLoadingExpand(null);
      }
    },
    [file.newPath],
  );

  const renderRow = useCallback(
    (item: RenderItem) => {
      if (item.type === "hunk-header") {
        return (
          <tr className="bg-[#388bfd]/[0.07]">
            <td
              colSpan={4}
              className="text-[#8b949e] text-[11px] leading-[18px] font-mono px-3 py-0.5 truncate max-w-0"
              title={item.header}
            >
              {item.header}
            </td>
          </tr>
        );
      }

      if (item.type === "expand") {
        const key =
          item.direction === "up"
            ? `before-${item.hunkIndex}`
            : item.direction === "down"
              ? `after-${item.hunkIndex}`
              : `between-${item.hunkIndex}`;
        const isLoading = loadingExpand === key;

        return (
          <tr className="bg-[#161b22]/60 hover:bg-[#1c2128]">
            <td colSpan={4} className="text-center">
              <button
                className="w-full text-[#58a6ff]/80 hover:text-[#79c0ff] text-[11px] leading-[18px] font-mono px-3 py-0.5 disabled:opacity-50"
                disabled={isLoading}
                onClick={() =>
                  handleExpand(item.direction, item.fromLine, item.toLine, item.hunkIndex)
                }
              >
                {isLoading
                  ? "..."
                  : item.direction === "up"
                    ? "↑ Show lines above"
                    : item.direction === "down"
                      ? "↓ Show lines below"
                      : `↕ Show ${item.toLine - item.fromLine + 1} hidden lines`}
              </button>
            </td>
          </tr>
        );
      }

      if (item.type === "pr-comment") {
        return (
          <tr>
            <td colSpan={4} className="px-3 py-1 bg-[#1c2128] border-l-2 border-[#58a6ff]">
              <InlinePRComment comment={item.comment} filePath={file.newPath} />
            </td>
          </tr>
        );
      }

      if (item.type === "pending-comment") {
        return (
          <tr>
            <td colSpan={4} className="px-3 py-1 bg-[#1c2128] border-l-2 border-[#d29922]">
              <PendingComment
                comment={item.pendingComment.comment}
                onUpdate={(text) => updatePending(item.pendingComment.id, text)}
                onDelete={() => removePending(item.pendingComment.id)}
              />
            </td>
          </tr>
        );
      }

      if (item.type === "copy-tooltip") {
        const range =
          item.startLine === item.endLine
            ? `${item.startLine}`
            : `${item.startLine}-${item.endLine}`;
        const ref = `${item.file}:${range}`;
        return (
          <tr>
            <td colSpan={4} className="px-3 py-1">
              <button
                className="text-[11px] font-mono text-[#848d97] hover:text-[#adbac7] border border-[#30363d] rounded px-2 py-0.5 hover:border-[#848d97]"
                onClick={async () => {
                  await navigator.clipboard.writeText(ref);
                  setCopiedRef(true);
                  setTimeout(() => setCopiedRef(false), 1500);
                }}
              >
                {copiedRef ? "Copied!" : ref}
              </button>
            </td>
          </tr>
        );
      }

      if (item.type === "comment-form") {
        return (
          <tr>
            <td colSpan={4} className="p-2 bg-[#161b22] border-y border-[#30363d]">
              <CommentForm onSubmit={handleSubmitComment} onCancel={handleCancelComment} />
            </td>
          </tr>
        );
      }

      const isSelected =
        selMin !== null && selMax !== null && item.index >= selMin && item.index <= selMax;

      return (
        <DiffLine
          line={item.line}
          filePath={file.newPath}
          reviewMode={isReviewMode}
          isNewFile={file.isNew}
          selected={isSelected}
          canComment={!!onComment}
          onMouseDown={onComment ? () => handleMouseDown(item.index) : undefined}
          onMouseEnter={onComment ? () => handleMouseEnter(item.index) : undefined}
        />
      );
    },
    [
      file.newPath,
      file.isNew,
      isReviewMode,
      onComment,
      selMin,
      selMax,
      loadingExpand,
      handleExpand,
      handleMouseDown,
      handleMouseEnter,
      handleSubmitComment,
      handleCancelComment,
      updatePending,
      removePending,
      copiedRef,
      allPending.length,
    ],
  );

  const renderItemKey = (item: RenderItem, i: number): string => {
    switch (item.type) {
      case "hunk-header":
        return `hdr-${item.hunkIndex}`;
      case "expand":
        return `expand-${item.direction}-${item.hunkIndex}`;
      case "pr-comment":
        return `pr-comment-${item.comment.id}`;
      case "pending-comment":
        return `pending-${item.pendingComment.id}`;
      case "copy-tooltip":
        return `copy-tooltip`;
      case "comment-form":
        return `comment-form`;
      case "line":
        return `line-${item.index}`;
      default:
        return `item-${i}`;
    }
  };

  const isSplit = viewMode === "split";

  const splitRows = useMemo(
    () => (isSplit ? buildSplitRows(renderItems, splitKind) : []),
    [isSplit, renderItems],
  );

  const toSide = (item: RenderItem | null): SplitSide | null => {
    if (!item || item.type !== "line") return null;
    const selected =
      selMin !== null && selMax !== null && item.index >= selMin && item.index <= selMax;
    return {
      line: item.line,
      selected,
      onMouseDown: onComment ? () => handleMouseDown(item.index) : undefined,
      onMouseEnter: onComment ? () => handleMouseEnter(item.index) : undefined,
    };
  };

  const splitRowKey = (left: RenderItem | null, right: RenderItem | null): string => {
    const l = left?.type === "line" ? left.index : "x";
    const r = right?.type === "line" ? right.index : "x";
    return `pair-${l}-${r}`;
  };

  const { additions, deletions } = useMemo(() => countChanges(file), [file]);

  const badge = file.isNew ? "New" : file.isDeleted ? "Deleted" : file.isRenamed ? "Renamed" : null;

  const badgeColor = file.isNew
    ? "text-[#3fb950] border-[#3fb950]/40"
    : file.isDeleted
      ? "text-[#f85149] border-[#f85149]/40"
      : "text-[#d29922] border-[#d29922]/40";

  const slash = file.newPath.lastIndexOf("/");
  const dirName = slash === -1 ? "" : file.newPath.slice(0, slash + 1);
  const baseName = slash === -1 ? file.newPath : file.newPath.slice(slash + 1);
  const isPane = variant === "pane";
  const collapsible = !isPane;
  const showBody = !collapsible || !collapsed;

  return (
    <div
      data-testid="diff-file"
      className={isPane ? "min-w-0" : "mb-3 border border-[#30363d] rounded-md overflow-clip"}
    >
      <div
        className={`flex items-center gap-2 h-8 px-3 bg-[#161b22] border-b border-[#30363d] sticky top-0 z-10 min-w-0 ${collapsible ? "cursor-pointer hover:bg-[#1c2128]" : ""}`}
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
      >
        {collapsible && (
          <ChevronRight
            className={`size-3.5 shrink-0 text-[#8b949e] transition-transform ${collapsed ? "" : "rotate-90"}`}
          />
        )}
        <span
          className="font-mono text-[12px] min-w-0 flex-1 truncate"
          title={file.isRenamed ? `${file.oldPath} → ${file.newPath}` : file.newPath}
        >
          <span className="text-[#8b949e]">{dirName}</span>
          <span className="text-[#e6edf3] font-medium">{baseName}</span>
        </span>
        {badge && (
          <span
            className={`${badgeColor} shrink-0 border text-[10px] leading-none px-1.5 py-0.5 rounded-full font-medium`}
          >
            {badge}
          </span>
        )}
        {(additions > 0 || deletions > 0) && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            <span className="text-[#3fb950]">+{additions}</span>{" "}
            <span className="text-[#f85149]">−{deletions}</span>
          </span>
        )}
        {onViewModeChange && !file.generated && (
          <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
        )}
        {onComment && (
          <button
            className="shrink-0 flex items-center gap-1 text-[#8b949e] hover:text-[#58a6ff] text-[11px] px-1.5 py-1 rounded hover:bg-[#30363d] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowFileComment((v) => !v);
            }}
            title="Comment on file"
          >
            <MessageSquarePlus className="size-3.5" />
            Comment
          </button>
        )}
        {headerTrailing}
      </div>
      {showFileComment && (
        <div className="px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
          <CommentForm
            onSubmit={handleSubmitFileComment}
            onCancel={() => setShowFileComment(false)}
          />
        </div>
      )}
      {showBody && file.generated && (
        <div className="px-3 py-6 text-center text-xs text-[#8b949e]">
          Generated file. Diff is not shown.
        </div>
      )}
      {showBody && !file.generated && (
        <div
          style={
            isPane
              ? undefined
              : ({
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 500px",
                } as React.CSSProperties)
          }
        >
          {isSplit ? (
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col className="w-[3rem]" />
                <col />
                <col className="w-[3rem]" />
                <col />
              </colgroup>
              <tbody>
                {splitRows.map((row, i) =>
                  row.kind === "full" ? (
                    <React.Fragment key={renderItemKey(row.item, i)}>
                      {renderRow(row.item)}
                    </React.Fragment>
                  ) : (
                    <SplitDiffLine
                      key={splitRowKey(row.left, row.right)}
                      left={toSide(row.left)}
                      right={toSide(row.right)}
                      reviewMode={isReviewMode}
                      isNewFile={file.isNew}
                      canComment={!!onComment}
                    />
                  ),
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {renderItems.map((item, i) => (
                  <React.Fragment key={renderItemKey(item, i)}>{renderRow(item)}</React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
