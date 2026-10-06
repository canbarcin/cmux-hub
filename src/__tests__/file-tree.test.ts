import { test, expect, describe } from "bun:test";
import {
  ancestorDirPaths,
  buildFileTree,
  countChanges,
  fileStatus,
  flattenTreeFiles,
  isUntrackedPath,
  parseUntrackedPaths,
  stepFile,
  type TreeNode,
} from "../lib/file-tree.ts";
import type { DiffFile } from "../lib/diff-parser.ts";

const id = (p: string) => p;

function shape(nodes: TreeNode<string>[]): unknown[] {
  return nodes.map((n) => (n.kind === "file" ? n.name : { [n.name]: shape(n.children) }));
}

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    oldPath: "a.ts",
    newPath: "a.ts",
    hunks: [],
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    ...overrides,
  };
}

describe("buildFileTree", () => {
  test("puts directories before files and sorts case-insensitively", () => {
    const tree = buildFileTree(["b.ts", "src/z.ts", "A.md", "src/a.ts", "lib/x.ts"], id);
    expect(shape(tree)).toEqual([{ lib: ["x.ts"] }, { src: ["a.ts", "z.ts"] }, "A.md", "b.ts"]);
  });

  test("compacts single-child directory chains", () => {
    const tree = buildFileTree(
      ["server/middleware/security.ts", "server/middleware/auth.ts", "src/a/b/c.ts"],
      id,
    );
    expect(shape(tree)).toEqual([
      { "server/middleware": ["auth.ts", "security.ts"] },
      { "src/a/b": ["c.ts"] },
    ]);
    const first = tree[0];
    expect(first?.kind === "dir" && first.path).toBe("server/middleware");
  });

  test("does not compact a directory that also holds files", () => {
    const tree = buildFileTree(["server/app.ts", "server/middleware/security.ts"], id);
    expect(shape(tree)).toEqual([{ server: [{ middleware: ["security.ts"] }, "app.ts"] }]);
  });

  test("keeps the full path on file nodes", () => {
    const files = flattenTreeFiles(buildFileTree(["src/components/ui/button.tsx"], id));
    expect(files.map((f) => f.path)).toEqual(["src/components/ui/button.tsx"]);
    expect(files[0]?.name).toBe("button.tsx");
  });

  test("returns an empty tree for no items", () => {
    expect(buildFileTree([], id)).toEqual([]);
  });
});

describe("flattenTreeFiles / stepFile", () => {
  const tree = buildFileTree(["z.ts", "src/b.ts", "src/a.ts", "docs/readme.md"], id);
  const order = flattenTreeFiles(tree).map((f) => f.path);

  test("returns files in display order", () => {
    expect(order).toEqual(["docs/readme.md", "src/a.ts", "src/b.ts", "z.ts"]);
  });

  test("steps forward and backward, clamped at the ends", () => {
    expect(stepFile(order, "src/a.ts", 1)).toBe("src/b.ts");
    expect(stepFile(order, "src/a.ts", -1)).toBe("docs/readme.md");
    expect(stepFile(order, "z.ts", 1)).toBe("z.ts");
    expect(stepFile(order, "docs/readme.md", -1)).toBe("docs/readme.md");
  });

  test("falls back to the first/last file when the current one is unknown", () => {
    expect(stepFile(order, null, 1)).toBe("docs/readme.md");
    expect(stepFile(order, "gone.ts", -1)).toBe("z.ts");
    expect(stepFile([], null, 1)).toBeNull();
  });
});

describe("ancestorDirPaths", () => {
  test("returns compacted directory node paths that contain the file", () => {
    const tree = buildFileTree(["server/middleware/security.ts", "server/app.ts", "x.ts"], id);
    expect(ancestorDirPaths(tree, "server/middleware/security.ts")).toEqual([
      "server",
      "server/middleware",
    ]);
    expect(ancestorDirPaths(tree, "x.ts")).toEqual([]);
    expect(ancestorDirPaths(tree, "missing/file.ts")).toEqual([]);
  });
});

describe("fileStatus / countChanges", () => {
  test("maps diff flags to status letters", () => {
    expect(fileStatus(makeFile())).toBe("M");
    expect(fileStatus(makeFile({ isNew: true }))).toBe("A");
    expect(fileStatus(makeFile({ isDeleted: true }))).toBe("D");
    expect(fileStatus(makeFile({ isRenamed: true }))).toBe("R");
    expect(fileStatus(makeFile({ isNew: true }), true)).toBe("U");
  });

  test("counts added and deleted lines across hunks", () => {
    const line = (type: "add" | "delete" | "context") => ({
      type,
      content: "",
      oldLineNumber: null,
      newLineNumber: null,
    });
    const hunk = (lines: ReturnType<typeof line>[]) => ({
      header: "@@",
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
      lines,
    });
    const file = makeFile({
      hunks: [
        hunk([line("add"), line("context"), line("delete")]),
        hunk([line("add"), line("add")]),
      ],
    });
    expect(countChanges(file)).toEqual({ additions: 3, deletions: 1 });
  });
});

describe("untracked paths", () => {
  test("parses only untracked entries from porcelain status", () => {
    const status = " M src/a.ts\n?? new.ts\nA  added.ts\n?? docs/\n";
    expect(parseUntrackedPaths(status)).toEqual(["new.ts", "docs/"]);
  });

  test("matches files and files inside untracked directories", () => {
    const untracked = ["new.ts", "docs/"];
    expect(isUntrackedPath("new.ts", untracked)).toBe(true);
    expect(isUntrackedPath("docs/guide/intro.md", untracked)).toBe(true);
    expect(isUntrackedPath("src/new.ts", untracked)).toBe(false);
  });
});
