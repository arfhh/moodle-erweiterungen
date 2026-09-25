# Moodle Namen verbergen

*Version 1.0.0 · Entwickelt von A. Spielhoff · Lizenz: CC BY-SA 4.0*

**Idee: Andreas Schenkel** — [moodle-textblock-blurmode_controller](https://github.com/andreasschenkel/moodle-textblock-blurmode_controller),
das seinerseits auf Code und Ideen von Matthias Giger und Florian Dagner beruht.
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
- E-Mail-Adressen als **reiner Text** (ohne `mailto:`-Link), etwa in der Teilnehmerliste, werden
  nicht erkannt.
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

- **1.0.0** (25.09.2026) — Erstfassung: Umschalter auf der Seite und in der Symbolleiste, Stärke,
  Profilbilder, eigene Selektoren, Zustand über `storage.sync`.
