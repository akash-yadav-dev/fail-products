#!/usr/bin/env bash
# Configures repo-local commit identity and attribution hooks for FailProducts.
# Safe to re-run. Never touches global git config.
set -euo pipefail

NAME="Akash Yadav"
EMAIL="180740493+akash-yadav-dev@users.noreply.github.com"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git repository. Run 'git init' first." >&2
  exit 1
fi

git config --local user.name  "$NAME"
git config --local user.email "$EMAIL"

# Versioned hooks apply to every clone, including ones driven by other agents.
git config --local core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

# Refuse pushes that would leak a non-noreply address.
git config --local push.default simple

echo "Repo-local identity configured:"
echo "  user.name       $(git config --local user.name)"
echo "  user.email      $(git config --local user.email)"
echo "  core.hooksPath  $(git config --local core.hooksPath)"
echo
echo "Commit with sign-off:  git commit -s -m \"feat: ...\""
