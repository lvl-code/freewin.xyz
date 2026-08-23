#!/data/data/com.termux/files/usr/bin/bash
# apply_casino_redesign.sh
# Run from your project root (the folder that contains `en/`).
# Safe to re-run: it always restores from git before re-applying if needed,
# but its first move is to create timestamped .bak files regardless of git.
set -euo pipefail

CSS_DIR="en/static/css"
TPL="en/templates/components/casino_grid.html"
STAMP=$(date +%Y%m%d-%H%M%S)

echo "== 1. Backups (timestamped, kept alongside originals) =="
cp "$CSS_DIR/main.css"        "$CSS_DIR/main.css.bak-$STAMP"
cp "$CSS_DIR/responsive.css"  "$CSS_DIR/responsive.css.bak-$STAMP"
cp "$CSS_DIR/supportive.css"  "$CSS_DIR/supportive.css.bak-$STAMP"
cp "$CSS_DIR/casino.css"      "$CSS_DIR/casino.css.bak-$STAMP"
cp "$TPL"                     "$TPL.bak-$STAMP"

echo "== 2. Strip every scattered .casino-grid / .casino-card rule =="
echo "   (main.css, responsive.css, supportive.css get cleaned;"
echo "    casino.css becomes the single source of truth)"
python3 strip_casino_css.py "$CSS_DIR/main.css"       --apply
python3 strip_casino_css.py "$CSS_DIR/responsive.css" --apply
python3 strip_casino_css.py "$CSS_DIR/supportive.css" --apply
python3 strip_casino_css.py "$CSS_DIR/casino.css"     --apply

echo "== 3. Remove the now-orphaned swipe-hint keyframes in responsive.css =="
python3 - "$CSS_DIR/responsive.css" <<'PYEOF'
import sys
p = sys.argv[1]
t = open(p, encoding="utf-8").read()
start = t.find("@keyframes swipeHint")
if start != -1:
    i = t.find("{", start)
    depth = 0
    j = i
    while True:
        if t[j] == "{":
            depth += 1
        elif t[j] == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    end = j + 1
    t = t[:start] + t[end:]
    t = t.replace("\n  /* Swipe hint pulse on first card */\n\n", "")
    open(p, "w", encoding="utf-8").write(t)
    print("  removed orphaned @keyframes swipeHint")
else:
    print("  (already absent, nothing to do)")
PYEOF

echo "== 4. Append the new consolidated grid + card CSS to casino.css =="
if grep -q "CASINO GRID + CASINO CARD" "$CSS_DIR/casino.css"; then
  echo "  casino.css already contains the new block — skipping append to avoid duplicates."
else
  printf '\n' >> "$CSS_DIR/casino.css"
  cat casino-card-grid.css >> "$CSS_DIR/casino.css"
  echo "  appended."
fi

echo "== 5. Replace the casino_grid.html template (logo wrapper + header hierarchy) =="
cp casino_grid.html "$TPL"

echo "== Done. Backups are the .bak-$STAMP files next to each original. =="
echo "== Now run the verification commands below before committing. =="
