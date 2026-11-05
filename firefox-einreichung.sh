#!/bin/bash
# Legt fuer jede Erweiterung die beiden Dateien fuer addons.mozilla.org in
# _firefox-einreichung/<datum>/ ab (Ordner ist gitignored):
#   <ordner>-<version>-firefox.zip    gebaute Firefox-Fassung (manifest.json ganz oben)
#   <ordner>-<version>-quellcode.zip  alle versionierten Quelldateien (ohne PDF/ZIP)
#                                     plus BAUANLEITUNG.txt fuer die Mozilla-Pruefer
# Vorher muss gebaut sein (passiert beim Commit durch den Pre-Commit-Hook oder mit
# npm run paket im jeweiligen Ordner).
# Zusaetzlich landen beide Dateien in <ordner>/Erweiterung/<name>-firefox/ neben der .xpi.
# Aufruf im Repo-Wurzelordner:  bash firefox-einreichung.sh
set -e
cd "$(git rev-parse --show-toplevel)"
ZIEL="$PWD/_firefox-einreichung/$(date +%Y-%m-%d)"
rm -rf "$ZIEL"; mkdir -p "$ZIEL"

for d in *-wxt; do
  V="$(node -p "require('./$d/package.json').version")"
  FF="$(ls -d "$d"/Erweiterung/*-firefox 2>/dev/null | head -1)"
  ROH="$FF/entpackte-dateien (nicht noetig)"
  if [ ! -f "$ROH/manifest.json" ]; then
    echo "✗ $d: kein Firefox-Build gefunden – erst 'npm run paket' in $d" >&2; exit 1
  fi
  MV="$(node -p "require('./$ROH/manifest.json').version")"
  if [ "$MV" != "$V" ]; then
    echo "✗ $d: Build ist $MV, package.json sagt $V – erst neu bauen" >&2; exit 1
  fi
  # Mozilla-Pruefung vorab: web-ext lint auf dem Build (Fehler brechen ab, Warnungen
  # werden gezeigt). Faengt u. a. fehlende Dateien wie background.js ab.
  LINT="$( (cd "$d" && node node_modules/web-ext/bin/web-ext.js lint --source-dir "../$ROH" --ignore-files "*.zip" --output json) 2>/dev/null || true)"
  FEHLER="$(printf '%s' "$LINT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const z=x=>x.map(e=>"   "+e.message+(e.file?" ("+e.file+")":"")).join("\n");if(j.errors.length)console.log("FEHLER\n"+z(j.errors));if(j.warnings.length)console.log("Warnungen\n"+z(j.warnings));}catch(e){console.log("FEHLER\n   web-ext lint lief nicht")}})')"
  if printf '%s' "$FEHLER" | grep -q '^FEHLER'; then
    echo "✗ $d $V – Mozilla wuerde ablehnen:" >&2; printf '%s\n' "$FEHLER" >&2; exit 1
  fi
  [ -n "$FEHLER" ] && printf '  %s %s – %s\n' "$d" "$V" "$FEHLER"
  TMP="$(mktemp -d)"
  # 1. Firefox-ZIP: Inhalt des Build-Ordners ohne alte ZIPs
  mkdir -p "$TMP/ff"
  (cd "$ROH" && for f in * ; do case "$f" in *.zip) ;; *) cp -R "$f" "$TMP/ff/" ;; esac; done)
  (cd "$TMP/ff" && zip -q -r -X "$ZIEL/$d-$V-firefox.zip" .)
  # 2. Quellcode-ZIP: alles, was git in diesem Ordner verfolgt (ohne PDF/ZIP)
  mkdir -p "$TMP/src/$d"
  git ls-files "$d" | grep -viE '\.(pdf|zip|xpi)$' | while read -r f; do
    mkdir -p "$TMP/src/$(dirname "$f")"; cp "$f" "$TMP/src/$f"
  done
  if [ ! -f "$TMP/src/$d/BAUANLEITUNG.txt" ]; then
    cat > "$TMP/src/$d/BAUANLEITUNG.txt" <<EOT
Bauanleitung fuer die Mozilla-Pruefung ($d, Version $V)

Voraussetzung: Node.js 20 oder neuer, npm.
  cd $d
  npm ci
  npm run build:firefox
Ergebnis: Ordner Erweiterung/ (Unterordner *-firefox) – identisch mit dem
eingereichten Firefox-ZIP. Gebaut mit WXT (https://wxt.dev), keine weiteren
Laufzeitbibliotheken; alle Pakete in package.json sind nur Bauwerkzeuge.
Lizenz: Quelltext MIT, Dokumentation CC BY-SA 4.0 – A. Spielhoff.
EOT
  fi
  (cd "$TMP/src" && zip -q -r -X "$ZIEL/$d-$V-quellcode.zip" "$d")
  rm -rf "$TMP"
  # 3. Auch direkt in den Firefox-Ordner der Erweiterung (neben die .xpi), alte
  #    Einreichungs-ZIPs dort vorher weg — damit dort immer nur die aktuelle Fassung liegt.
  find "$FF" -maxdepth 2 \( -name "*-quellcode.zip" -o -name "*-firefox.zip" \) -delete
  cp "$ZIEL/$d-$V-firefox.zip" "$ZIEL/$d-$V-quellcode.zip" "$FF/"
  echo "✓ $d $V"
done
echo "Fertig: $ZIEL"
