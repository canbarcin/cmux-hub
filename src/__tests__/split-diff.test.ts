import { test, expect, describe } from "bun:test";
import { buildSplitRows, type SplitItemKind, type SplitRow } from "../lib/split-diff.ts";

// Items are encoded as "<kind>:<label>" for readability
const kindOf = (item: string): SplitItemKind => item.split(":")[0] as SplitItemKind;

function render(rows: SplitRow<string>[]): string[] {
  return rows.map((r) =>
    r.kind === "full" ? `[${r.item}]` : `${r.left ?? "-"} | ${r.right ?? "-"}`,
  );
}

describe("buildSplitRows", () => {
  test("shows context lines on both sides", () => {
    expect(render(buildSplitRows(["context:1", "context:2"], kindOf))).toEqual([
      "context:1 | context:1",
      "context:2 | context:2",
    ]);
  });

  test("pairs a run of deletes with the following run of adds", () => {
    const items = ["context:a", "delete:1", "delete:2", "add:1", "context:b"];
    expect(render(buildSplitRows(items, kindOf))).toEqual([
      "context:a | context:a",
      "delete:1 | add:1",
      "delete:2 | -",
      "context:b | context:b",
    ]);
  });

  test("puts extra adds on the right with an empty left side", () => {
    const items = ["delete:1", "add:1", "add:2", "add:3"];
    expect(render(buildSplitRows(items, kindOf))).toEqual([
      "delete:1 | add:1",
      "- | add:2",
      "- | add:3",
    ]);
  });

  test("starts a new block when a delete follows adds", () => {
    const items = ["add:1", "delete:1", "add:2"];
    expect(render(buildSplitRows(items, kindOf))).toEqual(["- | add:1", "delete:1 | add:2"]);
  });

  test("emits attachments after the pair that contains their line", () => {
    const items = [
      "delete:1",
      "delete:2",
      "attachment:form-after-del2",
      "add:1",
      "attachment:comment-on-add1",
      "context:c",
      "attachment:comment-on-ctx",
    ];
    expect(render(buildSplitRows(items, kindOf))).toEqual([
      "delete:1 | add:1",
      "[attachment:comment-on-add1]",
      "delete:2 | -",
      "[attachment:form-after-del2]",
      "context:c | context:c",
      "[attachment:comment-on-ctx]",
    ]);
  });

  test("standalone rows flush the pending block and keep their position", () => {
    const items = ["delete:1", "standalone:hunk-2", "add:1", "standalone:expand"];
    expect(render(buildSplitRows(items, kindOf))).toEqual([
      "delete:1 | -",
      "[standalone:hunk-2]",
      "- | add:1",
      "[standalone:expand]",
    ]);
  });
});
