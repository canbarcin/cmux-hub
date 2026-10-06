import { test, expect, describe } from "bun:test";
import { fileSelectionPath, parseHash } from "../lib/route.ts";

describe("parseHash", () => {
  test("parses the existing pages", () => {
    expect(parseHash("")).toEqual({ page: "diff" });
    expect(parseHash("#/")).toEqual({ page: "diff" });
    expect(parseHash("#/commits")).toEqual({ page: "commits" });
    expect(parseHash("#/plan")).toEqual({ page: "plan" });
    expect(parseHash("#/review")).toEqual({ page: "review" });
    expect(parseHash("#/commit/abc123")).toEqual({ page: "commit", hash: "abc123" });
    expect(parseHash("#/commit/")).toEqual({ page: "diff" });
  });

  test("reads the selected file and view mode on diff pages", () => {
    expect(parseHash("#/?file=src%2Fa%20b.ts")).toEqual({ page: "diff", file: "src/a b.ts" });
    expect(parseHash("#/?file=x.ts&view=split")).toEqual({
      page: "diff",
      file: "x.ts",
      view: "split",
    });
    expect(parseHash("#/commit/abc?file=y.ts")).toEqual({
      page: "commit",
      hash: "abc",
      file: "y.ts",
    });
  });

  test("ignores unknown view modes and empty file params", () => {
    expect(parseHash("#/?view=wide&file=")).toEqual({ page: "diff" });
  });
});

describe("fileSelectionPath", () => {
  test("round-trips through parseHash", () => {
    const diffPath = fileSelectionPath({ page: "diff" }, "src/a&b.ts");
    expect(parseHash(`#${diffPath}`)).toEqual({ page: "diff", file: "src/a&b.ts" });

    const commitPath = fileSelectionPath({ page: "commit", hash: "abc" }, "x.ts");
    expect(commitPath).toBe("/commit/abc?file=x.ts");
    expect(parseHash(`#${commitPath}`)).toEqual({ page: "commit", hash: "abc", file: "x.ts" });
  });
});
