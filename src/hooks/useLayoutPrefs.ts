import { useState, useEffect, useCallback } from "react";
import type { DiffViewMode } from "../lib/route.ts";

const VIEW_MODE_KEY = "cmux-hub:diff-view-mode";
const SIDEBAR_WIDTH_KEY = "cmux-hub:sidebar-width";
const SIDEBAR_OPEN_KEY = "cmux-hub:sidebar-open";

export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 240;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode etc.)
  }
}

/** Unified/split preference, persisted in localStorage. A URL `view` param overrides it. */
export function useDiffViewMode(urlOverride?: DiffViewMode) {
  const [mode, setModeState] = useState<DiffViewMode>(() => {
    if (urlOverride) return urlOverride;
    return readStorage(VIEW_MODE_KEY) === "split" ? "split" : "unified";
  });

  useEffect(() => {
    if (urlOverride) {
      setModeState(urlOverride);
      writeStorage(VIEW_MODE_KEY, urlOverride);
    }
  }, [urlOverride]);

  const setMode = useCallback((next: DiffViewMode) => {
    setModeState(next);
    writeStorage(VIEW_MODE_KEY, next);
  }, []);

  return [mode, setMode] as const;
}

function clampWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/** Sidebar width and open state (desktop), persisted in localStorage. */
export function useSidebarPrefs() {
  const [width, setWidthState] = useState(() => {
    const stored = Number(readStorage(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [open, setOpenState] = useState(() => readStorage(SIDEBAR_OPEN_KEY) !== "false");

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    writeStorage(SIDEBAR_WIDTH_KEY, String(clamped));
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writeStorage(SIDEBAR_OPEN_KEY, String(next));
  }, []);

  return { width, setWidth, open, setOpen };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
