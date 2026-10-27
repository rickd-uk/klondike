#!/usr/bin/env bash
# Screenshots of the table at the spec's sizes into tests/out/ (check them by eye).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/tests/out"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
sed 's|<head>|<head><script>try { localStorage.setItem("playerName", "Test"); } catch (e) {}</script>|' "$ROOT/index.html" > "$TMP/index.html"
ln -s "$ROOT/cards" "$TMP/cards"
for size in 1440x900 1024x768 768x1024 844x390 390x844; do
  google-chrome-stable --headless=new --no-sandbox --user-data-dir="$TMP/profile" \
    --use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files \
    --window-size="${size/x/,}" --virtual-time-budget=4000 \
    --screenshot="$OUT/$size.png" "file://$TMP/index.html" 2>/dev/null
done
ls "$OUT"
