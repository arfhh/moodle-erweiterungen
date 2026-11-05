# LMS Nutzer

Browser-Erweiterung (Chrome, Firefox, Edge) für das LMS Hamburg (lms.lernen.hamburg). Sie nimmt eine Liste von Personen als JSON, prüft, ob es die Personen schon gibt, und füllt für alle neuen Personen nacheinander das Formular „Nutzer/in anlegen“ aus. Das Speichern bleibt bei dir: Die Erweiterung klickt nie selbst auf „Nutzer/in erstellen“.

**Version:** 1.0.1 · **Browser:** Chrome, Firefox, Edge (Manifest V3, gebaut mit WXT) · **Stand:** 05.11.2026

## Warum es sie gibt

Die LMS-Nutzerliste unter `admin/user.php` zeigt nur Nutzer der eigenen Kennzahl (z. B. 1111). Nutzer in Schulen sind dort unsichtbar. Dadurch legt man schnell Doppelkonten an. Die Erweiterung sucht deshalb wie der Dialog „Nutzer/innen einschreiben“ in einem Kurs. Diese Suche findet alle Nutzer.

## Installation

Das Download-ZIP enthält je einen Ordner pro Browser.

**Chrome / Edge**
1. Den Ordner `lms-nutzer-chrom` (Edge: `lms-nutzer-edge`) an einen festen Ort kopieren.
2. `chrome://extensions` (Edge: `edge://extensions`) öffnen und den Entwicklermodus einschalten.
3. „Entpackte Erweiterung laden“ und den Ordner wählen.

**Firefox**
1. Im Ordner `lms-nutzer-firefox` die `.xpi`-Datei in ein Firefox-Fenster ziehen und die Installation bestätigen.

Nach jeder neuen Fassung: Ordner ersetzen bzw. neue `.xpi` installieren, die Erweiterung neu laden und danach die LMS-Seite neu laden. Im Panel-Kopf steht die geladene Version („v1.0.1“).

Die Erweiterung wird nur aktiv, wenn du im LMS als Administrator angemeldet bist (sie erkennt das am Link zur Website-Administration).

## Bedienung

1. `https://lms.lernen.hamburg/admin/search.php` öffnen. Oben rechts erscheint das blaue Icon (Männchen mit Plus im Kreis). Es gibt das Icon nur auf dieser Seite.
2. Icon anklicken, das Panel öffnet sich.
3. **Such-Kurs-ID** eintragen: die ID eines Kurses, in dem du Nutzer einschreiben darfst. Sie steht in der Adresse des Kurses (`…/course/view.php?id=`). Beim ersten Start ist das Feld leer. Die Einstellung bleibt im Browser gespeichert.
4. JSON einfügen und **Einlesen** (der Knopf ist blau, solange er der nächste Schritt ist).
5. **Alle prüfen.** Jede Person bekommt einen Status:
   - **neu**: nicht gefunden, wird angelegt.
   - **vorhanden**: Konto gefunden (gleiche E-Mail oder gleicher Name, auch bei kleinen Schreibabweichungen). Mit Profil- und Bearbeiten-Link, ID, Anmeldename, Schule.
   - **gesperrt**: Konto gefunden, aber gesperrt. Der Knopf **Entsperren** öffnet das Bearbeitungsformular mit entferntem Sperr-Haken. Speichern musst du selbst.
6. **Neue anlegen**: Das Formular öffnet sich, ausgefüllt und grün markiert. Du prüfst und klickst „Nutzer/in erstellen“. Danach öffnet die Erweiterung automatisch die nächste Person. **Warteschlange stoppen** bricht ab.
7. Am Ende öffnet sich das Panel wieder. **Bericht kopieren** liefert ein JSON mit Status, gefundenen Konten und Hinweisen je Person, zum Beispiel für die Antwortmail.

### Was im Formular ausgefüllt wird

Anmeldename, Authentifizierung „Manuelle Konten“, „Kennwort erzeugen und Nutzer/in benachrichtigen“ (das Passwort bekommt nur die Person), Vorname, Nachname, E-Mail, Schulnummer, Schulname, Schulpersona, Stadt (Voreinstellung Hamburg), Land Deutschland. In die Beschreibung kommen, wenn vorhanden: `info`, die zweite E-Mail und bei Privatschulen der Hinweis „Privatschule“.

Wird ein Anmeldename beim Speichern als vergeben gemeldet, schlägt die Erweiterung die nächste Variante vor, und du klickst erneut auf Speichern.

## JSON-Format

Ein Array, je Person ein Objekt:

```json
[
 {"vorname": "Max", "nachname": "Mustermann", "email": "max.mustermann@li.hamburg.de", "email2": "", "schulnr": "1111", "schule": "Landesinstitut", "privat": false, "persona": "Lehrer/in", "stadt": "Hamburg", "neu": true, "info": "Pädagogische Mitarbeitende, LIF 12", "bemerkung": ""}
]
```

| Feld | Bedeutung |
|---|---|
| `vorname`, `nachname` | ohne Titel und Anrede |
| `email` | dienstliche Adresse des neuen Kontos |
| `email2` | optional, zweite Adresse, kommt in die Beschreibung |
| `schulnr`, `schule` | Nummer und Name laut Schulenverzeichnis. Ist `schulnr` leer, sucht die Erweiterung die Schule über den Namen. Ohne Schule: `1111` / `Landesinstitut`. |
| `privat` | `true` bei Privatschulen (Nummer dann `1111`) |
| `persona` | `Lehrer/in`, `Schüler/in`, `Projektteam`, `Sorgeberechtigte/r`, `Pädagogisch-Therapeutisches Fachpersonal (PTF)` oder `Sonstige` |
| `stadt` | Standard `Hamburg` |
| `info` | Funktion oder Rolle, kommt in die Beschreibung |
| `bemerkung` | nur zur Anzeige im Panel und im Bericht, wird nicht ins Konto geschrieben |
| `neu` | optional, `true` = bewusst zusätzliches Konto: nur gleiche E-Mail gilt als „vorhanden“ |

Die ChatGPT-Vorlage dazu liegt in `chatgpt-prompt.md`.

## Regeln der Erweiterung

- **Anmeldename:** Nachname plus erster Buchstabe des Vornamens, klein, Umlaute aufgelöst (Clara Müller → `muellerc`). Ist er schon vergeben, kommen weitere Buchstaben des Vornamens dazu.
- **Private Schulen** haben keine Nummer und werden unter 1111 mit ihrem Schulnamen angelegt.
- **LI-Adressen:** Endet die E-Mail auf `@li.hamburg.de`, gilt die Person als zusätzliches LI-Konto (wie `"neu": true`). Ein gleichnamiges Schulkonto zählt dann nicht als „vorhanden“, nur ein Konto mit genau dieser LI-Adresse.
- **Ähnliche Treffer:** Die Prüfung erkennt auch kleine Abweichungen, etwa „Jessika“ gegen „Jessica“. Solche Treffer sind mit „ähnlich“ markiert, bitte kurz ansehen.

## Grenzen und Hinweise

- Wer im Such-Kurs bereits eingeschrieben ist, taucht in dieser Suche nicht auf. Zusätzlich läuft deshalb die Nachrichtensuche des LMS mit, sie findet aber nicht jeden.
- Die Suche liefert höchstens 100 Treffer je Anfrage. Bei häufigen Nachnamen sucht die Erweiterung auch mit vollem Namen und E-Mail.
- Die Erweiterung ändert im LMS nichts, außer dass sie Formulare ausfüllt. Gespeichert wird nur durch deinen Klick.
- **Datenschutz:** Namen und E-Mails bleiben im Browser (Sitzungsspeicher dieses Tabs) und gehen nur an das LMS selbst. Es gibt keinen externen Server und keine Weitergabe. Der Sitzungsspeicher endet mit dem Tab.
- **Schulenverzeichnis:** In der Erweiterung steckt eine Liste mit Schulnummern und Namen (aus dem Schulenverzeichnis der FHH, Stand 04.05.2026, mit privaten Schulen aus dem Schülerzahlen-PDF 2013/14). Das Verzeichnis ist laut seinem Vermerk „Nur für den Dienstgebrauch“. Bitte die Erweiterung nur innerhalb der Behörde weitergeben, nicht öffentlich.
- Firefox und Edge sind nicht gebaut.

## Aufbau (für die Weiterentwicklung)

```
lms-nutzer-wxt/
├── entrypoints/content.ts  gesamte Logik
├── schulen.json            Schulnummern und Namen
├── public/icon/            Icons
├── wxt.config.ts           Version und Manifest (Quelle der Versionsnummer)
├── package.json
├── scripts/paketieren.sh   baut alle drei Browser und dist/lms-nutzer.zip
├── chatgpt-prompt.md
└── README.md
```

Bauen: `npm install`, danach `npm run build-all` (Ergebnis in `Erweiterung/lms-nutzer-chrom`, `-firefox`, `-edge`) oder `npm run paket` für das Download-ZIP. Firefox-Fassung signieren: `npm run sign:firefox`.

## Versionen

- **1.0.1** Firefox: HTML wird ohne innerHTML eingesetzt (keine Warnungen mehr beim Signieren).
- **1.0.0** Erste öffentliche Fassung: Chrome, Firefox und Edge aus einer Codebasis (WXT), Download-ZIP im Repo. Keine voreingestellte Such-Kurs-ID mehr – sie muss einmal eingetragen werden.
- **0.5.10** Fix Abgleich „schon im Kurs“: Teilnehmer kommen jetzt über die Moodle-Schnittstelle (vorher störte ein gespeicherter Filter der Teilnehmerseite); gleiche Erkennungsregeln (Dienstkonto, abweichender Vorname) auch für Eingeschriebene; bereits zugeordnete Konten werden wiedererkannt.
- **0.5.8** Nach dem Einschreiben: roter Hinweis „Nächster Schritt“ und roter Knopf „Fehlende anlegen“ (Admin) bzw. „Fehlende als CSV“; grüner Hinweis, wenn alle im Kurs sind.
- **0.5.7** Fix: Einschreibe-Dialog wartet auf das Moodle-Suchfeld; sucht im Dialog mit der E-Mail des gefundenen Kontos (wichtig bei übernommenen Dienstkonten).
- **0.5.6** CSV der fehlenden Personen mit Schulnummer und Schule.
- **0.5.5** Knopf „Liste löschen“ in Schritt 3 beider Reiter (setzt Liste, Textfeld und Datei zurück).
- **0.5.4** Auch bei abweichendem Vornamen (z. B. zweiter Vorname) wird das Dienstkonto erkannt; zusätzliche Suche nach erstem Vornamen + Nachname und nach Nachname.
- **0.5.3** Gleicher Name, andere Mail: Dienstkonto wird automatisch genommen, wenn die Schuladresse zur Schule passt oder die Liste nur eine private Adresse hat. KI-Prompt mit Feld „schule“.
- **0.5.2** Icon unter der Kopfleiste, rechts unter dem Nutzermenü.
- **0.5.1** Neues Layout: Reiter „Kurs befüllen“ / „Nutzer anlegen“ (nur Admins), aufklappbare Erklärung, KI-Prompt-Knopf in beiden Reitern, Icon oben rechts.
- **0.5.0** Neu: Kurs befüllen auf der Teilnehmerseite (JSON/CSV, Rolle, Einschreibe-Dialog vorausfüllen, Export fehlender Personen, für Admins „Fehlende anlegen“ mit Rücksprung). Ausführliche Doku folgt nach dem Test.
- **0.4.3** Umbenannt in „LMS Nutzer“ (Ordner lms-nutzer, lms-nutzer-chrom), Grundlage für weitere Funktionen.
- **0.4.2** LI-Adresse = automatisch zusätzliches Konto.
- **0.4.1** Feld `info` für die Beschreibung des Kontos.
- **0.4.0** Feld `neu` für bewusst zusätzliche Konten.
- **0.3.2** Icon nur auf `admin/search.php`, mit Kreis.
- **0.3.1** Sperr-Erkennung korrigiert.
- **0.3.0** Suche über den Einschreibe-Dialog, ähnliche Treffer, Entsperren, Bericht.
- **0.2.0** Schmales Panel, Workflow-Hervorhebung, Stadt, Land, Beschreibung.
- **0.1.0** Erste Fassung.

## Lizenz und Urheber

© 2026 A. Spielhoff — lizenziert unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.de). Entwickelt mit Unterstützung von Claude.
