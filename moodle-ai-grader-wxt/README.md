# Moodle AI Grader

**Version 3.2.0** · Browser-Erweiterung (Manifest V3) für **Chrome, Firefox und Edge**
Entwickelt von **T. Henken & A. Spielhoff** · Lizenz **CC BY-SA 4.0**

Bewertet Klausuren mit mehreren Aufgaben in **einer** Moodle-Freitextfrage: legt den
Erwartungshorizont und die Antwortvorlage in der Frage an, erzeugt daraus den
Bewertungsauftrag für einen KI-Chat und trägt Punkte und begründetes Feedback zurück
in Moodle ein.

Die Erweiterung greift **nicht selbst auf eine KI zu**. Sie erzeugt Prompts, die du in
ChatGPT, Claude oder einen anderen Chat einfügst, und liest die Antwort wieder ein.

---

## Was in Version 3 anders ist

| | v2 | v3 |
|---|---|---|
| Erwartungshorizont | im Plugin gespeichert | **in der Frage** (Moodle-Feld „Information zur Bewertung") |
| Punkte und Abzüge | die KI rechnet | **die Erweiterung rechnet** |
| Antwortvorlage | — | wird mit angelegt, gliedert die Abgabe je Aufgabe |
| Wirkt auf | jede Seite | nur Bewertungsseite **und** Frage-Bearbeiten |
| Berechtigungen | „alle Daten auf allen Websites" | nur `storage` |
| Sicherheitsnetze | Warnung vor dem Eintragen | Prüfen · Gegenprobe |

**Warum die Erweiterung rechnet:** Sprachmodelle beurteilen Sprache zuverlässig, rechnen
aber unzuverlässig. In einer früheren Fassung bestätigte die KI in der Tabelle 75 % und
schrieb anschließend die volle Punktzahl ins JSON. Seit die Rechnung im Code liegt, kann
das nicht mehr passieren.

---

## Für Einsteiger: Was, wo, wie?

### Was macht diese Erweiterung?

Sie hilft beim Bewerten von **Klausuren**, die in Moodle als **eine einzige lange
Freitextfrage** angelegt sind, in der aber mehrere Teilaufgaben mit eigenen Punktzahlen
stecken (bis zu acht bei einer Oberstufenklausur). Sie legt vor der Klausur einen
Erwartungshorizont in der Frage an, erzeugt danach einen fertigen Bewertungsauftrag für
einen KI-Chat (ChatGPT, Claude, o. Ä.) und trägt am Ende Punkte samt ausführlichem,
begründendem Feedback in Moodle ein. Eine eigene KI-Anbindung hat sie nicht — kopiert
wird von Hand zwischen Moodle und dem Chat-Fenster.

### Wo taucht sie in Moodle auf?

Der runde Knopf erscheint an zwei Stellen, je nachdem, was gerade zu tun ist:

- **Vor der Klausur**, um Erwartungshorizont und Antwortvorlage anzulegen: Kurs öffnen
  → **Fragensammlung** → die betreffende Klausur-Frage zum **Bearbeiten** öffnen.
- **Beim Bewerten** nach der Klausur: Kurs öffnen → den Test anklicken → **Ergebnisse**
  → **Manuelle Bewertung** → eine einzelne Abgabe/Frage zum Bewerten anklicken
  (die Einzelfrageseite, nicht die Übersicht). Dort erscheint unten rechts ein
  **blauer runder Knopf**.

Auf der Übersichtsseite der Manuellen Bewertung selbst erscheint nichts — dort wirken
stattdessen *Moodle AI Coach* und *Moodle AI Reviewer*.

### Installation (Schritt für Schritt)

Diese Erweiterung ist kein Programm zum Doppelklicken, sondern eine Browser-Erweiterung.
Sie kommt nicht aus einem offiziellen „Store", sondern wird als **entpackte Erweiterung**
geladen — das klingt komplizierter, als es ist.

1. Auf der GitHub-Seite die ZIP herunterladen und entpacken (Doppelklick auf die
   ZIP-Datei bzw. rechte Maustaste → „Alle extrahieren"). Danach liegt ein Ordner mit
   drei Unterordnern da — einer je Browser: `moodle-ai-grader-chrom`,
   `moodle-ai-grader-firefox`, `moodle-ai-grader-edge`.
2. Diesen Ordner an einen **festen Platz** verschieben, z. B. in einen eigenen Ordner
   „Moodle-Erweiterungen" in den eigenen Dokumenten. **Nicht mehr verschieben oder
   umbenennen** — sonst muss die Erweiterung neu eingerichtet werden.
3. Je nach Browser weiter wie unten beschrieben.

**Google Chrome**
1. Adresse `chrome://extensions` in die Adresszeile eingeben und Enter drücken.
2. Oben rechts den Schalter **Entwicklermodus** einschalten.
3. Auf **„Entpackte Erweiterung laden"** klicken und den Ordner `moodle-ai-grader-chrom`
   auswählen (den Ordner, in dem die Datei `manifest.json` direkt drinliegt).
4. Die Erweiterung erscheint jetzt in der Liste — fertig.

**Microsoft Edge**
Genauso wie bei Chrome, nur mit der Adresse `edge://extensions` und dem Ordner
`moodle-ai-grader-edge`.

**Firefox**
1. Die `.xpi`-Datei im Ordner `moodle-ai-grader-firefox` per Doppelklick öffnen (oder in
   ein offenes Firefox-Fenster ziehen).
2. Firefox fragt nach der Installationsberechtigung — mit **Hinzufügen** bestätigen.
3. Fertig. Die Erweiterung ist von Mozilla signiert und bleibt dauerhaft installiert,
   auch nach einem Firefox-Neustart.

Danach die Moodle-Seite einmal **neu laden** (Taste F5), falls sie schon offen war —
erst dann wird die neu installierte Erweiterung dort aktiv.

Beim Installieren fragt der Browser nur nach Zugriff auf die Bewertungs- und die
Fragen-Bearbeiten-Seite deines Moodle. Die Warnung „alle Daten auf allen Websites" gibt es
seit Version 3 nicht mehr.

**Update auf eine neue Version:** genau denselben Ordner mit dem Inhalt der neuen ZIP
überschreiben (Ordnername nicht ändern) und in den Erweiterungseinstellungen des
Browsers auf „↺ neu laden" klicken.

---

## Ablauf

### 1 · Vor der Klausur — Erwartungshorizont und Antwortvorlage anlegen

Frage in der Fragensammlung zum **Bearbeiten** öffnen. Rechts erscheint der Knopf **AI**.

1. Reiter **Erwartungshorizont** → „📋 Prompt kopieren".
2. In den KI-Chat einfügen. Die KI zerlegt die Aufgabenstellung in Teilaufgaben, schlägt
   Operator, AFB-Stufe, Punkte und den Erwartungshorizont vor und fragt nach, bis es passt.
3. Den JSON-Block der KI in das Feld einfügen → **🔍 Prüfen**. Je Aufgabe erscheint ein
   Textfeld; du kannst jeden Horizont noch ändern.
4. Reiter **Antwortvorlage** → Vorschau ansehen, dann **Horizont + Antwortvorlage eintragen**.

Beides wird in **einem** Speichervorgang geschrieben und danach gegengeprüft.

**Die Antwortvorlage** wird den Lernenden beim Öffnen der Frage in das Eingabefeld geladen:
je Aufgabe eine Kopfzeile mit Nummer, AFB-Stufe, Schlagwort und Punktzahl, darunter Platz
zum Schreiben. Sie gibt der Klasse Struktur — und erlaubt der Erweiterung später, die
Abgabe verlässlich Aufgabe für Aufgabe zu zerlegen.

### 2 · Nach der Klausur — bewerten

**Test → Ergebnisse → Manuelle Bewertung**, dann den Knopf **AI**.

1. Reiter **Korrektur**. Die Erweiterung schlägt vor, wie viele Abgaben in einen Durchgang
   passen — hergeleitet aus der tatsächlichen Textlänge, nicht aus einer festen Zahl.
2. „📋 Prompt kopieren" → in den KI-Chat → Antwort zurück in das Feld → **🔍 Prüfen**.
3. Je Abgabe erscheint eine Zeile mit alter und neuer Punktzahl, den Prozentwerten je
   Aufgabe und der Fehlerdichte. Das Feedback lässt sich vorher noch bearbeiten.
4. **Alle eintragen.** Danach lädt die Erweiterung die Seite erneut und vergleicht jeden
   gespeicherten Wert mit dem gewollten. Es wird nichts als Erfolg gemeldet, was nicht
   wirklich angekommen ist.

Fehlt der Erwartungshorizont, springt die Erweiterung von selbst in den Horizont-Reiter —
er lässt sich auch hier noch nachtragen.

---

## Bewertungsmaßstab

**Inhalt.** Die KI vergibt je Aufgabe einen Erfüllungsgrad in den Stufen
100 / 75 / 50 / 25 / 0 Prozent und verankert ihn am hinterlegten Erwartungshorizont.
Punkte, Rundung und Summe rechnet die Erweiterung.

**Sprache — als Abzug, nicht als zweiter Topf.** Ein inhaltsleerer, aber sauber
geschriebener Text bekäme sonst allein für die Form Punkte. Der Höchstabzug ist ein
Prozentsatz der **Gesamtpunktzahl**, nicht je Aufgabe, und wird proportional verteilt.

Gestaffelt wird nach **Fehlern je 100 Wörtern**, mit einer festen Kurve (seit 3.1.0,
nicht mehr wählbar — die früheren Stufen mild/normal/streng waren nur eine
Kalibrierungs-Reserve ohne eigene didaktische Bedeutung):

| kein Abzug | ⅓ | ⅔ | voll |
|---|---|---|---|
| bis 1,0 | bis 2,0 | bis 3,5 | darüber |

Unter 40 Wörtern greift eine Dichte nicht — dort zählt die absolute Fehlerzahl.
Bei 0 % wird kein Punkt abgezogen, das Sprachfeedback aber trotzdem geschrieben.
Schwere Fehler (Satz ohne Prädikat, abgebrochener Satz, Satzbau zum zweimal Lesen)
zählen doppelt.

**Operatoren** fließen immer in die Bewertung ein. Einen eigenen Abschnitt
„Operatorerfüllung" im Feedback bekommt nur die Stufe „Umfangreich"; bei „Ausführlich"
steht die Operatorverfehlung im laufenden Begründungstext.

**Jede Aufgabe bekommt eine Begründung** — auch eine mit voller Punktzahl.

---

## Einstellungen (⚙)

Fach · Jahrgang (ab 11 wird gesiezt) · Kursniveau · Punkteschritte ·
Rechtschreibung (Höchstabzug in % der Gesamtpunktzahl) · Feedbacklänge ·
KI-Transparenzhinweis · Quellenangaben entfernen.

Die Werte werden **nicht** nur in den Prompt geschrieben, sondern von der Erweiterung
angewandt. Wer den Prompt selbst anpassen will, kann ihn über ✏️ überschreiben;
beim Speichern der Grundeinstellungen werden eigene Prompts zurückgesetzt, damit keine
veralteten Parameter eingebettet bleiben.

**Seit 3.1.0 stehen Rechtschreibungs-Prozent und Punkteschritte zusätzlich im
Erwartungshorizont selbst** (Meta-Zeilen direkt nach dem Zuständigkeits-Marker, reine
Verwaltung — sie gehen nicht in den Prompt). Grund: Bei mehreren Kursen (z. B. Klasse 8,
9, 10) wird sonst leicht vergessen, die Einstellung vor jeder Korrektur an die richtige
Klasse anzupassen. Weicht der Rechtschreibungs-Prozentwert im Horizont von der aktuellen
Einstellung ab, zeigt Reiter „Korrektur" nach „🔍 Prüfen" einen Hinweis mit Umschalter —
ohne Umschalten gilt der Horizont-Wert, weil er beim Anlegen des Erwartungshorizonts
bewusst so gewählt wurde. Die Punkteschritte kommen ohne eigenen Abgleich-Dialog direkt
aus dem Horizont, weil sie die Note ohnehin kaum verändern.

---

## Ohne Antwortvorlage und ohne Kartendesign

Die Erweiterung setzt **nichts** davon voraus. Sie erkennt selbst, was sie vorfindet:

1. **Gegliederte Abgabe** → zerlegt je Aufgabe. Bester Fall.
2. **Keine Gliederung, aber Horizont** → die ganze Abgabe geht am Stück an die KI.
3. **Kein Horizont** → die Erweiterung bietet an, einen zu erzeugen.

Die Antwortvorlage wird standardmäßig **neutral** gestaltet; die Farblogik nach
AFB-Stufen ist eine Option.

Wer in seinem Moodle keine Fragen bearbeiten darf, kann den Horizont stattdessen in der
Erweiterung ablegen — im Reiter „Erwartungshorizont" ganz unten.

---

## Datenschutz

- **Keine Schülernamen** werden ausgelesen oder kopiert; zur Zuordnung dient nur die
  laufende Nummer der Abgabe auf der Seite.
- Die Erweiterung sendet nichts an fremde Server. Sie liest Seiten deiner eigenen
  Moodle-Instanz mit deiner bestehenden Anmeldung.
- Daten verlassen den Browser erst, wenn du selbst auf „Prompt kopieren" klickst.
- Kein Zugriff auf Seiten-JavaScript, kein Hintergrunddienst, keine Netzwerkrechte
  außerhalb deines Moodle.

## Änderungen

**WXT-Umstellung (17.09.2026):** Ab dieser Fassung wird die Erweiterung mit **WXT**
gebaut (siehe Skill `1-browser-wxt`) — eine Codebasis, drei Browser (Chrome, Firefox,
Edge), statt einem einzelnen Hand-Manifest nur für Chrome. Der fachliche Kern liegt in
`lib/mag-core.js` und ist zeilengleich mit der bewährten `content.js` bis 3.1.0; einzige
Änderungen: `chrome.*` -> `browser.*` (Polyfill), IIFE -> `export function
starteGrader()`, Icon-Pfad `icons/icon128.png` -> `icon/128.png` (WXT legt
`public/icon/` als `icon/` ab). Der Rundknopf mit dem Erweiterungs-Icon
(`.mag-knopf`/`.mag-knopf-bild`) deckte schon vorher den ganzen Kreis per
`object-fit: cover` — anders als beim Aufgaben-Grader gab es hier keinen weißen Ring
zu beheben.

Befehle: `npm run dev` (Chrome-Testlauf), `npm run build-all` (alle drei Browser),
`npm run paket` (baut, benennt um, packt zu `dist/moodle-ai-grader.zip`). Details in
`1-browser-wxt`.

**3.1.0** — Rechtschreibungs-Prozent und Punkteschritte stehen jetzt als Meta-Zeilen im
Erwartungshorizont und werden beim Bewerten mit der aktuellen Einstellung abgeglichen
(Rechtschreibung) bzw. direkt daraus übernommen (Punkteschritte) — Details siehe
„Einstellungen" oben. Die Strenge-Voreinstellung (keine/mild/normal/streng) ist
entfallen; die Rechtschreibungs-Kurve ist jetzt fest kalibriert, einzige Einstellung
bleibt der Prozentwert.

## Grenzen

- Eine Moodle-Freitextfrage je Bewertungsseite. Für Kurztests mit Zufallsfragen ist der
  **Moodle AI Coach** zuständig, für Cloze-Lücken der **Moodle AI Reviewer**.
- Die Erweiterung ändert nichts an Fragen, die sie nicht kennt: Geschrieben wird nur, was
  du beim Prüfen gesehen und dann bestätigt hast.
- Anhänge und Dateiabgaben werden nicht gelesen.
