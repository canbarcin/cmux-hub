import { test, expect, describe } from "bun:test";
import { describeActionError, describeActionResult } from "../lib/action-feedback.ts";
import type { ActionItem } from "../../server/actions.ts";

const paste: ActionItem = {
  label: "AI Review",
  type: "paste-and-enter",
  command: "/code-review:ai-review",
};
const shell: ActionItem = { label: "Commit", type: "shell", command: 'git commit -m "$MSG"' };

describe("describeActionResult", () => {
  test("paste-and-enter reports the command sent to the terminal", () => {
    expect(describeActionResult(paste, { ok: true, command: "/code-review:ai-review" })).toEqual({
      kind: "success",
      title: "Sent to terminal",
      message: "/code-review:ai-review",
    });
  });

  test("paste reports a paste without Enter", () => {
    const toast = describeActionResult({ ...paste, type: "paste" }, { ok: true, command: "x" });
    expect(toast.title).toBe("Pasted to terminal");
  });

  test("long or multi-line commands are shortened to one line", () => {
    const toast = describeActionResult(paste, { ok: true, command: `a\nb${"c".repeat(200)}` });
    expect(toast.message?.startsWith("a ⏎ b")).toBe(true);
    expect(toast.message?.length).toBe(120);
  });

  test("successful shell action shows the exit code and output", () => {
    const toast = describeActionResult(shell, {
      ok: true,
      command: "git commit",
      stdout: "[main 1234] msg\n",
      stderr: "",
      exitCode: 0,
    });
    expect(toast).toEqual({
      kind: "success",
      title: "Commit succeeded",
      message: "exit 0",
      details: "[main 1234] msg",
    });
  });

  test("failed shell action is an error with exit code and combined output", () => {
    const toast = describeActionResult(shell, {
      ok: false,
      command: "git commit",
      stdout: "out",
      stderr: "nothing to commit\n",
      exitCode: 1,
    });
    expect(toast.kind).toBe("error");
    expect(toast.title).toBe("Commit failed (exit 1)");
    expect(toast.details).toBe("out\nnothing to commit");
  });

  test("shell timeout is reported as such", () => {
    const toast = describeActionResult(shell, { ok: false, command: "x", exitCode: -1 });
    expect(toast.title).toBe("Commit timed out");
    expect(toast.details).toBeUndefined();
  });
});

describe("describeActionError", () => {
  test("uses the error message", () => {
    expect(describeActionError(paste, new Error("No terminal surface"))).toEqual({
      kind: "error",
      title: "AI Review failed",
      message: "No terminal surface",
    });
  });
});
