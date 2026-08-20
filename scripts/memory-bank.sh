#!/usr/bin/env bash
#
# memory-bank.sh — link, verify and repair this project's shared memory bank.
#
# The bank is git-tracked at <main clone>/memory/ so it travels with the repo.
# Claude Code reads and writes memory at a machine-specific home path:
#
#   ~/.claude/projects/<mangled-main-clone-path>/memory/
#
# `link` makes that home path a SYMLINK into the repo, so every session — in the
# main clone or in any worktree — reads and writes the one real bank.
#
#   ./scripts/memory-bank.sh link     create or repair the symlink (idempotent)
#   ./scripts/memory-bank.sh check    verify it, and report drift (exit 1 on problems)
#   ./scripts/memory-bank.sh where    print the paths involved
#
# `check --quiet` prints a one-line summary and always exits 0 (for hooks).

set -uo pipefail

QUIET=0
for arg in "$@"; do
  [ "$arg" = "--quiet" ] && QUIET=1
done

say()  { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }
ok()   { say "  ok    $*"; }
warn() { say "  WARN  $*"; }
bad()  { say "  FAIL  $*"; }

inode() {
  # Portable inode read: BSD/macOS first, then GNU.
  stat -f %i "$1" 2>/dev/null || stat -c %i "$1" 2>/dev/null
}

# --- locate the main clone, from anywhere (main clone, worktree, subdir) ------
GIT_COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || {
  printf 'not inside a git repository\n' >&2; exit 2; }
MAIN_CLONE=$(cd "$(dirname "$GIT_COMMON")" && pwd)
BANK="$MAIN_CLONE/memory"

# Claude Code mangles an absolute path into a project directory name by
# replacing "/" and "." with "-".
mangle() { printf '%s' "$1" | tr '/.' '--'; }
PROJECTS="$HOME/.claude/projects"
HOME_DIR="$PROJECTS/$(mangle "$MAIN_CLONE")"
HOME_LINK="$HOME_DIR/memory"

TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
IN_WORKTREE=0
[ "$TOPLEVEL" != "$MAIN_CLONE" ] && IN_WORKTREE=1

cmd_where() {
  printf 'main clone   %s\n' "$MAIN_CLONE"
  printf 'real bank    %s\n' "$BANK"
  printf 'home link    %s\n' "$HOME_LINK"
  printf 'this tree    %s%s\n' "$TOPLEVEL" \
    "$([ "$IN_WORKTREE" -eq 1 ] && printf '  (worktree — ./memory here is NOT the bank)')"
}

cmd_link() {
  say "linking memory bank"
  say ""

  if [ ! -d "$BANK" ]; then
    mkdir -p "$BANK"
    warn "created $BANK (it was missing — merge the branch that adds the bank)"
  fi

  mkdir -p "$HOME_DIR"

  if [ -L "$HOME_LINK" ]; then
    current=$(cd "$(dirname "$HOME_LINK")" && readlink "$HOME_LINK")
    if [ "$current" = "$BANK" ]; then
      ok "symlink already correct"
      say ""
      cmd_check
      return $?
    fi
    warn "symlink pointed at $current — repointing"
    rm "$HOME_LINK"
  elif [ -d "$HOME_LINK" ]; then
    # A real directory sits where the symlink belongs. Never delete content.
    if [ -z "$(ls -A "$HOME_LINK" 2>/dev/null)" ]; then
      rmdir "$HOME_LINK"
      ok "removed empty placeholder directory"
    else
      backup="$HOME_DIR/memory.orphan-$(date +%Y%m%d-%H%M%S)"
      mv "$HOME_LINK" "$backup"
      warn "found real files where the symlink belongs — preserved at:"
      warn "  $backup"
      warn "  review and fold anything valuable into $BANK, then delete the backup"
    fi
  elif [ -e "$HOME_LINK" ]; then
    bad "$HOME_LINK exists and is neither a symlink nor a directory — resolve by hand"
    return 1
  fi

  ln -s "$BANK" "$HOME_LINK"
  ok "linked $HOME_LINK -> $BANK"
  say ""
  cmd_check
}

cmd_check() {
  local problems=0
  local populated=1

  # 1. The symlink itself.
  if [ ! -L "$HOME_LINK" ]; then
    if [ -d "$HOME_LINK" ]; then
      bad "$HOME_LINK is a real directory, not a symlink — memory is forked"
    else
      bad "no memory symlink at $HOME_LINK"
    fi
    say "        fix: ./scripts/memory-bank.sh link"
    problems=$((problems + 1))
  else
    target=$(cd "$(dirname "$HOME_LINK")" && readlink "$HOME_LINK")
    if [ "$target" != "$BANK" ]; then
      bad "symlink points at $target, expected $BANK"
      say "        fix: ./scripts/memory-bank.sh link"
      problems=$((problems + 1))
    else
      ok "symlink -> $BANK"
    fi
  fi

  # The link can resolve by name and still point at nothing.
  if [ ! -d "$BANK" ]; then
    bad "the link target does not exist: $BANK"
    say "        writes through the link will fail. The bank arrives when the"
    say "        branch that adds memory/ is merged into the main clone."
    problems=$((problems + 1))
  fi

  # 2. The inode check — proof, not assumption.
  probe="$BANK/MEMORY.md"
  if [ -f "$probe" ] && [ -f "$HOME_LINK/MEMORY.md" ]; then
    a=$(inode "$probe"); b=$(inode "$HOME_LINK/MEMORY.md")
    if [ -n "$a" ] && [ "$a" = "$b" ]; then
      ok "inode match on MEMORY.md ($a) — the link resolves to the real file"
    else
      bad "inode mismatch: bank=$a link=$b — writes through the link are orphaned"
      problems=$((problems + 1))
    fi
  elif [ ! -f "$probe" ]; then
    warn "no MEMORY.md in the bank yet — skipping the inode check"
    populated=0
  fi

  # 3. Fragmentation: a stray real memory/ under any other project directory.
  if [ -d "$PROJECTS" ]; then
    while IFS= read -r stray; do
      [ -z "$stray" ] && continue
      [ "$stray" = "$HOME_LINK" ] && continue
      if [ -d "$stray" ] && [ ! -L "$stray" ] && [ -n "$(ls -A "$stray" 2>/dev/null)" ]; then
        warn "stray memory directory (a forked bank): $stray"
        problems=$((problems + 1))
      fi
    done <<< "$(find "$PROJECTS" -mindepth 2 -maxdepth 2 -name memory 2>/dev/null)"
  fi

  # 4. The orphan-edit trap, when this session runs in a worktree.
  if [ "$IN_WORKTREE" -eq 1 ] && [ -d "$TOPLEVEL/memory" ]; then
    w=$(inode "$TOPLEVEL/memory/MEMORY.md" 2>/dev/null)
    if [ -n "$w" ] && [ -n "${a:-}" ] && [ "$w" != "$a" ]; then
      warn "this worktree has its own memory/ checkout (inode $w) — editing it is the orphan-edit trap"
      say "        write memory via: $HOME_LINK/  (or $BANK/)"
    fi
  fi

  # 5. Freshness of the volatile s_ files against master.
  local sha
  sha=$(grep -oE 'verified against `master` at `[0-9a-f]{7,40}`' "$BANK/s_status.md" 2>/dev/null \
        | grep -oE '[0-9a-f]{7,40}' | head -1)
  if [ -n "$sha" ]; then
    if git -C "$MAIN_CLONE" cat-file -e "$sha^{commit}" 2>/dev/null; then
      behind=$(git -C "$MAIN_CLONE" rev-list --count "$sha..master" 2>/dev/null)
      if [ -n "$behind" ] && [ "$behind" -gt 3 ]; then
        warn "s_status.md was verified $behind commits ago — time for a memory wrap PR"
        problems=$((problems + 1))
      else
        ok "s_status.md is ${behind:-0} commit(s) behind master"
      fi
    else
      warn "s_status.md cites commit $sha, which is not in this clone"
    fi
  fi

  say ""
  if [ "$problems" -eq 0 ] && [ "$populated" -eq 0 ]; then
    say "memory bank linked, but not populated yet"
    [ "$QUIET" -eq 1 ] && printf 'memory bank: linked but empty (%s)\n' "$BANK"
    return 0
  fi
  if [ "$problems" -eq 0 ]; then
    say "memory bank healthy"
    [ "$QUIET" -eq 1 ] && printf 'memory bank: healthy (%s)\n' "$BANK"
    return 0
  fi
  say "$problems problem(s) — see above"
  [ "$QUIET" -eq 1 ] && printf 'memory bank: %s problem(s). Run: ./scripts/memory-bank.sh check\n' "$problems"
  [ "$QUIET" -eq 1 ] && return 0
  return 1
}

case "${1:-check}" in
  link)  cmd_link ;;
  check|--quiet) cmd_check ;;
  where) cmd_where ;;
  *) printf 'usage: %s {link|check|where} [--quiet]\n' "$0" >&2; exit 2 ;;
esac
