#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/lit}"

if [ -d "$TARGET" ]; then
  echo "Directory $TARGET already exists — skipping clone"
else
  git clone https://github.com/lit/lit.git "$TARGET"
fi

cp "$SCRIPT_DIR/chrome-ranger.yaml" "$TARGET/"
cp "$SCRIPT_DIR/bench.sh" "$TARGET/"

echo ""
echo "Ready. Next steps:"
echo "  cd $TARGET"
echo "  chrome-ranger run"
