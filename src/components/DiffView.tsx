import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ParsedDiff } from "../lib/diff-parser.ts";
import type { SelectedCommit } from "../hooks/useDiff.ts";
import { DiffFile } from "./DiffFile.tsx";
import { CommitList } from "./CommitList.tsx";
import { FileTree } from "./FileTree.tsx";
import { useToast } from "./Toast.tsx";
import { api } from "../lib/api.ts";
import { useReviewQueue } from "../hooks/useReviewQueue.tsx";
import type { CommentMode } from "./CommentForm.tsx";
import type { DiffViewMode } from "../lib/route.ts";
import {
  ancestorDirPaths,
  buildFileTree,
  countChanges,
  flattenTreeFiles,
  isUntrackedPath,
  stepFile,
} from "../lib/file-tree.ts";
import { useMediaQuery, useSidebarPrefs } from "../hooks/useLayoutPrefs.ts";

type PRComment = {
  id: number;
  body: string;
  bodyHtml: string;
  user: string;
  path: string;
  line: number;
  createdAt: string;
  isResolved: boolean;
};

type Props = {
  diff: ParsedDiff;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  hasTerminal?: boolean;
  selectedCommit?: SelectedCommit | null;
  showCommitList?: boolean;
  hasUncommittedChanges?: boolean;
  prComments?: PRComment[];
  onSelectCommit?: (commit: SelectedCommit) => void;
  onClearCommit?: () => void;
  /** File path from the URL; falls back to the first file when missing or stale */
  selectedFile?: string;
  onSelectFile?: (path: string, options?: { replace?: boolean }) => void;
  viewMode?: DiffViewMode;
  onViewModeChange?: (mode: DiffViewMode) => void;
  /** Untracked entries from `git status` (only applied to the working-tree diff) */
  untrackedPaths?: string[];
  /** PR / CI summary, shown in the sidebar (or above the commit list) */
  ciStatus?: React.ReactNode;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: PointerEvent) => onResize(startWidth - (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file list"
      className="order-1 w-1 -mr-0.5 shrink-0 cursor-col-resize hover:bg-[#1f6feb]/60 active:bg-[#1f6feb] z-10 transition-colors"
      onPointerDown={onPointerDown}
    />
  );
}

export function DiffView({
  diff,
  loading,
  error,
  onRefresh,
  hasTerminal = false,
  selectedCommit,
  showCommitList,
  hasUncommittedChanges,
  prComments = [],
  onSelectCommit,
  onClearCommit,
  selectedFile,
  onSelectFile,
  viewMode = "unified",
  onViewModeChange,
  untrackedPaths = [],
  ciStatus,
}: Props) {
  const { addToReview, pending } = useReviewQueue();
  const { showToast } = useToast();
  const isNarrow = useMediaQuery("(max-width: 639px)");
  const sidebar = useSidebarPrefs();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set());
  const paneRef = useRef<HTMLDivElement>(null);

  const handleComment = useCallback(
    async (
      file: string,
      startLine: number,
      endLine: number,
      comment: string,
      mode: CommentMode,
    ) => {
      if (mode === "review") {
        addToReview({ file, startLine, endLine, comment });
      } else {
        try {
          await api.sendComment(file, startLine, endLine, comment);
          showToast({ kind: "success", title: "Comment sent to terminal", message: file });
        } catch (e) {
          console.error("Failed to send comment:", e);
          showToast({
            kind: "error",
            title: "Failed to send comment",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    },
    [addToReview, showToast],
  );

  const tree = useMemo(() => buildFileTree(diff, (f) => f.newPath), [diff]);
  const order = useMemo(() => flattenTreeFiles(tree).map((f) => f.path), [tree]);

  const effectivePath =
    selectedFile && order.includes(selectedFile) ? selectedFile : (order[0] ?? null);
  const selected = diff.find((f) => f.newPath === effectivePath) ?? null;

  const untrackedSet = useMemo(() => {
    if (selectedCommit || untrackedPaths.length === 0) return new Set<string>();
    return new Set(order.filter((p) => isUntrackedPath(p, untrackedPaths)));
  }, [order, untrackedPaths, selectedCommit]);

  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of pending) counts.set(c.file, (counts.get(c.file) ?? 0) + 1);
    for (const c of prComments) counts.set(c.path, (counts.get(c.path) ?? 0) + 1);
    return counts;
  }, [pending, prComments]);

  const totals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const f of diff) {
      const c = countChanges(f);
      additions += c.additions;
      deletions += c.deletions;
    }
    return { additions, deletions };
  }, [diff]);

  const selectFile = useCallback(
    (path: string, options?: { replace?: boolean }) => {
      onSelectFile?.(path, options);
      if (isNarrow) setDrawerOpen(false);
    },
    [onSelectFile, isNarrow],
  );

  const step = useCallback(
    (delta: number) => {
      const next = stepFile(order, effectivePath, delta);
      if (next && next !== effectivePath) onSelectFile?.(next, { replace: true });
    },
    [order, effectivePath, onSelectFile],
  );

  // Make sure the selected file is visible in the tree (e.g. after j/k or a reload)
  useEffect(() => {
    if (!effectivePath) return;
    const ancestors = ancestorDirPaths(tree, effectivePath);
    setCollapsedDirs((prev) => {
      if (!ancestors.some((a) => prev.has(a))) return prev;
      const next = new Set(prev);
      for (const a of ancestors) next.delete(a);
      return next;
    });
  }, [effectivePath, tree]);

  // Start each newly selected file at the top
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [effectivePath, selectedCommit?.hash]);

  // j / k step through files from anywhere outside text inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "j") step(1);
      else if (e.key === "k") step(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  const toggleDir = useCallback((path: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (loading && diff.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[#8b949e]">
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-sm">
        <p className="text-[#f85149]">{error}</p>
        <button onClick={onRefresh} className="text-[#58a6ff] hover:text-[#79c0ff] underline">
          Retry
        </button>
      </div>
    );
  }

  if (showCommitList && onSelectCommit && onClearCommit) {
    return (
      <div className="h-full overflow-auto p-3">
        <div className="max-w-3xl mx-auto mb-2">
          <button className="text-[#58a6ff] hover:text-[#79c0ff] text-xs" onClick={onClearCommit}>
            ← Back
          </button>
        </div>
        <CommitList
          onSelectCommit={onSelectCommit}
          showNoDiffMessage={false}
          hasUncommittedChanges={hasUncommittedChanges}
          onShowUncommitted={onClearCommit}
        />
      </div>
    );
  }

  if (diff.length === 0 && !selectedCommit) {
    return (
      <div className="h-full overflow-auto p-3">
        {ciStatus && (
          <div className="max-w-3xl mx-auto mb-3 border border-[#30363d] rounded-md">
            {ciStatus}
          </div>
        )}
        {onSelectCommit ? (
          <CommitList onSelectCommit={onSelectCommit} />
        ) : (
          <div className="flex items-center justify-center h-64 text-xs text-[#8b949e]">
            No changes detected
          </div>
        )}
      </div>
    );
  }

  const sidebarVisible = isNarrow ? drawerOpen : sidebar.open;
  const toggleSidebar = () => {
    if (isNarrow) setDrawerOpen((v) => !v);
    else sidebar.setOpen(!sidebar.open);
  };

  const SidebarIcon = sidebarVisible ? PanelRightClose : PanelRightOpen;
  const sidebarToggle = (
    <button
      className="shrink-0 -mr-1 p-1 rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d]"
      onClick={(e) => {
        e.stopPropagation();
        toggleSidebar();
      }}
      title={sidebarVisible ? "Hide file list" : "Show file list"}
      aria-label={sidebarVisible ? "Hide file list" : "Show file list"}
      data-testid="sidebar-toggle"
    >
      <SidebarIcon className="size-3.5" />
    </button>
  );

  const fileCount = diff.length;

  const sidebarContent = (
    <aside
      data-testid="file-sidebar"
      className={`order-2 flex flex-col min-h-0 bg-[#010409] border-l border-[#30363d] ${
        isNarrow
          ? "absolute inset-y-0 right-0 z-30 w-[min(300px,85vw)] shadow-xl shadow-black/60"
          : "shrink-0"
      }`}
      style={isNarrow ? undefined : { width: sidebar.width }}
    >
      {ciStatus && <div className="border-b border-[#30363d] shrink-0">{ciStatus}</div>}
      <div className="flex items-center gap-2 h-8 px-2 shrink-0 border-b border-[#30363d]/60 text-[11px] text-[#8b949e]">
        <span className="uppercase tracking-wide font-medium">Changes</span>
        <span className="rounded-full bg-[#30363d] px-1.5 py-px text-[10px] text-[#c9d1d9]">
          {fileCount}
        </span>
        <span className="flex-1" />
        <span className="font-mono tabular-nums">
          <span className="text-[#3fb950]">+{totals.additions}</span>{" "}
          <span className="text-[#f85149]">−{totals.deletions}</span>
        </span>
        {isNarrow && (
          <button
            className="p-1 -mr-1 rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d]"
            onClick={() => setDrawerOpen(false)}
            aria-label="Hide file list"
            title="Hide file list"
          >
            <PanelRightClose className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <FileTree
          tree={tree}
          selectedPath={effectivePath}
          onSelect={(p) => selectFile(p)}
          onStep={step}
          collapsedDirs={collapsedDirs}
          onToggleDir={toggleDir}
          untrackedPaths={untrackedSet}
          commentCounts={commentCounts}
        />
      </div>
    </aside>
  );

  return (
    <div data-testid="diff-view" className="relative flex h-full min-h-0">
      {sidebarVisible && sidebarContent}
      {sidebarVisible && isNarrow && (
        <div
          className="absolute inset-0 z-20 bg-black/40"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      {sidebarVisible && !isNarrow && (
        <ResizeHandle width={sidebar.width} onResize={sidebar.setWidth} />
      )}
      <div ref={paneRef} data-testid="diff-pane" className="flex-1 min-w-0 overflow-auto">
        {selectedCommit && onClearCommit && (
          <div className="flex items-center gap-2 h-8 px-3 bg-[#0d1117] border-b border-[#30363d] text-xs min-w-0">
            <button
              className="shrink-0 text-[#58a6ff] hover:text-[#79c0ff]"
              onClick={onClearCommit}
            >
              ← Back
            </button>
            <span className="font-mono text-[#58a6ff] shrink-0">{selectedCommit.hash}</span>
            <span className="text-[#8b949e] truncate">{selectedCommit.message}</span>
          </div>
        )}
        {selected ? (
          <DiffFile
            key={selected.newPath}
            file={selected}
            variant="pane"
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            headerTrailing={sidebarToggle}
            onComment={hasTerminal ? handleComment : undefined}
            prComments={prComments.filter((c) => c.path === selected.newPath)}
            pendingComments={pending.filter((c) => c.file === selected.newPath)}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-xs text-[#8b949e]">
            {loading ? "Loading diff..." : "No files in this diff"}
          </div>
        )}
      </div>
    </div>
  );
}
