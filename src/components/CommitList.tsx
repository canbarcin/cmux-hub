import { useState, useEffect } from "react";
import { api } from "../lib/api.ts";
import type { SelectedCommit } from "../hooks/useDiff.ts";

type Props = {
  onSelectCommit: (commit: SelectedCommit) => void;
  showNoDiffMessage?: boolean;
  hasUncommittedChanges?: boolean;
  onShowUncommitted?: () => void;
};

export function CommitList({
  onSelectCommit,
  showNoDiffMessage = true,
  hasUncommittedChanges,
  onShowUncommitted,
}: Props) {
  const [commits, setCommits] = useState<SelectedCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getLog(20)
      .then((result) => setCommits(result.commits))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[#8b949e]">
        Loading commits...
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[#8b949e]">
        No changes detected
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {showNoDiffMessage && (
        <p className="text-[#8b949e] text-xs mb-2">No changes detected. Recent commits:</p>
      )}
      <div className="border border-[#30363d] rounded-md overflow-hidden">
        {hasUncommittedChanges && onShowUncommitted && (
          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-[#161b22] border-b border-[#30363d] transition-colors bg-[#d29922]/[0.06]"
            onClick={onShowUncommitted}
          >
            <span className="text-[#d29922] font-mono text-xs shrink-0">●</span>
            <span className="text-[#d29922] text-xs flex-1">Uncommitted changes</span>
          </button>
        )}
        {commits.map((commit) => (
          <button
            key={commit.hash}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-[#161b22] border-b border-[#30363d] last:border-b-0 transition-colors"
            onClick={() => onSelectCommit(commit)}
          >
            <span className="text-[#58a6ff] font-mono text-[11px] shrink-0">{commit.hash}</span>
            <span className="text-[#c9d1d9] text-xs truncate flex-1">{commit.message}</span>
            <span className="text-[#8b949e] text-[11px] shrink-0">{commit.relativeDate}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
