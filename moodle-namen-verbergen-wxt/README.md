# Moodle Namen verbergen

*Version 1.0.4 · Entwickelt von A. Spielhoff · Lizenz: CC BY-SA 4.0*

**Idee: Andreas Schenkel** — [moodle-textblock-blurmode_controller](https://github.com/andreasschenkel/moodle-textblock-blurmode_controller).

> Author/Copyright des Originals: *Andreas Schenkel based on code and ideas from
> Matthias Giger ([github.com/mattgig](https://github.com/mattgig)) and
> Florian Dagner ([github.com/fdagner](https://github.com/fdagner))*.
Schenkels Lösung ist ein HTML-Textblock, den man in jeden Kurs einfügt. Diese Erweiterung
setzt denselben Gedanken als Browser-Erweiterung um.

> **Zur Herkunft:** Das Repo von Andreas Schenkel trägt (Stand 25.09.2026) keine Lizenz.
> Deshalb ist aus ihm **kein Code übernommen**. Diese Erweiterung ist eine eigene
> Neuumsetzung der Idee, mit eigenen Selektoren und eigenem Code.

## Was macht sie?

Wer Moodle auf einem Beamer oder in einer Bildschirmfreigabe zeigt, will keine Namen,
E-Mail-Adressen und Profilbilder von Schülerinnen und Schülern zeigen. Ein Klick verwischt
sie auf der ganzen Seite, ein zweiter zeigt sie wieder an.

- **Ein Knopf unten links** (Auge) schaltet um. Das **Zahnrad** daneben öffnet die Einstellungen.
- **Symbol der Erweiterung** in der Symbolleiste des Browsers schaltet ebenfalls um.
- Der Zustand wird gemerkt (`storage.sync`, sonst `storage.local`) und gilt für alle Moodle-Seiten
  und, wenn der Browser-Account synchronisiert, geräteübergreifend.
- **Einstellungen:** Stärke der Unschärfe, Profilbilder mit oder ohne, eigene CSS-Selektoren.
- Der eigene Name in der Menüleiste oben bleibt sichtbar.

## Wo wirkt sie?

Auf Seiten, deren Adresse einen typischen Moodle-Pfad enthält (`user/`, `grade/`, `mod/`, `course/`,
`enrol/`, `group/`, `report/`, `message/`, `my/`, `badges/`, `question/`, …), und **nur, wenn die
Seite wirklich Moodle ist** (body-Klasse `pagelayout-…`). Auf fremden Seiten passiert nichts.
Sie läuft in jedem Moodle, auch in einem Unterverzeichnis.

Verwischt werden: Links auf Nutzerprofile (Teilnehmerliste, Bewertungsübersicht, Testauswertung,
Foren, Aufgaben-Bewerten), `mailto:`-Links, Namensfelder (`.fullname`, `.username` …), die
Namensspalte der Teilnehmerliste und Profilbilder.

## Grenzen

- Die Selektoren sind Moodle-Standard. Ein abweichendes Theme oder Plugin kann Namen anders
  auszeichnen — die fehlende Stelle im Zahnrad-Menü unter „Weitere CSS-Selektoren" nachtragen.
- E-Mail-Adressen und Benutzernamen werden in **Tabellen mit passendem Spaltenkopf** („E-Mail",
  „Benutzername", „ID-Nummer") und in Elementen erkannt, die nur die Adresse enthalten. Steht eine
  Adresse mitten in einem Fließtext, bleibt sie sichtbar.
- Namen in **Kurstiteln, Dateinamen oder Freitexten** verwischt sie nicht.
- Sie verwischt nur, was **in deinem Browser** angezeigt wird. Moodle selbst bleibt unverändert;
  Screenshots, die du machst, sind verwischt.
- Es ist ein Blur, keine Verschlüsselung: Die Namen stehen weiter im Seitenquelltext.

## Installation

Die Erweiterung liegt entpackt in drei Browser-Ordnern vor: `moodle-namen-verbergen-chrom`,
`moodle-namen-verbergen-firefox`, `moodle-namen-verbergen-edge`. Den passenden Ordner verwenden.

**Chrome / Edge:** `chrome://extensions` bzw. `edge://extensions` öffnen → **Entwicklermodus**
einschalten → **Entpackte Erweiterung laden** → den Ordner `moodle-namen-verbergen-chrom` (bzw. `-edge`)
wählen. Beim Update: Ordner ersetzen und in der Liste **↺ neu laden**; danach offene Moodle-Seiten
einmal neu laden.

**Firefox:** `about:debugging` → *Dieser Firefox* → *Temporäres Add-on laden* → die `manifest.json`
im Ordner `moodle-namen-verbergen-firefox` wählen (gilt bis zum Neustart; dauerhaft geht nur mit
signierter `.xpi`).

## Datenschutz

Keine Telemetrie, kein Netzverkehr, kein Server. Einzige Berechtigung: `storage` (für die
Einstellung). Die Erweiterung liest keine Namen aus, sie schaltet nur eine CSS-Regel.

## Bauen

```
npm install
npm run build-all     # Chrome, Firefox, Edge nach Erweiterung/
npm run paket         # baut alles und legt dist/moodle-namen-verbergen.zip im Repo-Wurzelordner ab
```

## Änderungsgeschichte

- **1.0.4** (25.09.2026) — Die Fehlerbehebung aus 1.0.3 war durch einen Übertragungsfehler nicht im Code angekommen; jetzt tatsächlich enthalten.
- **1.0.3** (25.09.2026) — Fehlerbehebung zu 1.0.2: Bei gespeichertem „an" lief die Markierung schon vor dem Aufbau der Seite (noch ohne `<body>`), warf einen Fehler und verhinderte damit den Knopf; die Markierung prüft jetzt `<body>` und kann den Aufbau der Oberfläche nicht mehr blockieren.
- **1.0.2** (25.09.2026) — E-Mail-Adressen und Benutzernamen in Tabellen (Testauswertung „Übersicht" und „Antworten", Teilnehmerliste) werden über den Spaltenkopf erkannt und verwischt; ebenso Elemente, die nur aus einer Adresse bestehen. Neu nachgeladene Tabellen werden mit erfasst.
- **1.0.1** (25.09.2026) — Urheberhinweis vollständig: Matthias Giger und Florian Dagner mit Links ergänzt (README, Panel, Quelltext).
- **1.0.0** (25.09.2026) — Erstfassung: Umschalter auf der Seite und in der Symbolleiste, Stärke,
  Profilbilder, eigene Selektoren, Zustand über `storage.sync`.
