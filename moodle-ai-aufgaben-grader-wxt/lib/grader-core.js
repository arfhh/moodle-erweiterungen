// Kern des Aufgaben-Graders — aus content.js v1.4.0 uebernommen.
// Genau vier Aenderungen beim Umzug nach WXT:
//  1. chrome.* -> browser.*        (Polyfill, Chrome UND Firefox)
//  2. Skill-Verweis 1-chrome-mv3 -> 1-webext-robustheit
//  3. IIFE -> export function starteGrader()
//  4. Versionsnummer per textContent statt Einsetzung ins innerHTML
// Sonst ist die Datei zeilengleich mit der bewaehrten Fassung.
import { browser } from 'wxt/browser';

/*
 * Moodle AI Aufgaben-Grader — content.js
 * Version 1.7.0
 *
 * Erscheint im Aufgaben-Modul (mod/assign) in der Bewerten-Ansicht:
 *  - action=grading  → Übersichtstabelle: Abgaben anonymisiert als ZIP + CSV
 *                       herunterladen, Auftrags-Prompt erzeugen.
 *  - Das Zurückschreiben läuft seit v1.2.0 über Moodles eigene
 *    SCHNELLBEWERTUNG (quickgrading=1): dort stehen alle Personen mit
 *    Notenfeld und Kommentarfeld untereinander auf EINER Seite, gespeichert
 *    wird mit EINEM Knopf. Die Erweiterung füllt die Felder, Arne sieht alles
 *    auf einen Blick und speichert selbst. Der frühere Weg (jede Bewerten-
 *    Einzelseite einzeln öffnen, eintragen, "Speichern und nächste anzeigen")
 *    ist damit entfallen — er war langsam und blieb im Live-Test nach der
 *    ersten Person hängen (Arne, 10.09.2026).
 *
 * Bewusst subjekt- und lehrkraftunabhängig: die Erweiterung kennt nur
 * Moodle-Mechanik, nie Bewertungsinhalte. Siehe Begleitdatei
 * moodle-ai-aufgaben-grader.md in 3-moodle-erweiterungen.
 *
 * WICHTIG (Stand Erstbau): Die DOM-Selektoren für die Aufgaben-Bewerten-
 * Seiten sind nach dem Moodle-Standardschema gewählt, aber noch NICHT an
 * einer echten Live-Instanz geprüft (anders als die Selektoren der
 * Quiz-Erweiterungen, die mehrfach verifiziert sind). Erster Live-Test
 * zeigt, welche Fallbacks tatsächlich greifen — Protokoll im Panel und in
 * der Konsole (Filter "[ABG]") hilft dabei.
 *
 * © 2026 A. Spielhoff — CC BY-SA 4.0
 */
export function starteGrader() {
  'use strict';

  const PREFIX = '[ABG]';
  function logKonsole(...args) { console.log(PREFIX, ...args); }

  // ---------------------------------------------------------------------
  // 1 · Seiten-Erkennung (Gegenprobe, siehe 1-webext-robustheit Abschnitt 2)
  // ---------------------------------------------------------------------
  const url = new URL(location.href);
  if (!/\/mod\/assign\/view\.php/.test(url.pathname)) return;
  const action = url.searchParams.get('action');
  if (action !== 'grading') return;

  const cmid = url.searchParams.get('id'); // Kurs-Modul-ID der Aufgabe
  if (!cmid) return;

  // Landmarke, die es auf einer echten Aufgaben-Bewerten-Seite geben muss.
  // Ohne sie könnte "mod/assign/view.php" theoretisch auch von einer
  // fremden Anwendung mit ähnlichem Pfad kommen.
  function istEchteAssignSeite() {
    return !!(document.querySelector('body#page-mod-assign-view')
      || document.querySelector('[data-region="grade-panel"]')
      || document.querySelector('#mod_assign_grading_table')
      || document.querySelector('input[name="grade"]')
      || document.title.match(/Aufgabe|Assignment/i));
  }
  if (!istEchteAssignSeite()) { logKonsole('Keine erkennbare Assign-Seite, breche ab.'); return; }

  if (document.getElementById('abg-panel') || document.getElementById('abg-toggle')) return; // kein Doppel-Einbau

  // ---------------------------------------------------------------------
  // 2 · Kleine Hilfsfunktionen
  // ---------------------------------------------------------------------
  const HAT_STORAGE = (typeof chrome !== 'undefined' && !!browser.storage);

  // Wird die Erweiterung neu geladen, während ein Moodle-Tab offen ist, läuft das
  // alte Content-Script dort weiter, verliert aber die Verbindung zur Erweiterung.
  // Jeder browser.*-Aufruf wirft dann "Extension context invalidated" — eine Meldung,
  // mit der niemand etwas anfangen kann. Deshalb vorher prüfen und im Klartext
  // sagen, was zu tun ist (Arne, 11.09.2026, zweites Auftreten).
  function kontextGueltig() {
    try { return !!(chrome && browser.runtime && browser.runtime.id); }
    catch (e) { return false; }
  }
  const KONTEXT_TEXT = 'Die Erweiterung wurde neu geladen, seit diese Seite offen ist. '
    + 'Bitte die Moodle-Seite einmal neu laden (Cmd+R bzw. Strg+R) und den Schritt wiederholen.';
  function istKontextfehler(e) {
    return /Extension context invalidated|message port closed|receiving end does not exist/i
      .test(String((e && e.message) || e));
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!HAT_STORAGE || !kontextGueltig()) return resolve({});
      try { browser.storage.local.get(keys, (r) => resolve(r || {})); }
      catch (e) { resolve({}); }
    });
  }
  function storageSet(obj) {
    return new Promise((resolve) => {
      if (!HAT_STORAGE || !kontextGueltig()) return resolve();
      try { browser.storage.local.set(obj, () => resolve()); }
      catch (e) { resolve(); }
    });
  }
  function storageRemove(keys) {
    return new Promise((resolve) => {
      if (!HAT_STORAGE || !kontextGueltig()) return resolve();
      try { browser.storage.local.remove(keys, () => resolve()); }
      catch (e) { resolve(); }
    });
  }

  function qparam(href, name) {
    try { return new URL(href, location.href).searchParams.get(name); }
    catch (e) { return null; }
  }

  function version() {
    try {
      return (chrome && browser.runtime && browser.runtime.getManifest)
        ? browser.runtime.getManifest().version : '';
    } catch (e) { return ''; }
  }

  // SHA-256 über den Dateiinhalt — dient doppelt: als stabiler Namensbestandteil und
  // als Erkennung, ob sich eine Abgabe seit dem letzten Lauf geändert hat.
  async function sha256Hex(bytes) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Rückfallebene ohne WebCrypto: einfacher Prüfwert, reicht zur Unterscheidung.
      let h = 0;
      for (let i = 0; i < bytes.length; i++) h = ((h << 5) - h + bytes[i]) | 0;
      return 'x' + (h >>> 0).toString(16).padStart(8, '0');
    }
  }

  // Arbeitsblatt-Nummer am ANFANG des Dateinamens. Auf die Nummer folgt in dieser
  // Materialreihe die NIVEAUSTUFE — Ziffer plus Großbuchstabe, z. B. "1D", "3F", "4G".
  // Die gehört NICHT zur Nummer: "4.-1D-Sicherheitsbelehrung" hat die Nummer "4.",
  // "4.1-01-4G-Atomgroesse" die Nummer "4.1-01". Ohne diese Grenze frisst der
  // Nummernausdruck die Stufe mit auf (Arne, 11.09.2026).
  function blattNummer(name) {
    const s = String(name);
    const mitStufe = /^\s*([\d]+[\d.\-]*?)-\d[A-Za-z]-/.exec(s);
    if (mitStufe) return mitStufe[1].replace(/-$/, '');
    const ohne = /^\s*(\d+(?:[.\-]\d+){0,3})/.exec(s);
    return ohne ? ohne[1] : null;
  }

  function dateiNameSicher(s) {
    return String(s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  }

  function csvZelle(s) {
    s = (s === undefined || s === null) ? '' : String(s);
    if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // CSV lesen: Trennzeichen ; , UTF-8-BOM wird toleriert, einfache
  // Anführungszeichen-Behandlung (reicht für Note/Feedback ohne Formeln).
  function csvLesen(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const zeilen = [];
    let feld = '', zeile = [], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { feld += '"'; i++; } else { inQuotes = false; }
        } else feld += c;
      } else if (c === '"') { inQuotes = true; }
      else if (c === ';') { zeile.push(feld); feld = ''; }
      else if (c === '\n') { zeile.push(feld); feld = ''; zeilen.push(zeile); zeile = []; }
      else feld += c;
    }
    if (feld.length || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
    return zeilen.filter((z) => z.some((f) => f.trim() !== ''));
  }

  // ---------------------------------------------------------------------
  // 2b · Einstellungen (kursübergreifend, einmal gesetzt)
  //      Bewusst nur Rahmenangaben — WAS eine gute Antwort ist, steht in der
  //      Bewertungs-Skill der jeweiligen Lehrkraft, nie in der Erweiterung.
  // ---------------------------------------------------------------------
  // Wortlaut wie in Reviewer und Coach, damit die SuS überall denselben Satz lesen.
  // Moodle rendert HTML im Feedback-Kommentar. Ist das Feedback selbst als HTML
  // geschrieben, wird der Hinweis ebenfalls als HTML angehängt (klein und grau);
  // sonst als Klartext mit Leerzeile davor.
  const KI_HINWEIS_STANDARD =
    'Dieses Feedback wurde von der Lehrkraft mithilfe von KI-Unterstützung erstellt und geprüft.';

  // Der Massstab haengt an der AUFGABE (cmid), nicht am Kurs: In einem Kurs
  // koennen mehrere Aufgabenserien parallel laufen ("1.1 Sicherheit" und
  // "4. Atombau"), und jede hat andere Blaetter. So sieht Arne beim Oeffnen
  // der 8a immer den Massstab dieser Aufgabe — ohne etwas umzustellen.
  const MASS_KEY = 'abgMassstab_' + cmid;
  const MASS_TYP = 'moodle-ai-aufgaben-grader/massstab';

  async function massstabLaden() {
    const d = await storageGet([MASS_KEY]);
    const m = d[MASS_KEY];
    return (m && Array.isArray(m.aufgaben)) ? m : null;
  }
  async function massstabSpeichern(m) { await storageSet({ [MASS_KEY]: m }); }
  async function massstabLoeschen() { await storageRemove([MASS_KEY]); }

  // Prozente werden IMMER aus den Gewichten gerechnet, nie gespeichert.
  // Dadurch ergibt die Summe zwangslaeufig 100 — ein Normieren-Knopf
  // eruebrigt sich (Arne, 16.09.2026).
  function anteile(aufgaben) {
    const summe = aufgaben.reduce((a, x) => a + (Number(x.gewicht) || 0), 0);
    return aufgaben.map((x) => summe > 0 ? (Number(x.gewicht) || 0) * 100 / summe : 0);
  }
  function proz(n) { return n.toFixed(2).replace('.', ','); }

  // Nimmt rohen Text an: reines JSON, oder JSON in einem Codeblock, oder
  // JSON mitten in einer KI-Antwort. Sonst muesste Arne von Hand ausschneiden.
  // Hoechstgewicht einer Wahlaufgabe. Sie ist freiwillig und darf die
  // Pflichtaufgaben nicht ueberwiegen.
  const WAHL_MAX = 4;

  // gekappt: optionale Liste, die der Aufrufer mitgibt und danach auslesen
  // kann. Nichts davon haengt am Massstab selbst — sonst landete es in der
  // gespeicherten Datei.
  // Stillschweigend aendern waere schlimmer als gar nicht kappen — also sagen.
  function meldeGekappt(body, gekappt) {
    if (!gekappt || !gekappt.length) return;
    logZeile(body, `Wahlaufgaben auf Gewicht ${WAHL_MAX} gekappt: ${gekappt.join(', ')} — die Zahl in Klammern kam von der KI.`, 'ok');
  }

  function massstabLesen(text, gekappt) {
    let t = String(text || '').trim();
    if (!t) throw new Error('Das Feld ist leer.');
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let obj = null;
    try { obj = JSON.parse(t); } catch (e) {
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a < 0 || b <= a) throw new Error('Darin steckt kein JSON.');
      obj = JSON.parse(t.slice(a, b + 1));
    }
    const liste = Array.isArray(obj) ? obj : obj.aufgaben;
    if (!Array.isArray(liste) || !liste.length) throw new Error('Es fehlt die Liste "aufgaben".');
    const aufgaben = liste.map((x) => ({
      name: String(x && x.name != null ? x.name : '').trim(),
      gewicht: Number(x && x.gewicht) || 0,
      notiz: String(x && x.notiz != null ? x.notiz : '').trim(),
    })).filter((x) => x.name);
    if (!aufgaben.length) throw new Error('Keine Aufgabe hat einen Namen.');
    // Der Prompt BITTET um hoechstens 4 fuer Wahlaufgaben — die KI haelt sich
    // nicht zuverlaessig daran. Also hier erzwingen. Eine Bitte an ein
    // Sprachmodell ist keine Regel (Arne, 17.09.2026).
    aufgaben.forEach((a) => {
      if (/wahlaufgabe/i.test(a.notiz) && a.gewicht > WAHL_MAX) {
        if (gekappt) gekappt.push(`${a.name} (${a.gewicht})`);
        a.gewicht = WAHL_MAX;
      }
    });
    return { typ: MASS_TYP, version: 1, erstellt: new Date().toISOString().slice(0, 10), aufgaben };
  }

  // Gegenprobe zum Massstab: Dateinamen, die bei MEHR ALS EINER Person
  // vorkommen, sind mit grosser Sicherheit Aufgabenblaetter. Einzelstuecke
  // sind meist Sonderfaelle und bleiben draussen.
  function blaetterAusAbgaben() {
    const zaehler = new Map();
    document.querySelectorAll('a[href*="pluginfile.php"]').forEach((a) => {
      const teile = decodeURIComponent(a.href).split('/');
      let n = (teile[teile.length - 1].split('?')[0] || '').trim();
      if (!n) return;
      n = n.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[ _-]\d{1,2}$/, '').trim();
      if (n.length < 3) return;
      zaehler.set(n, (zaehler.get(n) || 0) + 1);
    });
    return [...zaehler.entries()].filter(([, c]) => c > 1).map(([n]) => n).sort();
  }

  // Der Prompt fragt nach den AUFGABENBLAETTERN, nicht nach den Abgaben:
  // Die Lehrkraft hat sie, und nur wer sie liest, kann den Anspruch
  // einschaetzen. Seitenzahlen taugen dafuer nicht (Arne, 16.09.2026).
  // Sagt der KI, wo die Ordner auf dem Rechner liegen. Ohne diese Angabe fragt
  // sie jedes Mal nach. Der Pfad ist bei jeder Lehrkraft anders, steht deshalb
  // in den Einstellungen und nicht im Code (Arne, 17.09.2026).
  function ortZeilen(z, einst) {
    const pfad = (einst && einst.ordner || '').trim();
    if (!pfad) return;
    z.push(`Arbeitsordner auf meinem Rechner: ${pfad}`);
    z.push('Darunter liegen die Unterordner Import, Output und Lösungen. Der Ort ist damit');
    z.push('bekannt — bitte nicht noch einmal danach fragen.');
    z.push('');
  }

  function massstabPromptErzeugen(einst) {
    const gefunden = blaetterAusAbgaben();
    const z = [];
    z.push('Bewertungsmassstab fuer eine Aufgabenserie erstellen.');
    z.push('');
    ortZeilen(z, einst);
    z.push('Ich gebe dir gleich die Aufgabenblaetter dieser Serie (als Datei, Text oder Liste).');
    z.push('Bitte sieh sie durch und gewichte jede Aufgabe danach, wie viel Arbeit und welcher');
    z.push('Anspruch darin steckt — NICHT nach Seitenzahl. Fuenf Seiten mit sechs Luecken sind');
    z.push('weniger als eine Seite mit einer begruendeten Auswertung.');
    z.push('');
    z.push('Vergib je Aufgabe eine Zahl von 1 bis 20. Sie ist ein RELATIVES Gewicht: doppelte');
    z.push('Zahl heisst doppelter Anteil. Die Prozentwerte rechne ich selbst aus, schreibe sie');
    z.push('also nicht hin.');
    z.push('');
    z.push('In "notiz" ein kurzer Grund. Ist eine Aufgabe eine WAHLAUFGABE, muss das Wort');
    z.push('"Wahlaufgabe" dort vorkommen — daran erkenne ich sie spaeter.');
    z.push('');
    z.push('WICHTIG: Eine Wahlaufgabe bekommt hoechstens das Gewicht 4, auch wenn sie viel');
    z.push('Arbeit macht. Sie ist freiwillig und darf die Pflichtaufgaben nicht ueberwiegen.');
    z.push('');
    z.push('Antworte mit NICHTS als diesem JSON:');
    z.push('');
    z.push('{');
    z.push('  "typ": "moodle-ai-aufgaben-grader/massstab",');
    z.push('  "version": 1,');
    z.push('  "aufgaben": [');
    z.push('    { "name": "1.1-01 Laborordnung", "gewicht": 8, "notiz": "acht Felder, Reproduktion" },');
    z.push('    { "name": "1.1-06 Versuchsprotokoll", "gewicht": 16, "notiz": "eigener Text mit Auswertung" },');
    z.push('    { "name": "1.1-08 Experiment auswerten", "gewicht": 4, "notiz": "Wahlaufgabe, freiwillig" }');
    z.push('  ]');
    z.push('}');
    if (gefunden.length) {
      z.push('');
      z.push('Zur Orientierung — diese Blattnamen kommen in den Abgaben mehrfach vor. Es fehlen');
      z.push('aber die, die noch niemand abgegeben hat:');
      gefunden.forEach((n) => z.push('  ' + n));
    }
    return z.join('\n');
  }

  // Zahl kuerzen: 10,10 -> 10,1  aber 15,15 bleibt 15,15 (Arne, 17.09.2026).
  function zahl(n) {
    // Der Punkt schuetzt die Stellen davor: "100.00" -> "100.", nicht "1".
    return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
  }

  // Eine Zeile im Feedbackfeld der CSV, strukturiert:
  //   Name|Vollstaendigkeit|Fachlichkeitsstufe|Datum|Text
  //   !Kopfzeile|Flietext                      (Hinweis zum Arbeitsstand)
  // Bewusst ohne JSON: keine geraden Anfuehrungszeichen, keine Semikolons —
  // beides vertraegt die semikolongetrennte CSV nicht.
  // Steht unter der Kopfzeile des laufenden Durchgangs, wenn dort sonst nichts
  // stuende. Sonst sieht es aus wie ein Fehler (Arne, 17.09.2026).
  const NICHTS_NEU = 'Seit dem letzten Feedback ist nichts Neues dazugekommen.';

  function feedbackLesen(roh) {
    const zeilen = String(roh || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const blaetter = []; let stand = null; const frei = [];
    let lauf = null;
    zeilen.forEach((z) => {
      if (z.startsWith('@')) { lauf = z.slice(1).trim(); return; }
      if (z.startsWith('!')) {
        const t = z.slice(1).split('|');
        stand = { kopf: (t[0] || '').trim(), text: (t[1] || '').trim() };
        return;
      }
      const t = z.split('|');
      if (t.length >= 5 && /^\d+(\.\d+)?$/.test(t[1].trim()) && /^[0-3]$/.test(t[2].trim())) {
        blaetter.push({ name: t[0].trim(), v: parseFloat(t[1]), f: parseInt(t[2], 10),
                        datum: t[3].trim(), text: t.slice(4).join('|').trim() });
      } else { frei.push(z); }
    });
    if (!lauf && blaetter.length) lauf = blaetter.map((b) => b.datum).sort().pop();
    return { blaetter, stand, frei, lauf };
  }

  // Baut aus den Rohwerten das fertige HTML. Neuestes Datum oben, innerhalb
  // eines Datums absteigend nach Bezeichnung. Der Stand-Hinweis steht direkt
  // unter der obersten Kopfzeile — dort fangen die SuS an zu lesen.
  function feedbackBauen(daten, faktoren, punkteJeBlatt) {
    if (!daten.blaetter.length) {
      const t = [];
      // Auch ohne ein einziges Blatt gehoert die Datumszeile darueber.
      if (daten.lauf) t.push(`<p><em><u>Feedback vom ${datumDeutsch(daten.lauf)}</u></em></p>`);
      if (daten.stand) t.push(`<p><strong style='color:#c00'>${daten.stand.kopf}</strong><br>${daten.stand.text}</p>`);
      else if (daten.lauf) t.push(`<p>${NICHTS_NEU}</p>`);
      frei_dazu(t, daten.frei);
      return t.join('\n');
    }
    const daten_nach = {};
    daten.blaetter.forEach((b) => { (daten_nach[b.datum] = daten_nach[b.datum] || []).push(b); });
    const datenListe = Object.keys(daten_nach).sort().reverse();
    // Das Datum des laufenden Durchgangs bekommt IMMER eine Kopfzeile — auch
    // wenn nichts Neues dazugekommen ist. Sonst stuende der Hinweis auf den
    // Arbeitsstand unter einem alten Datum (Arne, 17.09.2026).
    if (daten.lauf && datenListe[0] !== daten.lauf) datenListe.unshift(daten.lauf);
    const aus = [];
    datenListe.forEach((d, i) => {
      aus.push(`<p><em><u>Feedback vom ${datumDeutsch(d)}</u></em></p>`);
      if (i === 0 && daten.stand) {
        aus.push(`<p><strong style='color:#c00'>${daten.stand.kopf}</strong><br>${daten.stand.text}</p>`);
      } else if (!(daten_nach[d] || []).length) {
        aus.push(`<p>${NICHTS_NEU}</p>`);
      }
      // Unterstrichen wird nur, was in DIESEM Durchgang dazugekommen ist.
      const neu = (d === daten.lauf);
      (daten_nach[d] || []).sort((a, b) => b.name.localeCompare(a.name, 'de', { numeric: true }));
      (daten_nach[d] || []).forEach((b) => {
        const fak = faktoren[b.f] != null ? faktoren[b.f] : 1;
        const erg = b.v * fak;
        const pk = punkteJeBlatt[b.name];
        if (b.v <= 0) {
          aus.push(`<p><strong style='color:#c00'>${b.name} — noch nicht bearbeitet</strong><br>${b.text}</p>`);
          return;
        }
        const abzug = Math.round((1 - fak) * 100);
        const teile = [`Vollständig ${zahl(b.v)} %`];
        if (abzug > 0) teile.push(`Fachlich −${abzug} %`);
        const rechts = pk != null
          ? ` = ${zahl(pk * erg / 100)} von ${zahl(pk)} Punkten`
          : ` = ${zahl(erg)} %`;
        // Aeltere Bloecke ohne Unterstreichung: so sieht man auf einen Blick,
        // was neu ist, nicht nur am Datum (Arne, 17.09.2026).
        const titel = neu ? `<strong><u>${b.name}</u></strong>` : `<strong>${b.name}</strong>`;
        aus.push(`<p>${titel} <small style='color:#777'>(${teile.join(' · ')}${rechts})</small><br>${b.text}</p>`);
      });
    });
    frei_dazu(aus, daten.frei);
    return aus.join('\n');
  }
  function frei_dazu(liste, frei) { frei.forEach((z) => liste.push(z)); }
  function datumDeutsch(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
  }

  const EINST_KEY = 'abgEinstellungen';
  // modus: 'schnell' = Voreinstellung. Unveränderte Abgaben werden gar nicht erst
  //                     geladen. Das ist gefahrlos, weil die Sicherung NICHT im
  //                     einzelnen ZIP liegt, sondern im Output-Ordner: dort bleiben
  //                     unveränderte Dateien über alle Runden eines Themas liegen und
  //                     neue/geänderte kommen nach dem Sichten dazu (Arne, 10.09.2026 —
  //                     Moodle hat ihm schon einmal die Dateien einer Schülerin verloren).
  //         'backup'  = alles laden, alles ins ZIP. Für den ersten Lauf eines Themas,
  //                     nach einem Rechnerwechsel oder wenn der Output-Ordner fehlt.
  // Der Strenge-Regler bestimmt, wie hart ein fachlicher Mangel durchschlaegt.
  // Die KI liefert nur die Stufe (0 bis 3), gerechnet wird HIER — deshalb
  // aendert ein Zug am Regler alle Feedbacks, ohne neuen Durchlauf im Chat
  // (Arne, 17.09.2026).
  const STRENGE = {
    nur_v:  { text: 'Nur Vollständigkeit — fachliche Mängel ziehen nichts ab', f: [1, 1, 1, 1] },
    mild:   { text: 'Mild — 0 / −5 / −15 / −30 Prozent',                        f: [1, 0.95, 0.85, 0.70] },
    normal: { text: 'Normal — 0 / −10 / −25 / −50 Prozent',                     f: [1, 0.90, 0.75, 0.50] },
    streng: { text: 'Streng — 0 / −15 / −35 / −60 Prozent',                     f: [1, 0.85, 0.65, 0.40] },
    fachlich: { text: 'Fachlich entscheidet — 0 / −20 / −50 / −100 Prozent', f: [1, 0.80, 0.50, 0] },
  };
  // Reihenfolge des Reglers: von links (nachsichtig) nach rechts (streng).
  const STRENGE_FOLGE = ['nur_v', 'mild', 'normal', 'streng', 'fachlich'];

  const EINST_STANDARD = { ordner: '', skill: '', duplikate: true, loesungen: true, modus: 'schnell',
    kiHinweis: true, kiHinweisText: KI_HINWEIS_STANDARD, strenge: 'normal' };

  async function einstellungenLaden() {
    const d = await storageGet([EINST_KEY]);
    return Object.assign({}, EINST_STANDARD, d[EINST_KEY] || {});
  }
  async function einstellungenSpeichern(e) {
    await storageSet({ [EINST_KEY]: e });
  }

  // ---------------------------------------------------------------------
  // 3 · Kurs-ID ermitteln (nur noch für den ZIP-Ordnernamen als Rückfall)
  // ---------------------------------------------------------------------
  // Seit die Kürzel-IDs rein aus den Klarnamen berechnet werden (Abschnitt 4),
  // dient dieser Schlüssel nur noch als Rückfall für den Ordnernamen im ZIP,
  // falls Kurs- und Aufgabentitel nicht ermittelt werden können. Mehrere
  // Anker, vom verlaesslichsten zum schwaechsten.
  function courseKeyKandidaten() {
    const k = [];
    const dazu = (x) => { if (x && k.indexOf(x) === -1) k.push(x); };

    // 1. Die Kurs-ID in den body-Klassen setzt Moodle selbst aus dem Kontext
    //    der Seite. Sie kann nicht auf einen fremden Kurs zeigen.
    const kl = /(?:^|\s)course-(\d+)(?:\s|$)/.exec(document.body.className || '');
    if (kl) dazu('kurs' + kl[1]);

    // 2. Der Kurs-Link in der Brotkrumenleiste gehoert zur Seitenhierarchie.
    const brot = document.querySelector('.breadcrumb a[href*="course/view.php"], nav.breadcrumb a[href*="course/view.php"]');
    if (brot) { const c = qparam(brot.href, 'id'); if (c) dazu('kurs' + c); }

    // 3. Irgendein Kurs-Link — das alte Verhalten, nur noch als Rueckfalllinie.
    const egal = document.querySelector('a[href*="/course/view.php?id="]');
    if (egal) { const c = qparam(egal.href, 'id'); if (c) dazu('kurs' + c); }

    // 4. Die Aufgaben-ID aus der URL. Immer vorhanden, aber je Aufgabe anders.
    dazu('cmid' + cmid);
    return k;
  }

  function ermittleCourseKey() {
    return courseKeyKandidaten()[0];
  }

  // Lesbare Namen für den ZIP-Dateinamen (statt Kurs-/Aufgaben-ID) — derselbe
  // Kurs-Link wie in ermittleCourseKey(), plus die Aufgaben-Überschrift.
  function ermittleAnzeigeNamen() {
    const link = document.querySelector('a[href*="/course/view.php?id="]')
      || document.querySelector('nav.breadcrumb a[href*="course/view.php"]');
    const kurs = link ? link.textContent.trim() : null;
    const h1 = document.querySelector('h1');
    const aufgabe = h1 ? h1.textContent.trim() : null;
    return { kurs, aufgabe };
  }

  // ---------------------------------------------------------------------
  // 4 · Kürzel-ID — wird bei jedem Lauf frisch aus den Klarnamen berechnet,
  //     nichts wird gespeichert oder muss gesichert/eingelesen werden.
  // ---------------------------------------------------------------------
  // Das ersetzt die frühere Kürzel-Karte (Zuordnung Person → Kürzel-ID in
  // chrome.storage, je Kurs unter einem eigenen Schlüssel): deren Zusatz war
  // ein KURSWEITER, fortlaufender Zähler. Wuchs die Klasse oder wurde die
  // Karte neu vergeben, verschoben sich fast alle Nummern (z. B.
  // AR-03→AR-04, TS-17/18→TS-24/25 am 17.09.2026 — siehe durchlauf-lehren.md).
  // Eine Nummer, die rein aus dem Namen berechnet wird, bleibt dagegen
  // stabil, solange der Name sich nicht ändert — unabhängig davon, wie die
  // Klasse sonst wächst, schrumpft oder neu geladen wird (Arne, 18.09.2026).
  function initialen(name) {
    const teile = name.trim().split(/\s+/).filter(Boolean);
    if (teile.length === 0) return 'XX';
    const vorname = teile[0];
    const nachname = teile[teile.length - 1];
    return ((vorname[0] || 'X') + (nachname[0] || 'X')).toUpperCase();
  }

  // Einfacher, deterministischer 32-Bit-Hash (FNV-1a) über den normalisierten
  // Klarnamen. Nicht kryptografisch — es geht nur darum, aus demselben Namen
  // JEDES Mal dieselbe zweistellige Zahl zu machen, ohne irgendetwas zu
  // speichern.
  function namensHash(name) {
    const text = name.trim().toLowerCase().replace(/\s+/g, ' ');
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % 100;
  }

  // teilnehmer: [{userid, name}]. Rückgabe: { userid: { kuerzel, name } }.
  // Kürzel = Initialen (Vorname+Nachname) + Bindestrich + eine aus dem vollen
  // Namen gehashte zweistellige Zahl (00–99) — IMMER, auch wenn die
  // Initialen gerade eindeutig sind. Sonst würde ein später hinzukommender
  // zweiter KM dem ersten KM nachträglich einen Zusatz aufzwingen und damit
  // dessen bis dahin zusatzlose Kürzel ändern (Arne, 18.09.2026). Kollidiert
  // der Hash zweier Namen mit denselben Initialen (selten), rückt — in
  // fester alphabetischer Reihenfolge, nicht nach Download-Reihenfolge —
  // die spätere Person zur nächstfreien Zahl auf.
  function kuerzelBerechnen(teilnehmer, melden) {
    const gruppen = {};
    teilnehmer.forEach((t) => {
      const base = initialen(t.name);
      (gruppen[base] = gruppen[base] || []).push(t);
    });
    const karte = {};
    const kollisionen = [];
    Object.keys(gruppen).forEach((base) => {
      const belegt = new Set();
      gruppen[base]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .forEach((t) => {
          const natuerlich = namensHash(t.name);
          let nr = natuerlich;
          while (belegt.has(nr)) nr = (nr + 1) % 100;
          belegt.add(nr);
          karte[t.userid] = { kuerzel: base + '-' + String(nr).padStart(2, '0'), name: t.name };
          // Nur eine ECHTE Hash-Kollision ist meldenswert — zwei verschiedene
          // Namen mit denselben Initialen, deren berechnete Zahl zufällig
          // gleich war. Das ist selten genug, dass es im Log auffallen soll.
          if (nr !== natuerlich) {
            kollisionen.push(`${t.name} → ${karte[t.userid].kuerzel} (Zahl war durch ${base}-${String(natuerlich).padStart(2, '0')} schon belegt)`);
          }
        });
    });
    if (melden && kollisionen.length) {
      melden(`Seltene Hash-Kollision aufgelöst: ${kollisionen.join(' · ')}`, 'ok');
    }
    return karte;
  }

  // ---------------------------------------------------------------------
  // 5 · Minimaler ZIP-Bau (nur "gespeichert", keine Kompression nötig für
  //     PDFs — spart eine Zusatzbibliothek im Repo)
  // ---------------------------------------------------------------------
  const CRC_TABELLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function u16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
  function u32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]; }
  function dosZeit() {
    const d = new Date();
    const zeit = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const datum = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { zeit, datum };
  }

  // dateien: [{ name: 'MB-03/arbeit.pdf', data: Uint8Array }]
  function zipBauen(dateien) {
    const { zeit, datum } = dosZeit();
    const teile = [];
    const zentral = [];
    let offset = 0;
    const enc = new TextEncoder();

    dateien.forEach((f) => {
      const nameBytes = enc.encode(f.name.replace(/\\/g, '/'));
      const data = f.data;
      const crc = crc32(data);

      const lokalHeader = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, // Local file header signature
        20, 0,                   // Version needed
        0, 0,                    // Flags
        0, 0,                    // Methode 0 = gespeichert (keine Kompression)
        ...u16(zeit), ...u16(datum),
        ...u32(crc),
        ...u32(data.length), ...u32(data.length), // komprimiert = unkomprimiert
        ...u16(nameBytes.length), ...u16(0),
      ]);
      teile.push(lokalHeader, nameBytes, data);

      const zentralHeader = new Uint8Array([
        0x50, 0x4b, 0x01, 0x02,
        20, 0, 20, 0,
        0, 0,
        0, 0,
        ...u16(zeit), ...u16(datum),
        ...u32(crc),
        ...u32(data.length), ...u32(data.length),
        ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0),
        ...u32(0),
        ...u32(offset),
      ]);
      zentral.push(zentralHeader, nameBytes);
      offset += lokalHeader.length + nameBytes.length + data.length;
    });

    const zentralStart = offset;
    let zentralGroesse = 0;
    zentral.forEach((t) => { zentralGroesse += t.length; });

    const eocd = new Uint8Array([
      0x50, 0x4b, 0x05, 0x06,
      0, 0, 0, 0,
      ...u16(dateien.length), ...u16(dateien.length),
      ...u32(zentralGroesse),
      ...u32(zentralStart),
      0, 0,
    ]);

    return new Blob([...teile, ...zentral, eocd], { type: 'application/zip' });
  }

  function download(blob, dateiname) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // ---------------------------------------------------------------------
  // 6 · Panel-Grundgerüst
  // ---------------------------------------------------------------------
  function panelBauen() {
    const wrap = document.createElement('div');
    wrap.id = 'abg-panel';
    wrap.innerHTML = `
      <div class="abg-head">
        <div class="abg-titelblock">
          <span><strong>Moodle AI Aufgaben-Grader</strong> <span class="abg-version"></span></span>
          <span class="abg-untertitel">PDF-Abgaben anonym bewerten</span>
        </div>
        <span class="abg-close" title="Schließen">✕</span>
      </div>
      <div class="abg-body"></div>
    `;
    wrap.querySelector('.abg-version').textContent = 'v' + version();
    document.body.appendChild(wrap);

    // Eingeklappt bleibt nur ein rundes Icon stehen — Text wäre auf der ohnehin
    // vollen Bewerten-Seite unnötig breit (Arne, 10.09.2026). icon/ ist in
    // web_accessible_resources eingetragen, sonst lädt das Bild auf der Moodle-Seite
    // nicht; ohne browser.runtime bleibt ein Buchstabe als Rückfallebene.
    // Korrigiert 17.09.2026: der Pfad hiess "icons/icon32.png" (alte Hand-MV3-
    // Struktur), WXT legt die Icons aber unter public/icon/ als "icon/32.png" ab —
    // das Bild ist deshalb seit dem WXT-Umzug nie geladen, nur der leere weisse
    // Kreis war zu sehen.
    const toggle = document.createElement('button');
    toggle.id = 'abg-toggle';
    toggle.title = 'Moodle AI Aufgaben-Grader öffnen';
    toggle.setAttribute('aria-label', 'Moodle AI Aufgaben-Grader öffnen');
    let iconUrl = '';
    try { iconUrl = browser.runtime.getURL('icon/32.png'); } catch (e) { iconUrl = ''; }
    if (iconUrl) {
      const bild = document.createElement('img');
      bild.src = iconUrl;
      bild.alt = '';
      toggle.appendChild(bild);
    } else {
      toggle.textContent = 'A';
    }
    toggle.hidden = true;
    document.body.appendChild(toggle);

    wrap.querySelector('.abg-close').addEventListener('click', () => {
      wrap.hidden = true; toggle.hidden = false;
    });
    toggle.addEventListener('click', () => { wrap.hidden = false; toggle.hidden = true; });

    return wrap.querySelector('.abg-body');
  }

  function logZeile(body, text, art) {
    let log = body.querySelector('.abg-log');
    if (!log) {
      log = document.createElement('div');
      log.className = 'abg-log';
      body.appendChild(log);
    }
    const z = document.createElement('div');
    if (art) z.className = 'abg-' + art;
    const zeit = new Date().toLocaleTimeString('de-DE');
    z.textContent = `[${zeit}] ${text}`;
    log.appendChild(z);
    log.scrollTop = log.scrollHeight;
    logKonsole(text);
  }

  // =======================================================================
  // Übersichtstabelle (action=grading) — der einzige Ort, an dem die Erweiterung wirkt
  // =======================================================================
  let weiterUhr = null;
  let weiterNachGlobal = null;
  async function modusUebersicht(body) {
    const courseKey = ermittleCourseKey();

    // Zwei Reiter statt nummerierter Schritte — Familienkonvention wie bei
    // MAG/Reviewer/Coach (.abg-reiter/.abg-tab/.abg-inhalt, Funktion zeige()).
    const reiter = document.createElement('div');
    reiter.className = 'abg-reiter';
    reiter.innerHTML = `
      <button class="abg-tab" data-tab="massstab">1 · Maßstab</button>
      <button class="abg-tab abg-aktiv" data-tab="download">2 · Download</button>
      <button class="abg-tab" data-tab="einfuegen">3 · Eintragen</button>
      <button class="abg-tab" data-tab="einstellungen" title="Einstellungen">⚙</button>
    `;
    body.appendChild(reiter);

    const panelDownload = document.createElement('div');
    panelDownload.className = 'abg-inhalt';
    panelDownload.dataset.panel = 'download';
    panelDownload.innerHTML = `
      <label for="abg-art">Feedback-Stufe</label>
      <select id="abg-art">
        <option value="zwischen">Zwischenfeedback (ohne Note)</option>
        <option value="abschluss">Abschlussfeedback (mit Note)</option>
      </select>
      <button id="abg-download">ZIP (Abgaben + CSV) erzeugen</button>
      <div class="abg-hinweis">Baut das ZIP selbst aus der Tabelle — kein Umweg über Moodles eigenen Bulk-Export. Nur Kürzel-IDs in Dateinamen, Klarnamen bleiben in Moodle. Liest immer alle Seiten der Übersichtstabelle, unabhängig von der eingestellten Seitengröße.</div>
    `;
    body.appendChild(panelDownload);

    const panelEinfuegen = document.createElement('div');
    panelEinfuegen.className = 'abg-inhalt';
    panelEinfuegen.dataset.panel = 'einfuegen';
    panelEinfuegen.hidden = true;
    const hatSchnellbewertung = !!document.querySelector('textarea[name^="quickgrade_comments_"]');
    // Zwei ganz getrennte, UNBEDINGTE Elemente mit je einer reinen Literal-
    // innerHTML-Zuweisung statt eines Ternary in EINER Zuweisung: ein if/else um eine
    // einzelne .innerHTML-Zuweisung baut der Minifizierer beim Bauen wieder zu einem
    // Ternary zusammen (kuerzer), und genau das loest AMOs "Unsafe assignment to
    // innerHTML"-Pruefung wieder aus. Die Auswahl passiert deshalb erst bei appendChild
    // — das ist kein von der Pruefung beobachteter HTML-Sink.
    const einfuegenAn = document.createElement('div');
    einfuegenAn.innerHTML = `
      <label for="abg-csv">Ausgefüllte CSV (Kürzel-ID;Note;Feedback)</label>
      <input type="file" id="abg-csv" accept=".csv,text/csv">
      <label for="abg-strenge">Gewichtung der Fachlichkeit</label>
      <input type="range" id="abg-strenge" class="abg-regler" min="0" max="4" step="1">
      <div class="abg-hinweis" id="abg-strenge-text"></div>
      <button id="abg-start" disabled>In die Tabelle eintragen</button>
      <div class="abg-hinweis">Trägt Note und Feedback in die Schnellbewertungs-Tabelle dieser Seite ein. Gespeichert wird nichts — du prüfst die Einträge und drückst danach selbst Moodles Knopf „Speichern".</div>
    `;
    const einfuegenAus = document.createElement('div');
    einfuegenAus.innerHTML = `
      <div class="abg-hinweis abg-schritt">Die <strong>Schnellbewertung</strong> ist auf dieser Seite nicht eingeschaltet. Nur mit ihr stehen Noten- und Kommentarfeld aller Personen untereinander auf einer Seite — darüber trägt die Erweiterung ein.</div>
      <button id="abg-schnell-an">Schnellbewertung einschalten</button>
      <div class="abg-hinweis">Lädt die Seite mit Schnellbewertung und allen Personen neu. Danach hier weitermachen.</div>
    `;
    const einfuegenQuelle = hatSchnellbewertung ? einfuegenAn : einfuegenAus;
    while (einfuegenQuelle.firstChild) panelEinfuegen.appendChild(einfuegenQuelle.firstChild);
    body.appendChild(panelEinfuegen);


    // Reiter 3: Einstellungen — was in JEDEN Auftrags-Prompt übernommen wird.
    const einst = await einstellungenLaden();

    // Regler setzen und bei jeder Bewegung sofort sichern. Beim naechsten
    // Eintragen rechnet die Erweiterung damit — ohne neuen Lauf der KI.
    const regler = panelEinfuegen.querySelector('#abg-strenge');
    if (regler) {
      const reglerText = panelEinfuegen.querySelector('#abg-strenge-text');
      const reglerZeigen = () => {
        const k = STRENGE_FOLGE[Number(regler.value)] || 'normal';
        reglerText.textContent = STRENGE[k].text;
      };
      const i = STRENGE_FOLGE.indexOf(einst.strenge);
      regler.value = String(i >= 0 ? i : STRENGE_FOLGE.indexOf('normal'));
      reglerZeigen();
      regler.addEventListener('input', reglerZeigen);
      regler.addEventListener('change', async () => {
        einst.strenge = STRENGE_FOLGE[Number(regler.value)] || 'normal';
        await einstellungenSpeichern(einst);
        logZeile(body, `Gewichtung gesetzt: ${STRENGE[einst.strenge].text}. Wirkt beim nächsten Eintragen.`, 'ok');
      });
    }
    // ---------------------------------------------------------------
    // Reiter "Maßstab" — wie stark jede Aufgabe in die Note eingeht.
    // Erzeugt wird er von der KI aus den Aufgabenblättern (die hat die
    // Lehrkraft ja), korrigiert wird er hier von Hand. Gespeichert je
    // Aufgabe, damit er über Monate stehen bleibt.
    // ---------------------------------------------------------------
    const panelMassstab = document.createElement('div');
    panelMassstab.className = 'abg-inhalt';
    panelMassstab.dataset.panel = 'massstab';
    panelMassstab.hidden = true;
    panelMassstab.innerHTML = `
      <div class="abg-hinweis abg-schritt" id="abg-m-stand"></div>
      <button class="abg-sekundaer" id="abg-m-prompt">Prompt erzeugen und kopieren</button>
      <textarea id="abg-m-prompt-text" rows="4" readonly placeholder="Hier steht nach dem Klick der Prompt — er liegt dann schon in der Zwischenablage."></textarea>
      <div class="abg-hinweis">Der Prompt fragt die KI nach allen Aufgaben dieser Serie und lässt sie gewichten. Die Antwort unten einfügen.</div>
      <label for="abg-m-text">Antwort der KI einfügen (oder fertigen Maßstab)</label>
      <textarea id="abg-m-text" rows="4" placeholder='{"aufgaben":[{"name":"...","gewicht":10,"notiz":"..."}]}'></textarea>
      <button id="abg-m-lesen" hidden>Einlesen</button>
      <input type="file" id="abg-m-datei" accept=".json,application/json">
      <div class="abg-hinweis">Eine gespeicherte Maßstab-Datei lässt sich hier direkt laden — dann muss die KI nichts neu erstellen.</div>
      <div id="abg-m-tabelle"></div>
    `;
    body.appendChild(panelMassstab);

    let massstab = await massstabLaden();

    function massstabZeichnen() {
      const stand = panelMassstab.querySelector('#abg-m-stand');
      const ziel = panelMassstab.querySelector('#abg-m-tabelle');
      if (!massstab) {
        stand.textContent = 'Für diese Aufgabe ist noch kein Maßstab gespeichert. Ohne ihn gibt es Prozentwerte je Aufgabe, aber keine Note.';
        ziel.textContent = '';
        return;
      }
      stand.textContent = `Maßstab für diese Aufgabe — ${massstab.aufgaben.length} Aufgaben, gespeichert am ${massstab.erstellt}.`;
      // Die Prozentspalte und die Summe haengen am Gewicht und muessen sich
      // beim Tippen mitbewegen. Frueher wurde dafuer die ganze Tabelle neu
      // gebaut — dabei verschwand das Eingabefeld unter dem Cursor und nach
      // der "1" landete die "0" im Nichts (Arne, 17.09.2026).
      const prozZellen = [];
      let fussSumme = null;
      const werteAktualisieren = () => {
        const neu = anteile(massstab.aufgaben);
        prozZellen.forEach((td, k) => { td.textContent = proz(neu[k]) + ' %'; });
        if (fussSumme) {
          const su = massstab.aufgaben.reduce((x, y) => x + (Number(y.gewicht) || 0), 0);
          fussSumme.textContent = String(Math.round(su * 10) / 10);
        }
      };

      const pr = anteile(massstab.aufgaben);
      const tab = document.createElement('table');
      tab.className = 'abg-mtab';
      const kopf = document.createElement('tr');
      ['Aufgabe', 'Gewicht', 'Anteil', 'Notiz', ''].forEach((t) => {
        const th = document.createElement('th'); th.textContent = t; kopf.appendChild(th);
      });
      tab.appendChild(kopf);
      massstab.aufgaben.forEach((a, i) => {
        const tr = document.createElement('tr');
        const zelle = (kind) => { const td = document.createElement('td'); td.appendChild(kind); tr.appendChild(td); return td; };
        const nam = document.createElement('input'); nam.type = 'text'; nam.value = a.name;
        nam.addEventListener('input', () => { a.name = nam.value; });
        zelle(nam);
        const gew = document.createElement('input'); gew.type = 'number'; gew.min = '0'; gew.step = '0.1';
        gew.value = String(a.gewicht); gew.className = 'abg-mgew';
        gew.addEventListener('input', () => { a.gewicht = Number(gew.value) || 0; werteAktualisieren(); });
        zelle(gew);
        const p = document.createElement('td'); p.className = 'abg-mproz'; p.textContent = proz(pr[i]) + ' %';
        prozZellen.push(p);
        tr.appendChild(p);
        const no = document.createElement('input'); no.type = 'text'; no.value = a.notiz || '';
        no.addEventListener('input', () => { a.notiz = no.value; });
        zelle(no);
        const weg = document.createElement('button'); weg.textContent = '×'; weg.className = 'abg-mweg'; weg.title = 'Zeile entfernen';
        weg.addEventListener('click', () => { massstab.aufgaben.splice(i, 1); massstabZeichnen(); });
        zelle(weg);
        tab.appendChild(tr);
      });
      const fuss = document.createElement('tr'); fuss.className = 'abg-mfuss';
      const summe = massstab.aufgaben.reduce((x, y) => x + (Number(y.gewicht) || 0), 0);
      [`Summe (${massstab.aufgaben.length})`, String(Math.round(summe * 10) / 10), '100,00 %', '', ''].forEach((t, k) => {
        const td = document.createElement('td'); td.textContent = t; fuss.appendChild(td);
        if (k === 1) fussSumme = td;
      });
      tab.appendChild(fuss);
      ziel.textContent = '';
      ziel.appendChild(tab);

      const leiste = document.createElement('div'); leiste.className = 'abg-mleiste';
      const knopf = (text, klasse, tun) => {
        const b = document.createElement('button'); b.textContent = text;
        if (klasse) b.className = klasse; b.addEventListener('click', tun); leiste.appendChild(b); return b;
      };
      knopf('Zeile hinzufügen', 'abg-sekundaer', () => {
        massstab.aufgaben.push({ name: '', gewicht: 10, notiz: '' }); massstabZeichnen();
      });
      knopf('Speichern', '', async () => {
        massstab.aufgaben = massstab.aufgaben.filter((a) => a.name.trim());
        await massstabSpeichern(massstab);
        logZeile(body, `Maßstab gespeichert (${massstab.aufgaben.length} Aufgaben). Er bleibt für diese Aufgabe stehen.`, 'ok');
        massstabZeichnen();
        // Nach dem Speichern ist der naechste Schritt der Download — also dorthin
        // springen, statt den Reiter von Hand suchen zu lassen (Arne, 17.09.2026).
        zeige('download');
      });
      knopf('Exportieren', 'abg-sekundaer', () => {
        const txt = JSON.stringify(massstab, null, 2);
        download(new Blob([txt], { type: 'application/json' }), 'massstab.json');
      });
      knopf('Löschen', 'abg-sekundaer', async () => {
        await massstabLoeschen(); massstab = null;
        logZeile(body, 'Maßstab gelöscht. Für andere Aufgaben kannst du jetzt einen neuen einlesen.', 'ok');
        massstabZeichnen();
      });
      ziel.appendChild(leiste);

      // Gegenprobe: Welche Blätter tauchen in den Abgaben auf, die der
      // Maßstab nicht kennt? Entweder fehlt eine Zeile, oder die KI hat
      // sich eine Aufgabe ausgedacht. Beides will man vorher wissen.
      const ausAbgaben = blaetterAusAbgaben();
      if (ausAbgaben.length) {
        const bekannt = massstab.aufgaben.map((a) => a.name.toLowerCase());
        const fehlt = ausAbgaben.filter((n) => !bekannt.some((b) => b.includes(n.toLowerCase()) || n.toLowerCase().includes(b)));
        const pruef = document.createElement('div');
        pruef.className = 'abg-hinweis';
        pruef.textContent = fehlt.length
          ? `Gegenprobe: In den Abgaben tauchen ${fehlt.length} Blätter auf, die der Maßstab nicht kennt — ${fehlt.slice(0, 4).join(', ')}${fehlt.length > 4 ? ' …' : ''}`
          : `Gegenprobe: Alle ${ausAbgaben.length} in den Abgaben gefundenen Blätter stehen im Maßstab.`;
        ziel.appendChild(pruef);
      }
    }

    panelMassstab.querySelector('#abg-m-prompt').addEventListener('click', (ev) => {
      const knopf = ev.currentTarget;
      const feld = panelMassstab.querySelector('#abg-m-prompt-text');
      feld.value = massstabPromptErzeugen(einst);
      const quittieren = (wort) => {
        const alt = 'Prompt erzeugen und kopieren';
        knopf.textContent = wort;
        setTimeout(() => { knopf.textContent = alt; }, 1500);
      };
      navigator.clipboard.writeText(feld.value)
        .then(() => weiterNach(knopf, 'Prompt erzeugen und kopieren', () => {
          const antwort = panelMassstab.querySelector('#abg-m-text');
          antwort.focus(); antwort.scrollIntoView({ block: 'nearest' });
        }))
        .catch(() => {
          // Ohne Zwischenablage-Recht bleibt der Text markiert stehen.
          feld.focus(); feld.select();
          quittieren('Markiert — bitte selbst kopieren');
        });
    });
    panelMassstab.querySelector('#abg-m-lesen').addEventListener('click', () => {
      try {
        const gekappt = [];
        massstab = massstabLesen(panelMassstab.querySelector('#abg-m-text').value, gekappt);
        panelMassstab.querySelector('#abg-m-text').value = '';
        logZeile(body, `Maßstab eingelesen: ${massstab.aufgaben.length} Aufgaben. Prüfen und dann speichern.`, 'ok');
        meldeGekappt(body, gekappt);
        massstabZeichnen();
      } catch (e) { logZeile(body, 'Einlesen nicht möglich: ' + e.message, 'fehler'); }
    });
    panelMassstab.querySelector('#abg-m-datei').addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const leser = new FileReader();
      leser.onload = () => {
        try {
          const gekappt = [];
          massstab = massstabLesen(leser.result, gekappt);
          logZeile(body, `Maßstab aus Datei geladen: ${massstab.aufgaben.length} Aufgaben.`, 'ok');
          meldeGekappt(body, gekappt);
          massstabZeichnen();
        } catch (e) { logZeile(body, 'Datei nicht lesbar: ' + e.message, 'fehler'); }
      };
      leser.readAsText(f);
    });
    massstabZeichnen();

    const panelEinstellungen = document.createElement('div');
    panelEinstellungen.className = 'abg-inhalt';
    panelEinstellungen.dataset.panel = 'einstellungen';
    panelEinstellungen.hidden = true;
    panelEinstellungen.innerHTML = `
      <label for="abg-ordner">Arbeitsordner auf deinem Rechner (optional)</label>
      <input type="text" id="abg-ordner" placeholder="z. B. Moodle/Aufgaben">
      <div class="abg-hinweis">Steht hier ein Pfad, schreiben ihn beide Prompts mit hinein — dann fragt die KI nicht mehr, wo die Ordner liegen. Leer lassen ist in Ordnung.</div>
      <label for="abg-skill">Bewertungs-Skill / Regelwerk (Name)</label>
      <input type="text" id="abg-skill" placeholder="z. B. 3-chemie-arbeitshefte">
      <div class="abg-hinweis">Die beiden Haken schalten nichts in der Erweiterung ein — sie bestimmen nur, welche Arbeitsschritte im erzeugten Prompt stehen, also was die KI tun soll.</div>
      <label class="abg-check"><input type="checkbox" id="abg-dupl"> Die KI soll auf abgeschriebene Abgaben prüfen</label>
      <label class="abg-check"><input type="checkbox" id="abg-loes"> Die KI soll vorhandene Lösungen als Maßstab nehmen</label>
      <label for="abg-modus">Umfang des Downloads</label>
      <select id="abg-modus">
        <option value="schnell">Schnell — nur neue und geänderte Abgaben laden</option>
        <option value="backup">Vollständig — alle Abgaben laden (erster Lauf, neuer Rechner)</option>
      </select>
      <label class="abg-check"><input type="checkbox" id="abg-ki"> KI-Hinweis unter jedes Feedback setzen</label>
      <label for="abg-ki-text">Wortlaut des KI-Hinweises</label>
      <textarea id="abg-ki-text" rows="2"></textarea>
      <div class="abg-hinweis">Wird beim Eintragen angehängt, nicht von der KI geschrieben. Leeres Feld stellt den Standardsatz wieder her. Ist das Feedback als HTML geschrieben, wird der Hinweis klein und grau angehängt, sonst als Klartext.</div>
      <label>Kürzel-IDs</label>
      <div class="abg-hinweis">Werden automatisch aus den Klarnamen gebildet: Vorname- und Nachname-Initiale plus eine aus dem vollen Namen berechnete Zahl (z. B. „KM-42“) — immer, auch wenn die Initialen gerade eindeutig sind. So ändert sich das Kürzel nicht mehr nachträglich, wenn später ein zweiter KM in die Klasse kommt. Rein aus dem Namen berechnet — es gibt nichts zu sichern oder einzulesen.</div>
      <button class="abg-sekundaer" id="abg-reset">Stand dieser Aufgabe zurücksetzen</button>
      <div class="abg-hinweis">Zurücksetzen vergisst, was beim letzten Lauf schon geladen war — der nächste Durchlauf holt dann wieder alles. Nötig, wenn der Output-Ordner verloren gegangen ist.</div>
      <button class="abg-sekundaer" id="abg-einst-speichern">Einstellungen speichern</button>
      <div class="abg-hinweis">Diese Angaben landen im Auftrags-Prompt. Die Erweiterung selbst bewertet nichts — sie sagt der KI nur, nach welchem Regelwerk sie arbeiten soll.</div>
    `;
    body.appendChild(panelEinstellungen);
    panelEinstellungen.querySelector('#abg-skill').value = einst.skill || '';
    panelEinstellungen.querySelector('#abg-dupl').checked = !!einst.duplikate;
    panelEinstellungen.querySelector('#abg-loes').checked = !!einst.loesungen;
    panelEinstellungen.querySelector('#abg-ordner').value = einst.ordner || '';
    panelEinstellungen.querySelector('#abg-modus').value = einst.modus === 'backup' ? 'backup' : 'schnell';
    panelEinstellungen.querySelector('#abg-ki').checked = einst.kiHinweis !== false;
    panelEinstellungen.querySelector('#abg-ki-text').value = einst.kiHinweisText || KI_HINWEIS_STANDARD;
    panelEinstellungen.querySelector('#abg-reset').addEventListener('click', async () => {
      await storageRemove(['abgStand_' + cmid]);
      logZeile(body, 'Stand zurückgesetzt — der nächste Download holt wieder alle Abgaben.', 'ok');
    });

    panelEinstellungen.querySelector('#abg-einst-speichern').addEventListener('click', async () => {
      einst.ordner = panelEinstellungen.querySelector('#abg-ordner').value.trim();
      einst.skill = panelEinstellungen.querySelector('#abg-skill').value.trim();
      einst.duplikate = panelEinstellungen.querySelector('#abg-dupl').checked;
      einst.loesungen = panelEinstellungen.querySelector('#abg-loes').checked;
      einst.modus = panelEinstellungen.querySelector('#abg-modus').value;
      einst.kiHinweis = panelEinstellungen.querySelector('#abg-ki').checked;
      einst.kiHinweisText = panelEinstellungen.querySelector('#abg-ki-text').value.trim() || KI_HINWEIS_STANDARD;
      await einstellungenSpeichern(einst);
      logZeile(body, 'Einstellungen gespeichert.', 'ok');
    });

    // Einheitlicher Ablauf aller Erweiterungen (24.09.2026): Kopieren quittiert,
    // zaehlt 3 s herunter und fuehrt dann zum naechsten Schritt. Ein Reiterklick
    // bricht ab.
    function weiterNach(knopf, urText, danach) {
      clearInterval(weiterUhr);
      let rest = 3;
      knopf.textContent = `✓ Kopiert — weiter in ${rest} s`;
      weiterUhr = setInterval(() => {
        rest--;
        if (rest > 0) { knopf.textContent = `✓ Kopiert — weiter in ${rest} s`; return; }
        clearInterval(weiterUhr); weiterUhr = null;
        knopf.textContent = urText;
        danach();
      }, 1000);
    }
    weiterNachGlobal = (knopf, urText) => weiterNach(knopf, urText, () => zeige('einfuegen'));

    function zeige(name) {
      body.querySelectorAll('.abg-inhalt').forEach((n) => { n.hidden = n.dataset.panel !== name; });
      body.querySelectorAll('.abg-tab').forEach((t) => t.classList.toggle('abg-aktiv', t.dataset.tab === name));
    }
    reiter.querySelectorAll('.abg-tab').forEach((t) => t.addEventListener('click', () => {
      if (weiterUhr) { clearInterval(weiterUhr); weiterUhr = null; }
      zeige(t.dataset.tab);
    }));

    // Eingefuegt wird fast immer die fertige KI-Antwort: gleich einlesen.
    panelMassstab.querySelector('#abg-m-text').addEventListener('paste', () =>
      setTimeout(() => panelMassstab.querySelector('#abg-m-lesen').click(), 0));
    // Ohne sichtbaren Einlesen-Knopf (wie Reviewer 1.7.2): eingelesen wird beim
    // Einfügen sofort und nach Handänderungen nach einer kurzen Tipp-Pause.
    let lesenUhr = null;
    panelMassstab.querySelector('#abg-m-text').addEventListener('input', (ev) => {
      if (ev.inputType === 'insertFromPaste') return;
      clearTimeout(lesenUhr);
      lesenUhr = setTimeout(() => {
        if (ev.target.value.trim()) panelMassstab.querySelector('#abg-m-lesen').click();
      }, 800);
    });

    panelDownload.querySelector('#abg-download').addEventListener('click', () => {
      if (!kontextGueltig()) { logZeile(body, KONTEXT_TEXT, 'fehler'); return; }
      herunterladen(body, courseKey, panelDownload.querySelector('#abg-art').value, einst)
        .catch((e) => logZeile(body, istKontextfehler(e) ? KONTEXT_TEXT : 'Fehler beim Herunterladen: ' + e.message, 'fehler'));
    });

    if (!hatSchnellbewertung) {
      panelEinfuegen.querySelector('#abg-schnell-an').addEventListener('click', () => {
        const u = new URL(location.href);
        u.searchParams.set('action', 'grading');
        u.searchParams.set('quickgrading', '1');
        u.searchParams.set('perpage', '-1');
        location.href = u.toString();
      });
    } else {
      let ausgewaehlteCsv = null;
      panelEinfuegen.querySelector('#abg-csv').addEventListener('change', (ev) => {
        ausgewaehlteCsv = ev.target.files[0] || null;
        panelEinfuegen.querySelector('#abg-start').disabled = !ausgewaehlteCsv;
      });
      panelEinfuegen.querySelector('#abg-start').addEventListener('click', async () => {
        if (!ausgewaehlteCsv) { logZeile(body, 'Bitte zuerst eine CSV-Datei wählen.', 'fehler'); return; }
        if (!kontextGueltig()) { logZeile(body, KONTEXT_TEXT, 'fehler'); return; }
        try {
          await inSchnellbewertungEintragen(body, ausgewaehlteCsv);
        } catch (e) {
          logZeile(body, istKontextfehler(e) ? KONTEXT_TEXT : 'Fehler beim Einlesen der CSV: ' + e.message, 'fehler');
        }
      });
    }
  }

  // ---- Tabelle auslesen ------------------------------------------------
  const KOPFVARIANTEN = {
    name: ['Vollständiger Name', 'Vorname / Nachname', 'Vorname', 'Name', 'Full name'],
    status: ['Status'],
    abgabe: ['Dateiabgabe', 'Datei-Einreichungen', 'Online-Text', 'Abgabe', 'Submission'],
  };

  // Spaltenköpfe, die trotz passendem Stichwort NIE die gesuchte Spalte sein können —
  // "Abgabe" als Variante trifft sonst auch auf "Zuletzt geändert (Abgabe)" (Datum) und
  // "Abgabekommentare", die beide vor der eigentlichen Dateiabgabe-Spalte stehen können.
  const KOPF_AUSSCHLUSS = ['geändert', 'kommentar'];

  function findeSpaltenTabelle(root) {
    root = root || document;
    // ID variiert je Moodle-Version/Theme: "submissions" ist der aktuelle Standard
    // (live geprüft 10.09.2026), "mod_assign_grading_table" eine ältere/andere Fassung.
    let tabelle = root.querySelector('#submissions')
      || root.querySelector('#mod_assign_grading_table');
    if (!tabelle) {
      // Fallback: irgendeine Tabelle, deren Kopfzeile einen Namens-Spaltentitel trägt.
      tabelle = Array.from(root.querySelectorAll('table')).find((t) => {
        const kopf = t.querySelector('thead');
        return kopf && /Vollständiger Name|Full name|Vorname/i.test(kopf.textContent);
      });
    }
    return tabelle;
  }

  function spaltenIndex(tabelle) {
    // :scope verhindert, dass Kopfzellen verschachtelter Tabellen (z. B. die
    // Datei-Baumansicht in der Dateiabgabe-Spalte) mitgezählt werden.
    const kopfZellen = Array.from(tabelle.querySelectorAll(':scope > thead th, :scope > thead td'));
    const idx = {};
    Object.keys(KOPFVARIANTEN).forEach((schluessel) => {
      const varianten = KOPFVARIANTEN[schluessel];
      const i = kopfZellen.findIndex((z) => {
        const txt = z.textContent.trim().toLowerCase();
        if (KOPF_AUSSCHLUSS.some((a) => txt.includes(a))) return false;
        return varianten.some((v) => txt.includes(v.toLowerCase()));
      });
      if (i >= 0) idx[schluessel] = i;
    });
    return idx;
  }

  const STATUS_ABGEGEBEN = ['abgegeben', 'submitted'];
  const STATUS_AUSSCHLUSS = ['keine abgabe', 'no submission'];

  function tabelleAuslesen(root) {
    const tabelle = findeSpaltenTabelle(root);
    if (!tabelle) throw new Error('Bewertungstabelle nicht gefunden (Selektor prüfen).');
    const idx = spaltenIndex(tabelle);
    if (idx.name === undefined) throw new Error('Spalte "Vollständiger Name" nicht gefunden.');

    // :scope beschränkt auf die direkten Zeilen/Zellen der Einreichungstabelle — manche
    // Abgabespalten enthalten eine verschachtelte Datei-Baumansicht (eigene <table>,
    // <tbody>, <tr>, <td>), die sonst als zusätzliche Zeilen/Spalten mitgezählt würde.
    const zeilen = Array.from(tabelle.querySelectorAll(':scope > tbody > tr'));
    const ergebnis = [];
    zeilen.forEach((tr) => {
      const zellen = tr.querySelectorAll(':scope > td');
      if (!zellen.length) return;
      const nameZelle = zellen[idx.name];
      if (!nameZelle) return;
      const nameLink = nameZelle.querySelector('a[href*="user/view.php"]') || nameZelle.querySelector('a');
      const name = (nameLink ? nameLink.textContent : nameZelle.textContent).trim();
      if (!name) return;

      // userid: bevorzugt aus einem "Bewerten"-Link mit action=grader, sonst aus dem Namenslink.
      const bewertenLink = tr.querySelector('a[href*="action=grader"]');
      let userid = bewertenLink ? qparam(bewertenLink.href, 'userid') : null;
      if (!userid && nameLink) userid = qparam(nameLink.href, 'id');
      if (!userid) return;

      const statusText = idx.status !== undefined ? (zellen[idx.status] || {}).textContent || '' : '';
      const statusKlein = statusText.trim().toLowerCase();
      // Personen ohne jede Abgabe werden NICHT verworfen, sondern mitgeführt: sonst
      // stehen sie in keiner CSV und können auch keine Rückmeldung bekommen, obwohl
      // gerade sie eine brauchen (Arne, 11.09.2026).
      const ohneAbgabe = idx.status !== undefined
        && STATUS_AUSSCHLUSS.some((x) => statusKlein.includes(x));

      const dateien = [];
      const abgabeZelle = idx.abgabe !== undefined ? zellen[idx.abgabe] : tr;
      if (abgabeZelle) {
        abgabeZelle.querySelectorAll('a[href*="pluginfile.php"]').forEach((a) => {
          const teile = decodeURIComponent(a.href).split('/');
          const dateiname = teile[teile.length - 1].split('?')[0] || 'abgabe.pdf';
          dateien.push({ url: a.href, dateiname, zeit: dateiZeit(a) });
        });
      }

      ergebnis.push({ userid, name, statusText: statusText.trim(), ohneAbgabe, dateien, grUrl: bewertenLink ? bewertenLink.href : null });
    });
    return ergebnis;
  }

  // Moodle schreibt neben jeden Abgabe-Link den Hochladezeitpunkt dieser einen Datei
  // (div.fileuploadsubmissiontime). Damit lässt sich VOR dem Herunterladen erkennen,
  // ob eine Datei seit dem letzten Lauf unverändert ist — live geprüft 10.09.2026.
  function dateiZeit(a) {
    let el = a;
    for (let i = 0; i < 5 && el; i++) {
      const z = el.querySelector && el.querySelector('.fileuploadsubmissiontime');
      if (z && z.textContent.trim()) return z.textContent.trim().replace(/\s+/g, ' ');
      el = el.parentElement;
    }
    return '';
  }

  // Die Übersichtstabelle ist standardmäßig seitenweise (10/20/50/100 oder "Alle" =
  // perpage -1) — für ZIP/CSV müssen IMMER alle Teilnehmenden erfasst werden, egal
  // welche Seitengröße gerade eingestellt ist. Deshalb wird die aktuelle Seite zusätzlich
  // einmal mit perpage=-1 nachgeladen, statt sich auf die sichtbar gerenderte Tabelle zu
  // verlassen (live geprüft 10.09.2026: Standardeinstellung zeigte nur 7 von mehr Abgaben).
  async function vollstaendigesDokumentHolen(body) {
    const url = new URL(location.href);
    url.searchParams.set('perpage', '-1');
    try {
      const resp = await fetch(url.toString(), { credentials: 'include' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      // Ohne <base> werden relative Links (action=grader, pluginfile.php) im
      // abgetrennten Dokument gegen "about:blank" statt gegen die echte Moodle-URL
      // aufgelöst — a.href liefert dann falsche/unvollständige Adressen.
      const base = doc.createElement('base');
      base.href = location.origin;
      if (doc.head) doc.head.prepend(base);
      return doc;
    } catch (e) {
      logZeile(body, `Konnte nicht alle Seiten nachladen (${e.message}) — verwende nur die sichtbare Seite.`, 'fehler');
      return document;
    }
  }

  // ---- Schritt 1: Herunterladen -----------------------------------------
  async function herunterladen(body, courseKey, feedbackArt, einst) {
    logZeile(body, 'Lese Bewertungstabelle (alle Seiten) …');
    const vollDoc = await vollstaendigesDokumentHolen(body);
    const teilnehmer = tabelleAuslesen(vollDoc);
    if (!teilnehmer.length) { logZeile(body, 'Keine abgegebenen Abgaben gefunden.', 'fehler'); return; }
    logZeile(body, `${teilnehmer.length} Abgabe(n) erkannt.`);

    const karte = kuerzelBerechnen(teilnehmer.map((t) => ({ userid: t.userid, name: t.name })),
      (text, art) => logZeile(body, text, art));

    const garnichts = teilnehmer.filter((t) => t.ohneAbgabe);
    if (garnichts.length) {
      logZeile(body, `${garnichts.length} Person(en) ohne jede Abgabe — sie stehen mit in der CSV, damit sie eine Rückmeldung bekommen können: ${garnichts.map((t) => karte[t.userid].kuerzel).join(', ')}`);
    }
    const ohneDatei = teilnehmer.filter((t) => !t.ohneAbgabe && !t.dateien.length);
    if (ohneDatei.length) {
      logZeile(body, `${ohneDatei.length} Abgabe(n) ohne erkannte Datei (z. B. Online-Text statt Datei-Abgabe): ${ohneDatei.map((t) => karte[t.userid].kuerzel).join(', ')}`, 'fehler');
    }

    // Ein einziger Wurzelordner im ZIP, mit STABILEM Namen (Kurs + Aufgabe, ohne
    // Datum) — damit derselbe Kurs bei jeder Feedback-Runde wieder im gleich
    // benannten Ordner landet und der Abgleich "was ist neu seit dem letzten Lauf"
    // ohne Namensraten funktioniert (Arne, 10.09.2026). Der ZIP-Dateiname behält
    // das Datum, sonst hängt Chrome bei mehreren Downloads pro Tag " (1)" an.
    // Weil im ZIP genau EIN Element auf oberster Ebene liegt, entpacken macOS und
    // Windows direkt zu diesem Ordner statt einen zweiten drumherum zu bauen.
    const { kurs, aufgabe } = ermittleAnzeigeNamen();
    const ordnerName = kuerzen(dateiNameSicher([kurs, aufgabe].filter(Boolean).join(' - ')) || courseKey, 60);

    // Stand des letzten Laufs: je Person die Dateien mit Zeitstempel und Prüfsumme.
    // Damit lässt sich eine Datei schon an Name + Hochladezeit als unverändert erkennen,
    // ohne sie herunterzuladen — und die Prüfsumme bestätigt es, wo geladen wurde.
    const standKey = 'abgStand_' + cmid;
    const gespeichert = (await storageGet([standKey]))[standKey] || {};
    const alt = gespeichert.sus || {};                 // userid -> { dateien: [...] }
    const alteHashes = {};                             // pruefsumme -> true
    const alteBlaetter = {};                           // "kuerzel|blatt" -> true
    Object.keys(alt).forEach((uid) => {
      const k = (karte[uid] && karte[uid].kuerzel) || uid;
      (alt[uid].dateien || []).forEach((d) => {
        if (d.pruefsumme) alteHashes[d.pruefsumme] = true;
        alteBlaetter[k + '|' + (d.blatt || 'ohne')] = true;
      });
    });

    const kennenWirDieAufgabe = Object.keys(alt).length > 0;
    // Beim allerersten Lauf einer Aufgabe gibt es nichts zu vergleichen — dann wird
    // immer alles geladen, egal was eingestellt ist.
    const schnell = !!(einst && einst.modus === 'schnell') && kennenWirDieAufgabe;
    logZeile(body, schnell
      ? 'Schnelldurchlauf: es werden nur neue und geänderte Abgaben geladen. Die unveränderten liegen bereits im Output-Ordner.'
      : (kennenWirDieAufgabe
        ? 'Vollständiger Durchlauf: alle Abgaben werden geladen.'
        : 'Erster Lauf für diese Aufgabe — es wird alles geladen.'));
    logZeile(body, 'Lade Dateien von Moodle …');

    const zipDateien = [];
    const inhalt = [];
    const neuerStand = {};
    const zaehler = { neu: 0, geaendert: 0, unveraendert: 0, uebersprungen: 0 };

    for (const t of teilnehmer) {
      const kuerzel = karte[t.userid].kuerzel;
      const frueher = (alt[t.userid] && alt[t.userid].dateien) || [];
      const eigene = [];

      for (const d of t.dateien) {
        const blatt = blattNummer(d.dateiname);
        // Schlüssel für die Änderungserkennung aus dem GANZEN Dateinamen, nicht aus
        // der Nummer: dieselbe Nummer kann für zwei verschiedene Arbeitsblätter
        // vergeben sein (belegt: "4.1-01-…-Sicherheitsbelehrung" und
        // "4.1-01-…-Atomgroesse" im selben Thema). Über die Nummer allein würden
        // die beiden als ein und dasselbe Blatt gelten.
        // Beim zweiten Herunterladen hängen Browser und Betriebssystem ein " 2"
        // oder " 3" an den Namen — es bleibt dasselbe Arbeitsblatt. Ohne diese
        // Entdoppelung gilt eine erneut hochgeladene Fassung als neues Blatt statt
        // als geänderte (Arne, 11.09.2026).
        const bkey = kuerzel + '|' + dateiNameSicher(d.dateiname)
          .replace(/[ _-]\d{1,2}(?=\.[a-z0-9]+$)/i, '').toLowerCase();

        // Vorfilter: gleicher Dateiname UND gleiche Hochladezeit wie beim letzten Lauf.
        const bekannt = d.zeit
          ? frueher.find((f) => f.original === d.dateiname && f.zeit === d.zeit && f.pruefsumme)
          : null;

        if (bekannt && schnell) {
          // Nicht laden. Eintrag aus dem letzten Lauf unverändert übernehmen.
          eigene.push({ datei: bekannt.datei, original: d.dateiname, blatt: bekannt.blatt || null,
                        zeit: d.zeit, pruefsumme: bekannt.pruefsumme, status: 'unveraendert',
                        im_zip: false, name_ersetzt: !!bekannt.name_ersetzt });
          zaehler.unveraendert += 1; zaehler.uebersprungen += 1;
          continue;
        }

        try {
          const resp = await fetch(d.url, { credentials: 'include' });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const buf = new Uint8Array(await resp.arrayBuffer());
          const hash = await sha256Hex(buf);

          // Dateiname bleibt, wie er ist — er trägt die Arbeitsblatt-Bezeichnung und ist
          // damit von Lauf zu Lauf stabil und lesbar. NUR wenn der Name keinen
          // Aufgabenbezug hat, wird er ersetzt: SuS benennen Dateien gelegentlich nach
          // sich selbst, und ein Klarname im Dateinamen hebelt die Anonymisierung aus.
          // Ersatzname trägt die Prüfsumme statt einer laufenden Nummer, damit er sich
          // nicht verschiebt, wenn später weitere Dateien dazukommen (Arne, 10.09.2026).
          const endung = (/\.([a-z0-9]{1,5})$/i.exec(d.dateiname) || [null, 'pdf'])[1].toLowerCase();
          let sicher, ersetzt = false;
          if (blatt) {
            sicher = dateiNameSicher(d.dateiname);
          } else {
            sicher = `${kuerzel}_ohne-Aufgabennummer_${hash.slice(0, 8)}.${endung}`;
            ersetzt = true;
            logZeile(body, `Dateiname von ${kuerzel} trug keine Aufgabennummer und wurde ersetzt (mögliche Klarnamen im Dateinamen).`);
          }

          let status = 'neu';
          if (alteHashes[hash] || (bekannt && bekannt.pruefsumme === hash)) status = 'unveraendert';
          else if (alteBlaetter[bkey]) status = 'geaendert';
          zaehler[status] += 1;

          zipDateien.push({ name: `${ordnerName}/${kuerzel}/${sicher}`, data: buf });
          eigene.push({ datei: sicher, original: d.dateiname, blatt: blatt || null, zeit: d.zeit || '',
                        pruefsumme: hash, status, im_zip: true, name_ersetzt: ersetzt });
        } catch (e) {
          logZeile(body, `Datei von ${kuerzel} konnte nicht geladen werden (${e.message}).`, 'fehler');
        }
      }

      inhalt.push({ kuerzel, ohne_abgabe: !!t.ohneAbgabe, dateien: eigene.map((x) => ({
        datei: x.datei, blatt: x.blatt, status: x.status, im_zip: x.im_zip,
        pruefsumme: x.pruefsumme.slice(0, 16), name_ersetzt: x.name_ersetzt,
      })) });
      neuerStand[t.userid] = { dateien: eigene };
    }
    await storageSet({ [standKey]: { sus: neuerStand, stand: Date.now() } });
    logZeile(body, `Abgleich mit dem letzten Lauf: ${zaehler.neu} neu, ${zaehler.geaendert} geändert, ${zaehler.unveraendert} unverändert`
      + (zaehler.uebersprungen ? ` (davon ${zaehler.uebersprungen} nicht geladen).` : '.'));

    const anzahlAbgabeDateien = zipDateien.length;
    if (!anzahlAbgabeDateien) {
      logZeile(body, 'Keine neue oder geänderte Datei — es entsteht trotzdem ein ZIP mit CSV und Laufzettel.');
    }

    const heute = new Date().toISOString().slice(0, 10);

    // CSV-Vorlage liegt MIT im ZIP (im Wurzelordner, neben den Kürzel-Ordnern) statt
    // als zweiter, separater Download — auf Arnes Wunsch (10.09.2026): ein Download.
    // Fester Name "bewertung.csv", damit Prompt und Skill sie ohne Namensraten finden.
    const csvZeilen = ['Kuerzel-ID;Note;Feedback'];
    teilnehmer.forEach((t) => csvZeilen.push(`${csvZelle(karte[t.userid].kuerzel)};;`));
    const csvText = '\ufeff' + csvZeilen.join('\r\n');
    zipDateien.push({ name: `${ordnerName}/bewertung.csv`, data: new TextEncoder().encode(csvText) });

    // Maschinenlesbarer Laufzettel: trägt Datum, Aufgabe und Lauf-Art, die aus dem
    // stabilen Ordnernamen bewusst herausgefallen sind. Enthält KEINE Klarnamen —
    // die Zuordnung Kürzel→Name bleibt ausschließlich im Browser-Speicher.
    const lauf = {
      erweiterung: 'Moodle AI Aufgaben-Grader',
      version: version(),
      erzeugt: new Date().toISOString(),
      datum: heute,
      kurs: kurs || null,
      aufgabe: aufgabe || null,
      cmid,
      ordner: ordnerName,
      csv: 'bewertung.csv',
      laufart: feedbackArt === 'abschluss' ? 'abschluss' : 'zwischen',
      duplikatpruefung: !!(einst && einst.duplikate),
      loesungen: !!(einst && einst.loesungen),
      skill: (einst && einst.skill) || null,
      anzahl_abgaben: teilnehmer.length,
      anzahl_dateien: anzahlAbgabeDateien,
      abgleich: zaehler,
      modus: schnell ? 'schnell' : 'vollstaendig',
      zip_enthaelt_alle_abgaben: !schnell,
      abgaben: inhalt,
    };
    // Der Massstab reist in der ZIP mit — sonst muesste ihn ein
    // ChatGPT-Nutzer von Hand nachreichen (Arne, 16.09.2026).
    const massFuerZip = await massstabLaden();
    if (massFuerZip) {
      lauf.massstab = 'massstab.json';
      zipDateien.push({
        name: `${ordnerName}/massstab.json`,
        data: new TextEncoder().encode(JSON.stringify(massFuerZip, null, 2)),
      });
    }
    zipDateien.push({
      name: `${ordnerName}/_lauf.json`,
      data: new TextEncoder().encode(JSON.stringify(lauf, null, 2)),
    });

    const zipName = `${ordnerName}_${heute}.zip`;
    const zipBlob = zipBauen(zipDateien);
    download(zipBlob, zipName);
    logZeile(body, `ZIP heruntergeladen: ${zipName} — entpackt zum Ordner "${ordnerName}" (${anzahlAbgabeDateien} Abgabedatei(en) + bewertung.csv + _lauf.json)`, 'ok');

    const prompt = promptErzeugen(lauf, einst);
    zeigePrompt(body, prompt);
  }

  // Kürzt einen Ordnernamen auf eine handhabbare Länge, ohne mitten im Wort zu enden.
  function kuerzen(text, max) {
    text = String(text).trim();
    if (text.length <= max) return text;
    const kurz = text.slice(0, max);
    const luecke = kurz.lastIndexOf(' ');
    return (luecke > max * 0.6 ? kurz.slice(0, luecke) : kurz).trim();
  }

  // Der Prompt bleibt bewusst kurz: er nennt nur Ort, Umfang und Lauf-Art und
  // verweist für alles Fachliche auf die Bewertungs-Skill. Das spart Token und
  // hält die Erweiterung fach- und lehrkraftunabhängig.
  function promptErzeugen(lauf, einst) {
    const stufe = lauf.laufart === 'abschluss'
      ? 'Abschlussfeedback MIT Note'
      : 'Zwischenfeedback OHNE Note';
    const z = [];
    z.push('Aufgaben-Bewertung starten.');
    z.push('');
    z.push(`Ordner:   ${lauf.ordner}`);
    if (lauf.kurs) z.push(`Kurs:     ${lauf.kurs}`);
    if (lauf.aufgabe) z.push(`Aufgabe:  ${lauf.aufgabe}`);
    z.push(`Lauf:     ${stufe} (${lauf.datum})`);
    z.push(`Umfang:   ${lauf.anzahl_abgaben} Kürzel-ID(s), ${lauf.anzahl_dateien} Datei(en) im ZIP`);
    if (lauf.abgleich) z.push(`Abgleich: ${lauf.abgleich.neu} neu, ${lauf.abgleich.geaendert} geändert, ${lauf.abgleich.unveraendert} unverändert`);
    if (lauf.modus === 'schnell') z.push('Hinweis:  Unveränderte Dateien liegen nicht im ZIP (Schnelldurchlauf).');
    z.push('');
    // Bug behoben (Arne, 19.09.2026): stand vorher VOR "const z = []" — das
    // liess jeden Download mit "Cannot access 'z' before initialization"
    // abbrechen, sobald diese Funktion aufgerufen wurde (seit c19b4a7).
    ortZeilen(z, einst);
    z.push('Ablauf:');
    let n = 1;
    z.push(`${n++}. "${lauf.ordner}/_lauf.json" lesen — Aufgabe, Lauf-Art, Kürzel-IDs und je Datei ein Feld "status" (neu, geaendert, unveraendert).`);
    z.push(`${n++}. Das laufende Archiv dieses Themas liegt in Output/${lauf.ordner}/ mit "_status.json" (je Kürzel-ID und Arbeitsblatt: Stufe, Datum, letztes Feedback). Der Import-Ordner enthält nur, was seit dem letzten Lauf dazugekommen oder geändert ist.`);
    z.push(`${n++}. Nur die Dateien aus dem Import-Ordner ansehen. Für alles andere das Feedback aus "_status.json" übernehmen und beim Zusammensetzen nach Aktualität kürzen.`);
    if (lauf.duplikatpruefung) {
      z.push(`${n++}. Duplikatprüfung: die neuen Abgaben gegen das gesamte Archiv im Output-Ordner prüfen, nicht nur untereinander. Eindeutige Fälle melden, Graubereich beurteilen statt automatisch werten.`);
    }
    if (lauf.loesungen) {
      z.push(`${n++}. Falls eine passende Lösung oder ein Erwartungshorizont vorliegt, diese als Maßstab nehmen; sonst allein die Aufgabenstellung in der Abgabe zugrunde legen.`);
    }
    z.push(`${n++}. Je Kürzel-ID Feedback schreiben${lauf.laufart === 'abschluss' ? ' und Note vergeben' : ' (kein Notenfeld füllen)'} — anonym, keine Vergleiche zwischen Abgaben im Feedbacktext.`);
    z.push(`${n++}. "${lauf.ordner}/${lauf.csv}" ausfüllen: Spalten Kuerzel-ID;Note;Feedback unverändert, semikolongetrennt. Zeilenumbrüche im Feedbackfeld sind erlaubt, das Feld dann in Anführungszeichen setzen; keine geraden doppelten Anführungszeichen im Text selbst.`);
    // Rohwerte statt fertigem HTML: nur so kann der Regler spaeter noch
    // wirken, ohne dass die KI alles neu liest (Arne, 17.09.2026).
    z.push(`${n++}. Das Feedbackfeld NICHT als fertigen Text schreiben, sondern als Rohwerte — eine Zeile je Arbeitsblatt, fünf Felder mit senkrechtem Strich getrennt:`);
    z.push('   Aufgabenname|Vollstaendigkeit|Fachlichkeit|Datum|Text');
    z.push('   Vollstaendigkeit: 0, 25, 50, 75 oder 100 — wie viel von der Aufgabe bearbeitet wurde, ohne Rücksicht auf Richtigkeit.');
    z.push('   Fachlichkeit: 0 ohne Beanstandung, 1 kleine Ungenauigkeit, 2 deutlicher Mangel, 3 schwerer Fehler.');
    z.push(`   Datum: der Tag, an dem das Blatt abgegeben wurde — heute ist ${lauf.datum}, ältere Blätter behalten ihr altes Datum aus "_status.json".`);
    z.push('   Text: ein bis drei Sätze, ohne Prozentangabe und ohne Punktzahl — die rechnet die Erweiterung selbst aus.');
    z.push(`${n++}. Erste Zeile des Feedbackfelds ist immer @${lauf.datum} (das Datum dieses Durchgangs). Ein Hinweis auf den Arbeitsstand kommt als eigene Zeile mit Ausrufezeichen davor: !Kopfzeile|Fließtext — er wird rot und ganz oben ausgegeben.`);
    z.push('   In den Rohwertzeilen darf kein Semikolon und kein gerades doppeltes Anführungszeichen stehen.');
    z.push(`${n++}. Die gesichteten Dateien aus dem Import- in den Output-Ordner übernehmen (gleicher Kürzel-Unterordner, geänderte Fassung ersetzt die alte), "_status.json" fortschreiben und den Import-Ordner leeren. Das Archiv im Output-Ordner enthält danach wieder ALLE Abgaben dieses Themas.`);
    z.push(`${n++}. Ausgefüllte CSV zurückgeben — sie wird über den Reiter „3 · Eintragen" wieder in Moodle eingetragen.`);
    z.push('');
    if (lauf.laufart === 'abschluss') {
      z.push('Da dies der Abschlusslauf ist: Nach dem Eintragen der Noten kann das Archiv im Output-Ordner gelöscht werden.');
      z.push('');
    }
    if (lauf.massstab) {
      z.push(`Gewichtung: "${lauf.ordner}/massstab.json" liegt bei. Jede Aufgabe hat dort ein relatives Gewicht; ihr Anteil in Prozent ist Gewicht geteilt durch die Summe aller Gewichte. Steht in der Notiz das Wort "Wahlaufgabe", ist es eine — das gehört in die Kopfzeile des Feedbacks.`);
    } else {
      z.push('Gewichtung: Es liegt kein Maßstab bei. Also Prozentwerte je Aufgabe vergeben, aber KEINE Gesamtnote — dafür fehlt die Gewichtung.');
    }
    z.push('');
    z.push(lauf.skill
      ? `Bewertungsregeln: Skill „${lauf.skill}".`
      : 'Bewertungsregeln: [Name der Bewertungs-Skill hier ergänzen — dauerhaft hinterlegbar in den Einstellungen (⚙).]');
    return z.join('\n');
  }

  // Die Prompt-Karte gehört in den Reiter "Download" — sie ist das Ergebnis des
  // Downloads. Im Reiter "Einfügen" hat sie nichts zu suchen (Arne, 10.09.2026).
  function zeigePrompt(body, text) {
    const ziel = body.querySelector('.abg-inhalt[data-panel="download"]') || body;
    let feld = ziel.querySelector('#abg-prompt');
    if (!feld) {
      const box = document.createElement('div');
      box.className = 'abg-karte';
      box.innerHTML = `
        <h4>Auftrags-Prompt</h4>
        <div class="abg-hinweis abg-schritt">Zuerst das heruntergeladene ZIP entpacken und den entstandenen Ordner in den <strong>Import-Ordner</strong> legen. Danach diesen Prompt in die KI einfügen.</div>
        <textarea id="abg-prompt" readonly></textarea>
        <button id="abg-prompt-kopieren">Prompt in die Zwischenablage kopieren</button>
      `;
      ziel.appendChild(box);
      feld = box.querySelector('#abg-prompt');
      const kopf = box.querySelector('#abg-prompt-kopieren');
      kopf.addEventListener('click', () => {
        navigator.clipboard.writeText(feld.value)
          .then(() => {
            // Danach arbeitet die KI; weiter geht es hier in „3 · Eintragen".
            if (weiterNachGlobal) return weiterNachGlobal(kopf, 'Prompt in die Zwischenablage kopieren');
            const alt = kopf.textContent;
            kopf.textContent = 'Kopiert';
            setTimeout(() => { kopf.textContent = alt; }, 1500);
          })
          .catch(() => { feld.select(); });
      });
    }
    feld.value = text;
  }

  // ---- Schritt 2: Bewertungen in die Schnellbewertung eintragen ---------
  // Moodles Schnellbewertung (quickgrading=1) stellt pro Person zwei Felder auf
  // dieselbe Seite: input[name="quickgrade_<userid>"] für die Note und
  // textarea[name="quickgrade_comments_<userid>"] für den Kommentar (schlichtes
  // Textfeld, KEIN TinyMCE — Zeilenumbrüche gehen also direkt hinein). Gespeichert
  // wird alles zusammen mit dem einen Speichern-Knopf des Formulars.
  // Live geprüft am 10.09.2026.
  // Die Erweiterung füllt nur — abgeschickt wird von Hand, damit Arne vorher
  // alle Einträge auf einen Blick prüfen kann.
  async function inSchnellbewertungEintragen(body, datei) {
    const text = await datei.text();
    const zeilen = csvLesen(text);
    if (zeilen.length < 2) throw new Error('CSV enthält keine Datenzeilen.');
    const kopf = zeilen[0].map((x) => x.trim().toLowerCase());
    const iKuerzel = kopf.findIndex((x) => x.includes('kürzel') || x.includes('kuerzel'));
    const iNote = kopf.findIndex((x) => x.includes('note') || x.includes('punkt'));
    const iFeedback = kopf.findIndex((x) => x.includes('feedback'));
    if (iKuerzel < 0) throw new Error('Spalte "Kuerzel-ID" nicht in der CSV gefunden.');

    const karte = kuerzelBerechnen(tabelleAuslesen(document).map((t) => ({ userid: t.userid, name: t.name })));
    const kuerzelZuUserid = {};
    Object.entries(karte).forEach(([uid, e]) => { kuerzelZuUserid[e.kuerzel] = uid; });

    const einst = await einstellungenLaden();
    const hinweis = einst.kiHinweis !== false ? (einst.kiHinweisText || KI_HINWEIS_STANDARD).trim() : '';

    // Der Regler rechnet beim Eintragen. Steht in der CSV die strukturierte
    // Form (Name|Vollstaendigkeit|Fachlichkeitsstufe|Datum|Text), baut die
    // Erweiterung daraus das HTML — dann aendert eine andere Reglerstellung
    // alle Feedbacks, ohne dass die KI noch einmal lesen muss.
    const faktoren = (STRENGE[einst.strenge] || STRENGE.normal).f;
    const mass = await massstabLaden();
    const punkteJeBlatt = {};
    if (mass && Array.isArray(mass.aufgaben) && mass.aufgaben.length) {
      const summe = mass.aufgaben.reduce((a, x) => a + (Number(x.gewicht) || 0), 0);
      if (summe > 0) mass.aufgaben.forEach((x) => {
        punkteJeBlatt[x.name] = (Number(x.gewicht) || 0) / summe * 100;
      });
    }

    let getroffen = 0, noten = 0, kommentare = 0, gebaut = 0;
    const unbekannt = [], nichtAufSeite = [];

    for (let i = 1; i < zeilen.length; i++) {
      const z = zeilen[i];
      const kuerzel = (z[iKuerzel] || '').trim();
      if (!kuerzel) continue;
      const userid = kuerzelZuUserid[kuerzel];
      if (!userid) { unbekannt.push(kuerzel); continue; }

      const notenFeld = document.querySelector(`input[name="quickgrade_${userid}"]`);
      const kommentarFeld = document.querySelector(`textarea[name="quickgrade_comments_${userid}"]`);
      if (!notenFeld && !kommentarFeld) { nichtAufSeite.push(kuerzel); continue; }

      const note = iNote >= 0 ? (z[iNote] || '').trim() : '';
      let feedback = iFeedback >= 0 ? (z[iFeedback] || '').trim() : '';
      // Rohwerte erkennen und selbst rendern. Findet sich keine einzige
      // strukturierte Zeile, bleibt der Text unveraendert stehen — aeltere
      // CSVs mit fertigem HTML funktionieren weiter.
      if (feedback) {
        const roh = feedbackLesen(feedback);
        if (roh.blaetter.length || roh.stand) {
          feedback = feedbackBauen(roh, faktoren, punkteJeBlatt);
          gebaut += 1;
        }
      }
      // Hinweis anhängen — aber nur einmal, falls die CSV ihn schon enthält.
      if (feedback && hinweis && feedback.indexOf(hinweis) === -1) {
        const istHtml = /<(p|br|div|strong|em|span|ul|ol)\b/i.test(feedback);
        feedback = istHtml
          ? feedback + `<p><small><em style='color:#777'>${hinweis}</em></small></p>`
          : feedback + '\n\n' + hinweis;
      }

      if (note !== '' && notenFeld) {
        notenFeld.value = note;
        notenFeld.dispatchEvent(new Event('input', { bubbles: true }));
        notenFeld.dispatchEvent(new Event('change', { bubbles: true }));
        noten += 1;
      }
      if (feedback !== '' && kommentarFeld) {
        kommentarFeld.value = feedback;
        kommentarFeld.dispatchEvent(new Event('input', { bubbles: true }));
        kommentarFeld.dispatchEvent(new Event('change', { bubbles: true }));
        kommentarFeld.style.outline = '2px solid #d3070f';
        kommentare += 1;
      }
      getroffen += 1;
    }

    if (unbekannt.length) {
      logZeile(body, `Diese Kürzel-IDs sind diesem Kurs nicht bekannt und wurden übersprungen: ${unbekannt.join(', ')}`, 'fehler');
    }
    if (nichtAufSeite.length) {
      logZeile(body, `Nicht auf dieser Seite sichtbar (Seitengröße?): ${nichtAufSeite.join(', ')} — Seite mit "Alle" anzeigen und erneut eintragen.`, 'fehler');
    }
    if (!getroffen) { logZeile(body, 'Keine einzige Zeile konnte zugeordnet werden.', 'fehler'); return; }
    if (gebaut) {
      logZeile(body, `${gebaut} Feedback(s) aus Rohwerten gebaut — Strenge: ${(STRENGE[einst.strenge] || STRENGE.normal).text}.`, 'ok');
      if (!mass) logZeile(body, 'Kein Maßstab gespeichert — im Feedback stehen Prozentwerte statt Punkten.', 'fehler');
    }

    logZeile(body, `${getroffen} Person(en) ausgefüllt: ${kommentare} Feedback, ${noten} Note(n). NICHT gespeichert.`
      + (hinweis ? ' KI-Hinweis angehängt.' : ' Ohne KI-Hinweis.'), 'ok');
    logZeile(body, 'Jetzt in der Tabelle prüfen und Moodles Knopf „Speichern" ganz unten drücken.', 'ok');

    // Panel einklappen: ab hier wird in der Tabelle geprüft und dort gespeichert,
    // das Panel würde nur die Sicht verstellen (Arne, 11.09.2026).
    const panel = document.getElementById('abg-panel');
    const knopf = document.getElementById('abg-toggle');
    if (panel && knopf) { panel.hidden = true; knopf.hidden = false; }

    const ersteMarkierung = document.querySelector('textarea[name^="quickgrade_comments_"][style*="outline"]');
    if (ersteMarkierung) ersteMarkierung.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------------------------------------------------------------------
  // 7 · Start
  // ---------------------------------------------------------------------
  (async () => {
    const body = panelBauen();
    if (!kontextGueltig()) { logZeile(body, KONTEXT_TEXT, 'fehler'); return; }
    try { await modusUebersicht(body); }
    catch (e) { logZeile(body, istKontextfehler(e) ? KONTEXT_TEXT : 'Fehler: ' + e.message, 'fehler'); }
  })();

}
