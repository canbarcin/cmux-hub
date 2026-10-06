import React, { useCallback } from "react";
import { DiffFile } from "./DiffFile.tsx";
import { api } from "../lib/api.ts";
import { usePlanData } from "../hooks/usePlanData.ts";

type Props = {
  onBack: () => void;
  hasTerminal?: boolean;
};

export function PlanView({ onBack, hasTerminal = false }: Props) {
  const { files, planPath, loading, error, isPending } = usePlanData();

  const handleComment = useCallback(
    async (file: string, startLine: number, endLine: number, comment: string) => {
      try {
        await api.sendComment(file, startLine, endLine, comment);
      } catch (e) {
        console.error("Failed to send comment:", e);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[#8b949e]">
        Loading plan...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-sm">
        <p className="text-[#f85149]">{error}</p>
        <button onClick={onBack} className="text-[#58a6ff] hover:text-[#79c0ff] underline">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 h-8 px-3 bg-[#161b22] border border-[#30363d] rounded-md relative overflow-hidden text-xs">
        {isPending && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1a1e24] overflow-hidden">
            <div className="h-full bg-[#58a6ff] animate-progress-bar" />
          </div>
        )}
        <button className="shrink-0 text-[#58a6ff] hover:text-[#79c0ff]" onClick={onBack}>
          ← Back
        </button>
        {planPath && <span className="text-[#8b949e] font-mono truncate">{planPath}</span>}
      </div>
      {files.map((file, idx) => (
        <DiffFile
          key={`${file.newPath}-${idx}`}
          file={file}
          onComment={hasTerminal ? handleComment : undefined}
        />
      ))}
    </div>
  );
}
