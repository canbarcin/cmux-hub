import React, { useState } from "react";
import { AlertCircle, Eye, Play, RotateCw, Square } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";
import { api } from "../lib/api.ts";
import type { LauncherServer } from "../hooks/useLauncher.ts";

type Props = {
  servers: LauncherServer[];
};

const STATUS_COLORS: Record<string, string> = {
  running: "bg-green-500",
  starting: "bg-yellow-500 animate-pulse",
  error: "bg-red-500",
  stopped: "bg-gray-500",
};

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="p-1 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d] disabled:opacity-50 disabled:pointer-events-none"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Compact launcher (preview server) status, rendered inline in the top bar. */
export function LauncherStatus({ servers }: Props) {
  const [selectedName, setSelectedName] = useState<string>(servers[0]?.name ?? "");
  const [busy, setBusy] = useState(false);

  const selected = servers.find((s) => s.name === selectedName) ?? servers[0];
  if (!selected) return null;

  async function handleAction(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      console.error("Launcher action failed:", e);
    } finally {
      setBusy(false);
    }
  }

  const dot = (status: string) => (
    <span
      className={`inline-block w-1.5 h-1.5 shrink-0 rounded-full ${STATUS_COLORS[status] ?? STATUS_COLORS.stopped}`}
    />
  );

  return (
    <div
      data-testid="launcher-status"
      className="flex items-center gap-1 pr-2 mr-0.5 border-r border-[#30363d] text-xs text-[#c9d1d9]"
      title={`Preview server: ${selected.name} (${selected.status})`}
    >
      {servers.length > 1 ? (
        <Select value={selectedName} onValueChange={setSelectedName}>
          <SelectTrigger
            size="sm"
            className="data-[size=sm]:h-6 h-6 px-1.5 gap-1 text-xs min-w-[96px] border-[#30363d]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {servers.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                <span className="flex items-center gap-1.5">
                  {dot(s.status)}
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="flex items-center gap-1.5">
          {dot(selected.status)}
          {selected.name}
        </span>
      )}

      <span className="text-[#6e7681] font-mono">:{selected.port}</span>

      {selected.status === "running" && (
        <>
          <IconButton
            title="Open preview"
            disabled={busy}
            onClick={() => handleAction(() => api.launcherPreview(selected.name))}
          >
            <Eye className="size-3" />
          </IconButton>
          <IconButton
            title="Restart"
            disabled={busy}
            onClick={() => handleAction(() => api.launcherRestart(selected.name))}
          >
            <RotateCw className="size-3" />
          </IconButton>
          <IconButton
            title="Stop"
            disabled={busy}
            onClick={() => handleAction(() => api.launcherStop(selected.name))}
          >
            <Square className="size-3" />
          </IconButton>
        </>
      )}

      {(selected.status === "stopped" || selected.status === "error") && (
        <IconButton
          title="Start"
          disabled={busy}
          onClick={() => handleAction(() => api.launcherStart(selected.name))}
        >
          <Play className="size-3" />
        </IconButton>
      )}

      {selected.status === "error" && selected.error && (
        <span
          className="flex items-center gap-1 text-[#f85149] truncate max-w-[160px]"
          title={selected.error}
        >
          <AlertCircle className="size-3 shrink-0" />
          <span className="truncate">{selected.error}</span>
        </span>
      )}

      {selected.status === "starting" && <span className="text-[#d29922]">Starting...</span>}
    </div>
  );
}
