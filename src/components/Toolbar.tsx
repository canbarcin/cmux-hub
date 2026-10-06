import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, GitBranch, Loader2 } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { api } from "../lib/api.ts";
import type { MenuItem, ActionItem } from "../../server/actions.ts";
import { isSubmenu, isActionWithInput } from "../../server/actions.ts";
import { useReviewQueue } from "../hooks/useReviewQueue.tsx";
import { describeActionError, describeActionResult } from "../lib/action-feedback.ts";
import { useToast } from "./Toast.tsx";

type Props = {
  branch: string;
  hasTerminal: boolean;
  actions: MenuItem[];
  onShowCommitList?: () => void;
  onShowPlan?: () => void;
  onShowReview?: () => void;
  onShowDiff?: () => void;
  /** Extra status shown before the actions (e.g. launcher / preview server) */
  status?: React.ReactNode;
};

const BAR_BUTTON =
  "h-6 px-2 text-xs font-normal text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e6edf3] dark:hover:bg-[#30363d]";

/** Run an action and report the result as a toast. */
function useRunAction() {
  const { showToast } = useToast();
  return async (id: string, action: ActionItem, variables?: Record<string, string>) => {
    try {
      const res = await api.executeAction(id, variables);
      showToast(describeActionResult(action, res));
      return true;
    } catch (e) {
      console.error("Action failed:", e);
      showToast(describeActionError(action, e));
      return false;
    }
  };
}

function SimpleActionButton({
  id,
  action,
  disabled,
  onSending,
  onDone,
  className,
}: {
  id: string;
  action: ActionItem;
  disabled: boolean;
  onSending: (sending: boolean) => void;
  onDone?: () => void;
  className?: string;
}) {
  const runAction = useRunAction();
  const [running, setRunning] = useState(false);

  const handleExecute = async () => {
    onSending(true);
    setRunning(true);
    try {
      await runAction(id, action);
    } finally {
      setRunning(false);
      onSending(false);
      onDone?.();
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleExecute}
      disabled={disabled}
      className={`${BAR_BUTTON} ${className ?? ""}`}
    >
      {running && <Loader2 className="size-3 animate-spin" />}
      {action.label}
    </Button>
  );
}

function SubmenuButton({
  label,
  items,
  baseId,
  disabled,
  onSending,
}: {
  label: string;
  items: ActionItem[];
  baseId: string;
  disabled: boolean;
  onSending: (sending: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" className={BAR_BUTTON} onClick={() => setOpen(!open)}>
        {label}
        <ChevronDown className="size-3 -ml-0.5 opacity-70" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 p-1 bg-[#21262d] border border-[#30363d] rounded-md shadow-lg shadow-black/40 z-50 min-w-[160px] flex flex-col">
          {items.map((item, i) => (
            <SimpleActionButton
              key={item.label}
              id={`${baseId}.${i}`}
              action={item}
              disabled={disabled}
              onSending={onSending}
              onDone={() => setOpen(false)}
              className="w-full justify-start"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InputRow({
  id,
  action,
  sending,
  onSending,
  onClose,
}: {
  id: string;
  action: ActionItem;
  sending: boolean;
  onSending: (s: boolean) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const runAction = useRunAction();

  const handleExecute = async () => {
    if (!value.trim() || !action.input) return;
    onSending(true);
    try {
      const ok = await runAction(id, action, { [action.input.variable]: value });
      if (ok) {
        setValue("");
        onClose();
      }
    } finally {
      onSending(false);
    }
  };

  const canSubmit = !sending && !!value.trim();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#30363d]">
      <span className="text-xs text-[#8b949e] shrink-0">{action.label}</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={action.input?.placeholder ?? ""}
        className="flex-1 h-7 text-xs md:text-xs bg-[#0d1117] border-[#30363d] text-[#e6edf3]"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleExecute();
          if (e.key === "Escape") onClose();
        }}
        autoFocus
      />
      <Button
        size="sm"
        className="h-7 px-3 text-xs bg-[#238636] hover:bg-[#2ea043] text-white"
        onClick={handleExecute}
        disabled={!canSubmit}
      >
        {sending && <Loader2 className="size-3 animate-spin" />}
        Send
      </Button>
      <Button variant="ghost" size="sm" className={BAR_BUTTON} onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}

function NavLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <span className="text-[#30363d]">/</span>
      <button
        className="text-[#8b949e] hover:text-[#e6edf3] text-xs leading-none px-0.5"
        onClick={onClick}
      >
        {label}
      </button>
    </>
  );
}

export function Toolbar({
  branch,
  hasTerminal,
  actions,
  onShowCommitList,
  onShowPlan,
  onShowReview,
  onShowDiff,
  status,
}: Props) {
  const [sending, setSending] = useState(false);
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const { pending, submitReview, submitting: submittingReview, clearQueue } = useReviewQueue();

  return (
    <div
      data-testid="toolbar"
      className="border-b border-[#30363d] bg-[#161b22] flex-shrink-0 z-20"
    >
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-h-9 px-3 py-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            className="flex items-center gap-1 text-[#58a6ff] hover:text-[#79c0ff] text-xs font-mono leading-none min-w-0"
            onClick={onShowDiff}
            title={branch}
          >
            <GitBranch className="size-3.5 shrink-0" />
            <span className="truncate max-w-[200px]">{branch}</span>
          </button>
          {onShowCommitList && <NavLink label="Commits" onClick={onShowCommitList} />}
          {onShowPlan && <NavLink label="Plan" onClick={onShowPlan} />}
          {onShowReview && <NavLink label="Review" onClick={onShowReview} />}
        </div>
        <div className="flex-1" />
        {status}
        {hasTerminal && pending.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={submittingReview}
              onClick={submitReview}
              className="h-6 px-2 text-xs bg-[#d29922] hover:bg-[#bb8a1e] text-black"
            >
              {submittingReview ? "Sending..." : `Finish review (${pending.length})`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={BAR_BUTTON}
              onClick={clearQueue}
              title="Discard all pending comments"
            >
              Discard
            </Button>
          </div>
        )}
        {hasTerminal && actions.length > 0 && (
          <div className="flex items-center gap-0.5" data-testid="toolbar-actions">
            {actions.map((item, i) => {
              const id = String(i);
              if (isSubmenu(item)) {
                return (
                  <SubmenuButton
                    key={item.label}
                    label={item.label}
                    items={item.submenu}
                    baseId={id}
                    disabled={sending}
                    onSending={setSending}
                  />
                );
              }
              if (isActionWithInput(item)) {
                return (
                  <Button
                    key={item.label}
                    variant="ghost"
                    size="sm"
                    className={`${BAR_BUTTON} ${activeInput === id ? "bg-[#30363d]" : ""}`}
                    onClick={() => setActiveInput(activeInput === id ? null : id)}
                  >
                    {item.label}
                  </Button>
                );
              }
              return (
                <SimpleActionButton
                  key={item.label}
                  id={id}
                  action={item}
                  disabled={sending}
                  onSending={setSending}
                />
              );
            })}
          </div>
        )}
      </div>

      {hasTerminal &&
        actions.map((item, i) => {
          const id = String(i);
          if (!isActionWithInput(item)) return null;
          if (activeInput !== id) return null;
          return (
            <InputRow
              key={item.label}
              id={id}
              action={item}
              sending={sending}
              onSending={setSending}
              onClose={() => setActiveInput(null)}
            />
          );
        })}
    </div>
  );
}
