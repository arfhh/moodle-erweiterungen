# Moodle-Erweiterungen für Chrome, Firefox und Edge

Sieben kleine Browser-Erweiterungen, die wiederkehrende Handarbeit in Moodle abnehmen —
Bewerten, Nachbewerten, Fragensammlung pflegen, Notenstufen eintragen, Namen verbergen. Alle sieben sind
mit **WXT** aus **einer** Codebasis für Chrome, Firefox und Edge gebaut.

Alle laufen **ausschließlich im Browser**. Keine Erweiterung schickt Daten an einen
Server, keine hat einen eigenen KI-Zugang und keine braucht einen API-Schlüssel.
Wo eine KI im Spiel ist, erzeugt die Erweiterung einen **Prompt zum Kopieren** und
liest die **Antwort als JSON** wieder ein — welchen Chat du benutzt, entscheidest du.

---

## Was ist das hier eigentlich?

Diese sieben Programme sind **Browser-Erweiterungen** — kleine Zusatzprogramme,
die man einmalig im Browser installiert (nicht auf dem Computer) und die dann
automatisch auf bestimmten Seiten mitlaufen. Du kennst das Prinzip vielleicht
von einem Werbeblocker oder einem Passwort-Manager: einmal eingerichtet,
taucht er von selbst auf, wenn er gebraucht wird.

**Was passiert konkret, wenn du eine davon installierst?** Rufst du danach
eine bestimmte Moodle-Seite auf — z. B. die Bewerten-Uebersicht eines Tests
oder einer Aufgabe — erscheint dort automatisch ein zusaetzlicher Knopf oder
ein kleines Panel, das vorher nicht da war. Auf jeder anderen Seite (auch in
anderen Moodle-Kursen, auf anderen Webseiten) passiert **nichts** — die
Erweiterung erkennt selbst, ob sie auf der richtigen Seite ist.

Klickst du den Knopf an, liest die Erweiterung aus, was auf der Seite steht
(z. B. die Schuelerantworten eines Tests), und baut daraus einen fertigen
Text — einen sogenannten **Prompt**. Diesen Text kopierst du in einen Chat
mit einer KI (mit **Claude**, siehe die Skills weiter unten — es geht aber
grundsaetzlich mit jedem KI-Chat). Die KI beantwortet ihn, du kopierst die
Antwort zurueck in die Erweiterung. Sie traegt Punkte und Feedback dann in
Moodles **eigene** Eingabefelder ein und markiert, was sie veraendert hat.

**Wichtig: Nichts wird automatisch abgeschickt.** Am Ende steht immer
Moodles **eigener** Speichern-Knopf, den druecke ausschliesslich du selbst —
nachdem du kontrolliert hast, was drinsteht. Keine dieser Erweiterungen
schickt irgendwelche Daten an einen fremden Server, keine hat einen eigenen
KI-Zugang, keine braucht ein Passwort oder einen API-Schluessel. Sie laufen
vollstaendig lokal in deinem Browser und beruehren nur die Moodle-Seite, die
gerade offen ist.

**Wie installiert man das?** Nicht ueber einen Chrome Web Store — die
Installation laeuft als sogenannte "entpackte Erweiterung": man laedt eine
ZIP-Datei herunter, entpackt sie, und zeigt dem Browser den entpackten
Ordner. Klingt technischer, als es ist — die genaue Schritt-fuer-Schritt-
Anleitung fuer Chrome, Edge und Firefox steht im Abschnitt "Installation"
weiter unten.

Die Erweiterungen ersetzen dabei nur das laestige Kopieren zwischen Moodle
und einem KI-Chat von Hand. Damit die KI-Antworten inhaltlich auch gut sind
(welcher Bewertungsmassstab gilt, welche Fehler wie viel kosten, …), gehoert
zu jeder Erweiterung eine passende **Claude-Skill** — eine Art
mitgelieferte Anleitung fuer die KI. Wo die liegen und wie man sie
installiert, steht ganz unten unter "Womit diese Erweiterungen gebaut
werden".

---

## Die sieben Erweiterungen

| Erweiterung | Version | Download | Wofür |
|---|---|---|---|
| **Moodle AI Grader** · [Quelltext](moodle-ai-grader-wxt/) | 3.2.2 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-grader.zip)** | **Klausuren** mit mehreren Aufgaben in einer Freitextfrage: legt Erwartungshorizont und Antwortvorlage in der Frage an, erzeugt Bewertungs-Prompts, rechnet die Punkte und trägt sie mit begründetem Feedback zurück |
| **Moodle AI Reviewer** · [Quelltext](moodle-ai-reviewer-wxt/) | 1.7.2 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-reviewer.zip)** | **Nachbewerten**: findet frei eingetippte Antworten (Cloze-Lücken, Kurzantwort, Numerisch), die Moodle nicht erkannt hat, und trägt Punkte und Feedback nach |
| **Moodle AI Coach** · [Quelltext](moodle-ai-coach-wxt/) | 1.9.1 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-coach.zip)** | **Kurze Freitextantworten** (2–3 Sätze): liest den Erwartungshorizont aus der Frage, bewertet und gibt Sprachfeedback |
| **Moodle AI Aufgaben-Grader** · [Quelltext](moodle-ai-aufgaben-grader-wxt/) | 1.9.1 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-aufgaben-grader.zip)** | **Datei-Abgaben** im Aufgabenmodul: lädt die Abgaben anonymisiert als ZIP, erkennt was seit dem letzten Mal neu oder geändert ist, und trägt Feedback und Punkte über Moodles Schnellbewertung zurück |
| **Moodle Cloze Autofill** · [Quelltext](moodle-cloze-autofill-wxt/) | 2.1.1 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-cloze-autofill.zip)** | **Fragensammlung pflegen**: trägt neue Antwortvarianten in Cloze-Lücken ein, statt Frage für Frage von Hand |
| **Moodle Notenstufen Autofill** · [Quelltext](notenstufen-extension-wxt/) | 2.8.0 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/notenstufen-autofill.zip)** | **Notenstufen-Tabelle** eines Kurses auf einen Klick ausfüllen — pro Kurs oder für alle Kurse gemeinsam |
| **Moodle Namen verbergen** · [Quelltext](moodle-namen-verbergen-wxt/) | 1.0.3 | **[⬇ ZIP](https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-namen-verbergen.zip)** | **Namen verwischen**: verbirgt Namen, E-Mail-Adressen und Profilbilder per Klick, z. B. für Vorführungen mit Bildschirmfreigabe. Idee: Andreas Schenkel, nach Code und Ideen von Matthias Giger und Florian Dagner |

### Was du nach der Installation konkret siehst

- **Moodle AI Grader** — auf der Bewerten-Seite einer Klausurfrage erscheint
  ein Panel. Es legt zuerst Erwartungshorizont und Antwortvorlage in der
  Frage an (einmalig, mit Vorschau), danach erzeugt es pro Person einen
  Bewertungs-Prompt, rechnet aus der KI-Antwort die Punkte und schreibt
  Note plus begruendetes Feedback in die manuelle Bewertung.
- **Moodle AI Reviewer** — auf derselben Art Seite, aber bei automatisch
  ausgewerteten Fragen (Cloze, Kurzantwort, Numerisch): findet frei
  eingetippte Antworten, die Moodle nicht erkannt hat, und traegt fehlende
  Punkte und Kommentare nach.
- **Moodle AI Coach** — auf der Bewerten-Uebersicht eines Kurztests: liest
  den in der Frage hinterlegten Erwartungshorizont aus, bewertet kurze
  Freitextantworten (2–3 Saetze) und gibt zusaetzlich Sprachfeedback.
- **Moodle AI Aufgaben-Grader** — auf der Bewerten-Uebersicht einer Aufgabe
  (Datei-Abgaben, z. B. PDF-Arbeitshefte) erscheint ein roter Knopf. Er laedt
  alle Abgaben anonymisiert (nur mit Kuerzel statt Klarnamen) als ein ZIP
  herunter, erkennt beim naechsten Mal, was neu oder geaendert ist, und
  traegt spaeter Note und Feedback ueber Moodles Schnellbewertung zurueck.
- **Moodle Cloze Autofill** — auf der Seite, auf der man eine
  Cloze-Frage bearbeitet: traegt neu gefundene, richtige Schreibvarianten
  einer Luecke automatisch ein, statt sie von Hand einzutippen.
- **Moodle Notenstufen Autofill** — auf der Notenstufen-Seite eines Kurses:
  fuellt die ganze Tabelle auf einen Klick, fuer einen Kurs oder fuer alle
  gemeinsam.
- **Moodle Namen verbergen** — auf allen Moodle-Seiten: verwischt Namen,
  E-Mail-Adressen und Profilbilder per Klick (Knopf unten links oder Symbol in
  der Symbolleiste), damit man Moodle vorfuehren kann, ohne Schuelerdaten zu
  zeigen. Idee: Andreas Schenkel (moodle-textblock-blurmode_controller, nach
  Code und Ideen von Matthias Giger und Florian Dagner); der Code ist eine
  eigene Umsetzung.

Bei allen gilt dasselbe Muster: Erweiterung liest und schlaegt vor, du
pruefst und speicherst selbst. Genaueres — auch was die Erweiterung NICHT
kann — steht jeweils in ihrer eigenen README (siehe Spalte "Quelltext" in
der Tabelle oben).

Jeder Ordner hat eine eigene, ausführliche `README.md` — dort stehen Bedienung,
Bewertungsmaßstab, Grenzen und die Änderungsgeschichte.

> **Der Coach ist jung (seit 1.8).** Der Bewertungsweg ist mehrfach mit echten Daten
> gelaufen; beim ersten Einsatz in einem neuen Kurs trotzdem mit **einer** Frage anfangen.

---

## Installation

Keine dieser Erweiterungen liegt in einem Web Store — sie werden als *entpackte
Erweiterung* geladen. Jedes ZIP enthält **drei fertige Ordner**, einen je Browser:
`<name>-chrom`, `<name>-firefox`, `<name>-edge`.

1. In der Tabelle oben auf **⬇ ZIP** der gewünschten Erweiterung klicken und das
   Archiv entpacken. Diese Links zeigen immer auf die **aktuelle Fassung** und ändern
   sich nie — man kann sie also weitergeben und in eigene Anleitungen schreiben.
   (Wer alles auf einmal will: **Code → Download ZIP** oben auf dieser Seite. Wer Git
   benutzt: Repo klonen und den passenden `*-wxt`-Ordner verwenden.)
2. Die drei Ordner an einen festen Platz legen und **nicht mehr verschieben**. Chrome
   und Edge leiten aus dem Ordnerpfad die Erweiterungs-ID ab — wird der Ordner
   verschoben oder umbenannt, sind gespeicherte Einstellungen weg.

**Chrome / Edge:**
1. `chrome://extensions` bzw. `edge://extensions` öffnen, **Entwicklermodus** einschalten.
2. **Entpackte Erweiterung laden** → den passenden Ordner auswählen (`-chrom` für
   Chrome, `-edge` für Edge).
3. Beim Update genügt „↺ neu laden" an derselben Stelle, solange der Ordner am selben
   Platz bleibt.

**Firefox:**
1. `about:debugging#/runtime/this-firefox` öffnen.
2. **„Temporäres Add-on laden…"** klicken und eine Datei im `-firefox`-Ordner auswählen
   (z. B. `manifest.json`).
3. Gilt bis zum nächsten Firefox-Neustart — für Dauerbetrieb braucht Firefox eine
   Signierung durch Mozilla oder den Entwicklermodus.

Mehrere Erweiterungen lassen sich gleichzeitig laden; sie kommen sich nicht in die
Quere. Grader, Reviewer und Coach liegen zwar auf derselben Moodle-Seite, zeigen ihr
Panel aber unter verschiedenen Bedingungen und in verschiedenen Farben.

**Update:** denselben ⬇-Link noch einmal aufrufen, den alten Ordnerinhalt ersetzen, in
den Erweiterungseinstellungen des jeweiligen Browsers auf „↺ neu laden" klicken. Ob die
neue Fassung wirklich aktiv ist, verrät die Versionsnummer auf der Kachel.

**Direktlinks zum Weitergeben** — sie führen immer zur neuesten Fassung:

```
moodle-ai-grader
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-grader.zip

moodle-ai-reviewer
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-reviewer.zip

moodle-ai-coach
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-coach.zip

moodle-ai-aufgaben-grader
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-ai-aufgaben-grader.zip

moodle-cloze-autofill
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-cloze-autofill.zip

notenstufen-autofill
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/notenstufen-autofill.zip

moodle-namen-verbergen
https://github.com/arfhh/moodle-erweiterungen/raw/main/dist/moodle-namen-verbergen.zip
```

---

## Vor dem ersten Einsatz

**Coach und Grader teilen sich die Freitextfragen.** Kommen in einem Test kurze und
lange Freitextaufgaben nebeneinander vor, sagt ein Marker in der ersten Zeile des
Erwartungshorizonts, wer zuständig ist — `[moodle-ai-coach]` oder `[moodle-ai-grader]`.
Der Coach überspringt fremde Fragen, der Grader weist nur darauf hin. Ausführlich steht
das im Abschnitt „Wer ist zuständig" in beiden READMEs.

**Fang mit einer Frage an.** Alle Erweiterungen, die schreiben, zeigen
vor dem Eintragen eine Prüfung. Nutze sie beim ersten Mal — und sieh in Moodle nach,
ob wirklich das drinsteht, was du erwartet hast.

**Wer schreibt, hinterlässt Spuren.** Punkte und Kommentare, die eine Erweiterung
einträgt, sind normale manuelle Bewertungen. Sie lassen sich überschreiben, aber
nicht mit einem Knopfdruck zurücknehmen.

**Geteilte Fragensammlung?** Dann Vorsicht mit *Cloze Autofill* — die Erweiterung
schreibt direkt in die Fragen. Wo eine Sammlung im Kollegium geteilt wird, sollte nur
eine Person eintragen; die anderen sammeln ihre Funde mit dem *Reviewer* als CSV und
schicken sie ihr. Wer eine eigene Sammlung pflegt, kann beide direkt hintereinander
benutzen. Näheres in der README des Autofill.

---

## Bekannte Grenzen

- Alle Erweiterungen erkennen ihre Seite am **Moodle-Pfad**, nicht an der Adresse
  davor. Sie laufen deshalb auf jedem Moodle — auch auf einem, das in einem
  Unterverzeichnis liegt (`https://schule.de/moodle/…`). Eine feste Schuladresse
  steht in keinem Manifest.
- Die Oberflächentexte, nach denen gesucht wird, sind auf **Deutsch** ausgerichtet;
  wo es ging, wird primär über Moodle-Feldnamen und IDs gesucht, die
  sprachunabhängig sind. Auf einer englischsprachigen Oberfläche kann trotzdem eine
  Beschriftung nicht erkannt werden — dann bitte ein Issue mit dem sichtbaren Text.
- Grader, Reviewer und Coach sind an der Moodle-Seite **Manuelle Bewertung**
  entwickelt und an einem Moodle-4-Theme erprobt. Andere Themes ändern das HTML —
  wenn ein Panel nicht erscheint, liegt es fast immer daran.
- Um die hinterlegten richtigen Antworten mitzulesen, braucht man das Recht,
  **Fragen zu bearbeiten**. Fehlt es, arbeiten die Erweiterungen ohne diese Angaben
  weiter, die KI beurteilt dann aber blind.
- **Firefox verlangt für Dauerbetrieb eine Signierung durch Mozilla** oder den
  Entwicklermodus. Ohne das gilt eine über „Temporäres Add-on laden" installierte
  Fassung nur bis zum nächsten Firefox-Neustart.

---

## Versionsnummern

Alle sieben Erweiterungen benutzen dieselbe dreistellige Form **`x.y.z`** — auch
dann, wenn die letzte Stelle 0 ist.

| Stelle | Bedeutet | Beispiel |
|---|---|---|
| **x** | Echte neue Fassung: großer Umbau, geänderter Arbeitsablauf | Grader 2.30 → 3.0.0 |
| **y** | Neue Funktion oder spürbare Erweiterung im bestehenden Ablauf | 1.4.2 → 1.5.0 |
| **z** | Laufende Anpassung: Fehlerbehebung, Feinschliff, Text, Symbol, Doku | 1.5.6 → 1.5.7 |

Maßgeblich ist immer die `version` in `wxt.config.ts` der jeweiligen Erweiterung
(dort im Code, seit der WXT-Umstellung nicht mehr in einer separaten `manifest.json`)
— die Tabelle oben und die READMEs werden danach nachgezogen. Grader, Reviewer und
Coach zeigen ihre Versionsnummer außerdem in der Kopfzeile ihres Panels — direkt aus
dem gebauten Manifest gelesen. Nach „↺ neu laden" ist damit ohne Umweg über die
Erweiterungsverwaltung sichtbar, welche Fassung wirklich läuft.

---

## Womit diese Erweiterungen gebaut werden

Alle sieben entstehen aus je einem eigenen **WXT**-Projekt (`*-wxt/`): eine
JavaScript/CSS-Codebasis, aus der `npm run build-all` die drei Browserfassungen baut
und `npm run paket` sie zusammen mit der README zu `dist/<name>.zip` packt — dieselbe
ZIP, auf die die Download-Links oben zeigen. Der Ordner **im** Zip heißt nach der
Erweiterung selbst (`<name>-Erweiterung`), nicht schlicht „Erweiterung" — sonst würde
beim Entpacken mehrerer ZIPs nacheinander „Erweiterung", „Erweiterung (1)",
„Erweiterung (2)" … entstehen.

**Die ZIPs bauen sich beim Commit von selbst neu.** Ein Git-Hook
(`.githooks/pre-commit`) prüft bei jedem `git commit`, ob Quelltext einer der sieben
`*-wxt`-Projekte mit eingecheckt wird, baut in dem Fall automatisch `npm run paket`
für genau dieses Projekt und nimmt die frische `dist/<name>.zip` gleich mit in denselben
Commit auf. Damit ist ausgeschlossen, dass eine ZIP im Download hinter dem
Quelltext zurückbleibt, weil das manuelle `npm run paket` vergessen wurde.

Der Hook ist **einmalig pro Arbeitskopie** einzurichten (danach merkt Git sich das
dauerhaft in `.git/config`):

```
git config core.hooksPath .githooks
```

Fehlt in einem der sieben Projekte `node_modules/` (z. B. nach einem frischen Klonen
ohne `npm install`), überspringt der Hook diese Erweiterung mit einer Warnung, statt
den Commit zu blockieren — dann `npm install` in dem Ordner nachholen und den Commit
notfalls wiederholen.

Die Claude-Skills hinter diesen Erweiterungen — und weitere für H5P und für
Moodle-Testfragen — liegen in einem eigenen Repo:
<https://github.com/arfhh/lehrkraft-werkzeuge>. Dort gibt es sie als Plugin
zum Installieren oder als ZIP zum Selbsteinrichten.

---

## Mitmachen

Fehler, Verbesserungen und Erfahrungen aus anderen Moodle-Installationen sind
willkommen — am liebsten als Issue mit Moodle-Version, Browser, Theme und dem, was auf
dem Bildschirm passiert ist (oder eben nicht).

---

## Lizenz und Urheber

**CC BY-SA 4.0** — Weitergabe und Bearbeitung erlaubt, mit Namensnennung, und unter
denselben Bedingungen. Siehe [LICENSE](LICENSE).

Entwickelt von **A. Spielhoff** für den eigenen Unterricht — den **Moodle AI Grader**
zusammen mit **T. Henken**. Bei ihm müssen beide Namen genannt bleiben, wer ihn
weiterverbreitet oder bearbeitet.
