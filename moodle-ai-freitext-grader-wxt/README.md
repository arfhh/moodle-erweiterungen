# Moodle AI Freitext Grader

Version 1.3.0 · für Chrome, Firefox und Edge aus einer Codebasis · Lizenz: CC BY-SA 4.0

**📘 Handbuch:** [Handbuch-Moodle-AI-Freitext-Grader.pdf](Handbuch-Moodle-AI-Freitext-Grader.pdf) – Schritt-für-Schritt-Anleitung mit Bildern (liegt auch im Download-ZIP).

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

Das Panel ist überall gleich aufgebaut: oben die Reiter, darin die Schritte 1–3
untereinander. Jeder Reiter hat einen aufklappbaren Kasten **„So funktioniert's"**;
selten Gebrauchtes (Prompt anpassen, nur die Antworten kopieren …) steht unter
**„Für Fortgeschrittene"**. Einstellungen unter ⚙ werden mit **„Speichern und zurück"**
übernommen oder mit **„Verwerfen"** verworfen.

| Seite | Reiter |
|---|---|
| Frageneditor | **1 · Horizont** · **2 · Layout-Vorlage** · ⚙ |
| Übersicht der manuellen Bewertung (Kurztest) | **1 · Bewerten** · **2 · Horizonte** · ⚙ |
| Bewertungsseite einer Frage (Klausur, einzelner Kurztest) | **1 · Bewerten** · **2 · Horizont** · ⚙ |

### 1 · Erwartungshorizont anlegen (Frageneditor)

Im Frageneditor einer Freitextfrage öffnet sich am rechten Rand das Panel „Freitext Grader".

1. Im Reiter **1 · Horizont**, Kasten **„Diese Aufgabe"**: Art der Aufgabe (Kurztest oder
   Klausur), Feedbacklänge, Fach, Jahrgang und Niveau wählen. Die Erweiterung schlägt die
   Art aus Marker und Aufgabe vor.
2. **„📋 Horizont-Prompt kopieren"** und in die KI einfügen. Der Prompt enthält
   Aufgabentext, Punkte und – falls die Aufgabe darauf verweist – das Material (Bilder und
   Dateien werden aufgelistet; Werte daraus verlangt der Prompt mit Quelle). Die KI zeigt
   den Horizont zuerst zur Durchsicht und gibt ihn nach „ok" in einem grauen Kasten aus.
3. Inhalt des grauen Kastens einfügen und in die Aufgabe eintragen. Bei einer neuen Frage
   wird er ins offene Formular gesetzt und mit Moodles „Änderungen speichern" gespeichert.

Im Reiter **2 · Layout-Vorlage** lassen sich Aufgabenstellung und Antwortvorlage im
Kartendesign gestalten: eine Häkchenreihe (Aufgabenstellung, Antwortvorlage, Farben nach
Anforderungsbereich, Punkte je Teilaufgabe, AFB-Angabe), darunter die Vorschau, dann
**„Ins Formular einfügen"** — gespeichert wird von Hand.

Wird ein Horizont später geändert, legt Moodle eine neue Fragenfassung an. Bereits
geschriebene Versuche zeigen weiter die alte – die Erweiterung rechnet trotzdem sofort mit
dem neuen Horizont und sagt das in ihrer Meldung.

### 2 · Kurztest bewerten (Übersicht der manuellen Bewertung)

Oben im Reiter **1 · Bewerten** steht die Kurzzeile **„Für diese Bewertung"** (Anrede,
Rechtschreibabzug) mit **[ändern]**; bei Problemen erscheint dort eine Warnzeile.

1. **Antworten laden:** **„Kurztest-Aufgaben durchsuchen"**. Die Erweiterung lädt alle
   Antworten zu allen Kurztest-Fragen. Fehlt Aufgaben ein aktueller Horizont oder die
   Kurztest-Kennzeichnung, meldet das ein gemeinsamer Hinweiskasten im Ergebnis – mit
   Links zu den Aufgaben und dem Knopf **„Als Kurztest kennzeichnen"**. Klausur-Aufgaben
   werden erkannt und als Link auf ihre eigene Bewertungsseite angeboten.
2. **„📋 Bewertungsprompt kopieren"**, in die KI einfügen.
3. Antwort der KI einfügen. Die Vorschau zeigt je Antwort bisherige und neue Punkte.
   Prüfen, dann **„Alle eintragen"**.
   Darüber steht die **Punkteverteilung dieser Bewertung** als Diagramm: Höchstpunktzahl
   links, 0 Punkte rechts, Balken = Anzahl der Antworten, Linie = Normalverteilung.
   Farben: unter 35 % der Punkte rot, um 50 % gelb, ab 65 % grün (mit Übergängen). Haben die
   Aufgaben verschiedene Höchstpunktzahlen, zeigt es Prozent statt Punkte. Fällt die
   Bewertung auffällig schief aus, sieht man es vor dem Eintragen.

Der Reiter **2 · Horizonte** zeigt alle Freitextaufgaben des Tests mit Art und
Horizont-Status. Erstellt oder überarbeitet wird ein Horizont immer für eine Aufgabe –
über die Links im Frageneditor oder auf ihrer Bewertungsseite.

Eine einzelne Kurztest-Frage lässt sich auch auf ihrer eigenen Bewertungsseite bewerten –
gleicher Prompt, gleiche Rechnung, nur für diese Frage.

### 3 · Klausur bewerten (Bewertungsseite der Frage)

1. Die Übersicht erkennt Klausur-Fragen (auch ohne Marker am Inhalt) und legt sie als
   **Rundgang** an: Nach dem Eintragen springt die Erweiterung zur nächsten Klausur-Frage
   und am Ende zurück zur Übersicht.
2. Im Reiter **1 · Bewerten** die Kurzzeile **„Für diese Bewertung"** prüfen (bei Bedarf
   **[ändern]**: Anrede, Rechtschreibung, Punkteschritte) und den Bewertungsprompt kopieren.
   Bei großen Klassen wird er in **Durchgänge** aufgeteilt – geteilt wird nach Personen,
   nie nach Aufgaben. Durchgang 1 in die KI, Ergebnis einfügen, dann Durchgang 2 im
   **selben** Chat usw. Der Hinweis dazu erscheint nur, wenn wirklich geteilt wird.
3. Die KI fragt zuerst nach dem Modus:
   - **Gemeinsam durchgehen** (empfohlen): Arbeit für Arbeit, du bestätigst oder änderst.
   - **Automatisch**: alle Arbeiten auf einmal.
4. Antwort einfügen, prüfen, **„Alle eintragen"**. Automatisch bewertete Arbeiten musst du
   einmal angesehen haben, sonst warnt die Erweiterung vor dem Eintragen.

Nach dem Eintragen lädt die Seite neu, damit Moodles eigenes „Speichern" die neuen Werte
nicht überschreibt.

## Was er nicht tut

- Er greift nicht selbst auf eine KI zu und speichert nichts außerhalb deines Browsers.
- Er bewertet keine automatisch ausgewerteten Fragen (Cloze, Kurzantwort, Numerisch) –
  dafür gibt es den **Moodle AI Reviewer** – und keine Datei-Abgaben im Aufgabenmodul –
  dafür gibt es den **Moodle AI Aufgaben-Grader**.
- Er speichert nie ungesehen: Eintragen ist immer dein Klick.

## Einstellungen – was wo steht

- **Zur Aufgabe** (Frageneditor, Reiter *1 · Horizont*, Kasten „Diese Aufgabe"): Art der
  Aufgabe, Feedbacklänge, Fach, Jahrgang, Niveau. Sie werden mit dem Horizont in der Frage
  gespeichert und wandern mit (Zufallspool, Export). **Der Horizont regelt die Bewertung:**
  Eine Änderung gilt erst, wenn der neue Horizont eingetragen ist.
- **Zur Bewertung** (Reiter *1 · Bewerten*, Kurzzeile „Für diese Bewertung" → [ändern]):
  Anrede (automatisch ab Jahrgang 11 „Sie"), Rechtschreibung als Höchstabzug in % (je ein
  Wert für Sek I und Oberstufe), Punkteschritte.
- **Für alles** (⚙, in beiden Wegen gleich): KI-Hinweis unter dem Feedback (Wortlaut
  änderbar). Unter „Für Fortgeschrittene": Quellenangaben entfernen, kompakter Prompt für
  KI mit eigenen Skills, nur gekennzeichnete Aufgaben bewerten (Kurztest-Übersicht),
  alles auf Standard zurücksetzen.

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

## Versionshinweise

**1.3.0 (29.10.2026)** — Einfachere Oberfläche: gleicher Aufbau in beiden Wegen (Reiter,
Schritte 1–3, Speichern/Verwerfen), „Für diese Bewertung" als Kurzzeile mit [ändern],
je Reiter ein Kasten „So funktioniert's", Selten Gebrauchtes unter „Für Fortgeschrittene",
ein gemeinsamer Hinweiskasten im Kurztest-Ergebnis, Layout-Vorlage mit einer Häkchenreihe,
Punkteverteilung ohne innerHTML (Mozilla-Prüfung).

**1.2.0** — Punkteverteilung der Bewertung als Diagramm vor dem Eintragen.

## Lizenz

© 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
