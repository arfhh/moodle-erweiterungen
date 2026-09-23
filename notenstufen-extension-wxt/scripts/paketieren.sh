#!/bin/bash
# Baut alle drei Browser-Versionen und packt sie zusammen mit
# der README.md aus diesem Projektordner zu dist/notenstufen-autofill.zip im
# Repo-Wurzelordner.
# Aufruf:  bash scripts/paketieren.sh   (oder: npm run paket)
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

NAME="notenstufen-autofill"
OUT="Erweiterung"

# Signierte .xpi (von addons.mozilla.org heruntergeladen) und das dazugehoerige
# Quellcode-ZIP VOR dem Aufraeumen sichern: Erweiterung/ ist gitignored, der
# Build weiss nichts davon, "rm -rf" weiter unten wuerde sie sonst unwiderruflich
# loeschen (Fehler vom 23.09.2026 - seitdem hier eingebaut).
SICHERUNG="$(mktemp -d)"
FF="$OUT/$NAME-firefox"
if [ -d "$FF" ]; then
  find "$FF" -maxdepth 1 -iname "*.xpi" -exec cp {} "$SICHERUNG/" \;
  UNTER_ALT="$FF/entpackte-dateien (nicht noetig)"
  [ -d "$UNTER_ALT" ] && find "$UNTER_ALT" -maxdepth 1 -iname "*-quellcode.zip" -exec cp {} "$SICHERUNG/" \;
fi

# Reste eines frueheren Durchlaufs ZUERST weg — die Builds schreiben direkt in
# die benannten Ordner, ein Aufraeumen danach wuerde das frische Ergebnis loeschen.
for b in chrom firefox edge; do rm -rf "$OUT/$NAME-$b"; done

npm run build-all

# Firefox-Ordner aufraeumen: rohe Build-Dateien (manifest.json, content-scripts,
# icon) in einen Unterordner verschieben, damit Nutzer nur die .xpi sehen.
# Gesicherte .xpi + Quellcode-ZIP von oben wieder einsetzen, falls vorhanden.
UNTER="$FF/entpackte-dateien (nicht noetig)"
mkdir -p "$UNTER"
for item in manifest.json content-scripts icon; do
  [ -e "$FF/$item" ] && mv "$FF/$item" "$UNTER/"
done
find "$SICHERUNG" -maxdepth 1 -iname "*.xpi" -exec cp {} "$FF/" \;
find "$SICHERUNG" -maxdepth 1 -iname "*-quellcode.zip" -exec cp {} "$UNTER/" \;
rm -rf "$SICHERUNG"

# README ist im Repo verfolgt (Erweiterung/ selbst ist gitignored, siehe .gitignore)
cp "README.md" "$OUT/README.md"

# zip kann nicht immer in einen gemounteten Ordner schreiben (Temp-Datei + Umbenennen);
# deshalb ausserhalb bauen und hineinkopieren.
# Der Ordner IM Zip heisst NICHT "Erweiterung", sondern "$NAME-Erweiterung": beim
# Entpacken mehrerer ZIPs nebeneinander sonst "Erweiterung", "Erweiterung (1)", ... —
# mit dem Namen der Erweiterung im Ordnernamen bleibt jede eindeutig.
ZIPROOT="$NAME-Erweiterung"
WORK="${TMPDIR:-/tmp}/zipwork.$$"; rm -rf "$WORK"; mkdir -p "$WORK/staging/$ZIPROOT" "$WORK/out"
(cd "$OUT" && find . \( -name '.DS_Store' -o -name '*.bak' -o -iname 'entpackte-dateien*' \) -prune -o -type f -print) \
  | sed 's|^\./||' | while read -r f; do
      mkdir -p "$WORK/staging/$ZIPROOT/$(dirname "$f")"; cp "$OUT/$f" "$WORK/staging/$ZIPROOT/$f"
    done
(cd "$WORK/staging" && zip -q -r -X "$WORK/out/$NAME.zip" "$ZIPROOT")
REPO_ROOT="$(cd "$DIR/.." && pwd)"
mkdir -p "$REPO_ROOT/dist"
cp "$WORK/out/$NAME.zip" "$REPO_ROOT/dist/$NAME.zip"
rm -rf "$WORK"

echo "dist/$NAME.zip aktualisiert."
