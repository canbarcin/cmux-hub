/**
 * Side-by-side (split) diff layout.
 *
 * The unified renderer produces a flat list of items: diff lines plus rows that
 * belong to a line (comments, comment form) and standalone rows (hunk headers,
 * expand buttons). Split view pairs each run of deleted lines with the run of
 * added lines that follows it, shows context lines on both sides, and keeps the
 * rows attached to a line right below the pair that contains it.
 */

export type SplitItemKind = "delete" | "add" | "context" | "attachment" | "standalone";

export type SplitRow<T> =
  | { kind: "pair"; left: T | null; right: T | null }
  | { kind: "full"; item: T };

type Entry<T> = { item: T; attachments: T[] };

export function buildSplitRows<T>(items: T[], kindOf: (item: T) => SplitItemKind): SplitRow<T>[] {
  const rows: SplitRow<T>[] = [];
  let deletes: Entry<T>[] = [];
  let adds: Entry<T>[] = [];
  // Attachments that arrive before any line (should not happen, but stay safe)
  let lastEntry: Entry<T> | null = null;

  const flush = () => {
    const count = Math.max(deletes.length, adds.length);
    for (let i = 0; i < count; i++) {
      const left = deletes[i] ?? null;
      const right = adds[i] ?? null;
      rows.push({ kind: "pair", left: left?.item ?? null, right: right?.item ?? null });
      for (const a of left?.attachments ?? []) rows.push({ kind: "full", item: a });
      for (const a of right?.attachments ?? []) rows.push({ kind: "full", item: a });
    }
    deletes = [];
    adds = [];
  };

  for (const item of items) {
    const kind = kindOf(item);
    switch (kind) {
      case "delete": {
        // A delete after adds starts a new change block
        if (adds.length > 0) flush();
        lastEntry = { item, attachments: [] };
        deletes.push(lastEntry);
        break;
      }
      case "add": {
        lastEntry = { item, attachments: [] };
        adds.push(lastEntry);
        break;
      }
      case "context": {
        flush();
        rows.push({ kind: "pair", left: item, right: item });
        lastEntry = null;
        break;
      }
      case "attachment": {
        if (lastEntry) lastEntry.attachments.push(item);
        else rows.push({ kind: "full", item });
        break;
      }
      case "standalone": {
        flush();
        rows.push({ kind: "full", item });
        lastEntry = null;
        break;
      }
    }
  }
  flush();
  return rows;
}
