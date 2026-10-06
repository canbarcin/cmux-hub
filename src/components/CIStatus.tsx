import React, { useState } from "react";
import { CheckCircle2, ChevronRight, CircleDot, Clock, XCircle } from "lucide-react";

type Check = {
  name: string;
  status: string;
  conclusion: string;
  url: string;
};

type Props = {
  checks: Check[];
  prTitle?: string | null;
  prUrl?: string | null;
  prState?: string | null;
};

function checkState(check: Check): "success" | "failure" | "pending" | "neutral" {
  if (check.conclusion === "SUCCESS") return "success";
  if (check.conclusion === "FAILURE") return "failure";
  if (check.status === "IN_PROGRESS" || check.status === "QUEUED") return "pending";
  return "neutral";
}

function statusIcon(check: Check): React.ReactNode {
  switch (checkState(check)) {
    case "success":
      return <CheckCircle2 className="size-3 shrink-0 text-[#3fb950]" />;
    case "failure":
      return <XCircle className="size-3 shrink-0 text-[#f85149]" />;
    case "pending":
      return <Clock className="size-3 shrink-0 text-[#d29922]" />;
    default:
      return <CircleDot className="size-3 shrink-0 text-[#8b949e]" />;
  }
}

function statusColor(check: Check): string {
  switch (checkState(check)) {
    case "success":
      return "text-[#c9d1d9]";
    case "failure":
      return "text-[#f85149]";
    default:
      return "text-[#d29922]";
  }
}

function prStateIcon(state: string): React.ReactNode {
  // GitHub-style PR state icons
  if (state === "MERGED") {
    return (
      <svg
        className="inline shrink-0 w-3.5 h-3.5 text-[#a371f7]"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8-9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 4a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
      </svg>
    );
  }
  if (state === "CLOSED") {
    return (
      <svg
        className="inline shrink-0 w-3.5 h-3.5 text-[#f85149]"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5ZM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
      </svg>
    );
  }
  // OPEN
  return (
    <svg
      className="inline shrink-0 w-3.5 h-3.5 text-[#3fb950]"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

export function CIStatus({ checks, prTitle, prUrl, prState }: Props) {
  const failed = checks.filter((c) => checkState(c) === "failure").length;
  const pending = checks.filter((c) => checkState(c) === "pending").length;
  const passed = checks.filter((c) => checkState(c) === "success").length;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  // Expand by default only when something needs attention
  const showChecks = expanded ?? failed > 0;

  if (checks.length === 0 && !prUrl) return null;

  return (
    <div data-testid="ci-status" className="px-2 py-1.5 space-y-1 text-[12px]">
      {prUrl && (
        <div className="flex items-center gap-1.5 min-w-0">
          {prState && prStateIcon(prState)}
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#58a6ff] hover:text-[#79c0ff] hover:underline truncate"
            title={prTitle ?? "Pull Request"}
          >
            {prTitle ?? "Pull Request"}
          </a>
        </div>
      )}
      {checks.length > 0 && (
        <>
          <button
            className="flex items-center gap-1 text-[11px] text-[#8b949e] hover:text-[#c9d1d9]"
            onClick={() => setExpanded(!showChecks)}
          >
            <ChevronRight
              className={`size-3 transition-transform ${showChecks ? "rotate-90" : ""}`}
            />
            <span>Checks</span>
            <span className="text-[#3fb950]">{passed}✓</span>
            {failed > 0 && <span className="text-[#f85149]">{failed}✗</span>}
            {pending > 0 && <span className="text-[#d29922]">{pending}…</span>}
          </button>
          {showChecks && (
            <div className="space-y-0.5 pl-1">
              {checks.map((check) => (
                <div key={check.name} className="flex items-center gap-1.5 min-w-0 text-[11px]">
                  {statusIcon(check)}
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${statusColor(check)} hover:underline truncate`}
                    title={check.name}
                  >
                    {check.name}
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
