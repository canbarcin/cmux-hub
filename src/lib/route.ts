export type DiffViewMode = "unified" | "split";

export type Route =
  | { page: "diff"; file?: string; view?: DiffViewMode }
  | { page: "commits" }
  | { page: "plan" }
  | { page: "review" }
  | { page: "commit"; hash: string; file?: string; view?: DiffViewMode };

function parseView(value: string | null): DiffViewMode | undefined {
  return value === "split" || value === "unified" ? value : undefined;
}

/**
 * Parse a location hash. Diff pages carry the selected file (and optionally a
 * view mode) as query parameters: `#/?file=src/a.ts`,
 * `#/commit/abc123?file=src/a.ts&view=split`.
 */
export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  const queryIndex = h.indexOf("?");
  const path = queryIndex === -1 ? h : h.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? "" : h.slice(queryIndex + 1));
  const file = params.get("file") || undefined;
  const view = parseView(params.get("view"));

  if (path === "commits") return { page: "commits" };
  if (path === "plan") return { page: "plan" };
  if (path === "review") return { page: "review" };
  if (path.startsWith("commit/")) {
    const commitHash = path.slice("commit/".length);
    if (commitHash) return withOptional({ page: "commit", hash: commitHash }, file, view);
  }
  return withOptional({ page: "diff" }, file, view);
}

function withOptional<R extends { page: "diff" } | { page: "commit"; hash: string }>(
  route: R,
  file: string | undefined,
  view: DiffViewMode | undefined,
): R & { file?: string; view?: DiffViewMode } {
  const result: R & { file?: string; view?: DiffViewMode } = { ...route };
  if (file) result.file = file;
  if (view) result.view = view;
  return result;
}

/** Hash path (without `#`) that selects `file` on the current diff or commit page. */
export function fileSelectionPath(route: Route, file: string): string {
  const query = `?file=${encodeURIComponent(file)}`;
  if (route.page === "commit") return `/commit/${route.hash}${query}`;
  return `/${query}`;
}
