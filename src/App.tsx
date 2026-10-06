import React, { useMemo } from "react";
import { DiffView } from "./components/DiffView.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { CIStatus } from "./components/CIStatus.tsx";
import { PlanView } from "./components/PlanView.tsx";
import { ReviewView } from "./components/ReviewView.tsx";
import { LauncherStatus } from "./components/LauncherStatus.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { useDiff } from "./hooks/useDiff.ts";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { useHashRoute } from "./hooks/useHashRoute.ts";
import { useStatus } from "./hooks/useStatus.ts";
import { usePRData } from "./hooks/usePRData.ts";
import { useLauncher } from "./hooks/useLauncher.ts";
import { useDiffViewMode } from "./hooks/useLayoutPrefs.ts";
import { ReviewQueueProvider } from "./hooks/useReviewQueue.tsx";
import { fileSelectionPath } from "./lib/route.ts";
import { parseUntrackedPaths } from "./lib/file-tree.ts";
import "./index.css";

export default function App() {
  const {
    diff,
    loading,
    refreshing,
    error,
    refresh,
    selectedCommit,
    hasUncommittedChanges,
    selectCommit,
    clearCommit,
  } = useDiff();
  const { route, navigate } = useHashRoute();
  const { branch, gitStatus, hasTerminal, actions, hasPlan, hasReview } = useStatus();
  const { prUrl, prTitle, prState, checks, prComments } = usePRData();
  const { hasLauncher, servers } = useLauncher();
  const routeView = route.page === "diff" || route.page === "commit" ? route.view : undefined;
  const [viewMode, setViewMode] = useDiffViewMode(routeView);
  const untrackedPaths = useMemo(() => parseUntrackedPaths(gitStatus), [gitStatus]);

  // Establish WebSocket connection (individual hooks subscribe via ws-message events)
  useWebSocket(() => {});

  const selectedFile = route.page === "diff" || route.page === "commit" ? route.file : undefined;
  const ciStatus =
    checks.length > 0 || prUrl ? (
      <CIStatus checks={checks} prTitle={prTitle} prUrl={prUrl} prState={prState} />
    ) : undefined;

  return (
    <ToastProvider>
      <ReviewQueueProvider>
        <div className="h-screen max-w-full overflow-hidden bg-[#0d1117] text-[#c9d1d9] flex flex-col">
          {refreshing && (
            <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-[#1a1e24] overflow-hidden">
              <div className="h-full bg-[#58a6ff] animate-progress-bar" />
            </div>
          )}
          <Toolbar
            branch={branch}
            hasTerminal={hasTerminal}
            actions={actions}
            status={
              hasLauncher && servers.length > 0 ? <LauncherStatus servers={servers} /> : undefined
            }
            onShowDiff={() => {
              navigate("/");
              clearCommit();
            }}
            onShowCommitList={() => navigate("/commits")}
            onShowPlan={hasPlan ? () => navigate("/plan") : undefined}
            onShowReview={hasReview ? () => navigate("/review") : undefined}
          />
          <div
            className={`flex-1 min-h-0 transition-opacity duration-200 ${refreshing ? "opacity-60" : "opacity-100"}`}
          >
            {route.page === "plan" ? (
              <div className="h-full overflow-auto p-3">
                <PlanView onBack={() => navigate("/")} hasTerminal={hasTerminal} />
              </div>
            ) : route.page === "review" ? (
              <div className="h-full overflow-auto p-3">
                <ReviewView onBack={() => navigate("/")} hasTerminal={hasTerminal} />
              </div>
            ) : (
              <DiffView
                diff={diff}
                loading={loading}
                error={error}
                onRefresh={refresh}
                hasTerminal={hasTerminal}
                selectedCommit={selectedCommit}
                showCommitList={route.page === "commits"}
                hasUncommittedChanges={hasUncommittedChanges}
                prComments={prComments.filter((c) => !c.isResolved)}
                onSelectCommit={(commit) => {
                  navigate(`/commit/${commit.hash}`);
                  selectCommit(commit);
                }}
                onClearCommit={() => {
                  navigate("/");
                  clearCommit();
                }}
                selectedFile={selectedFile}
                onSelectFile={(path, options) => navigate(fileSelectionPath(route, path), options)}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                untrackedPaths={untrackedPaths}
                ciStatus={ciStatus}
              />
            )}
          </div>
        </div>
      </ReviewQueueProvider>
    </ToastProvider>
  );
}
