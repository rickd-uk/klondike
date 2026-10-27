#!/usr/bin/env bash
# Builds cards/{J,Q,K}{C,D,H,S}.svg: downloads Byron Knoll's public-domain court
# cards, recolours them red/gold/black (no blue or green) and shrinks them with svgo.
set -euo pipefail

SRC=https://raw.githubusercontent.com/notpeter/Vector-Playing-Cards/master/cards-svg
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/raw" "$TMP/recoloured" "$ROOT/cards"

for r in J Q K; do
  for s in C D H S; do
    curl -fsSL -o "$TMP/raw/$r$s.svg" "$SRC/$r$s.svg"
  done
done

python3 -I - "$TMP/raw" "$TMP/recoloured" <<'EOF'
import colorsys, pathlib, re, sys

def recolour(hexcode):
    h = hexcode.lower()
    if h == '#df0000':
        return '#d32128'
    x = h[1:] if len(h) == 7 else ''.join(c * 2 for c in h[1:])
    r, g, b = (int(x[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    hue *= 360
    if sat < 0.25 or light < 0.05:
        return '#000000' if light < 0.05 else h
    if 180 <= hue <= 260:                      # blues
        if light > 0.7:
            return '#f2c879'
        return '#1a1a1a' if light < 0.45 else '#3a3a3a'
    if 45 <= hue < 76:                         # yellows and olive shading
        return '#e39a2d' if light >= 0.4 else '#c9821f'
    if 76 <= hue < 180:                        # greens
        return '#c9821f'
    return h

src, out = map(pathlib.Path, sys.argv[1:])
for f in sorted(src.glob('*.svg')):
    text = re.sub(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b', lambda m: recolour(m.group(0)), f.read_text())
    (out / f.name).write_text(text)
EOF

npx -y svgo@3.3.2 -q --multipass --precision 1 -f "$TMP/recoloured" -o "$ROOT/cards"
ls -l "$ROOT/cards"/*.svg
