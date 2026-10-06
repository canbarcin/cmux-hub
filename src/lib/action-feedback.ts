import type { ActionItem } from "../../server/actions.ts";

export type ActionResponse = {
  ok: boolean;
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};

export type ToastKind = "success" | "error" | "info";

export type ToastData = {
  kind: ToastKind;
  title: string;
  /** Optional secondary line shown in monospace */
  message?: string;
  /** Optional long output, rendered collapsed and expandable */
  details?: string;
};

const MAX_COMMAND_LENGTH = 120;

function truncate(text: string, max: number): string {
  const singleLine = text.replace(/\s*\n\s*/g, " ⏎ ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

/** Toast describing a successful /api/action response. */
export function describeActionResult(action: ActionItem, response: ActionResponse): ToastData {
  if (action.type === "shell") {
    const exitCode = response.exitCode ?? (response.ok ? 0 : 1);
    const output = [response.stdout ?? "", response.stderr ?? ""]
      .map((s) => s.trimEnd())
      .filter(Boolean)
      .join("\n");
    const timedOut = exitCode === -1;
    return {
      kind: response.ok ? "success" : "error",
      title: response.ok
        ? `${action.label} succeeded`
        : timedOut
          ? `${action.label} timed out`
          : `${action.label} failed (exit ${exitCode})`,
      message: response.ok ? `exit ${exitCode}` : undefined,
      details: output || undefined,
    };
  }
  const verb = action.type === "paste" ? "Pasted to terminal" : "Sent to terminal";
  return {
    kind: "success",
    title: verb,
    message: truncate(response.command || action.command, MAX_COMMAND_LENGTH),
  };
}

/** Toast describing a failed /api/action request (network or server error). */
export function describeActionError(action: ActionItem, error: unknown): ToastData {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "error", title: `${action.label} failed`, message };
}
