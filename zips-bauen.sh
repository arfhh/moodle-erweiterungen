#!/bin/bash
# Baut die Download-ZIPs unter dist/ neu — fuer alle Erweiterungen oder nur einzelne.
#
# Aufruf:
#   bash zips-bauen.sh                 alle Erweiterungen (jeder Ordner *-wxt)
#   bash zips-bauen.sh reviewer coach  nur diese (Teil des Ordnernamens genuegt)
#
# Jede Erweiterung wird mit WXT gebaut und bringt ihr eigenes Paketierskript mit
# (scripts/paketieren.sh = npm run paket). Dieses Skript ruft es nur der Reihe nach
# auf. Eine neue Erweiterung braucht hier deshalb KEINEN Eintrag mehr — es genuegt,
# dass ihr Ordner auf -wxt endet und "npm run paket" kennt.
#
# Signierte Firefox-.xpi bleiben erhalten (paketieren.sh sichert sie vor dem
# Aufraeumen). Am Ende meldet das Skript, wenn eine .xpi aelter ist als die
# Version im Manifest — dann steckt im ZIP fuer Firefox noch die alte Fassung.
#
# Der Pre-Commit-Hook (.githooks/pre-commit) macht dasselbe automatisch fuer die
# Erweiterungen, die ein Commit betrifft. Dieses Skript ist fuer den Fall, dass
# man die ZIPs ohne Commit neu haben will.
set -e
REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

# Auswahl bestimmen
ALLE=$(ls -d *-wxt 2>/dev/null)
if [ $# -eq 0 ]; then
  AUSWAHL="$ALLE"
else
  AUSWAHL=""
  for such in "$@"; do
    treffer=$(echo "$ALLE" | grep -i -- "$such" || true)
    [ -n "$treffer" ] || { echo "✗ Keine Erweiterung passt zu „$such“." >&2; exit 1; }
    AUSWAHL="$AUSWAHL $treffer"
  done
fi

OK=""; FEHLER=""; HINWEISE=""
for p in $AUSWAHL; do
  if [ ! -d "$p/node_modules" ]; then
    echo "⚠ $p: node_modules fehlt — erst 'npm install' in $p ausfuehren. Uebersprungen."
    FEHLER="$FEHLER $p"; continue
  fi
  VER=$(node -p "require('./$p/package.json').version")
  printf '→ %-32s V%-8s … ' "$p" "$VER"
  LOG="$(mktemp)"
  if (cd "$p" && npm run paket) >"$LOG" 2>&1; then
    echo "✓"
    OK="$OK $p"
  else
    echo "✗ fehlgeschlagen"
    sed 's/^/     /' "$LOG" | tail -15
    FEHLER="$FEHLER $p"
  fi
  rm -f "$LOG"

  # Steckt eine veraltete .xpi im Firefox-Ordner?
  XPI=$(find "$p/Erweiterung" -maxdepth 2 -iname '*.xpi' 2>/dev/null | head -1)
  if [ -n "$XPI" ]; then
    XVER=$(basename "$XPI" .xpi | sed -E 's/.*-([0-9][0-9.]*)$/\1/')
    [ "$XVER" = "$VER" ] || HINWEISE="$HINWEISE\n   $p: .xpi ist V$XVER, Manifest V$VER"
  fi
done

echo
[ -n "$OK" ]     && echo "Neu gebaut:$OK"
[ -n "$FEHLER" ] && echo "NICHT gebaut:$FEHLER"
[ -n "$HINWEISE" ] && echo -e "Firefox-.xpi noch alt (im ZIP steckt fuer Firefox die alte Fassung):$HINWEISE"
echo
echo "Die ZIP-Dateinamen bleiben immer gleich — daran haengen die Download-Links."
echo "Naechster Schritt: git add -A && git commit -m \"...\" && git push"
[ -z "$FEHLER" ]
