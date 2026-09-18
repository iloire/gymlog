#!/usr/bin/env bash
# Signal to other agents that a task is under way in the shared checkout.
#
#   scripts/task-lock.sh claim "<what you are doing>"   # take the lock, or fail if held
#   scripts/task-lock.sh status                          # who holds it, since when, is the tree dirty
#   scripts/task-lock.sh release                         # drop it when the task is committed and pushed
#
# The lock is .task.lock at the repo root, git-ignored. It is a convention, not
# an enforcement: it tells the next agent to start in a worktree instead of
# editing the same files. See CLAUDE.md, "Parallel work". Nothing here is
# specific to this repo, so the same script can be dropped into any other.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
lock="$root/.task.lock"
stale_after=$((4 * 3600)) # seconds; a lock this old with a clean tree is a leftover

age() {
  local started
  started=$(sed -n 's/^started: //p' "$lock")
  echo $(( $(date +%s) - $(date -d "$started" +%s) ))
}

show() {
  cat "$lock"
  local a
  a=$(age)
  printf 'age: %dh%02dm\n' $((a / 3600)) $((a % 3600 / 60))
  if [ -n "$(git -C "$root" status --porcelain --untracked-files=normal | grep -v '^?? .task.lock$' || true)" ]; then
    echo 'tree: dirty (someone is mid-task; do not touch their files)'
  else
    echo 'tree: clean'
    [ "$a" -gt "$stale_after" ] && echo 'stale: older than 4h with a clean tree; probably a leftover, safe to release'
  fi
}

case "${1:-}" in
  claim)
    [ -n "${2:-}" ] || { echo 'usage: task-lock.sh claim "<task>"' >&2; exit 2; }
    if [ -e "$lock" ]; then
      echo 'LOCKED: another task is under way in this checkout. Start yours in a worktree.' >&2
      show >&2
      exit 1
    fi
    printf 'started: %s\ntask: %s\nby: %s@%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" "$(id -un)" "$(hostname)" > "$lock"
    echo "claimed $lock"
    ;;
  status)
    if [ -e "$lock" ]; then show; else echo 'free: no task lock, the shared checkout is yours'; fi
    ;;
  release)
    if [ -e "$lock" ]; then rm "$lock"; echo 'released'; else echo 'no lock to release'; fi
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
