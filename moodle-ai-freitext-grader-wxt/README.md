# Moodle AI Freitext Grader

Bewertet alle Freitextaufgaben (Essay-Fragen) in Moodle-Tests mit KI-Unterstützung –
Kurztests mit Zufallsfragen ebenso wie Klausuren mit Teilaufgaben. Die Erweiterung
greift selbst nicht auf eine KI zu: Sie baut die Prompts, du gibst sie in die KI deiner
Wahl, fügst die Antwort ein, und die Erweiterung rechnet und trägt Punkte samt Feedback ein.

Ersetzt **Moodle AI Coach** und **Moodle AI Grader**.

## Was er macht

Der Freitext Grader begleitet eine Freitextaufgabe vom Anlegen bis zur eingetragenen
Rückmeldung:

- **Beim Anlegen der Frage:** Er erstellt mit Hilfe der KI den **Erwartungshorizont** und
  speichert ihn in der Frage. Auf Wunsch gestaltet er Aufgabenstellung und Antwortfeld im
  einheitlichen Kartendesign (Teilaufgaben 1, 2a, 2b … mit Punkten).
- **Beim Bewerten:** Er sammelt alle Antworten, baut daraus einen fertigen Bewertungsauftrag
  für die KI, liest deren Antwort wieder ein, **rechnet Punkte und Rechtschreibabzug selbst**
  und trägt Punkte und Feedback in Moodles manuelle Bewertung ein.

Er kennt zwei Arten von Freitextaufgaben:

| | **Kurztest** | **Klausur** |
|---|---|---|
| Typische Aufgabe | ca. 5 Minuten, 2–3 Sätze, oft Zufallsfragen | 40–120 Minuten, mehrere Teilaufgaben in einer Frage, oft mit Material |
| Bewertet wird | gesammelt auf der Übersicht der manuellen Bewertung (oder einzeln auf der Fragenseite) | auf der Einzelseite der Frage, Arbeit für Arbeit |
| Feedback | kurz, mit Sprachrückmeldung | ausführlich begründet je Teilaufgabe |

Welche Art gilt, steht als Marker in der ersten Zeile des Horizonts:
`[moodle-ai-freitext: kurztest]` oder `[moodle-ai-freitext: klausur]`.
Alte Marker (`[moodle-ai-coach]`, `[moodle-ai-grader]`) gelten weiter; ein alter Horizont
wird erkannt und geht beim Neuerstellen als Vorlage in den Auftrag.

## Wie er es macht – die Grundsätze

- **Kein eigener KI-Zugang.** Die Erweiterung schickt nichts an eine KI oder einen fremden
  Server. Sie kopiert Prompts in die Zwischenablage; du fügst sie in die KI deiner Wahl ein
  (Claude, ChatGPT …) und die Antwort wieder in die Erweiterung.
- **Ohne Namen.** Die Antworten gehen nur nummeriert in den Prompt. Die Zuordnung zu den
  Personen bleibt in Moodle.
- **Die KI beurteilt, die Erweiterung rechnet.** Die KI liefert je Aufgabe eine Stufe,
  gezählte Sprachfehler, eine Begründung und die Rückmeldung. Punkte, Rechtschreibabzug und
  Rundung auf die eingestellten Punkteschritte berechnet die Erweiterung – nachvollziehbar
  und bei allen gleich.
- **Der Horizont ist der Maßstab.** Bewertet wird immer nach dem in der Frage gespeicherten
  Horizont. Fach, Jahrgang, Niveau und Feedbacklänge stehen mit darin und wandern mit der
  Frage mit (Zufallspool, Export).
- **Du entscheidest und speicherst.** Jede Bewertung wird vor dem Eintragen angezeigt
  („bisher → neu"). Den Klick zum Eintragen machst immer du.
- Jede Teilaufgabe bekommt eine Begründung, auch bei voller Punktzahl. Der KI-Hinweis unter
  dem Feedback wird von der Erweiterung angehängt, nicht von der KI geschrieben.

## So funktioniert es Schritt für Schritt

### 1 · Erwartungshorizont anlegen (Frageneditor)

Im Frageneditor einer Freitextfrage öffnet sich am rechten Rand das Panel „Freitext Grader".

1. Im Kasten **„Diese Aufgabe"** Modus (Kurztest oder Klausur), Feedbacklänge, Fach,
   Jahrgang und Niveau wählen. Die Erweiterung schlägt den Modus aus Marker und Aufgabe vor.
2. **Horizont-Prompt kopieren** und in die KI einfügen. Der Prompt enthält Aufgabentext,
   Punkte und – falls die Aufgabe darauf verweist – das Material (Bilder und Dateien werden
   aufgelistet; Werte daraus verlangt der Prompt mit Quelle).
3. Antwort der KI einfügen und **„Horizont eintragen"**. Bei einer neuen Frage wird er ins
   offene Formular gesetzt und mit Moodles „Änderungen speichern" gespeichert.

Im Reiter **Layout** lassen sich Aufgabenstellung und Antwortvorlage im Kartendesign
gestalten; auch das wird nur ins Formular eingefügt, gespeichert wird von Hand.

Wird ein Horizont später geändert, legt Moodle eine neue Fragenfassung an. Bereits
geschriebene Versuche zeigen weiter die alte – die Erweiterung rechnet trotzdem sofort mit
dem neuen Horizont und sagt das in ihrer Meldung.

### 2 · Kurztest bewerten (Übersicht der manuellen Bewertung)

1. In der manuellen Bewertung des Tests **„Kurztest-Aufgaben durchsuchen"**. Die
   Erweiterung lädt alle Antworten zu allen Kurztest-Fragen. Ein Reiter listet die
   Aufgaben mit Status; Aufgaben ohne aktuellen Horizont werden gezählt und verlinkt.
2. Bewertungsprompt kopieren, in die KI einfügen, Antwort zurück einfügen.
3. Die Vorschau zeigt je Antwort bisherige und neue Punkte. Prüfen, dann eintragen.

Eine einzelne Kurztest-Frage lässt sich auch auf ihrer eigenen Bewertungsseite bewerten –
gleicher Prompt, gleiche Rechnung, nur für diese Frage.

### 3 · Klausur bewerten (Einzelseite der Frage)

1. Die Übersicht erkennt Klausur-Fragen (auch ohne Marker am Inhalt) und legt sie als
   **Rundgang** an: Nach dem Eintragen springt die Erweiterung zur nächsten Klausur-Frage
   und am Ende zurück zur Übersicht.
2. Im Reiter **Bewerten** die Angaben unter **„Für diese Bewertung"** prüfen und den
   Bewertungsprompt kopieren. Bei großen Klassen wird er in **Teile** aufgeteilt – geteilt
   wird nach Personen, nie nach Aufgaben. Teil 1 in die KI, Ergebnis einfügen, dann Teil 2
   im **selben** Chat usw.
3. Die KI fragt zuerst nach dem Modus:
   - **Gemeinsam** (empfohlen): Arbeit für Arbeit, du bestätigst oder änderst.
   - **Automatisch**: alle Arbeiten auf einmal.
4. Antwort einfügen. Gemeinsam besprochene Arbeiten lassen sich direkt eintragen.
   Automatisch bewertete musst du einmal angesehen haben, sonst warnt die Erweiterung vor
   dem Eintragen.

Nach dem Eintragen lädt die Seite neu, damit Moodles eigenes „Speichern" die neuen Werte
nicht überschreibt.

## Was er nicht tut

- Er greift nicht selbst auf eine KI zu und speichert nichts außerhalb deines Browsers.
- Er bewertet keine automatisch ausgewerteten Fragen (Cloze, Kurzantwort, Numerisch) –
  dafür gibt es den **Moodle AI Reviewer** – und keine Datei-Abgaben im Aufgabenmodul –
  dafür gibt es den **Moodle AI Aufgaben-Grader**.
- Er speichert nie ungesehen: Eintragen ist immer dein Klick.

## Einstellungen – was wo steht

- **Zur Aufgabe** (Reiter *Horizont*, Kasten „Diese Aufgabe"): Modus, Feedbacklänge, Fach,
  Jahrgang, Niveau. Sie werden mit dem Horizont in der Frage gespeichert und wandern mit
  (Zufallspool, Export). **Der Horizont regelt die Bewertung:** Eine Änderung gilt erst,
  wenn der neue Horizont eingetragen ist.
- **Zur Bewertung** (Reiter *Bewerten*, Kasten „Für diese Bewertung"): Anrede (automatisch
  ab Jahrgang 11 „Sie"), Rechtschreibung als Höchstabzug in % (je ein Wert für Sek I und
  Oberstufe), Punkteschritte.
- **Für alles** (⚙, in beiden Wegen gleich): KI-Hinweis unter dem Feedback (Wortlaut
  änderbar), Quellenangaben entfernen, kompakter Prompt für KI mit eigenen Skills.

**Rechtschreibung** wird in beiden Wegen gleich gerechnet: Die KI zählt nur Fehler (schwere
doppelt). Bei Antworten unter 40 Wörtern zählt die Fehlerzahl (1 Fehler ein Drittel des
Höchstabzugs, ab 5 alles), bei längeren der Fehlerquotient (Fehler je 100 Wörter: bis 1
nichts, bis 2 ein Drittel, bis 3,5 zwei Drittel, darüber alles).

## Installation

ZIP entpacken. Darin liegt je Browser ein Ordner:
`moodle-ai-freitext-grader-chrom/`, `moodle-ai-freitext-grader-edge/`,
`moodle-ai-freitext-grader-firefox/`. Den Ordner an einen festen Platz legen und danach
nicht mehr verschieben oder umbenennen.

Coach und Grader vorher deaktivieren, sonst erscheinen zwei Panels.

**Chrome / Edge**
1. `chrome://extensions` bzw. `edge://extensions` öffnen.
2. Schalter **Entwicklermodus** einschalten.
3. **„Entpackte Erweiterung laden"** und den Ordner `moodle-ai-freitext-grader-chrom`
   bzw. `moodle-ai-freitext-grader-edge` wählen (den, in dem `manifest.json` liegt).

**Firefox**
1. Die `.xpi`-Datei im Ordner `moodle-ai-freitext-grader-firefox` per Doppelklick öffnen
   (oder in ein offenes Firefox-Fenster ziehen).
2. Firefox fragt nach der Installationsberechtigung — mit **Hinzufügen** bestätigen.
3. Fertig. Die Erweiterung ist von Mozilla signiert und bleibt dauerhaft installiert,
   auch nach einem Firefox-Neustart.

Danach die Moodle-Seite einmal **neu laden** (F5), falls sie schon offen war.

**Update:** die neue `.xpi`-Datei genauso öffnen wie oben — Firefox ersetzt die alte
Version automatisch.

## Lizenz

© 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
