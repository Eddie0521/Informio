#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/scripts/git-hooks/prepare-commit-msg"

chmod +x "$HOOK"
git -C "$ROOT" config core.hooksPath scripts/git-hooks
echo "Installed git hooks at scripts/git-hooks (core.hooksPath=scripts/git-hooks)"
