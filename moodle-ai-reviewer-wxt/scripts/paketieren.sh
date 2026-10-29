#!/bin/bash
# Baut alle drei Browser-Versionen und packt sie zusammen mit
# der README.md aus diesem Projektordner zu dist/moodle-ai-reviewer.zip im
# Repo-Wurzelordner.
# Aufruf:  bash scripts/paketieren.sh   (oder: npm run paket)
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

NAME="moodle-ai-reviewer"
OUT="Erweiterung"

# Signierte .xpi (von addons.mozilla.org heruntergeladen) und das dazugehoerige
# Quellcode-ZIP VOR dem Aufraeumen sichern: Erweiterung/ ist gitignored, der
# Build weiss nichts davon, "rm -rf" weiter unten wuerde sie sonst unwiderruflich
# loeschen (Fehler vom 23.09.2026 - seitdem hier eingebaut).
SICHERUNG="$(mktemp -d)"
FF="$OUT/$NAME-firefox"
if [ -d "$FF" ]; then
  find "$FF" -maxdepth 1 -iname "*.xpi" -exec cp {} "$SICHERUNG/" \;
  # Quellcode- und Firefox-ZIPs fuer Mozilla entstehen seit 2.2.1 bei jedem Bau neu
  # (siehe unten) – alte Fassungen werden nicht mehr aufgehoben.
fi

# Bricht das Bauen ab (set -e), legt diese Falle die gesicherten .xpi selbst
# zurueck in den Firefox-Ordner – sonst waeren sie nur noch in der temporaeren
# Sicherung (Fehler vom 29.10.2026, als vite fehlte).
xpi_zuruecklegen() {
  rc=$?
  if [ $rc -ne 0 ] && ls "$SICHERUNG"/*.xpi >/dev/null 2>&1; then
    mkdir -p "$FF"
    find "$SICHERUNG" -maxdepth 1 -iname "*.xpi" -exec cp -n {} "$FF/" \;
    echo "✗ Bauen fehlgeschlagen – signierte .xpi wieder nach $FF gelegt." >&2
  fi
  rm -rf "$SICHERUNG"
}
trap xpi_zuruecklegen EXIT

# Reste eines frueheren Durchlaufs ZUERST weg — die Builds schreiben direkt in
# die benannten Ordner, ein Aufraeumen danach wuerde das frische Ergebnis loeschen.
for b in chrom firefox edge; do rm -rf "$OUT/$NAME-$b"; done

npm run build-all

# Firefox-Ordner aufraeumen: rohe Build-Dateien (manifest.json, content-scripts,
# icon) in einen Unterordner verschieben, damit Nutzer nur die .xpi sehen.
# Gesicherte .xpi + Quellcode-ZIP von oben wieder einsetzen, falls vorhanden.
UNTER="$FF/entpackte-dateien (nicht noetig)"
mkdir -p "$UNTER"
# Alles ausser .xpi und dem Unterordner selbst — seit 2.0.0 gibt es auch background.js,
# options.html und chunks/; eine feste Liste liess die neuen Dateien oben liegen.
for item in "$FF"/* ; do
  case "$item" in *.xpi|*.XPI|"$UNTER") continue ;; esac
  [ -e "$item" ] && mv "$item" "$UNTER/"
done
find "$SICHERUNG" -maxdepth 1 -iname "*.xpi" -exec cp {} "$FF/" \;

# Einreichung bei addons.mozilla.org (seit 2.2.1, wie beim Freitext Grader): je Version zwei
# Dateien im Unterordner –
#   <name>-<version>-firefox.zip    die gebaute Erweiterung (manifest.json ganz oben)
#   <name>-<version>-quellcode.zip  der ungebuendelte Quelltext mit BAUANLEITUNG.txt
# Mozilla verlangt den Quelltext, weil content.js gebuendelt ist. Anleitung: FIREFOX-EINREICHUNG.md
VERSION="$(node -p "require('./package.json').version")"
AMO="${TMPDIR:-/tmp}/amo.$$"; rm -rf "$AMO"; mkdir -p "$AMO/ff" "$AMO/src/$NAME"
(cd "$UNTER" && for f in * ; do case "$f" in *.zip) ;; *) cp -R "$f" "$AMO/ff/" ;; esac; done)
(cd "$AMO/ff" && zip -q -r -X "$AMO/$NAME-$VERSION-firefox.zip" .)
cp -R README.md BAUANLEITUNG.txt FIREFOX-EINREICHUNG.md .gitignore package.json package-lock.json wxt.config.ts entrypoints lib public scripts "$AMO/src/$NAME/"
find "$AMO/src" -name '.DS_Store' -delete
(cd "$AMO/src" && zip -q -r -X "$AMO/$NAME-$VERSION-quellcode.zip" "$NAME")
find "$UNTER" -maxdepth 1 -name "$NAME-*.zip" -delete
cp "$AMO/$NAME-$VERSION-firefox.zip" "$AMO/$NAME-$VERSION-quellcode.zip" "$UNTER/"
rm -rf "$AMO"
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
