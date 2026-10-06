import React, { useEffect, useRef } from "react";
import { ChevronRight, MessageSquare } from "lucide-react";
import type { DiffFile } from "../lib/diff-parser.ts";
import { countChanges, fileStatus, type FileStatus, type TreeNode } from "../lib/file-tree.ts";

type Props = {
  tree: TreeNode<DiffFile>[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** Step the selection by +1/-1 (arrow keys while the tree has focus) */
  onStep: (delta: number) => void;
  collapsedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  untrackedPaths: Set<string>;
  commentCounts: Map<string, number>;
};

const STATUS_COLOR: Record<FileStatus, string> = {
  M: "text-[#d29922]",
  A: "text-[#3fb950]",
  U: "text-[#56d364]",
  D: "text-[#f85149]",
  R: "text-[#a371f7]",
};

const STATUS_TITLE: Record<FileStatus, string> = {
  M: "Modified",
  A: "Added",
  U: "Untracked",
  D: "Deleted",
  R: "Renamed",
};

const INDENT_PX = 12;
const BASE_PAD_PX = 6;

function FileRow({
  node,
  depth,
  selected,
  untracked,
  commentCount,
  onSelect,
}: {
  node: Extract<TreeNode<DiffFile>, { kind: "file" }>;
  depth: number;
  selected: boolean;
  untracked: boolean;
  commentCount: number;
  onSelect: (path: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const file = node.item;
  const status = fileStatus(file, untracked);
  const { additions, deletions } = countChanges(file);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button
      ref={ref}
      data-testid="file-tree-item"
      data-path={node.path}
      aria-current={selected ? "true" : undefined}
      tabIndex={-1}
      className={`group w-full flex items-center gap-1.5 h-[22px] pr-2 text-left text-[12px] leading-none border-l-2 ${
        selected
          ? "bg-[#1f6feb]/20 border-[#58a6ff] text-[#e6edf3]"
          : "border-transparent text-[#c9d1d9] hover:bg-[#21262d]"
      } ${file.generated ? "opacity-50" : ""}`}
      style={{ paddingLeft: BASE_PAD_PX + depth * INDENT_PX + 14 }}
      title={
        file.generated
          ? `${node.path} (generated)`
          : file.isRenamed
            ? `${file.oldPath} → ${file.newPath}`
            : node.path
      }
      onClick={() => onSelect(node.path)}
    >
      <span
        className={`w-2.5 shrink-0 font-mono text-[10px] font-semibold ${STATUS_COLOR[status]}`}
        title={STATUS_TITLE[status]}
      >
        {status}
      </span>
      <span
        className={`flex-1 min-w-0 truncate ${file.isDeleted ? "line-through decoration-[#f85149]/60" : ""}`}
      >
        {node.name}
      </span>
      {commentCount > 0 && (
        <span
          className="shrink-0 flex items-center gap-0.5 rounded-full bg-[#d29922]/15 px-1 py-px text-[10px] text-[#d29922]"
          title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
        >
          <MessageSquare className="size-2.5" />
          {commentCount}
        </span>
      )}
      {!file.generated && (additions > 0 || deletions > 0) && (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#6e7681] group-hover:text-[#8b949e]">
          {additions > 0 && <span className="text-[#3fb950]/80">+{additions}</span>}
          {additions > 0 && deletions > 0 && " "}
          {deletions > 0 && <span className="text-[#f85149]/80">−{deletions}</span>}
        </span>
      )}
    </button>
  );
}

export function FileTree({
  tree,
  selectedPath,
  onSelect,
  onStep,
  collapsedDirs,
  onToggleDir,
  untrackedPaths,
  commentCounts,
}: Props) {
  const renderNodes = (nodes: TreeNode<DiffFile>[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      if (node.kind === "file") {
        return (
          <FileRow
            key={node.path}
            node={node}
            depth={depth}
            selected={node.path === selectedPath}
            untracked={untrackedPaths.has(node.path)}
            commentCount={commentCounts.get(node.path) ?? 0}
            onSelect={onSelect}
          />
        );
      }
      const collapsed = collapsedDirs.has(node.path);
      return (
        <div key={`dir:${node.path}`} role="group">
          <button
            tabIndex={-1}
            className="w-full flex items-center gap-1 h-[22px] pr-2 text-left text-[12px] leading-none text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9] border-l-2 border-transparent"
            style={{ paddingLeft: BASE_PAD_PX + depth * INDENT_PX }}
            onClick={() => onToggleDir(node.path)}
            title={node.path}
            aria-expanded={!collapsed}
          >
            <ChevronRight
              className={`size-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
            />
            <span className="truncate">{node.name}</span>
          </button>
          {!collapsed && renderNodes(node.children, depth + 1)}
        </div>
      );
    });

  return (
    <div
      data-testid="file-tree"
      role="tree"
      tabIndex={0}
      className="py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#1f6feb]/60"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onStep(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onStep(-1);
        }
      }}
    >
      {renderNodes(tree, 0)}
    </div>
  );
}
