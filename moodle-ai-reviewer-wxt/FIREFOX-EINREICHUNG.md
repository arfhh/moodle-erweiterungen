# Firefox-Fassung signieren lassen (addons.mozilla.org, „unlisted")

Firefox installiert dauerhaft nur von Mozilla signierte Erweiterungen. Die Signierung ist
kostenlos; mit dem Kanal **„Auf eigene Faust vertreiben" (unlisted)** erscheint die Erweiterung
nicht im öffentlichen Katalog – Mozilla signiert nur, du gibst die `.xpi` selbst weiter.

## 1 · Dateien bauen

```bash
npm run paket
```

(Läuft auch automatisch beim Commit über den Pre-Commit-Hook.) Danach liegen in
`Erweiterung/moodle-ai-reviewer-firefox/entpackte-dateien (nicht noetig)/`:

| Datei | Wofür |
| --- | --- |
| `moodle-ai-reviewer-<version>-firefox.zip` | die gebaute Erweiterung – wird hochgeladen |
| `moodle-ai-reviewer-<version>-quellcode.zip` | der Quelltext – Mozilla fragt danach, weil `content.js` gebündelt ist |

Ältere ZIPs löscht der Bau selbst. Vorher prüfen (muss ohne Fehler durchlaufen):

```bash
npm run lint
```

## 2 · Hochladen (Weg im Browser)

1. https://addons.mozilla.org/developers/ öffnen und mit dem Mozilla-Konto anmelden.
2. Add-on **Moodle AI Reviewer** öffnen → **„Neue Version hochladen"** → **„Auf eigene Faust"**
   (unlisted).
3. `…-firefox.zip` hochladen. Mozilla prüft automatisch; Warnungen zu `innerHTML` sind bekannt
   (siehe Prüfer-Hinweis unten), Fehler dürfen keine kommen.
4. Frage „Verwenden Sie Code-Generatoren, Minifizierer …?" → **Ja** → `…-quellcode.zip`
   hochladen.
5. Versionshinweise und Prüfer-Hinweis aus Abschnitt 4 eintragen, Lizenz **CC BY-SA 4.0**,
   absenden.
6. Nach der Signierung (meist Minuten) die `.xpi` herunterladen und als
   `Moodle AI Reviewer-<version>.xpi` in `Erweiterung/moodle-ai-reviewer-firefox/` legen, die
   alte `.xpi` dort löschen. `npm run paket` hebt die neue beim nächsten Bau automatisch auf.

Die Add-on-ID bleibt `moodle-ai-reviewer@spielhoff.de` (steht in `wxt.config.ts`).

## 3 · Alternativ von der Kommandozeile

API-Schlüssel unter https://addons.mozilla.org/developers/addon/api/key/ anlegen und **selbst**
als Umgebungsvariablen setzen (nie ins Repo schreiben):

```bash
export WEB_EXT_API_KEY=…   WEB_EXT_API_SECRET=…
npm run sign:firefox -- --upload-source-code="Erweiterung/moodle-ai-reviewer-firefox/entpackte-dateien (nicht noetig)/moodle-ai-reviewer-<version>-quellcode.zip"
```

Die signierte `.xpi` landet in `web-ext-artifacts/` (gitignored); weiter wie Schritt 2.6.

## 4 · Texte für die Einreichung

**Name:** Moodle AI Reviewer

**Kurzbeschreibung (max. 250 Zeichen):**
Findet in Moodle-Tests frei getippte Antworten (Lückentext, Kurzantwort, Numerisch), die Moodle
nicht erkannt hat, schlägt mit einer KI deiner Wahl Punkte vor und trägt sie nach deiner
Entscheidung ein.

**Beschreibung:**
Für Lehrkräfte, die Kurztests mit Lückentexten in Moodle schreiben lassen. Moodle gibt 0 Punkte,
wenn eine Antwort nicht wortgleich hinterlegt ist – auch bei Tippfehlern oder Synonymen. Die
Erweiterung sammelt diese Antworten aus der manuellen Bewertung (ohne Namen), baut einen Prompt
für einen KI-Chat und liest die Antwort wieder ein. Feste Regeln (Groß-/Kleinschreibung, schon
bekannte Varianten) entscheiden vorab; unklare Fälle legt eine Vorschau zur Entscheidung vor.
Erst nach einem Klick werden Punkte und Feedback eingetragen. Eine Fehlersammlung merkt sich die
Entscheidungen als CSV, eine Punkteverteilung zeigt die Ergebnisse des Tests. Optional kann eine
KI direkt angesprochen werden – eine lokale auf dem eigenen Rechner oder ein Cloud-Dienst mit
eigenem API-Schlüssel; standardmäßig ist das aus.

**Versionshinweise 2.3.1:**
Vorschau für unklare Fälle statt direktem Eintragen; feste Regeln vor der KI; Wert für reine
Groß-/Kleinschreibfehler einstellbar; Fehlersammlung mit Import/Export (räumt eingepflegte Fälle
selbst auf); Punkteverteilung als Diagramm; optional „KI direkt" (lokal oder Cloud-API) mit
Einstellungsseite; vereinfachte Oberfläche.

**Hinweis für die Prüfer (Notes to reviewer):**
- Content Script nur auf `mod/quiz/report.php` (Moodle) und nur bei `mode=grading` und
  `includeauto=1`; Berechtigung `storage`.
- Netzverkehr des Content Scripts: ausschließlich `fetch` auf dieselbe Moodle-Instanz (gleiche
  Origin), um Bewertungs- und Frageseiten zu lesen und Bewertungsformulare abzusenden – genau das,
  was die Lehrkraft sonst von Hand tut.
- **Optionale Funktion „KI direkt" (Standard aus):** Das Hintergrund-Skript sendet auf Klick der
  Lehrkraft Schülerantworten (ohne Namen) an einen OpenAI-kompatiblen Endpunkt, den die Lehrkraft
  auf der Optionsseite selbst einträgt. `host_permissions` nur für `http://localhost/*` und
  `http://127.0.0.1/*` (lokale KI-Server); jede andere Adresse wird über
  `optional_host_permissions` erst auf der Optionsseite per `permissions.request` erfragt. Ein
  API-Schlüssel bleibt in `storage.local`. Es gibt keinen Server des Entwicklers, keine
  Telemetrie.
- `innerHTML` wird für die eigene Oberfläche aus festen Vorlagen benutzt; Inhalte aus Moodle und
  aus der KI-Antwort werden maskiert (`escapeHtml`) bzw. per `textContent` gesetzt.
- Bauen: siehe `BAUANLEITUNG.txt` im Quelltext-ZIP (`npm install`, `npm run build:firefox`).

## 5 · Vor der Weitergabe in Firefox testen

- `.xpi` in Firefox auf `about:addons` ziehen → Erweiterung erscheint aktiv, Version stimmt.
- Unter `about:addons` → Moodle AI Reviewer → Berechtigungen: Zugriff auf localhost/127.0.0.1
  erlaubt (Firefox fragt bei Host-Berechtigungen nach).
- Manuelle Bewertung mit „Automatisch bewertete Fragen anzeigen": Panel erscheint, „Test
  durchsuchen" läuft, Punkteverteilung lädt.
- „Prompt + Daten kopieren" → KI-Antwort einfügen → Vorschau → eintragen → Seite neu laden,
  Punkte stehen in Moodle.
- Optionen öffnen: „Verbindung testen" mit einer lokalen KI (falls vorhanden).
