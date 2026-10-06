import { useState, useEffect, useCallback } from "react";
import { parseHash } from "../lib/route.ts";

export type { Route } from "../lib/route.ts";

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /**
   * Navigate to a hash path. `replace` updates the current history entry
   * instead of pushing a new one (used for keyboard file stepping so back/forward
   * is not flooded with every intermediate file).
   */
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (options?.replace) {
      window.history.replaceState(window.history.state, "", `#${path}`);
      // replaceState does not fire hashchange
      setRoute(parseHash(window.location.hash));
      return;
    }
    window.location.hash = path;
  }, []);

  return { route, navigate };
}
