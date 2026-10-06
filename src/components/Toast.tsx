import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Info, X, XCircle } from "lucide-react";
import type { ToastData } from "../lib/action-feedback.ts";

type Toast = ToastData & { id: number };

type ToastContextValue = {
  showToast: (toast: ToastData) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;
const MAX_TOASTS = 4;

const KIND_STYLES: Record<Toast["kind"], { icon: React.ReactNode; border: string }> = {
  success: {
    icon: <CheckCircle2 className="size-3.5 text-[#3fb950]" />,
    border: "border-l-[#3fb950]",
  },
  error: { icon: <XCircle className="size-3.5 text-[#f85149]" />, border: "border-l-[#f85149]" },
  info: { icon: <Info className="size-3.5 text-[#58a6ff]" />, border: "border-l-[#58a6ff]" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Errors stay until dismissed; others auto-dismiss unless the user is reading them
  const sticky = toast.kind === "error" || hovered || expanded;

  useEffect(() => {
    if (sticky) return;
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [sticky, toast.id, onDismiss]);

  const style = KIND_STYLES[toast.kind];

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      data-testid="toast"
      className={`pointer-events-auto w-full bg-[#1c2128] border border-[#30363d] border-l-2 ${style.border} rounded-md shadow-lg shadow-black/40 text-xs`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <span className="mt-px shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[#e6edf3] font-medium">{toast.title}</div>
          {toast.message && (
            <div className="mt-0.5 font-mono text-[11px] text-[#8b949e] break-all">
              {toast.message}
            </div>
          )}
          {toast.details && (
            <button
              className="mt-1 flex items-center gap-0.5 text-[11px] text-[#58a6ff] hover:text-[#79c0ff]"
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronRight
                className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
              {expanded ? "Hide output" : "Show output"}
            </button>
          )}
        </div>
        <button
          className="shrink-0 text-[#6e7681] hover:text-[#c9d1d9]"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {toast.details && expanded && (
        <pre className="mx-2.5 mb-2 max-h-56 overflow-auto rounded bg-[#0d1117] border border-[#30363d] p-2 font-mono text-[11px] leading-4 text-[#c9d1d9] whitespace-pre-wrap break-all">
          {toast.details}
        </pre>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastData) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...toast, id }].slice(-MAX_TOASTS));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-3 right-3 z-[60] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
