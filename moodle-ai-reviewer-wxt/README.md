# Moodle AI Reviewer

**Findet Schülerantworten, die inhaltlich richtig sind, aber von Moodle mit 0 Punkten bewertet wurden.**

Version 1.7.2 · Schwester-Erweiterung zum *Moodle AI Grader* · für Chrome, Firefox und
Edge aus einer Codebasis · Lizenz: CC BY-SA 4.0

> Der **Grader** bewertet Freitext. Der **Reviewer** sieht nach, was der Automat bei
> frei eingetippten Antworten übersehen hat — in Cloze-Lücken wie in Kurzantwort-Fragen.

---

## Für Einsteiger: Was, wo, wie?

### Was macht diese Erweiterung?

Nach einem Kurztest mit Zufallsfragen vergibt Moodle bei frei getippten Antworten
(Lückentext, Kurzantwort, Numerisch) oft 0 Punkte, obwohl die Antwort inhaltlich richtig
war — nur eben nicht wortgleich mit der hinterlegten Musterlösung. Diese Erweiterung
durchsucht den ganzen Test auf einmal, sammelt alle diese unerkannten Antworten und
legt sie fertig zum Einfügen in einen KI-Chat vor. Die berechneten neuen Punkte trägt
sie danach automatisch ein.

### Wo taucht sie in Moodle auf?

Kurs öffnen → den Test anklicken → **Ergebnisse** → **Manuelle Bewertung** → oben auf
**„Automatisch bewertete Fragen anzeigen"** klicken. Erst dann erscheint rechts der
**petrolfarbene runde Knopf** 🔎. Auf der normalen Übersicht ohne diesen Klick bleibt
die Erweiterung unsichtbar.

## Wozu?

Bei Kurztests mit Zufallsfragen tippen Schülerinnen und Schüler Rechtschreibfehler
oder eigene Formulierungen — in Cloze-Lücken genauso wie in Kurzantwort-Fragen. Moodle
kennt diese Schreibweise nicht und vergibt 0 Punkte, obwohl die Antwort inhaltlich stimmt.

Bisher hieß das: Ergebnisübersicht durchsehen, jede rote Null einzeln anklicken,
Antwort ansehen, in der Fragensammlung nachpflegen. Bei 100+ Fragen pro Test
ist das der eigentliche Zeitfresser.

Diese Erweiterung durchsucht den kompletten Test in einem Durchgang und legt
dir alle unerkannten Antworten als JSON vor — fertig zum Einfügen in die KI.

Die Erweiterung arbeitet in zwei Schritten:

**Tab 1 · Auslesen** — durchsucht den ganzen Test und legt die unerkannten Antworten
als JSON vor. Verändert nichts.

**Tab 2 · Eintragen** — trägt die von der KI berechneten neuen Gesamtpunktzahlen ein.
Das entspricht exakt dem, was passiert, wenn du den Wert selbst ins Punktefeld tippst
und auf „Änderungen speichern" klickst — nur eben für alle Fragen auf einmal.

---

## Was genau gesammelt wird

Moodle kennzeichnet jede Cloze-Lücke intern mit einer von drei Klassen:

| Klasse | Bedeutung | Wird gesammelt? |
|---|---|---|
| `correct` | 100 % — Antwort ist hinterlegt | nein |
| `partiallycorrect` | Teilpunkte — **inklusive der 0,01-%-Marker** für bereits bekannte Fehler | nein |
| `incorrect` | Kein einziger hinterlegter Begriff hat gegriffen | **ja** |

Zusätzlich werden leere Felder übersprungen (Schüler hat nichts geschrieben —
da gibt es nichts nachzupflegen).

Übrig bleibt genau das, was du bisher von Hand gesucht hast: das rote Kreuz mit
0,00 Punkten und einer tatsächlich getippten Antwort.

---

## Welche Fragetypen erfasst werden

Das Problem „inhaltlich richtig, trotzdem 0 Punkte" gibt es nur dort, wo Schülerinnen
und Schüler **frei tippen** und Moodle den Text gegen eine hinterlegte Antwortliste
vergleicht. Genau diese Fragetypen sammelt die Erweiterung ein:

| Fragetyp | Wird erfasst? | Warum |
|---|---|---|
| **Lückentext (Cloze)** — Lücken vom Typ SA, SAC, NUM | **ja** | freie Texteingabe gegen Antwortliste |
| **Kurzantwort** | **ja** (seit 1.2) | dieselbe Antwortliste, nur eine Lücke je Frage |
| **Numerisch** | **ja** (seit 1.2) | Zahl gegen Antwortliste mit Toleranz |
| Cloze-Lücken zum Anklicken (MC, MR, Dropdowns) | nein | Auswahl aus Vorgegebenem — es *kann* keine unerkannte Variante geben |
| Multiple Choice, Wahr/Falsch, Zuordnung, Drag&Drop, Reihenfolge | nein | dieselbe Begründung |
| **Freitext (Essay)** | nein | wird von Moodle gar nicht automatisch bewertet — dafür ist der *Moodle AI Grader* da |

Bei einer **Kurzantwort-Frage** ist die ganze Frage die eine Lücke. Sie trägt in den
Daten immer die Lückennummer 1, und unter `art` steht `"kurzantwort"` statt `"cloze"`.
Als Zusammenhang bekommt die KI dort den kompletten Fragetext statt eines Satzes um
die Lücke — bei einer Kurzantwort gibt es keinen umgebenden Satz. Bewertet, gerechnet
und eingetragen wird danach identisch.

Ob Moodle bei einer Kurzantwort-Frage Groß- und Kleinschreibung unterscheidet, liest
die Erweiterung mit aus (Feld *Groß-/Kleinschreibung* der Frage) und übersetzt es in
die Lückentypen `SA` bzw. `SAC` — nur so greift die 90-%-Stufe der Skala richtig.

---

## Installation (Schritt für Schritt für Einsteiger)

Diese Erweiterung ist kein Programm zum Doppelklicken, sondern eine Browser-Erweiterung.
Sie kommt nicht aus einem offiziellen „Store", sondern wird als **entpackte
Erweiterung** geladen — das klingt komplizierter, als es ist.

1. Auf der GitHub-Seite die ZIP herunterladen und entpacken (Doppelklick auf die
   ZIP-Datei bzw. rechte Maustaste → „Alle extrahieren"). Danach liegt ein Ordner mit
   drei Unterordnern da — einer je Browser: `moodle-ai-reviewer-chrom`,
   `moodle-ai-reviewer-firefox`, `moodle-ai-reviewer-edge`.
2. Diesen Ordner an einen **festen Platz** verschieben und **nicht mehr verschieben
   oder umbenennen** — sonst muss die Erweiterung neu eingerichtet werden.

**Google Chrome**
1. Adresse `chrome://extensions` eingeben und Enter drücken.
2. Oben rechts den Schalter **Entwicklermodus** einschalten.
3. Auf **„Entpackte Erweiterung laden"** klicken und den Ordner
   `moodle-ai-reviewer-chrom` auswählen (den, in dem `manifest.json` direkt drinliegt).

**Microsoft Edge**
Genauso wie bei Chrome, mit `edge://extensions` und dem Ordner `moodle-ai-reviewer-edge`.

**Firefox**
1. Die `.xpi`-Datei im Ordner `moodle-ai-reviewer-firefox` per Doppelklick öffnen (oder in ein
   offenes Firefox-Fenster ziehen).
2. Firefox fragt nach der Installationsberechtigung — mit **Hinzufügen** bestätigen.
3. Fertig. Die Erweiterung ist von Mozilla signiert und bleibt dauerhaft installiert,
   auch nach einem Firefox-Neustart.

Danach die Moodle-Seite einmal **neu laden** (F5), falls sie schon offen war.

**Update:** die neue `.xpi`-Datei genauso öffnen wie oben — Firefox ersetzt die alte
Version automatisch.

Der *Moodle AI Grader* bleibt davon unberührt und läuft parallel weiter.

### Warum sich die beiden nicht in die Quere kommen

Beide Erweiterungen liegen auf derselben Moodle-Seite (`mode=grading`). Die
Fehlerernte zeigt ihr Panel **nur dann**, wenn in der URL `includeauto=1` steht
— also wenn du in der Manuellen Bewertung auf *„Automatisch bewertete Fragen
anzeigen"* geklickt hast. Beim normalen Freitext-Bewerten bleibt sie unsichtbar.

Zusätzlich sitzt ihr Knopf (🔎, petrol) etwas tiefer als der des Graders (🪄).

---

## Bedienung

1. In Moodle: **Test → Ergebnisse → Manuelle Bewertung**
2. Auf **„Automatisch bewertete Fragen anzeigen"** klicken.
3. Rechts erscheint der Knopf 🔎 — anklicken.
4. **„Auch schwache Antworten fürs Feedback sammeln"** steht seit 1.5 vorbelegt auf
   *an* und merkt sich deine Wahl. Die **Schwelle** darunter ist ein Prozentsatz der
   erreichbaren Punkte (Standard 50 %), gilt also bei einer 1-Punkt- und einer
   2-Punkte-Frage gleichermaßen. Unter dem Feld steht, was der Wert konkret bedeutet.
   Leere Lücken werden immer mitgenommen, unabhängig von der Schwelle.
5. **„Test durchsuchen"** klicken. Die Erweiterung lädt alle Fragen des Tests im
   Hintergrund und zeigt den Fortschritt. Bei ~110 Fragen dauert das ein bis zwei Minuten.
6. Ergebnisliste prüfen, dann **„📋 Prompt + Daten kopieren"**.
7. Den Block in ChatGPT oder Claude einfügen und abschicken.

---

## Woher die KI weiß, was richtig gewesen wäre

Die Bewertungsseite von Moodle zeigt die hinterlegte Lösung nicht an. Die Erweiterung
holt sie deshalb selbst: Zu jeder betroffenen Frage ruft sie im Hintergrund das
Bearbeiten-Formular der Frage auf. Bei einer **Lückentext-Aufgabe** steht dort der
Cloze-Quelltext, aus dem je Lücke der Lückentyp und die als richtig hinterlegten
Antworten entstehen. Bei einer **Kurzantwort- oder Numerisch-Frage** gibt es keinen
Quelltext — dort liest die Erweiterung stattdessen die Antwortliste der Frage aus
(die Felder *Antwort 1*, *Antwort 2*, … mit ihren Prozentwerten).

Das ist ein reiner Lesezugriff — es wird nichts gespeichert und nichts verändert.

Voraussetzung ist, dass du in deinem Kurs Fragen bearbeiten darfst. Als Lehrkraft
im eigenen Kurs ist das normalerweise der Fall. Klappt es nicht, sagt dir die
Erweiterung Bescheid; dann gibst du die Fragen-XML zusätzlich mit in den Chat.

---

## Die beiden Kopierknöpfe

| Knopf | Wann |
|---|---|
| **📋 Prompt + Daten kopieren** | Der Normalfall. Kopiert eine vollständige Arbeitsanweisung samt Daten — Bewertungsskala, Punkteberechnung, Ausgabeformat. Funktioniert in jedem KI-Chat, ohne Vorbereitung. |
| **📋 nur JSON** | Für einen Chat, der die Auswertungsregeln schon kennt, etwa über ein eigenes Projekt oder Skill. Kopiert nur die Rohdaten. |

Unter den Knöpfen steht, wie lang der Prompt geworden ist. Bei sehr vielen Funden
kann er die Länge erreichen, die ein Chat auf einmal annimmt — dann in zwei Durchgängen
arbeiten (Feedback-Sammlung erst im zweiten).

---

## Die Bewertungsskala im Prompt

Die KI bewertet jede unerkannte Antwort nach einer festen sechsstufigen Skala:

| % | Wann |
|---|---|
| 100 | Richtig oder gleichwertiges Synonym |
| 90 | Nur Groß-/Kleinschreibung falsch — **gilt nur bei Lücken vom Typ SAC** |
| 75 | Ein einzelner klarer Tippfehler, Wort eindeutig erkennbar |
| 50 | Mehrere Tippfehler, Wort noch mit Mühe erkennbar |
| 25 | Nur Wortstamm oder Wortanfang erkennbar — **oder** ein echter Fachbegriff, der hier nicht gefragt war |
| 0 | Nur noch Rateversuche, sinnlose Eingaben und aus dem Satz abgeschriebene Wörter |

Seit 1.3 bekommt die KI je Lücke zusätzlich die **schon erfassten Falschschreibungen mit
ihrem Prozentwert** (`bekannte_varianten`) und muss jede Bewertung an einem dieser
Einträge verankern. Ohne diese Angabe erfindet jedes Sprachmodell die Skala je Lücke
neu — ein Blindvergleich zweier Modelle am 27.08.2026 stimmte nur bei 15 von 31 Funden
überein, und die Abweichungen ließen sich fast alle auf diese fehlende Verankerung
zurückführen. Die 0,01-%-Marker bleiben draußen: sie sind ein technischer Eintrag im
Cloze-Quelltext, kein Bewertungswert.

Ebenfalls seit 1.3 steht die Prüfung auf reine Groß-/Kleinschreibung als **Pflichtschritt
vor der Skala** statt als Fußnote darin. Sie wurde vorher regelmäßig übersprungen.

**Die KI vergibt nur Prozentwerte — die Punkte rechnet die Erweiterung.** Sie kennt den
bisherigen Punktestand, die Maximalpunktzahl und die Anzahl der Lücken und rechnet
`bisher + (max / Anzahl Lücken) × Prozent/100`, gerundet auf zwei Nachkommastellen und
gedeckelt auf die Maximalpunktzahl. Bereits erkannte Teilpunkte bleiben erhalten.

Das ist bewusst so aufgeteilt: Sprachmodelle beurteilen Sprache zuverlässig, rechnen
aber unzuverlässig. In einer früheren Fassung bestätigte die KI in der Tabelle 75 %
und schrieb anschließend trotzdem die volle Punktzahl ins JSON. Seit die Rechnung in
der Erweiterung liegt, kann das nicht mehr passieren.

Beim Klick auf „🔍 Prüfen" zeigt die Erweiterung die berechneten Werte einzeln an,
bevor etwas eingetragen wird.

Die KI legt dir zuerst eine **nach Fragen gruppierte Übersicht** vor: je Lücke der Satz,
in dem sie steht, darunter alle hinterlegten richtigen Antworten und dann die
Schülerantworten mit dem vorgeschlagenen Prozentwert. Erst wenn du bestätigst, gibt sie
das JSON aus — du kannst also jeden Wert vorher ändern.

Der Satz steht bewusst dabei: Ein einzelnes Wort lässt sich oft nicht beurteilen.
„Verstaut" kann in der einen Lücke genau richtig und in der anderen falsch sein. Die
Erweiterung schneidet den Satz um jede Lücke aus dem Aufgabentext heraus und legt ihn
direkt neben die Schülerantwort.

Der Prompt schärft dazu ein, dass **das Wort** zu bewerten ist und nicht die im Satz
beschriebene Handlung. Das ist bei verneinten Sätzen entscheidend: In „Chemikalienreste
werden **nicht** in die Vorratsgefäße ___" ist „zurückgegeben" die gesuchte Antwort,
obwohl der Satz sagt, dass man das gerade unterlassen soll.

Jeder Fund trägt eine **laufende Nummer**. Die KI benennt ihre Zeilen damit, und in der
Ergebnisliste der Erweiterung steht dieselbe Nummer — ein Klick darauf öffnet den
Versuch an genau der Stelle in Moodle.

Versuche, die bereits die volle Punktzahl haben, sind mit „voll" gekennzeichnet. Sie
bekommen keine Punkte mehr, werden aber trotzdem mitbewertet — die Antwort ist eine
Variante, die man beim Überarbeiten der Aufgabe brauchen kann.

---

## Einstellungen (⚙ im Panel)

**Vollständigen Aufgaben-Quelltext mitgeben** — normalerweise bekommt die KI je Lücke
nur die als richtig hinterlegten Antworten. Mit dieser Option geht zusätzlich der
komplette Quelltext jeder Aufgabe mit, also auch alle bereits erfassten Fehlervarianten
samt ihren Prozentwerten. **Das verbraucht sehr viel mehr KI-Ressourcen** — rund 2.000
Zeichen je Aufgabe. Nur einschalten, wenn du die vorhandenen Varianten wirklich brauchst,
etwa um den Aufgaben-Quelltext anschließend zu überarbeiten.

**KI-Hinweis unter dem Feedback** — der Satz, der unter jedes Feedback gesetzt wird,
solange in Tab 2 das Häkchen steht. Vorbelegt mit „Dieses Feedback wurde von der
Lehrkraft mithilfe von KI-Unterstützung erstellt und geprüft." Leeres Feld setzt beim
Speichern den Standardsatz zurück. Der jeweils gültige Satz steht seit 1.3 auch direkt
unter dem Häkchen in Tab 2 — man kreuzt nichts mehr an, ohne zu wissen, was in Moodle
landet.

**Eigener Prompt** — wer die Arbeitsanweisung anpassen will, kann sie hier überschreiben.
„Standard einfügen" holt die mitgelieferte Fassung als Ausgangspunkt. Der Platzhalter
`[MOODLE_AI_REVIEWER_DATEN]` wird durch die Daten ersetzt, `[FEEDBACK_BLOCK]` durch die
Feedback-Anweisungen. „Zurücksetzen" verwirft den eigenen Prompt wieder.

---

## Schon nachbewertete Versuche

Hast du einen Test bereits einmal durchgearbeitet und Punkte nachgetragen, sollen diese
Versuche beim nächsten Durchlauf nicht wieder auftauchen. Moodle hilft dabei nicht: Im
Zustand steht weiterhin „Richtig" oder „Teilweise richtig", ein Vermerk „Manuell" fehlt.

Die Erweiterung erkennt es deshalb rechnerisch. Eine Lücke, die Moodle als falsch
einstuft, bringt automatisch null Punkte. Liegt die Punktzahl des Versuchs über der
Summe der übrigen Lücken, kann sie nur von Hand eingetragen worden sein.

Solche Versuche werden übersprungen und in der Zusammenfassung gezählt. Sind alle Funde
davon betroffen, meldet die Erweiterung „Nichts zu tun". Mit dem Häkchen **„Auch schon
nachbewertete Versuche noch einmal vorlegen"** holst du sie zurück — etwa, wenn du eine
frühere Bewertung revidieren willst.

---

## Was im JSON steht

```json
{
  "meta": { "test": "...", "datum": "2026-08-23",
            "fragen_geprueft": 110, "funde": 42 },
  "fragen": {
    "1.1.1-Abwaschen-Aufräumen": {
      "qid": "115405757", "art": "cloze", "luecken": 2,
      "text": "... alle Geräte [[L1]] und ... an ihren [[L2]] gebracht werden."
    }
  },
  "funde": [
    { "frage": "1.1.1-Abwaschen-Aufräumen", "qubaid": "2429480", "slot": "1",
      "ist": 1, "max": 2, "markfeld": "q2429480:1_-mark",
      "luecken": [ { "nr": 1, "antwort": "müssen gesäubert werden" } ] }
  ]
}
```

- `fragen` enthält jede betroffene Frage **einmal** mit ihrem Text und markierten
  Lücken — damit die KI beurteilen kann, was an dieser Stelle gefragt war.
- `art` ist `cloze` oder `kurzantwort`. Bei `kurzantwort` gibt es genau eine Lücke
  mit der Nummer 1.
- `funde` enthält je Versuch die betroffenen Lücken.
- `ist` / `max` sind die aktuellen Punkte des Versuchs. Daraus berechnet die KI
  die neue **Gesamtpunktzahl** — wichtig bei Fragen mit mehreren Lücken, wo der
  Schüler bereits Teilpunkte hat.
- `markfeld` ist der Name des Moodle-Eingabefelds — darüber trägt Tab 2 die Punkte ein.

---

## Tab 2 · Punkte eintragen

Die KI gibt dir einen Block in dieser Form zurück:

```json
{
  "bewertungen": [
    { "frage": "1.1.4-Pistill", "qubaid": "2429453", "slot": "5",
      "luecken": [ { "nr": 1, "prozent": 75 } ] }
  ],
  "kommentare": [
    { "frage": "1.1.4-Pistill", "qubaid": "2429453", "slot": "5",
      "text": "Gesucht war das Pistill …" }
  ]
}
```

Nur Prozentwerte, keine Punktzahlen und keine Feldnamen — beides ergänzt die
Erweiterung selbst aus dem, was sie beim Auslesen gefunden hat.

Ein Block im älteren Format mit fertigen Punktwerten (`"punkte"` mit `"neu"` und
`"markfeld"`) wird weiterhin angenommen. Das ist für Abläufe gedacht, bei denen die
Auswertung an anderer Stelle passiert.

1. Block in das Textfeld einfügen, **„🔍 Prüfen"** klicken. Es erscheint, wie viele
   Bewertungen auf wie vielen Fragenseiten eingetragen werden — und darunter je
   Eintrag eine Zeile mit Frage, Schülerantwort, altem und neuem Punktwert und den
   vergebenen Prozenten. Ein Klick auf die Zeile öffnet den Versuch in Moodle.
   Einträge, bei denen alle Lücken 0 % bekommen haben, werden dabei weggelassen und
   gezählt — sie würden in Moodle nichts ändern.
2. **„Alle eintragen"**. Jeder Eintrag wird nach dem Speichern gegengeprüft; was nicht
   ankommt, steht im Protokoll. (Der frühere Trockenlauf ist seit 1.6.0 entfallen.)

Gab es keinen einzigen Fehler, meldet die Erweiterung „✓ Fertig" und schließt sich
nach drei Sekunden selbst. Gab es Fehler, bleibt sie offen — sonst verschwände genau
die Zeile, die man lesen müsste. Ein Klick ins Panel bricht das Schließen ab.

Nach jedem Speichern lädt die Erweiterung die Seite erneut und **vergleicht den
tatsächlich gespeicherten Wert** mit dem gewünschten. Im Protokoll steht je Eintrag
ein ✓ oder ein ✗ mit dem Wert, der wirklich drinsteht — es wird also nichts
„erfolgreich" gemeldet, was nicht wirklich angekommen ist. Jede Zeile ist ein Link auf
den betreffenden Versuch.

Fehlt beim Neuladen das Eingabefeld eines Versuchs — das kommt direkt nach einem
Speichervorgang gelegentlich vor —, wartet die Erweiterung kurz und lädt die Seite ein
zweites Mal. Fehlt es dann immer noch, zählt der Eintrag als **Fehler**. Bis 1.2 fiel
so ein Fall weder in die Erfolgs- noch in die Fehlerzahl und die Kopfzeile meldete
fälschlich „0 fehlgeschlagen".

### Was dabei technisch passiert

Die Erweiterung lädt die Bewertungsseite, setzt die Zielwerte in die Punktefelder
und schickt das Formular ab — dasselbe Formular, denselben Weg, den auch dein
Klick auf „Änderungen speichern" nimmt. Punkte werden im deutschen Format mit
Komma geschrieben (`1,75`), sonst nimmt Moodle den Wert nicht an.

Nicht angefasste Versuche auf derselben Seite werden mit ihren bestehenden Werten
mitgeschickt — genauso, wie es beim manuellen Speichern der Fall ist.

---

## Datenschutz

- Es werden **keine Schülernamen** ausgelesen oder kopiert. Zur Zuordnung dient
  ausschließlich die interne Moodle-Nummer des Versuchs (`qubaid`).
- Die Erweiterung sendet nichts an fremde Server. Sie liest nur Seiten deiner
  eigenen Moodle-Instanz, mit deiner bestehenden Anmeldung.
- Daten verlassen den Browser erst, wenn du selbst auf „JSON kopieren" klickst.

---

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| Knopf erscheint nicht | Steht `includeauto=1` in der Adresszeile? Sonst „Automatisch bewertete Fragen anzeigen" klicken. |
| „Keine Fragen-Tabelle gefunden" | Du bist auf einer Unterseite. Zurück zur Übersicht der Manuellen Bewertung. |
| Einzelne Fragen fehlen | Meldung unten im Panel beachten; Durchlauf einfach wiederholen. |
| Suche dauert lange | Normal bei vielen Fragen — der Fortschrittsbalken läuft weiter, Tab offen lassen. |

---

*Moodle AI Reviewer – Version 1.5.7 · Entwickelt von A. Spielhoff · CC BY-SA 4.0*

---

## Änderungen

**WXT-Umstellung (17.09.2026):** Ab dieser Fassung wird die Erweiterung mit **WXT**
gebaut (siehe Skill `1-browser-wxt`) — eine Codebasis, drei Browser (Chrome, Firefox,
Edge), statt einem einzelnen Hand-Manifest nur für Chrome. Der fachliche Kern liegt in
`lib/rev-core.js` und ist zeilengleich mit der bewährten `content.js` bis 1.5.9; einzige
Änderungen: `chrome.*` -> `browser.*` (Polyfill), IIFE -> `export function
starteReviewer()`, Icon-Pfad `icons/icon128.png` -> `icon/128.png` (WXT legt
`public/icon/` als `icon/` ab). Der Rundknopf (`.ce-fab`/`.ce-fab-icon`) deckte das Icon
schon vorher komplett per `object-fit: cover` — kein weißer Ring zu beheben, anders als
beim Aufgaben-Grader. Neu ergänzt: ein `action.default_title` für die Symbolleiste, den
das alte Hand-Manifest nicht hatte.

Befehle: `npm run dev` (Chrome-Testlauf), `npm run build-all` (alle drei Browser),
`npm run paket` (baut, benennt um, packt zu `dist/moodle-ai-reviewer.zip`). Details in
`1-browser-wxt`.

**1.5.7**

- Die Kopfzeile des Panels zeigt die Versionsnummer, direkt aus dem Manifest gelesen.
  Nach „↺ neu laden" ist damit sofort sichtbar, welche Fassung aktiv ist.

**1.5.6**

- Das Panel sitzt jetzt oben rechts (vorher 150 px tiefer), an derselben Stelle wie
  Grader und Coach. Möglich, weil sich die drei gegenseitig ausschließen: der Grader
  arbeitet auf der Einzelfrageseite, der Coach auf der Übersicht ohne `includeauto=1`,
  der Reviewer auf der Übersicht mit `includeauto=1`. Es erscheint nie mehr als eines.

**1.5.5**

- Behoben: „Fehler: Cannot read properties of undefined (reading 'nr')". Mit
  `includeauto=1` listet Moodle auch Fragen ohne Textfeld auf (Multiple-Choice,
  Wahr/Falsch, Zuordnung). Blieben sie unter der Feedback-Schwelle, landeten sie mit
  leerer Lückenliste in der Sammlung und ließen das Sortieren abstürzen. Solche Fragen
  kommen jetzt gar nicht erst in die Feedback-Liste — ohne erfasste Antwort kann die KI
  ohnehin kein Feedback schreiben. Sortierung und Panelzeile prüfen zusätzlich ab.

**1.5.4**

- Behoben: Chrome verweigerte das Laden mit „Invalid value for
  `web_accessible_resources[0]`. Invalid match pattern." In diesem Manifest-Abschnitt
  erlaubt Chrome nur Muster mit dem Pfad `/*`; der Seitenfilter des Content Scripts
  darf dort nicht stehen. Er wirkt ohnehin an der Stelle, an die er gehört.

**1.5.3**

- Der Panel-Knopf auf der Moodle-Seite zeigt das echte Symbol statt der Lupe 🔎.
  Fällt auf die Lupe zurück, wenn das Bild nicht geladen werden kann.

**1.5.2**

- **Moodle-Installationen in einem Unterverzeichnis werden unterstützt.** Die
  Erweiterung leitet die Wurzel der Moodle-Installation aus der eigenen Adresse ab,
  statt sie auf der Domainwurzel zu vermuten. Vorher schlug das Nachlesen der
  richtigen Antworten unter `https://schule.de/moodle/…` fehl.
- Der Seitenfilter im Manifest heißt jetzt `*://*/*mod/quiz/report.php*` — dieselbe
  Wirkung wie bisher, nur eben auch mit Unterverzeichnis.

**1.5.1**

- Neues Symbol (16/32/48/128 px), einheitlich mit den übrigen Erweiterungen.
- Installationsanleitung auf GitHub umgestellt; die ZIP-Weitergabe entfällt.

**1.5**

- Das Häkchen **„Auch schwache Antworten fürs Feedback sammeln" ist jetzt vorbelegt**
  und wird gespeichert. Grund: Wer es vergisst, bekommt die Kommentarfelder gar nicht
  ausgelesen und muss den ganzen Test noch einmal durchsuchen; wer es nicht braucht,
  überliest einen Abschnitt. Die Kosten sind einseitig verteilt.
- **Die Schwelle ist ein Prozentsatz der erreichbaren Punkte statt einer absoluten
  Punktzahl** (Standard 50 %). Vorher bedeutete „0,50" bei einer 1-Punkt-Frage 50 %
  und bei einer 2-Punkte-Frage 25 % — ein Schüler mit 0,75 von 2 fiel durchs Raster.
  Unter dem Feld steht, was der eingestellte Wert konkret heißt. Leere Lücken kommen
  weiterhin immer mit, unabhängig von der Schwelle.

**1.4**

- **Abdeckungsprüfung fürs Feedback:** „🔍 Prüfen" vergleicht die gelieferten Kommentare
  mit den ausgelesenen Kandidaten und zeigt namentlich, wer ohne Text geblieben ist —
  mit Link zum Versuch und einem Knopf, der eine fertige Nachforderung für den Chat in
  die Zwischenablage legt. Anlass: Ein Modell hatte mehrere Versuche derselben Frage zu
  einem Kommentar zusammengefasst, zwei Schüler wären leer ausgegangen.
- **Falsches Gerät = 0 %.** Die in 1.3 eingeführte 25-%-Stufe für „echter Fachbegriff an
  falscher Stelle" wieder zurückgenommen. Ausnahme: Steht die Verwechslung unter
  `bekannte_varianten` mit einem Wert (etwa „Kartuschenbrenner" = 50 %), gilt dieser.
- Eingabefelder stehen jetzt unter ihrer Beschriftung statt daneben.

**1.3**

- Die KI bekommt je Lücke die schon erfassten Falschschreibungen mit ihrem Prozentwert
  (`bekannte_varianten`) und muss ihre Bewertung daran verankern.
- Die Prüfung auf reine Groß-/Kleinschreibung ist ein Pflichtschritt vor der Skala.
- Die 25-%-Stufe gilt jetzt auch für einen echten Fachbegriff, der an dieser Stelle
  nicht gefragt war; 0 % bleibt Rateversuchen vorbehalten.
- „Probelauf — nur die erste Frage" ersetzt durch **„Trockenlauf — nichts speichern"**:
  prüft alle Seiten auf vorhandene Felder, ohne etwas zu schreiben.
- Fortschritt und Protokoll stehen jetzt **über** den Knöpfen, und die Ansicht springt
  beim Start dorthin. Vorher lief alles unsichtbar unterhalb des Sichtfelds ab.
- Abschlussmeldung in Klartext; ohne Fehler schließt sich das Panel nach vier Sekunden.
- Übersprungene Felder zählen als Fehler statt lautlos zu verschwinden; bei fehlendem
  Feld wird die Seite einmal neu geladen und der Eintrag wiederholt.
- Die Vorschau zeigt Frage, Schülerantwort, alten und neuen Wert und die Prozente und
  verlinkt auf den Versuch. Vorher stand dort „à 1 × %" — der Prozentwert fehlte im
  Text ganz.
- Der KI-Hinweis unter dem Feedback ist in den Einstellungen frei änderbar und steht
  zur Kontrolle unter dem Häkchen in Tab 2.
- Beim Prüfen wird gewarnt, wenn ein Feedback-Text nicht alle leeren Lücken nennt.

**1.2**

- **Kurzantwort- und Numerisch-Fragen werden mit erfasst.** Bisher fand die Erweiterung
  nur Cloze-Lücken. Das Problem ist bei einer Kurzantwort-Frage aber dasselbe: Moodle
  vergleicht den getippten Text mit einer Antwortliste, und was nicht darin steht,
  bekommt 0 Punkte. Bei diesen Fragen ist die ganze Frage die eine Lücke (Nummer 1).
- Die hinterlegten Antworten werden dafür aus der Antwortliste der Frage gelesen
  (`Antwort 1`, `Antwort 2`, … mit Prozentwerten) statt aus dem Cloze-Quelltext.
  Die Einstellung *Groß-/Kleinschreibung* der Frage wird in den Lückentyp `SA`/`SAC`
  übersetzt, damit die 90-%-Stufe der Skala greift.
- Jede Frage trägt in den Daten jetzt ein Feld `art` (`cloze` oder `kurzantwort`),
  und der Prompt erklärt der KI den Unterschied.
- **Behoben:** Multiple-Choice- und Wahr/Falsch-Fragen legen ihre Felder in Moodle
  ebenfalls auf `_answer` an — als Radiobutton. Beim Sammeln der Feedback-Kandidaten
  tauchten daraus Pseudo-Antworten mit dem Wert „0" oder „1" auf. Es werden jetzt nur
  noch echte Eingabefelder ausgewertet.
- Hinweis: Ein **eigener Prompt** unter ⚙ stammt noch aus einer älteren Fassung und
  kennt die Kurzantwort-Regeln nicht. Wer dort etwas eingetragen hat, sollte das Feld
  leeren und bei Bedarf neu vom Standard aus anpassen.

**1.1**

- Bereits von Hand nachbewertete Versuche werden erkannt und übersprungen. Die bisherige
  Erkennung suchte im Zustandstext nach „Manuell" — das Wort steht dort aber nicht, sodass
  ein zweiter Durchlauf die schon erledigte Arbeit erneut vorlegte. Jetzt entscheidet die
  Rechnung: Punktzahl höher als die Summe der nicht als falsch markierten Lücken.
- Neues Häkchen, um solche Versuche bewusst wieder mit vorzulegen.

**1.0**

- Jeder Fund hat eine laufende Nummer, die in der Übersicht der KI und in der
  Ergebnisliste dieselbe ist. Die Liste verlinkt direkt auf den Versuch in Moodle.
  Vorher ließ sich eine Zeile der Übersicht nicht auf einen Versuch zurückführen.
- Der Prompt stellt klar, dass das eingetippte Wort zu bewerten ist und nicht die im
  Satz beschriebene Handlung. Bei verneinten Sätzen hatte die KI sonst die hinterlegte
  Lösung für falsch gehalten und 0 % vergeben.
- Versuche mit bereits voller Punktzahl werden als solche gekennzeichnet, statt
  stillschweigend mitzulaufen.

**0.9**

- Zu jeder Lücke geht jetzt der Satz mit, in dem sie steht. Ohne diesen Zusammenhang
  konnte die KI ein einzelnes Wort oft nicht sinnvoll einordnen.
- Der Prompt verpflichtet ausdrücklich dazu, gegen **alle** hinterlegten richtigen
  Antworten zu prüfen. Vorher kürzte die KI die Liste mitunter auf die ersten Einträge
  und beurteilte dann gegen ihre eigene Abkürzung — dieselbe Antwort bekam so in zwei
  Durchläufen einmal 100 % und einmal 0 %.
- Die Übersicht ist nach Frage und Lücke gruppiert, mit Satz und vollständiger
  Lösungsliste als Kopfzeile.

**0.8**

- Die KI liefert nur noch Prozentwerte, die Punkteberechnung übernimmt die Erweiterung.
  Vorher rechnete das Modell selbst und schrieb dabei mitunter die volle Punktzahl,
  obwohl es in der Tabelle 75 % bestätigt hatte.
- Auch `markfeld` und `kommentarfeld` schlägt die Erweiterung selbst nach, statt sie
  aus der KI-Antwort zu übernehmen.
- „🔍 Prüfen" zeigt die berechneten Punkte einzeln an.
- Das Ergebnis des Auslesens wird gespeichert, sodass Tab 2 auch nach einem Neuladen
  der Seite noch rechnen kann.
- Tab 2 nimmt weiterhin das bisherige `punkte`-JSON mit fertigen Werten an.
- Urheberangabe berichtigt: die Erweiterung ist von A. Spielhoff.

**0.7**

- Die Erweiterung erzeugt die Arbeitsanweisung für die KI jetzt selbst. Vorher gab sie
  nur Rohdaten aus und setzte voraus, dass der Chat die Auswertungsregeln bereits kennt.
- Die hinterlegten richtigen Antworten werden aus der Fragensammlung mitgelesen, sodass
  die KI beurteilen kann, was gesucht war.
- Neue Einstellungsseite (⚙) mit dem Schalter für den vollständigen Aufgaben-Quelltext
  und einem überschreibbaren Prompt.
- Zwei Kopierknöpfe: fertiger Prompt oder nur die Rohdaten.
- Versionsangabe und Lizenz in dieser Datei berichtigt (stand noch auf 0.2 bzw. CC BY 4.0).

**0.6**

- Erster vollständiger Durchlauf: Auslesen, Punkte eintragen, Feedback schreiben,
  Gegenprüfung des gespeicherten Werts.
