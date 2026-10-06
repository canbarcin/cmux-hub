---
description: Manually start cmux-hub (diff viewer) for the repository or worktree this session is working in
argument-hint: "[path to git repo or worktree]"
---

Start cmux-hub for the git repository this session is actually working in.

Pick `TARGET` before running the commands:

1. If an argument was given (`$ARGUMENTS`), use it as `TARGET`.
2. Otherwise, if this session has been editing files in a git repo or linked
   worktree other than the shell's current directory (e.g.
   `~/worktrees/<TICKET>/<repo>`), use that repo's top-level path. The Bash tool
   resets to the session's start directory, so do not rely on `$PWD` alone.
3. Otherwise use `git rev-parse --show-toplevel` of the current directory.
4. If several repos were edited (cross-repo task), ask which one, or start one
   cmux-hub per repo by running the commands once per `TARGET`.

`TARGET` must be inside a git work tree (`git -C "$TARGET" rev-parse --is-inside-work-tree`).

Run the following commands:

```bash
# Ensure binary is installed
${CLAUDE_PLUGIN_ROOT}/scripts/ensure-cmux-hub.sh

TARGET="<chosen path>"

# Determine actions file (project-local config of the target repo wins)
if [ -f "${TARGET}/.claude/cmux-hub.json" ]; then
  ACTIONS="${TARGET}/.claude/cmux-hub.json"
elif [ -f "${HOME}/.claude/cmux-hub.json" ]; then
  ACTIONS="${HOME}/.claude/cmux-hub.json"
else
  # Copy defaults if no user config exists
  mkdir -p "${HOME}/.claude"
  cp "${CLAUDE_PLUGIN_ROOT}/defaults/actions.json" "${HOME}/.claude/cmux-hub.json"
  ACTIONS="${HOME}/.claude/cmux-hub.json"
fi

# Setup logging
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/cmux-hub"
mkdir -p "$LOG_DIR"
PROJECT_NAME="$(basename "$TARGET")"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
LOG_FILE="${LOG_DIR}/${PROJECT_NAME}-${TIMESTAMP}.log"

# Start cmux-hub in background
CMUX_HUB="${HOME}/.local/bin/cmux-hub"
echo "[${TIMESTAMP}] Starting cmux-hub (target: $TARGET)" >> "$LOG_FILE"
# Subshell + & detaches it from this shell's job table (no disown needed)
(cd "$TARGET" && "$CMUX_HUB" --actions "$ACTIONS" "$TARGET" >> "$LOG_FILE" 2>&1 &)
```
