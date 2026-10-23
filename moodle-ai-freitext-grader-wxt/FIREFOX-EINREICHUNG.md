# Firefox-Fassung signieren lassen (addons.mozilla.org, „unlisted")

Firefox installiert dauerhaft nur von Mozilla signierte Erweiterungen. Die Signierung ist
kostenlos; mit dem Kanal **„Auf eigene Faust vertreiben" (unlisted)** erscheint die Erweiterung
nicht im öffentlichen Katalog – Mozilla signiert nur, du gibst die `.xpi` selbst weiter.

## 1 · Dateien bauen

```bash
npm run paket
```

Danach liegen in `Erweiterung/moodle-ai-freitext-grader-firefox/entpackte-dateien (nicht noetig)/`:

| Datei | Wofür |
| --- | --- |
| `moodle-ai-freitext-grader-<version>-firefox.zip` | die gebaute Erweiterung – wird hochgeladen |
| `moodle-ai-freitext-grader-<version>-quellcode.zip` | der Quelltext – Mozilla fragt danach, weil `content.js` gebündelt ist |

Vorher prüfen (muss ohne Fehler durchlaufen):

```bash
npx web-ext lint --source-dir="Erweiterung/moodle-ai-freitext-grader-firefox/entpackte-dateien (nicht noetig)" --ignore-files="*.zip"
```

## 2 · Hochladen (Weg im Browser)

1. https://addons.mozilla.org/developers/ öffnen und mit dem Mozilla-Konto anmelden.
2. **„Neues Add-on einreichen"** → **„Auf eigene Faust"** (On your own / unlisted).
3. `…-firefox.zip` hochladen. Mozilla prüft automatisch; Warnungen zu `innerHTML` sind bekannt
   (siehe Prüfer-Hinweis unten), Fehler dürfen keine kommen.
4. Frage „Verwenden Sie Code-Generatoren, Minifizierer …?" → **Ja** → `…-quellcode.zip`
   hochladen.
5. Texte aus Abschnitt 4 eintragen, Lizenz **CC BY-SA 4.0** wählen, absenden.
6. Nach der Signierung (meist Minuten) die `.xpi` herunterladen und als
   `Moodle AI Freitext Grader-<version>.xpi` in `Erweiterung/moodle-ai-freitext-grader-firefox/`
   legen. `npm run paket` hebt sie beim nächsten Bau automatisch auf.

Ab der zweiten Version: in der Add-on-Seite **„Neue Version hochladen"**, sonst gleich.
Die Add-on-ID bleibt immer `moodle-ai-freitext-grader@spielhoff.de` (steht in `wxt.config.ts`).

## 3 · Alternativ von der Kommandozeile

API-Schlüssel unter https://addons.mozilla.org/developers/addon/api/key/ anlegen und **selbst**
als Umgebungsvariablen setzen (nie ins Repo schreiben):

```bash
export WEB_EXT_API_KEY=…   WEB_EXT_API_SECRET=…
npm run sign:firefox -- --upload-source-code="Erweiterung/moodle-ai-freitext-grader-firefox/entpackte-dateien (nicht noetig)/moodle-ai-freitext-grader-<version>-quellcode.zip"
```

Die signierte `.xpi` landet in `web-ext-artifacts/` (gitignored); weiter wie Schritt 2.6.

## 4 · Texte für die Einreichung

**Name:** Moodle AI Freitext Grader

**Kurzbeschreibung (max. 250 Zeichen):**
Bewertet Freitextaufgaben in Moodle-Tests mit einer KI deiner Wahl: hilft beim Erwartungshorizont,
baut die Bewertungs-Prompts, rechnet Punkte und trägt Punkte und Feedback ein. Ohne eigenen KI-Zugang.

**Beschreibung:**
Für Lehrkräfte, die Freitextaufgaben in Moodle-Tests bewerten – Kurztests mit Zufallsfragen
ebenso wie Klausuren mit Teilaufgaben. Im Frageneditor entsteht mit Hilfe einer KI der
Erwartungshorizont der Aufgabe, auf Wunsch auch ein gestaltetes Layout für Aufgabe und
Antwortfeld. Auf der Bewertungsseite baut die Erweiterung den Bewertungs-Prompt mit allen
Antworten (ohne Namen), liest die Antwort der KI ein, rechnet Punkte und Rechtschreibabzug
selbst und trägt Punkte und Rückmeldung in Moodle ein. Die Erweiterung hat keinen eigenen
KI-Zugang und schickt nichts an fremde Server: Prompts gehen nur über die Zwischenablage
dorthin, wo die Lehrkraft sie einfügt.

**Hinweis für die Prüfer (Notes to reviewer):**
- Läuft nur auf Moodle-Seiten (`mod/quiz/report.php`, `question/bank/editquestion/question.php`);
  Berechtigung nur `storage`.
- Netzverkehr ausschließlich `fetch` auf dieselbe Moodle-Instanz (gleiche Origin), um
  Bewertungs- und Frageseiten zu laden und Formulare abzusenden – genau das, was die Lehrkraft
  sonst von Hand tut. Keine externen Server, keine Telemetrie, keine Datensammlung
  (`data_collection_permissions: none`).
- `innerHTML` wird für die eigene Oberfläche aus festen Vorlagen benutzt; Inhalte aus Moodle
  und aus der KI-Antwort werden vor dem Einsetzen maskiert (`escapeHtml`) bzw. als Text gesetzt.
- Bauen: siehe `BAUANLEITUNG.txt` im Quelltext-ZIP (`npm install`, `npm run build:firefox`).

## 5 · Vor der Weitergabe in Firefox testen

- `.xpi` in Firefox auf `about:addons` ziehen → Erweiterung erscheint aktiv.
- Frageneditor einer Freitextfrage: Panel erscheint, Horizont-Prompt kopieren meldet
  „✓ In die Zwischenablage kopiert".
- Kurztest-Übersicht: „Kurztest-Aufgaben durchsuchen" lädt die Antworten.
- Bewertungsseite einer Klausur-Frage: Prompt kopieren, KI-Antwort einfügen, Vorschau stimmt,
  eintragen, Seite neu laden → Punkte und Feedback stehen in Moodle.
