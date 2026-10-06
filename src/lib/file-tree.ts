import type { DiffFile } from "./diff-parser.ts";

export type FileStatus = "M" | "A" | "D" | "R" | "U";

export type TreeFileNode<T> = {
  kind: "file";
  /** File name (last path segment) */
  name: string;
  /** Full path, used as the node identity */
  path: string;
  item: T;
};

export type TreeDirNode<T> = {
  kind: "dir";
  /** Display name; compacted single-child chains are joined with "/" */
  name: string;
  /** Full directory path, used as the node identity */
  path: string;
  children: TreeNode<T>[];
};

export type TreeNode<T> = TreeFileNode<T> | TreeDirNode<T>;

/**
 * Git-style status letter for a parsed diff file. Untracked files are reported
 * as "U" when the caller knows the path is untracked (git shows them as new).
 */
export function fileStatus(file: DiffFile, untracked = false): FileStatus {
  if (untracked) return "U";
  if (file.isNew) return "A";
  if (file.isDeleted) return "D";
  if (file.isRenamed) return "R";
  return "M";
}

/** Count added and deleted lines across all hunks of a file. */
export function countChanges(file: DiffFile): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") additions++;
      else if (line.type === "delete") deletions++;
    }
  }
  return { additions, deletions };
}

/**
 * Parse `git status --porcelain` / `--short` output into the list of untracked
 * entries. Untracked directories keep their trailing slash (e.g. `docs/`).
 */
export function parseUntrackedPaths(status: string): string[] {
  const result: string[] = [];
  for (const line of status.split("\n")) {
    if (!line.startsWith("?? ")) continue;
    let path = line.slice(3).trim();
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    if (path) result.push(path);
  }
  return result;
}

/** True when `path` is one of the untracked entries or lives in an untracked directory. */
export function isUntrackedPath(path: string, untracked: string[]): boolean {
  return untracked.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : entry === path));
}

type MutableDir<T> = {
  name: string;
  path: string;
  dirs: Map<string, MutableDir<T>>;
  files: TreeFileNode<T>[];
};

function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function finalize<T>(dir: MutableDir<T>): TreeNode<T>[] {
  const dirs = [...dir.dirs.values()]
    .sort((a, b) => compareNames(a.name, b.name))
    .map((d) => compactDir(d));
  const files = [...dir.files].sort((a, b) => compareNames(a.name, b.name));
  return [...dirs, ...files];
}

function compactDir<T>(dir: MutableDir<T>): TreeDirNode<T> {
  let current = dir;
  let name = dir.name;
  // Merge chains of directories that contain exactly one directory and no files
  while (current.files.length === 0 && current.dirs.size === 1) {
    const only = current.dirs.values().next().value as MutableDir<T>;
    name = `${name}/${only.name}`;
    current = only;
  }
  return { kind: "dir", name, path: current.path, children: finalize(current) };
}

/**
 * Build a directory tree from a flat list of items with paths. Directories come
 * before files and both are sorted case-insensitively. Directory chains with a
 * single child directory are compacted (`server/middleware`), like VS Code.
 */
export function buildFileTree<T>(items: T[], getPath: (item: T) => string): TreeNode<T>[] {
  const root: MutableDir<T> = { name: "", path: "", dirs: new Map(), files: [] };
  for (const item of items) {
    const path = getPath(item);
    const segments = path.split("/").filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) continue;
    let dir = root;
    for (const segment of segments) {
      let next = dir.dirs.get(segment);
      if (!next) {
        next = {
          name: segment,
          path: dir.path ? `${dir.path}/${segment}` : segment,
          dirs: new Map(),
          files: [],
        };
        dir.dirs.set(segment, next);
      }
      dir = next;
    }
    dir.files.push({ kind: "file", name: fileName, path, item });
  }
  return finalize(root);
}

/** Files in display (depth-first) order, ignoring collapsed state. */
export function flattenTreeFiles<T>(nodes: TreeNode<T>[]): TreeFileNode<T>[] {
  const result: TreeFileNode<T>[] = [];
  const walk = (list: TreeNode<T>[]) => {
    for (const node of list) {
      if (node.kind === "file") result.push(node);
      else walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

/** All directory paths (as used for tree node identity) that contain `filePath`. */
export function ancestorDirPaths<T>(nodes: TreeNode<T>[], filePath: string): string[] {
  const result: string[] = [];
  const walk = (list: TreeNode<T>[]): boolean => {
    for (const node of list) {
      if (node.kind === "file") {
        if (node.path === filePath) return true;
      } else if (filePath.startsWith(`${node.path}/`)) {
        result.push(node.path);
        if (walk(node.children)) return true;
        result.pop();
      }
    }
    return false;
  };
  walk(nodes);
  return result;
}

/** Path of the file `delta` steps away from `current` in `order`, clamped to the ends. */
export function stepFile(order: string[], current: string | null, delta: number): string | null {
  if (order.length === 0) return null;
  const index = current === null ? -1 : order.indexOf(current);
  if (index === -1) return order[delta < 0 ? order.length - 1 : 0] ?? null;
  const next = Math.min(order.length - 1, Math.max(0, index + delta));
  return order[next] ?? null;
}
