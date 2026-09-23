# Moodle Cloze Autofill

**Trägt neue Antwortvarianten in die Cloze-Lücken der Fragensammlung ein**, statt sie
Frage für Frage von Hand nachzupflegen.

Version 2.0.5 · für Chrome, Firefox und Edge aus einer Codebasis · Lizenz: CC BY-SA 4.0

> ⚠️ **Nur für die eigene Fragensammlung.** Die Erweiterung schreibt direkt in die
> Fragen der Sammlung, in der sie läuft. Wer eine **eigene** Sammlung pflegt, kann
> *Moodle AI Reviewer* und *Cloze Autofill* unmittelbar hintereinander benutzen.
> Wird die Sammlung im Kollegium **geteilt**, trägt dort nur eine Person ein; alle
> anderen sammeln ihre Funde mit dem Reviewer als CSV und schicken sie ihr.

---

## Für Einsteiger: Was, wo, wie?

### Was macht diese Erweiterung?

Nach einem Kurztest landen neue, bisher unbekannte Antwortvarianten in einer
Fehlersammlung — Begriffe, die inhaltlich richtig sind, aber noch nicht in den
Cloze-Lücken der Fragensammlung hinterlegt sind. Diese Erweiterung trägt solche
Begriffe direkt in die richtige Lücke der richtigen Frage ein, statt jede der oft
Dutzenden Fragen einzeln von Hand zu öffnen und zu bearbeiten.

### Wo taucht sie in Moodle auf?

Kurs öffnen → **Fragensammlung** → eine **Kategorie** anklicken (die Liste der Fragen
darin). Dort erscheint rechts ein **gelber runder Knopf**.

### Installation (Schritt für Schritt für Einsteiger)

Diese Erweiterung ist kein Programm zum Doppelklicken, sondern eine Browser-Erweiterung.
Sie kommt nicht aus einem offiziellen „Store", sondern wird als **entpackte
Erweiterung** geladen — das klingt komplizierter, als es ist.

1. Auf der GitHub-Seite die ZIP herunterladen und entpacken (Doppelklick auf die
   ZIP-Datei bzw. rechte Maustaste → „Alle extrahieren"; wer Git benutzt: Repo
   klonen). Danach liegt ein Ordner mit drei Unterordnern da — einer je Browser:
   `moodle-cloze-autofill-chrom`, `moodle-cloze-autofill-firefox`,
   `moodle-cloze-autofill-edge`.
2. Diesen Ordner an einen **festen Platz** verschieben und **nicht mehr verschieben
   oder umbenennen** — sonst muss die Erweiterung neu eingerichtet werden.

**Google Chrome**
1. Adresse `chrome://extensions` eingeben und Enter drücken.
2. Oben rechts den Schalter **Entwicklermodus** einschalten.
3. Auf **„Entpackte Erweiterung laden"** klicken und den Ordner
   `moodle-cloze-autofill-chrom` auswählen (den, in dem `manifest.json` direkt
   drinliegt).

**Microsoft Edge**
Genauso wie bei Chrome, mit `edge://extensions` und dem Ordner
`moodle-cloze-autofill-edge`.

**Firefox**
1. Die `.xpi`-Datei im Ordner `moodle-cloze-autofill-firefox` per Doppelklick öffnen (oder in ein
   offenes Firefox-Fenster ziehen).
2. Firefox fragt nach der Installationsberechtigung — mit **Hinzufügen** bestätigen.
3. Fertig. Die Erweiterung ist von Mozilla signiert und bleibt dauerhaft installiert,
   auch nach einem Firefox-Neustart.

Danach die Moodle-Seite einmal **neu laden** (F5), falls sie schon offen war.

**Update:** die neue `.xpi`-Datei genauso öffnen wie oben — Firefox ersetzt die alte
Version automatisch.

---

## Wozu

Nach jedem Kurztest landen in `Fehlersammlung.csv` die Schülerantworten, die Moodle
nicht erkannt hat — mit einer bereits festgelegten Bewertung. Bisher hieß das: 26 Fragen
einzeln öffnen, den Cloze-Text suchen, den Begriff an der richtigen Stelle einsetzen,
speichern. Diese Erweiterung macht daraus zwei Knopfdrücke.

Wichtig: Ein **Import** der überarbeiteten XML hilft hier nicht. Moodle legt beim Import
immer *neue* Fragen an und aktualisiert nie bestehende — man bekäme jede Frage doppelt in
den Zufallspool. Der einzige Weg, eine Frage wirklich zu ändern, führt über ihr
Bearbeiten-Formular. Genau das benutzt diese Erweiterung, nur eben automatisch.

---

## Wo sie erscheint

Auf der Kategorieansicht der Fragensammlung:
`…/question/edit.php?cmid=…`

Rechts erscheint ein gelber runder Knopf. Die anderen Erweiterungen arbeiten auf
anderen Seiten (Grader, Reviewer und Coach auf der Manuellen Bewertung, Notenstufen auf
der Notenstufen-Seite, Aufgaben-Grader im Aufgabenmodul), es gibt also keine
Überschneidung.

**Sie wird niemals von allein tätig.** Angefasst wird nur, was doppelt zutrifft:
in der angezeigten Kategorie *und* namentlich im eingefügten JSON. Einen Modus
„alle Fragen durchgehen" gibt es bewusst nicht.

---

## Ablauf

### 1 · Liste erzeugen (rein lesend)

Liest zu jeder Lückentext-Frage der Ansicht den Cloze-Quelltext aus dem
Bearbeiten-Formular und zerlegt ihn in seine Lücken. Daraus entsteht ein Prompt,
der je Lücke nur Typ und die bereits hinterlegten Varianten samt Prozentwerten enthält —
**kein HTML, kein Kartendesign, keine Bild-URLs.**

Der Vorteil gegenüber dem Weg über die lokale XML: Du siehst den *wirklichen* Stand in
Moodle. Ob die lokale Datei aktueller oder älter ist, spielt keine Rolle mehr.

Zwei Kopierknöpfe wie beim Reviewer:

* **Prompt + Daten** — für einen beliebigen KI-Chat
* **nur die Daten** — für einen Chat, der die Regeln schon über ein Skill kennt

Voreingestellt werden **nur die angehakten Fragen** gelesen. Nimmt man den Haken weg,
gehen alle Lückentext-Fragen der Ansicht mit.

### 2 · Cloze einfügen

JSON einfügen und auf **Prüfen** drücken. Dabei passiert dreierlei, und noch wird
nichts gespeichert:

1. **Abgleich.** Steht der Begriff schon in der Lücke, wird er übersprungen. Steht er
   dort mit einem *anderen* Prozentwert, wird das als Konflikt gemeldet und nichts
   geändert — solche Fälle entscheidest du selbst.
2. **Selbstprüfung.** Nach dem Einsetzen wird nachgerechnet: gleiche Zahl an Lücken,
   Begriff mit richtigem Prozentwert in der richtigen Lücke, alle anderen Lücken
   Byte für Byte unverändert.
3. **Moodles eigener Prüfer.** Jede geänderte Frage geht durch den Knopf
   „Fragetext entschlüsseln und prüfen". Das ist Moodles eingebaute Cloze-Syntaxprüfung
   und speichert nicht.

Erst danach erscheint der rote Knopf **Jetzt eintragen** — und nur für die Fragen, die
alle drei Stufen überstanden haben.

Nach dem Speichern wird jede Frage noch einmal frisch geladen und nachgesehen, ob die
Begriffe wirklich drinstehen. Das Protokoll sagt es Frage für Frage.

---

## JSON-Format

```json
{
  "erweiterung": "moodle-cloze-autofill",
  "eintraege": [
    {
      "frage": "1.1.1-Riechen",
      "qid": "115405757",
      "luecke": 2,
      "begriff": "fächeln",
      "prozent": 75,
      "grund": "Auslassung der Vorsilbe"
    }
  ]
}
```

* `frage` muss genau dem Fragenamen in Moodle entsprechen.
* `qid` ist freiwillig. Steht sie da, wird geprüft, ob sie zum Namen passt — sonst
  wird der Eintrag übersprungen statt geraten.
* `prozent` mit **Punkt**: `0.01`, nicht `0,01`.

Zum **Ändern** eines vorhandenen Werts dient eine zweite Liste im selben JSON:

```json
{
  "erweiterung": "moodle-cloze-autofill",
  "eintraege": [],
  "aenderungen": [
    {
      "frage": "1.1.1-Glasbruch",
      "qid": "115405789",
      "luecke": 1,
      "begriff": "Handschuhe",
      "von": 10,
      "nach": 0.01,
      "grund": "10 gibt es in der Skala nicht"
    }
  ]
}
```

`von` muss dem Wert entsprechen, der gerade in Moodle steht — sonst wird die Änderung
übersprungen.

Zum **Entfernen** einer Variante — in aller Regel eine Dublette — dient eine dritte Liste:

```json
{
  "entfernen": [
    { "frage": "1.1.4-Pipette", "qid": "115318793", "luecke": 1,
      "begriff": "Pipete", "wert": 75, "grund": "steht doppelt" }
  ]
}
```

Steht der Begriff mehrfach mit demselben Wert, fällt genau einer weg. Gesperrt sind die
mit `=` markierte Hauptantwort und die letzte 100-%-Antwort einer Lücke.

Reihenfolge im Lauf: **Änderungen → Entfernungen → Ergänzungen.**
* Begriffe, die mit `%` oder `=` beginnen, werden abgelehnt. Dafür gibt es in der
  Cloze-Syntax keine saubere Maskierung.

---

## Was die Erweiterung nicht kann

Sie legt keine Lücken an, ändert keine Fragetexte und löscht keine Fragen. Innerhalb
einer Lücke kann sie ergänzen, Werte ändern und Einträge entfernen — mehr nicht.

## Was die Erweiterung nicht anfasst

Geändert wird ausschließlich die Antwortliste innerhalb der einen benannten Lücke.
Alles andere im Fragetext bleibt Byte für Byte stehen: das AFB-Kartendesign, die
Inline-Styles, die Bilder.

Das ist kein Komfort, sondern nötig. Im Bearbeiten-Formular stehen Bilder als
`draftfile.php`-URLs, in der lokalen XML dagegen als `@@PLUGINFILE@@`. Wer den Fragetext
im Ganzen ersetzt, zerschießt die Bildbezüge.

Aus demselben Grund wird **TinyMCE nicht angefasst**. Die Erweiterung liest und schreibt
die versteckte Textarea und baut den POST selbst — der Editor bekommt nie die Gelegenheit,
das Karten-HTML zu normalisieren.

---

## Sicherheitsnetze

| Netz | Was es abfängt |
|---|---|
| Doppelter Filter (Ansicht + JSON) | dass eine nicht gemeinte Frage angefasst wird |
| Konfliktmeldung statt Überschreiben | dass ein vorhandener Prozentwert still geändert wird |
| Selbstprüfung nach dem Einsetzen | Maskierungs- und Positionsfehler |
| Moodles `analyzequestion` | kaputte Cloze-Syntax |
| Gegenprobe nach dem Speichern | dass ein Speichern still gescheitert ist |
| Moodles Fragen-Versionierung | alles andere — die alte Version bleibt erhalten |

Zufallsfragen ziehen immer die neueste Version. Laufende Tests brauchen nach einer
Änderung nichts.

---

## Stand der Erprobung

**Am 28.08.2026 erfolgreich abgeschlossen.** An `1.1.1-Abwaschen-Aufräumen` acht Begriffe
in zwei Lücken eingetragen; danach am neuen Stand nachgelesen: alle acht drin, korrekt
nach Prozentwert einsortiert, beide Bilder und das AFB-Kartendesign unverändert,
weiterhin genau zwei Lücken. Frage von v2 auf v3.

**Wichtig für jeden weiteren Lauf:** nach dem Eintragen tragen die Fragen neue IDs.
Vor einem zweiten Durchgang Seite neu laden und in Tab 1 eine frische Liste erzeugen.

Die Syntaxprüfung lässt sich nicht absichtlich zum Anschlagen bringen, indem man einen
Begriff mit `{` schickt: die Erweiterung maskiert ihn zu `\{`, und das ist gültige
Cloze-Syntax. Netz 4 bleibt insofern ungetestet; der belastbare Beweis ist die
Versionsnummer und die Gegenprobe nach dem Speichern.

## Dateien

```
moodle-cloze-autofill-wxt/
├── entrypoints/content.ts   dünnes Content Script (matches, Zeitpunkt, ruft den Kern)
├── lib/cloze-core.js        alles: Auslesen, Prompt, Einsetzen, Schreiben, Oberfläche
├── lib/style.css            gelbes Panel
├── public/icon/             icon16/32/48/128.png
├── wxt.config.ts            Manifest im Code (Name, Version, matches, Icons)
└── README.md                diese Datei
```

Gebaut wird nach `Erweiterung/moodle-cloze-autofill-{chrom,firefox,edge}/`.

## Änderungen

**WXT-Umstellung (18.09.2026):** Ab dieser Fassung wird die Erweiterung mit **WXT**
gebaut (siehe Skill `1-browser-wxt`) — eine Codebasis, drei Browser (Chrome, Firefox,
Edge), statt einem einzelnen Hand-Manifest nur für Chrome. Der fachliche Kern liegt in
`lib/cloze-core.js` und ist zeilengleich mit der bewährten `content.js` bis 2.0.4;
einzige Änderungen: `chrome.*` → `browser.*` (Polyfill), IIFE → `export function
starteClozeAutofill()`, Icon-Pfad `icons/icon128.png` → `icon/128.png` (WXT legt
`public/icon/` als `icon/` ab). Der Rundknopf (`.ca-fab`/`.ca-fab-icon`) deckte das Icon
schon vorher komplett per `object-fit: cover` — kein weißer Ring zu beheben. Neu ergänzt:
ein `action.default_title` für die Symbolleiste, den das alte Hand-Manifest nicht hatte.

Befehle: `npm run dev` (Chrome-Testlauf), `npm run build-all` (alle drei Browser),
`npm run paket` (baut, benennt um, packt zu `dist/moodle-cloze-autofill.zip`). Details in
`1-browser-wxt`.

**2.0.4 — 02.09.2026**

* Behoben: Chrome verweigerte das Laden mit „Invalid value for
  `web_accessible_resources[0]`. Invalid match pattern." In diesem Manifest-Abschnitt
  erlaubt Chrome nur Muster mit dem Pfad `/*`; der Seitenfilter des Content Scripts
  darf dort nicht stehen. Er wirkt ohnehin an der Stelle, an die er gehört.

**2.0.3 — 01.09.2026**

* Der Panel-Knopf auf der Moodle-Seite zeigt das echte Symbol statt des Puzzleteils 🧩.
  Fällt auf das Puzzleteil zurück, wenn das Bild nicht geladen werden kann.

**2.0.2 — 01.09.2026**

* **Moodle-Installationen in einem Unterverzeichnis werden unterstützt.** Das
  Bearbeiten-Formular wird jetzt relativ zur erkannten Moodle-Wurzel geladen, nicht
  mehr fest ab der Domainwurzel.
* Seitenfilter im Manifest auf `*://*/*question/edit.php*` erweitert.

**2.0.1 — 01.09.2026**

* Neues Symbol (16/32/48/128 px), einheitlich mit den übrigen Erweiterungen.
* Installationsabschnitt ergänzt, Weitergabe-Hinweis neu gefasst: entscheidend ist
  nicht die Erweiterung, sondern ob die Fragensammlung geteilt wird.
* Die Fehlersammlung heißt seit 30.08.2026 `Fehlersammlung.csv`, nicht mehr `.xlsx`.

**2.0 — 28.08.2026**

* **Dritte Liste `entfernen`.** Damit ist der Satz vollständig: ergänzen, ändern,
  entfernen. Anlass sind Dubletten — steht ein Begriff zweimal in einer Lücke, ist der
  niedrigere Eintrag wirkungslos, weil Moodle den besten Treffer nimmt. Bis 1.9 ließ
  sich das nur von Hand bereinigen.
  Absicherungen: der Eintrag wird über Begriff **und** Wert gefunden; bei mehreren
  gleichen fällt der letzte weg und der erste bleibt; die mit `=` markierte
  Hauptantwort und die letzte 100-%-Antwort einer Lücke sind gesperrt, weil eine Lücke
  ohne richtige Antwort die Frage kaputtmacht. In der Vorschau stehen Entfernungen rot
  mit `−`.
* **Knopf „Protokoll kopieren".** Das Protokoll ist der einzige Beleg dafür, was
  wirklich durchgegangen ist, und wird nach jedem Lauf gebraucht — jetzt ein Klick statt
  Markieren im schmalen Kasten. Kopf mit Version, Kategorie und Zeitpunkt inklusive.
* Der Prompt dokumentiert die neue Liste und fragt Dubletten aktiv ab.

**1.9 — 28.08.2026**

* **Der Prompt kennt jetzt die lokale XML als dritte Quelle.** Neue Regel 4: vor jeder
  eigenen Einschätzung in der lokalen Datei der Kategorie nachsehen — Arnes
  Entscheidungen stehen dort oft schon, und die lokale Datei ist häufig *voraus*, nicht
  hinterher. Abweichungen zwischen lokal und live sind zu melden, nicht stillschweigend
  aufzulösen.
* **Der Prompt dokumentiert jetzt auch die Liste `aenderungen`** samt Beispiel.
* Der Prompt bittet außerdem, mehrfach vorkommende Begriffe in einer Lücke zu melden
  (der niedrigere Eintrag ist wirkungslos).

**1.8 — 28.08.2026**

* **Die Seite lädt sich nach einem Lauf selbst neu** (8 Sekunden Bedenkzeit, mit
  Ausstieg). Das Protokoll wird vorher gesichert und danach wieder eingeblendet.
  Grund: nach einem Lauf zeigen alle Links der Seite noch auf die **alten**
  Fragen-Versionen — wer von dort eine Frage öffnet und speichert, macht die Änderung
  rückgängig.

**1.7 — 28.08.2026**

* **Vorhandene Prozentwerte lassen sich jetzt ändern**, über eine eigene Liste
  `aenderungen` im JSON. Absicherung: jede Änderung nennt den **bisherigen** Wert
  (`von`); stimmt der nicht mit Moodle überein, wird übersprungen statt überschrieben.
  In der Vorschau stehen Änderungen orange (`~`) über den grünen Ergänzungen (`+`).

**1.6 — 28.08.2026**

* „Nur die angehakten Fragen" ist jetzt **voreingestellt**. Haken weg = alle Fragen der
  Ansicht.

**1.5 — 28.08.2026**

* Panel auf **Gelb** umgestellt (vorher Violett) — zur besseren Unterscheidung von den
  anderen Erweiterungen.

**1.4 — 28.08.2026**

* **Gegenprobe nimmt jetzt die neue Fragen-Version.** Moodle legt beim Speichern eine
  neue Version mit neuer Fragen-ID an; die neue ID kommt aus dem `lastchanged`-Parameter
  der Weiterleitung, ersatzweise über den Fragenamen.
* Nach einem Lauf verschwindet der rote Knopf mit dem Hinweis, für einen weiteren
  Durchgang eine frische Liste zu erzeugen.

**1.3 — 28.08.2026**

* **Der Fragetext wird jetzt im Moment des Absendens gebaut, nicht vorher** — Moodle
  legt bei jedem Formularaufruf einen neuen Draft-Dateibereich an, der mitgeschleppte
  Text zeigte sonst auf einen alten Bereich (HTTP 404 bei Bildern).
* Ein Fehlerstatus wird nicht mehr als Erfolg durchgewunken.
* Begriffe, die zwischen Prüfen und Speichern von jemandem anders eingetragen wurden,
  werden übersprungen und protokolliert statt doppelt gesetzt.

**1.2 — 28.08.2026**

* Versionsnummer steht jetzt im Panel-Kopf, gelesen aus dem geladenen Manifest.

**1.1 — 28.08.2026**

* Protokoll sagt jetzt, was Moodle geantwortet hat (HTTP-Status, Seitentitel, Meldung,
  Ziel-URL). Kam beim Prüfen kein Formular zurück, blockiert das nicht mehr den ganzen
  Lauf.

**1.0 — 28.08.2026**

* Erste Fassung: Liste erzeugen, Cloze einfügen mit Abgleich, Selbstprüfung,
  Moodle-Syntaxprüfung und Gegenprobe. Bewusst kein Modus, der ohne Liste alle Fragen
  durchgeht.

---

*Moodle Cloze Autofill 2.0.4 — CC BY-SA 4.0 — A. Spielhoff*
