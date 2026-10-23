/* Moodle AI Coach — Kern, aus content.js v1.8.10 uebernommen (WXT-Umzug 17.09.2026).
 * Genau vier Aenderungen beim Umzug, wie beim Aufgaben-Grader:
 *  1. chrome.* -> browser.*        (Polyfill, Chrome UND Firefox)
 *  2. Skill-Verweis 1-chrome-mv3 -> 1-webext-robustheit
 *  3. IIFE -> export function starteCoach()
 *  4. Versionsnummer per textContent statt Einsetzung ins innerHTML
 * Sonst ist die Datei zeilengleich mit der bewaehrten Fassung.
 *
 * Arbeitsteilung der drei Erweiterungen (Stand 05.09.2026):
 *   Grader   blau,    top 80px, Einzelfrageseite (slot=)        — EINE Freitextaufgabe mit Teilaufgaben
 *   Coach    violett, top 80px, Übersicht OHNE includeauto=1     — unbewertete kurze Freitextantworten
 *   Reviewer petrol,  top 80px, Übersicht MIT  includeauto=1     — automatisch bewertete Cloze-/Kurzantworten
 *
 * Die drei schliessen sich gegenseitig aus: Grader nur mit slot=, Coach und
 * Reviewer teilen die Übersicht ueber den Schalter includeauto. Deshalb duerfen
 * alle drei dieselbe Panel-Position benutzen — es erscheint nie mehr als eines.
 *
 * Grundprinzip „Horizont zuerst": Der Erwartungshorizont steht im Moodle-Feld
 * graderinfo an der Frage selbst. Ist er da, wird sofort der Bewertungs-Prompt
 * gebaut. Fehlt er, führt Reiter 3 durch das Erstellen und schreibt ihn hinein.
 *
 * A. Spielhoff · CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';
import { MARKER_RE as GEMEINSAM_MARKER_RE, MARKER_KURZTEST, markerWer } from './gemeinsam/marker.js';
import { kurztestHorizontVorlage } from './gemeinsam/kurztest-horizont.js';
import { bewertungsKopf } from './gemeinsam/bewertungsregeln.js';
import { metaAusText, istMetaZeile, stufeVon, anredeFuer, NIVEAU_WORT } from './gemeinsam/horizont-meta.js';
import { materialBlock } from './gemeinsam/horizont-bausteine.js';
import { rsAnteil, fehlerGewicht, woerter, rsErklaerung, rsPromptSatz } from './gemeinsam/rechtschreibung.js';
import { KI_HINWEIS_STANDARD, GEMEINSAME_OPTIONEN, GEMEINSAM_STANDARD, ohneQuellenTief } from './gemeinsam/feedback-optionen.js';
import { rundgangSpeichern, einzelseiteUrl } from './gemeinsam/rundgang.js';

export function starteCoach(opts) {
  'use strict';
  opts = opts || {};

  // Versionsnummer aus dem Manifest — sie steht in der Kopfzeile des Panels, damit
  // nach "↺ neu laden" sofort sichtbar ist, welche Fassung wirklich aktiv ist.
  // Aus dem Manifest gelesen, nie von Hand gepflegt: so kann sie nicht auseinanderlaufen.
  const VERSION = (browser.runtime.getManifest ? browser.runtime.getManifest().version : '');
  // Rahmendaten (Fach, Jahrgang, Kursniveau) teilen sich beide Wege: sie stehen in den
  // Grundeinstellungen (⚙) und gehen in die Rolle des Bewertungsprompts.
  const NIVEAU_TEXT = NIVEAU_WORT;
  let RAHMEN = {};
  try {
    browser.storage.local.get(['magSettings']).then((r) => {
      const m = (r && r.magSettings) || {};
      const zahlOderNull = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? null : x; };
      RAHMEN = { fach: m.fach || '', jahrgang: m.jahrgang || '', niveau: m.kursniveau || '',
        // Rechtschreibung je Stufe – dieselben Werte wie im Reiter „Bewerten" des Klausur-Wegs
        rsSek1: zahlOderNull(m.rsSek1 !== undefined && m.rsSek1 !== '' ? m.rsSek1 : m.rechtschreibung),
        rsSek2: zahlOderNull(m.rsSek2 !== undefined && m.rsSek2 !== '' ? m.rsSek2 : 25),
        anredeWahl: m.anredeWahl || 'auto' };
      if (typeof abzugFeldAktualisieren === 'function') abzugFeldAktualisieren();
    }).catch(() => {});
  } catch (e) { /* ohne Speicher: neutrale Rolle */ }

  const P = new URLSearchParams(location.search);
  if (P.get('mode') !== 'grading') return;
  // Einzelmodus (seit 1.1.0): Auf der Bewertungsseite EINER Kurztest-Frage bettet der
  // Klausur-Weg dieses Panel in seinen Reiter „Bewerten" ein – gleiche Prompts, gleiche
  // Rechnung, gleiches Feedback wie auf der Uebersicht, nur fuer diese eine Frage.
  const EINZEL = opts.einzel || null;
  const ZIEL = opts.ziel || null;
  if (P.get('slot') && !EINZEL) return;      // Einzelfrageseite gehört dem Klausur-Weg
  // Sind die automatisch bewerteten Fragen eingeblendet, gehoert die Seite dem
  // Moodle AI Reviewer — dort geht es um Cloze- und Kurzantwort-Luecken, nicht um
  // unbewertete Freitextantworten. Spiegelbild zur Pruefung im Reviewer, damit sich
  // die beiden Panels nie gleichzeitig zeigen.
  if (P.get('includeauto') === '1') return;
  const CMID = P.get('id');
  if (!CMID) return;
  const BASE = location.origin + location.pathname;

  // Wurzel der Moodle-Installation aus der eigenen Adresse ableiten.
  // Nicht jedes Moodle liegt auf der Domainwurzel: https://schule.de/moodle/... ist
  // genauso gueltig wie https://lms.example/... . location.origin allein zeigte in
  // solchen Installationen auf /question/... statt auf /moodle/question/... .
  const MOODLE_ROOT = (() => {
    const p = location.pathname;
    for (const m of ['/mod/', '/question/', '/grade/', '/course/', '/admin/', '/report/', '/user/']) {
      const i = p.indexOf(m);
      if (i > -1) return location.origin + p.slice(0, i);
    }
    return location.origin;
  })();

  /* ================= Helfer ================= */

  const num = (s) => {
    const v = parseFloat(String(s == null ? '' : s).replace(',', '.'));
    return isNaN(v) ? null : v;
  };
  const komma = (v) => Number(v).toFixed(2).replace('.', ',');
  const prozentText = (v) => String(Number(v)).replace('.', ',');
  const escapeHtml = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Aus den Feldern der KI wird HIER das Feedback gebaut, nicht im Prompt. Formvorgaben
  // setzt kein Prompt zuverlaessig durch (Lehre aus den Blindvergleichen): Fett,
  // Unterstreichung und Absaetze gehoeren deshalb ins Plugin. Die KI liefert nur die
  // Sätze, gegliedert nach Inhalt, Rechtschreibung, Grammatik und Tipp.
  // Reine Volltreffer bekommen die kurze Form: „Feedback: Das hast du super gemacht."
  function rueckmeldungHtml(r, muster, punkte) {
    if (!r || typeof r !== 'object') return '';
    const z = (k) => String(r[k] || '').trim();
    const lob = z('lob');
    const teile = [
      ['Inhalt', z('inhalt')],
      ['Rechtschreibung', z('rechtschreibung')],
      ['Grammatik', z('grammatik')],
      ['Tipp', z('tipp')]
    ].filter(([, t]) => t);

    if (!teile.length && !lob) return '';
    if (!teile.length) {
      return '<p><strong><u>Feedback:</u></strong> ' + escapeHtml(lob) + '</p>';
    }
    // Punkteaufschlüsselung (seit 1.7.0): Moodle zeigt neben der Frage nur die
    // Gesamtpunktzahl — dezent, aber sichtbar hinter der jeweiligen Zeile ergänzen,
    // damit "inhaltlich schwach" und "inhaltlich gut, aber viele Fehler" für die
    // Schülerin/den Schüler unterscheidbar bleiben. Kursiv, grau, in Klammern, am
    // Zeilenende. Der Abzug steht EINMAL GESAMT hinter der letzten Sprachzeile, nicht
    // je Kategorie — er wird aus der Gesamtfehlerzahl berechnet, nicht pro Zeile.
    // Seit 1.8.8: die Klammer nennt konkrete Zahlen statt Abstraktionen — die
    // Maximalpunktzahl bei Inhalt, die gezählten Fehlerpunkte beim Abzug — und ab der
    // höchsten Fehlerstufe (5+ Fehlerpunkte) folgt ein fester Hinweissatz zur
    // Dringlichkeit. Nicht von der KI generiert, siehe TEIL-2-Prompt weiter unten.
    const vorhandeneKoepfe = teile.map(([k]) => k);
    const letzteSprachzeile = vorhandeneKoepfe.includes('Grammatik') ? 'Grammatik'
      : (vorhandeneKoepfe.includes('Rechtschreibung') ? 'Rechtschreibung' : null);
    const punktSpan = (t) => '<span style="color:#767676;font-style:italic;"> (' + t + ')</span>';
    const hoechsteStufe = !!(punkte && punkte.gewicht >= 5);
    const fehlerpunkteText = (n) => n >= 5 ? '5 oder mehr Fehlerpunkte'
      : (n === 1 ? '1 Fehlerpunkt' : n + ' Fehlerpunkte');

    let html = '<p><strong><u>Feedback</u></strong></p>';
    if (lob) html += '<p>' + escapeHtml(lob) + '</p>';
    teile.forEach(([kopf, text]) => {
      let zusatz = '';
      if (punkte) {
        if (kopf === 'Inhalt' && punkte.inhalt != null) {
          zusatz = punktSpan(punkte.inhaltMax != null
            ? komma(punkte.inhalt) + ' von ' + komma(punkte.inhaltMax) + ' Punkten'
            : komma(punkte.inhalt) + ' Punkte');
        } else if (kopf === letzteSprachzeile && punkte.abzug) {
          zusatz = punktSpan('−' + komma(punkte.abzug) + ' Punkte'
            + (punkte.gewicht != null ? ' — ' + fehlerpunkteText(punkte.gewicht)
              + (hoechsteStufe ? ', höchste Stufe' : '') : ''));
        }
      }
      html += '<p><u>' + kopf + ':</u> ' + escapeHtml(text) + zusatz + '</p>';
      // Die Musterloesung steht schon im Horizont — die Kernaussage IST der Satz, der
      // die volle Punktzahl traegt. Sie hier anzuhaengen kostet kein einziges Token
      // beim Sprachmodell und ist woertlich das, was die Lehrkraft hinterlegt hat.
      if (kopf === 'Inhalt' && muster) {
        html += '<p><u>So hättest du es schreiben können:</u> ' + escapeHtml(muster) + '</p>';
      }
      // Fester, nicht von der KI generierter Hinweis — nur bei der höchsten
      // Fehlerstufe, sonst nutzt er sich ab. Direkt hinter der Sprachzeile, mit der
      // die Stufe erreicht wurde.
      if (kopf === letzteSprachzeile && hoechsteStufe) {
        html += '<p>In deiner Antwort häufen sich mehrere grundlegende Fehler — das ist die '
          + 'höchste Fehlerstufe. Es lohnt sich, gezielt daran zu arbeiten.</p>';
      }
    });
    return html;
  }

  // Erste Zeile nach „Kernaussage:" aus dem Erwartungshorizont. Endet an der naechsten
  // Abschnittsueberschrift; im Moodle-Feld stehen die Abschnitte direkt untereinander.
  function kernaussage(horizont) {
    const t = String(horizont || '').replace(/\r/g, '');
    const m = t.match(/Kernaussage\s*:?\s*([\s\S]*?)(?=\n\s*(?:Muss enthalten|Auch richtig|Inhalt|Reicht nicht|Häufiger Fehler|Wichtigster Hinweis|Teile)\s*:|$)/i);
    const satz = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    // Sehr lange Kernaussagen sind keine Musterloesung mehr, sondern ein Absatz.
    return satz.length > 300 ? '' : satz;
  }

  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  async function fetchDoc(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // grade=needsgrading fürs Auslesen (Essays sind nie autobewertet),
  // grade=all fürs Eintragen und Gegenprüfen — ein bewerteter Versuch
  // verlässt needsgrading sofort.
  const seiteUrl = (slot, qid, filter) =>
    `${BASE}?id=${CMID}&mode=grading&slot=${slot}&qid=${qid}` +
    `&grade=${filter || 'needsgrading'}&qperpage=100`;

  const fragenUrl = (qid) =>
    `${MOODLE_ROOT}/question/bank/editquestion/question.php?id=${qid}&cmid=${CMID}`;

  const versuchLink = (e) => (e && e.slot && e.qid)
    ? seiteUrl(e.slot, e.qid, 'all') + (e.qubaid ? '#question-' + e.qubaid + '-' + e.slot : '')
    : null;

  async function inZwischenablage(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = el('textarea', 'co-fallback'); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  /* ================= Zustaendigkeit: wem gehoert die Frage? ================= */

  // In einem Test koennen Freitextfragen fuer den Coach (2-3 Saetze) und fuer den
  // Grader (laengere Antworten) nebeneinander liegen. Ohne Kennzeichnung wuerde der
  // Coach beide bewerten. Deshalb traegt der Erwartungshorizont in der ERSTEN Zeile
  // einen Marker, z. B. „[moodle-ai-coach]". Er steht in der Frage selbst, gilt also
  // dauerhaft und in jedem Test — anders als eine Auswahl, die man je Durchlauf neu
  // setzen muesste. Der Coach liest den Horizont ohnehin; der Marker kostet nichts.
  const MARKER_ZEILE = MARKER_KURZTEST;
  // Toleriert auch die Fassung ohne Klammern, mit Leer- statt Bindestrich und mit
  // nachfolgendem Text in derselben Zeile.
  const MARKER_RE = GEMEINSAM_MARKER_RE;

  function ersteZeile(h) {
    return String(h || '').split('\n').map((z) => z.trim()).find(Boolean) || '';
  }

  // 'coach' | 'grader' | null (kein Marker oder gar kein Horizont)
  function zustaendigkeit(horizont) {
    const zeilen = String(horizont || '').split('\n').map((z) => z.trim()).filter(Boolean);
    const m = zeilen.slice(0, 5).map((z) => z.match(MARKER_RE)).find(Boolean) || null;
    const wer = markerWer(m);
    if (wer) return wer;
    // Ohne Marker am Inhalt erkennen: Ueberschriften „Aufgabe N" = Klausur,
    // „Kernaussage:" ohne solche Ueberschriften = Kurztest.
    if (zeilen.some((z) => /^(?:[①-⑳]\s*)?Aufgabe\s+\d{1,2}\s*[a-h]?\b/i.test(z))) return 'grader';
    if (zeilen.some((z) => /^Kernaussage\s*:/i.test(z))) return 'coach';
    return null;
  }

  // Der Marker ist Verwaltung, kein Bewertungsmassstab — er gehoert nicht in den
  // Prompt. Deshalb wird er aus dem Horizont entfernt, bevor er an die KI geht.
  function horizontOhneMarker(h) {
    const zeilen = String(h || '').split('\n');
    const i = zeilen.findIndex((z) => z.trim());
    if (i > -1 && MARKER_RE.test(zeilen[i])) {
      zeilen[i] = zeilen[i].replace(MARKER_RE, '').trim();
      if (!zeilen[i]) zeilen.splice(i, 1);
    }
    return zeilen.join('\n').trim();
  }

  // ---- Rechtschreibungs-Prozent im Horizont (seit 1.8.0) ----------------------
  //
  // Bei mehreren Kursen (8./9./10. Klasse o. ae.) wird leicht vergessen, die
  // Einstellung vor jeder Bewertung an die richtige Klasse anzupassen. Deshalb
  // traegt ein selbst erzeugter Horizont den beim Erstellen aktiven Prozentwert
  // als eigene Meta-Zeile, direkt nach dem Zustaendigkeits-Marker — z. B.
  // "[Rechtschreibung: 15%]". Reine Verwaltung, wie der Marker: sie fliesst nicht
  // in den Bewertungsprompt ein.
  const PROZENT_ZEILE_RE = /^\s*\[?\s*rechtschreibung\s*[:\-]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%?\s*\]?\s*$/i;

  function prozentZeile(wert) {
    return `[Rechtschreibung: ${prozentText(wert)}%]`;
  }

  // Liefert den im Horizont hinterlegten Prozentwert, oder null, wenn keiner drin
  // steht (aeltere Horizonte, oder von Hand geschrieben ohne Meta-Zeile).
  function prozentAusHorizont(horizontRoh) {
    const erste = ersteZeile(horizontOhneMarker(horizontRoh));
    const m = erste.match(PROZENT_ZEILE_RE);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }

  // Entfernt Marker UND Rechtschreibungs-Meta-Zeile vom Kopf des Horizonts — beide
  // sind Verwaltung, keine Bewertungsgrundlage, und duerfen nicht in den Prompt.
  function horizontBereinigt(horizontRoh) {
    const ohneMarker = horizontOhneMarker(horizontRoh);
    const zeilen = ohneMarker.split('\n');
    const i = zeilen.findIndex((z) => z.trim());
    if (i > -1 && PROZENT_ZEILE_RE.test(zeilen[i].trim())) {
      zeilen.splice(i, 1);
    }
    // Alle Verwaltungszeilen (Fach, Jahrgang, Niveau, Feedback, alte Prozent-/Schritte-Zeilen).
    for (let k = 0; k < 8; k++) {
      const j = zeilen.findIndex((z) => z.trim());
      if (j > -1 && istMetaZeile(zeilen[j])) zeilen.splice(j, 1); else break;
    }
    return zeilen.join('\n').trim();
  }

  // Setzt die Rechtschreibungs-Meta-Zeile direkt nach der Marker-Zeile, falls dort
  // noch keine steht. `textMitMarker` hat den Marker garantiert schon als Zeile 1.
  function fuegeProzentZeileEin(textMitMarker, prozent) {
    const zeilen = textMitMarker.split('\n');
    const zweite = (zeilen[1] || '').trim();
    if (PROZENT_ZEILE_RE.test(zweite)) return textMitMarker;
    zeilen.splice(1, 0, prozentZeile(prozent));
    return zeilen.join('\n');
  }

  /* ================= Einstellungen ================= */


  const OPT_STANDARD = {
    // Sprache wird ABGEZOGEN, nicht als zweiter Topf addiert: sonst bekäme eine
    // inhaltsleere Antwort allein für sauberes Deutsch schon 30 %.
    maxSprachabzug: 10,   // Freitext Grader: wie im Klausur-Weg; der Wert im Horizont hat Vorrang
    kiHinweisText: KI_HINWEIS_STANDARD,
    promptOverride: '',
    horizontPromptOverride: '',
    // Streng: nur Fragen bewerten, deren Horizont ausdruecklich „[moodle-ai-coach]"
    // sagt. Standardmaessig aus, sonst wuerde der Coach auf einem noch nicht
    // markierten Bestand gar nichts mehr bewerten.
    nurMitMarker: false,
    // Standardmaessig AUS, wie beim Reviewer: der volle Prompt ist die Fassung, die
    // fuer jede KI (auch ohne eigene Skills) sicher funktioniert. Bewusst per
    // Haekchen einschaltbar, nicht als Bedingung im Prompt selbst.
    kompaktPrompt: false,
    kiHinweis: true,
    entferneQuellen: true
  };
  let optionen = { ...OPT_STANDARD };
  // Gilt nur fuer den aktuellen Ernte-Durchlauf, wird nie gespeichert: erzwingt die
  // eingestellte Prozentzahl statt der im Horizont hinterlegten (Abgleich, 1.8.0).
  let prozentEinstellungErzwingen = false;

  // Ein Wert fuer beide Wege: die Grundeinstellungen (⚙ „Rechtschreibung").
  // Ein Wert je Stufe fuer beide Wege (Kasten „Für diese Bewertung").
  function rsFuerJahrgang(jahrgang) {
    const k = stufeVon(jahrgang) === 'sek2' ? 'rsSek2' : 'rsSek1';
    if (RAHMEN && RAHMEN[k] != null) return RAHMEN[k];
    return k === 'rsSek2' ? 25 : (optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug);
  }
  // Angaben fuer Rolle und Anrede: die haeufigsten aus den Horizonten der Fragen,
  // sonst die zuletzt benutzten Werte.
  function rolleAktuell() {
    const fr = (typeof ausgabe !== 'undefined' && ausgabe && ausgabe.fragen) ? Object.values(ausgabe.fragen) : [];
    const haeufig = (k) => {
      const z = {}; fr.forEach((f) => { if (f[k]) z[f[k]] = (z[f[k]] || 0) + 1; });
      return Object.keys(z).sort((a, b) => z[b] - z[a])[0] || '';
    };
    const jahrgang = haeufig('jahrgang') || RAHMEN.jahrgang || '';
    const niveau = haeufig('niveau') || RAHMEN.niveau || '';
    return {
      fach: haeufig('fach') || RAHMEN.fach || '',
      jahrgang,
      niveau: NIVEAU_TEXT[niveau] || niveau,
      anrede: anredeFuer(jahrgang, RAHMEN.anredeWahl)
    };
  }
  function rsStandard() { return rsFuerJahrgang(rolleAktuell().jahrgang); }
  // Die Rechtschreib-Zeile im Horizont zaehlt nur, wenn der Freitext Grader sie selbst
  // geschrieben hat. Alte Coach-Horizonte tragen noch ihren eigenen Wert (oft 30 %).
  function hoechstabzugFuer(frageDaten) {
    const standard = rsStandard();
    if (prozentEinstellungErzwingen) return standard;
    // Ab 0.9 zaehlt keine Prozentzeile im Horizont mehr; der Wert haengt am Jahrgang der Frage.
    return frageDaten && frageDaten.jahrgang ? rsFuerJahrgang(frageDaten.jahrgang) : standard;
  }

  function optionenLaden() {
    return new Promise((resolve) => {
      try {
        // KI-Hinweis, Quellen und kompakter Prompt gelten fuer beide Wege: sie liegen in
        // magSettings und haben dort Vorrang (seit 1.0.0).
        browser.storage.local.get(['coachOptionen', 'magSettings'], (r) => {
          const m = (r && r.magSettings) || {};
          const gemeinsam = {};
          GEMEINSAME_OPTIONEN.forEach((k) => { if (m[k] !== undefined) gemeinsam[k] = m[k]; });
          optionen = { ...OPT_STANDARD, ...(r && r.coachOptionen ? r.coachOptionen : {}), ...gemeinsam };
          resolve(optionen);
        });
      } catch (e) { resolve(optionen); }
    });
  }
  function optionenSpeichern(neu) {
    optionen = { ...optionen, ...neu };
    return new Promise((resolve) => {
      try {
        browser.storage.local.get(['magSettings'], (r) => {
          const m = { ...((r && r.magSettings) || {}) };
          GEMEINSAME_OPTIONEN.forEach((k) => { m[k] = optionen[k]; });
          browser.storage.local.set({ coachOptionen: optionen, magSettings: m }, resolve);
        });
      } catch (e) { resolve(); }
    });
  }

  /* ================= Sprachabzug ================= */

  // Gleiche Rechnung wie im Klausur-Weg (gemeinsam/rechtschreibung.js): unter 40 Woertern
  // nach Fehlerzahl, darueber nach Fehlerquotient. Schwere Fehler zaehlen doppelt.
  function abzugProzent(fehlerGewichtet, wortzahl, hoechstabzugOverride) {
    const basis = hoechstabzugOverride ?? rsStandard();
    return rsAnteil(fehlerGewichtet, wortzahl) * basis;
  }

  function punkteRechnen(max, inhaltProzent, fehlerListe, hoechstabzugOverride, antwortText) {
    const gewicht = fehlerGewicht(fehlerListe);
    const ab = abzugProzent(gewicht, woerter(antwortText), hoechstabzugOverride);
    const roh = max * inhaltProzent / 100 - max * ab / 100;
    return {
      gewicht, abzug: ab,
      inhaltPunkte: Math.round(max * inhaltProzent / 100 * 100) / 100,
      // Punkte statt Prozent, fuers Feedback (1.7.0) — der Prozentwert bleibt fuer
      // die bestehende Rechnungs-Zeile in der Vorschau erhalten.
      abzugPunkte: Math.round(max * ab / 100 * 100) / 100,
      punkte: Math.max(0, Math.round(roh * 100) / 100)
    };
  }

  /* ================= Auslesen ================= */

  // Die Übersichtstabelle listet je Pool-Frage eine Zeile mit gleichbleibender
  // Slot-Nummer. Genau diese Paare laufen wir ab.
  function uebersichtsZeilen() {
    if (EINZEL) return [{ slot: String(EINZEL.slot), qid: String(EINZEL.qid), name: EINZEL.name || 'Diese Aufgabe', summe: null }];
    const t = document.querySelector('table');
    if (!t) return [];
    return [...t.querySelectorAll('tbody tr')].map((tr) => {
      const href = [...tr.querySelectorAll('a')]
        .map((a) => a.getAttribute('href') || '').find((h) => /slot=/.test(h)) || '';
      const slot = (href.match(/slot=(\d+)/) || [])[1];
      const qid = (href.match(/qid=(\d+)/) || [])[1];
      if (!slot || !qid) return null;
      // Letzte Spalte ("Summe") traegt die tatsaechliche Anzahl Versuche dieser
      // Frage — damit weiss das Auslesen, wann es wirklich alle beisammen hat
      // (siehe seiteAllerVersucheLaden), statt sich auf einen einzelnen Ladeversuch
      // zu verlassen.
      const summeTxt = tr.cells[5] ? tr.cells[5].textContent.trim() : '';
      const summeM = summeTxt.match(/^(\d+)/);
      return {
        slot, qid, name: (tr.cells[2] ? tr.cells[2].textContent.trim() : ''),
        summe: summeM ? +summeM[1] : null
      };
    }).filter(Boolean);
  }

  const txt = (n) => {
    if (!n) return '';
    return n.innerHTML
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
  };

  // Essay-Antwortfeld: je nach Antwortformat der Frage ist es entweder ein
  // Textarea (Format „Nur Text"/„Text mit Zeilenumbruechen") oder — bei
  // Format „HTML-Editor" — ein schreibgeschuetztes DIV mit derselben Klasse.
  // Beides zaehlt als Essay-Frage, sonst werden HTML-Editor-Fragen als
  // "kein Essay" verworfen und tauchen nirgends mehr auf.
  const essayFeld = (q) =>
    q.querySelector('textarea.qtype_essay_response, div.qtype_essay_response');
  // Kopfzeile der Layout-Vorlage („Deine Antwort · AFB II (2 Punkte)") gehoert nicht
  // zur Schuelerantwort — sonst zaehlt sie als Text und als moegliche Sprachfehler.
  // Mit Teilen: „a · Deine Antwort AFB I (1 Punkt)" — wird zu „a) ", damit die KI die Teile auseinanderhaelt.
  const VORLAGE_KOPF_RE = /^\s*Deine Antwort(?:\s+AFB\s+I{1,3}(?:\s*[-–]\s*I{1,3})?)?(?:\s+\(\s*[\d.,]+\s+Punkte?\s*\))?\s*/i;
  const VORLAGE_TEIL_RE = /(^|\s)([a-h])\s*·\s*Deine Antwort(?:\s+AFB\s+I{1,3}(?:\s*[-–]\s*I{1,3})?)?(?:\s+\(\s*[\d.,]+\s+Punkte?\s*\))?\s*/gi;
  // Kopfzeile einer AELTEREN Antwortvorlage („Atommodell … AFB II · Kernaussage (2 Punkte)").
  const ALT_KOPF_RE = /^\s*(?:[^\n]{0,120}?\s)?AFB\s+I{1,3}(?:\s*[-–]\s*I{1,3})?\s*·[^()\n]{0,80}\(\s*[\d.,]+\s+Punkte?\s*\)\s*/i;
  const essayWert = (feld) =>
    (feld.tagName === 'TEXTAREA' ? (feld.value || '') : txt(feld))
      .replace(ALT_KOPF_RE, '')
      .replace(VORLAGE_TEIL_RE, (m0, vor, b) => (vor ? '\n' : '') + b.toLowerCase() + ') ')
      .replace(VORLAGE_KOPF_RE, '').trim()
      .replace(/^(?:[a-h]\)\s*)+$/i, '');   // nur leere Teilkaesten = leere Antwort

  // Live am 11.09.2026 bestaetigt (siehe seiteMitFeldernLaden weiter unten):
  // Bei einer Zufallsfrage mit mehr Versuchen, als Moodle auf einen Schlag zeigt,
  // liefert dieselbe Bewertungsseiten-URL bei wiederholtem Laden eine ANDERE
  // Teilmenge der .que-Bloecke. Ein einzelner fetchDoc()-Aufruf beim Auslesen
  // (Freitextaufgaben durchsuchen) uebernimmt deshalb manchmal nur einen Teil der
  // echten Versuche — die fehlenden werden nie an die KI geschickt und bleiben für
  // immer unbewertet, ohne dass das auffaellt. Deshalb ueber mehrere Ladeversuche
  // hinweg SAMMELN (nach Versuchs-id dedupliziert), bis entweder die aus der
  // Uebersichtstabelle bekannte Gesamtzahl (zeile.summe) erreicht ist oder die
  // Versuche aufgebraucht sind.
  async function seiteAllerVersucheLaden(zeile, versucheMax) {
    let letzterDoc = null;
    const gesehen = new Set();
    const bloecke = [];
    for (let i = 0; i < versucheMax; i++) {
      if (i > 0) await warte(500);
      const doc = await fetchDoc(seiteUrl(zeile.slot, zeile.qid, 'all'));
      letzterDoc = doc;
      [...doc.querySelectorAll('.que')].forEach((q) => {
        const m = (q.id || '').match(/^question-(\d+)-(\d+)$/);
        const key = m ? m[1] : q.id;
        if (key && !gesehen.has(key)) { gesehen.add(key); bloecke.push(q); }
      });
      if (zeile.summe != null && bloecke.length >= zeile.summe) break;
    }
    return { bloecke, letzterDoc };
  }

  async function werteSeiteAus(bloecke, zeile) {
    if (!bloecke.length) return null;
    // Nur Essay-Fragen: die Antwort steht in einem readonly-Feld mit dieser
    // Klasse (Textarea oder DIV, siehe essayFeld). Cloze- und
    // Kurzantwortfragen haben sie nicht.
    if (!bloecke.some((q) => essayFeld(q))) return null;

    const erste = bloecke[0];
    const gi = erste.querySelector('.graderinfo');
    let horizontRoh = gi ? gi.innerText.trim() : '';
    const fassung = fassungAusAbzeichen(erste);
    let nachgeladen = null;
    // Meldet das Abzeichen eine neuere Fassung, gilt deren Horizont: Er ist der
    // aktuelle Massstab der Lehrkraft, auch wenn der Versuch an einer aelteren haengt.
    if (fassung && fassung.gesamt > fassung.ist) {
      try {
        const neu = await neuesterHorizont(zeile.qid);
        if (neu && neu.horizont) { horizontRoh = neu.horizont; nachgeladen = fassung.gesamt; }
      } catch (e) { /* dann bleibt der Stand der Bewertungsseite */ }
    }
    const frage = {
      name: zeile.name, qid: zeile.qid, slot: zeile.slot,
      aufgabe: txt(erste.querySelector('.qtext')),
      zustaendig: zustaendigkeit(horizontRoh),
      vonFreitext: /moodle[-\s]?ai[-\s]?freitext/i.test(horizontRoh),
      ...(() => { const m = metaAusText(horizontRoh); return { fach: m.fach || '', jahrgang: m.jahrgang || '', niveau: m.niveau || '' }; })(),
      horizontProzent: prozentAusHorizont(horizontRoh),
      feedback: (horizontRoh.match(/^\s*\[?\s*feedback\s*[:\-]?\s*(kurz|mittel)\s*\]?\s*$/im) || [])[1] || 'Mittel',
      horizont: horizontBereinigt(horizontRoh),
      max: num((erste.querySelector('input[name$="-maxmark"]') || {}).value) ?? 1,
      ...(nachgeladen ? { horizont_aus_fassung: nachgeladen } : {})
    };

    const versuche = [];
    bloecke.forEach((q) => {
      const m = (q.id || '').match(/^question-(\d+)-(\d+)$/);
      if (!m) return;
      const antwortFeld = essayFeld(q);
      const mark = q.querySelector('input[name$="-mark"]');
      const komm = q.querySelector('textarea[name$="-comment"]');
      if (!antwortFeld || !mark) return;
      // Leeres Punktefeld = noch nicht bewertet. Der Zustandstext taugt nicht:
      // er sagt auch bei unbewerteten Essays „Vollständig".
      const schonBewertet = String(mark.value || '').trim() !== '';
      versuche.push({
        frage: zeile.name, qid: zeile.qid, slot: zeile.slot, qubaid: m[1],
        antwort: essayWert(antwortFeld),
        max: num((q.querySelector('input[name$="-maxmark"]') || {}).value) ?? frage.max,
        markfeld: mark.name,
        kommentarfeld: komm ? komm.name : null,
        hat_kommentar: !!(komm && komm.value.trim()),
        schon_bewertet: schonBewertet,
        // Nur fuer den Vergleich in der Vorschau — geht NICHT an die KI (sonst ankert sie daran).
        bisher: schonBewertet ? num(mark.value) : null
      });
    });
    return { frage, versuche };
  }

  async function ernten(onProgress, mitBereits) {
    const zeilen = uebersichtsZeilen();
    if (!zeilen.length) throw new Error('Auf dieser Seite steht keine Fragenübersicht.');

    const fragen = {}, fremde = {}, antworten = [], fehler = [];
    let fertig = 0, uebersprungen = 0, ohneHorizont = 0, keinEssay = 0;
    let fuerGrader = 0, ohneMarker = 0, strengUebersprungen = 0;
    const warteschlange = [...zeilen];

    // War 4 parallele Worker. Live am 11.09.2026 blieb trotz Sammel-Logik in
    // seiteAllerVersucheLaden weiterhin vereinzelt ein Versuch unentdeckt — der
    // Verdacht: Moodles Bewertungsseite haelt fuer die Zufallsfragen-Anzeige
    // offenbar session-gebundenen Zustand, und gleichzeitige fetch()-Aufrufe an
    // report.php fuer VERSCHIEDENE Fragen (verschiedene qid, gleiche Session)
    // koennen sich dabei gegenseitig stoeren — genau das Muster einer instabilen
    // Teilmenge, das mehr Ladeversuche allein nicht zuverlaessig beheben. Deshalb
    // nacheinander statt parallel: langsamer, aber nur noch ein Request gleichzeitig
    // gegen diese Seite.
    await Promise.all(Array.from({ length: 1 }, async () => {
      while (warteschlange.length) {
        const z = warteschlange.shift();
        try {
          const { bloecke } = await seiteAllerVersucheLaden(z, EINZEL ? 3 : 8);
          const res = await werteSeiteAus(bloecke, z);
          if (!res) { keinEssay++; }
          else {
            const schluessel = res.frage.name || (z.slot + '|' + z.qid);
            const zust = res.frage.zustaendig;
            // Fremd ist eine Frage, die ausdruecklich dem Grader gehoert — und im
            // strengen Modus zusaetzlich jede ohne Coach-Marker.
            const fuerAnderen = zust === 'grader';
            const strengRaus = optionen.nurMitMarker && zust !== 'coach' && !EINZEL;
            if (fuerAnderen || strengRaus) {
              if (!fremde[schluessel]) {
                fremde[schluessel] = {
                  ...res.frage,
                  grund: fuerAnderen ? 'grader' : 'kein-marker'
                };
                if (fuerAnderen) fuerGrader++; else strengUebersprungen++;
              }
            } else {
              if (!fragen[schluessel]) {
                fragen[schluessel] = res.frage;
                if (!res.frage.horizont) ohneHorizont++;
                else if (!zust) ohneMarker++;
              }
              res.versuche.forEach((v) => {
                if (v.schon_bewertet && !mitBereits) { uebersprungen++; return; }
                // Leere Antworten kommen MIT: sie bleiben sonst für immer unbewertet.
                // Die KI gibt dort 0 % Inhalt und schreibt trotzdem eine Rückmeldung.
                antworten.push(v);
              });
            }
          }
        } catch (e) {
          fehler.push({ frage: z.name, meldung: e.message });
        }
        fertig++;
        onProgress(fertig, zeilen.length, antworten.length);
      }
    }));

    antworten.forEach((a, i) => { a.nr = i + 1; });
    return {
      meta: {
        test: (document.title || '').replace(/\s*\|.*$/, '').trim(),
        kurs: (() => {
          const a = [...document.querySelectorAll('a')]
            .find((x) => /\/course\/view\.php/.test(x.getAttribute('href') || ''));
          return a ? a.textContent.trim() : '';
        })(),
        cmid: CMID,
        datum: new Date().toISOString().slice(0, 10),
        fragen_geprueft: zeilen.length,
        fragen_mit_horizont: Object.values(fragen).filter((f) => f.horizont).length,
        fragen_ohne_horizont: ohneHorizont,
        fragen_fuer_grader: fuerGrader,
        fragen_ohne_marker: ohneMarker,
        streng_uebersprungen: strengUebersprungen,
        nur_mit_marker: !!optionen.nurMitMarker,
        keine_freitextfrage: keinEssay,
        antworten: antworten.length,
        uebersprungen,
        max_sprachabzug_prozent: rsStandard()
      },
      fragen, fremde, antworten, fehler
    };
  }

  /* ================= Zurückschreiben: Punkte und Feedback ================= */

  function formularFelder(form) {
    const p = new URLSearchParams();
    [...form.elements].forEach((f) => {
      if (!f.name || f.disabled) return;
      // form.elements enthält auch FIELDSET-Elemente mit name (Moodle vergibt
      // z. B. „graderinfoheader"). Die haben kein value und würden als
      // „undefined" mitgeschickt. Nur echte Eingabefelder übernehmen.
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName)) return;
      if (f.type === 'file' || f.type === 'submit') return;
      if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) return;
      if (f.tagName === 'SELECT') {
        [...f.selectedOptions].forEach((o) => p.append(f.name, o.value));
      } else { p.append(f.name, f.value); }
    });
    return p;
  }

  function gruppieren(liste) {
    const map = new Map();
    (liste || []).forEach((e) => {
      const k = e.slot + '|' + e.qid;
      if (!map.has(k)) map.set(k, { slot: e.slot, qid: e.qid, eintraege: [] });
      map.get(k).eintraege.push(e);
    });
    return [...map.values()];
  }

  async function trockenlauf(liste, onLog, onProgress) {
    const gruppen = gruppieren(liste);
    let ok = 0, fehler = 0, fertig = 0;
    for (const g of gruppen) {
      try {
        const doc = await fetchDoc(seiteUrl(g.slot, g.qid, 'all'));
        const form = doc.querySelector('form#manualgradingform');
        if (!form) throw new Error('Bewertungsformular nicht gefunden');
        const felder = formularFelder(form);
        g.eintraege.forEach((e) => {
          const fehlt = [];
          if (!felder.has(e.markfeld)) fehlt.push('Punktefeld');
          if (e.text && e.kommentarfeld && !felder.has(e.kommentarfeld)) fehlt.push('Kommentarfeld');
          if (fehlt.length) {
            fehler++; onLog(`✗ ${fehlt.join(' und ')} fehlt — ${e.frage}`, versuchLink(e));
          } else ok++;
        });
      } catch (e) {
        fehler += g.eintraege.length;
        onLog(`✗ Seite ${g.eintraege[0].frage}: ${e.message}`);
      }
      fertig++; onProgress(fertig, gruppen.length);
    }
    return { ok, fehler, gruppen: gruppen.length, trocken: true };
  }

  // Bei Zufallsfragen-Pools liefert dieselbe Bewertungsseiten-URL nicht immer
  // alle Versuche in einem Aufruf zurueck (Moodle-seitige Anzeige-Unregelmaessigkeit,
  // kein Fehler in unserer Logik) - ein fehlendes Punktefeld deshalb erst nach ein
  // paar erneuten Ladeversuchen als wirklich fehlend werten.
  // Live am 11.09.2026 bestaetigt: dieselbe URL liefert bei mehr Versuchen, als
  // Moodle auf einmal anzeigt, bei jedem Aufruf eine ANDERE Teilmenge der Zeilen
  // (z. B. 5 von 7, aber nicht immer dieselben 5) — keine feste Seitengroesse mit
  // stabiler Sortierung. Ein reines Neuladen-und-Ersetzen verliert deshalb Felder,
  // die im vorherigen Versuch schon da waren. Stattdessen ueber alle Versuche
  // hinweg SAMMELN: jedes einmal gesehene Feld bleibt erhalten, auch wenn eine
  // spaetere Seite es nicht mehr zeigt.
  async function seiteMitFeldernLaden(url, benoetigteFelder, versuche) {
    let form = null;
    const gesammelt = new URLSearchParams();
    const gesehen = new Set();
    for (let i = 0; i < versuche; i++) {
      if (i > 0) await warte(500); // Moodle etwas Zeit geben, bevor erneut geladen wird
      const doc = await fetchDoc(url);
      const f = doc.querySelector('form#manualgradingform');
      if (!f) throw new Error('Bewertungsformular nicht gefunden');
      form = f; // neuestes Formular liefert Action-URL und Submit-Button
      const felder = formularFelder(f);
      [...new Set(felder.keys())].forEach((name) => {
        if (!gesehen.has(name)) { gesammelt.set(name, felder.get(name)); gesehen.add(name); }
      });
      const alleDa = benoetigteFelder.every((name) => gesammelt.has(name));
      if (alleDa) break;
    }
    return { form, felder: gesammelt };
  }

  async function eintragen(liste, kiHinweis, onLog, onProgress) {
    const gruppen = gruppieren(liste);
    let ok = 0, fehler = 0, fertig = 0;
    // Seit 1.8.8: Fehlgeschlagenes wird gesammelt, nicht nur gezaehlt — so kann
    // eintragenMitWiederholung() gezielt nur diese Eintraege erneut versuchen,
    // statt dass Arne selbst mehrfach auf „Eintragen" klicken muss.
    const fehlgeschlagen = [];
    for (const g of gruppen) {
      try {
        const url = seiteUrl(g.slot, g.qid, 'all');
        const benoetigt = g.eintraege.map((e) => e.markfeld);
        const { form, felder: geladen } = await seiteMitFeldernLaden(url, benoetigt, 8);
        let felder = geladen;
        const gesetzt = [];
        g.eintraege.forEach((e) => {
          if (!felder.has(e.markfeld)) {
            fehler++; fehlgeschlagen.push(e);
            onLog(`✗ Punktefeld nicht auf der Seite — ${e.frage}`, versuchLink(e));
            return;
          }
          felder.set(e.markfeld, komma(e.punkte));
          if (e.text && e.kommentarfeld && felder.has(e.kommentarfeld)) {
            // e.text ist bei der neuen Form schon fertiges HTML (aus rueckmeldungHtml);
            // eine alte Fassung mit reinem Text bekommt hier ihre Absaetze.
            let html = e.text.trim();
            if (!/<[a-z]/i.test(html)) html = '<p>' + html.replace(/\n+/g, '</p><p>') + '</p>';
            if (kiHinweis) {
              const satz = (optionen.kiHinweisText || KI_HINWEIS_STANDARD).trim();
              if (satz) html += '<p><em><small>' + escapeHtml(satz) + '</small></em></p>';
            }
            felder.set(e.kommentarfeld, html);
          }
          gesetzt.push(e);
        });
        if (gesetzt.length) {
          const submit = [...form.elements].find((f) => f.type === 'submit' && f.name);
          if (submit) felder.set(submit.name, submit.value);
          const action = new URL(form.getAttribute('action') || url, url).href;
          const antwort = await fetch(action, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: felder.toString()
          });
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status + ' beim Speichern');
          // Gegenprobe mit bis zu drei Ladeversuchen: dieselbe Moodle-seitige
          // Anzeige-Unregelmaessigkeit, die schon beim Auslesen manchmal ein
          // Punktefeld auf der ersten Seite fehlen laesst (siehe
          // seiteMitFeldernLaden), trifft auch die Kontrolle danach — ein
          // gespeicherter Wert wuerde sonst faelschlich als fehlgeschlagen
          // gemeldet.
          let ausstehend = gesetzt.slice();
          const bestaetigtBei = new Map();
          for (let versuch = 0; versuch < 8 && ausstehend.length; versuch++) {
            if (versuch > 0) await warte(500);
            const kontrolle = await fetchDoc(url);
            ausstehend = ausstehend.filter((e) => {
              const f = kontrolle.querySelector(`input[name="${CSS.escape(e.markfeld)}"]`);
              const ist = f ? num(f.value) : null;
              if (ist !== null && Math.abs(ist - e.punkte) < 0.005) {
                bestaetigtBei.set(e, ist);
                return false;
              }
              bestaetigtBei.set(e, ist); // letzter bekannter Stand, falls es dabei bleibt
              return true;
            });
          }
          gesetzt.forEach((e) => {
            if (!ausstehend.includes(e)) {
              ok++; onLog(`✓ ${e.frage} — ${komma(e.punkte)} von ${komma(e.max)}`, versuchLink(e));
            } else {
              fehler++; fehlgeschlagen.push(e);
              const ist = bestaetigtBei.get(e);
              onLog(`✗ ${e.frage} — steht auf ${ist == null ? 'keinem Wert' : komma(ist)} `
                  + `statt ${komma(e.punkte)}`, versuchLink(e));
            }
          });
        }
      } catch (e) {
        fehler += g.eintraege.length;
        fehlgeschlagen.push(...g.eintraege);
        onLog(`✗ ${g.eintraege[0].frage}: ${e.message}`);
      }
      fertig++; onProgress(fertig, gruppen.length);
    }
    return { ok, fehler, gruppen: gruppen.length, fehlgeschlagen };
  }

  // Wiederholt automatisch nur die fehlgeschlagenen Eintraege, statt dass Arne
  // selbst mehrfach auf „Eintragen" klicken muss (gemeldet 17.09.2026: bis zu
  // 5 Klicks noetig). Dieselbe Moodle-seitige Anzeige-Unregelmaessigkeit, die
  // schon in seiteMitFeldernLaden abgefangen wird (dieselbe URL liefert bei
  // vielen Versuchen nicht immer alle Felder), tritt manchmal auch nach den
  // eingebauten 8 Ladeversuchen noch auf — ein zeitversetzter, kompletter neuer
  // Durchlauf faengt das meist ab. 1,5 s Pause zwischen den Runden geben Moodle
  // Zeit, statt sofort erneut auf denselben Zustand zu treffen.
  const EINTRAGEN_WIEDERHOLUNGEN = 3;

  async function eintragenMitWiederholung(liste, kiHinweis, onLog, onProgress) {
    let rest = liste;
    let ok = 0, gruppen = 0, versuche = 0;
    for (let v = 1; v <= EINTRAGEN_WIEDERHOLUNGEN && rest.length; v++) {
      versuche = v;
      if (v > 1) {
        onLog(`↻ Versuch ${v}/${EINTRAGEN_WIEDERHOLUNGEN}: ${rest.length} `
          + `Eintrag/Einträge erneut …`);
        await warte(1500);
      }
      const r = await eintragen(rest, kiHinweis, onLog, onProgress);
      ok += r.ok; gruppen += r.gruppen;
      rest = r.fehlgeschlagen;
    }
    return { ok, fehler: rest.length, gruppen, versuche };
  }

  /* ================= Zurückschreiben: Erwartungshorizont ================= */

  // ---- Den Horizont der NEUESTEN Fragenfassung holen -------------------------
  //
  // Auf der Bewertungsseite steht immer die Fassung, mit der der Versuch geschrieben
  // wurde ("v1 (von 5)"). Aenderungen am Horizont landen aber in einer neuen Fassung,
  // und die sieht man dort nie. Wer den Horizont nachtraegt oder neu schreibt, bewertet
  // sonst weiter nach dem alten Massstab — und der Marker fehlt scheinbar.
  //
  // Der Weg zur neuesten Fassung ist dreistufig, weil Moodle keine Abkuerzung anbietet:
  // Bearbeiten-Formular der bekannten id -> "Verlauf"-Link mit entryid -> letzte Zeile
  // der Verlaufstabelle -> deren Frage-id. Das laeuft nur fuer Fragen, deren Abzeichen
  // eine neuere Fassung meldet, und nur einmal je Frage.
  function fassungAusAbzeichen(block) {
    const b = [...block.querySelectorAll('.badge, .info span')]
      .map((e) => e.textContent.trim())
      .find((t) => /^v\d+\s*\(von\s*\d+\)$/i.test(t));
    const m = b && b.match(/^v(\d+)\s*\(von\s*(\d+)\)$/i);
    return m ? { ist: +m[1], gesamt: +m[2] } : null;
  }

  async function neuesterHorizont(qid) {
    // Schritt 1: Formular der bekannten Fassung, darin der Verlauf-Link.
    const doc = await fetchDoc(fragenUrl(qid));
    const verlauf = [...doc.querySelectorAll('a')]
      .find((a) => /history\.php/.test(a.getAttribute('href') || ''));
    if (!verlauf) return null;

    // Schritt 2: Verlaufstabelle. Die letzte Zeile ist die neueste Fassung.
    const hist = await fetchDoc(new URL(verlauf.getAttribute('href'), fragenUrl(qid)).href);
    const zeilen = [...hist.querySelectorAll('table tbody tr')];
    if (!zeilen.length) return null;
    let neueId = null;
    for (const tr of zeilen) {
      for (const a of tr.querySelectorAll('a')) {
        const m = (a.getAttribute('href') || '').match(/question\.php\?[^"']*?\bid=(\d+)/);
        if (m) { neueId = m[1]; break; }
      }
    }
    if (!neueId || String(neueId) === String(qid)) return null;

    // Schritt 3: Horizont aus dem Formular der neuesten Fassung.
    const neu = await fetchDoc(fragenUrl(neueId));
    const feld = neu.querySelector('[name="graderinfo[text]"]');
    if (!feld) return null;
    // DOMParser statt innerHTML-Zuweisung: dekodiert HTML genauso, fuehrt aber
    // keine Skripte aus und loest AMOs "Unsafe assignment to innerHTML"-Warnung
    // nicht aus, da hier keine .innerHTML gesetzt wird.
    const geparst = new DOMParser().parseFromString(String(feld.value || ''), 'text/html');
    const text = (geparst.body ? geparst.body.textContent : '').trim();
    return text ? { qid: neueId, horizont: text } : null;
  }

  // Schreibt den Horizont in das Moodle-Feld graderinfo der Frage. Technisch
  // dasselbe Muster wie beim Punkte-Eintragen: Bearbeiten-Formular vollständig
  // einsammeln, ein Feld überschreiben, absenden, danach gegenprüfen.
  // ACHTUNG: Das ändert die Fragensammlung, nicht nur eine Bewertung.
  // Schreibt den Horizont als reinen Text (wird zu <p>…<br>…</p>). Der
  // Zustaendigkeits-Marker wird vorangestellt, falls er noch fehlt — so traegt jeder
  // vom Coach erzeugte Horizont ihn automatisch.
  function horizontSchreiben(qid, text, nurPruefen) {
    const mitMarker = MARKER_RE.test(ersteZeile(text)) ? text : MARKER_ZEILE + '\n' + text;
    const mitProzent = mitMarker;   // ab 0.9 keine Prozentzeile mehr im Horizont
    return graderinfoSchreiben(
      qid,
      () => '<p>' + escapeHtml(mitProzent).replace(/\n/g, '<br>') + '</p>',
      mitProzent, nurPruefen);
  }

  // Stellt Marker- UND Rechtschreibungs-Zeile vor einen VORHANDENEN Horizont. Der
  // bisherige Inhalt wird unveraendert uebernommen — er ist HTML, und ihn ueber den
  // Textweg neu zu schreiben wuerde Absaetze und Listen zerstoeren.
  function markerNachtragen(qid) {
    const kopf = '<p>' + MARKER_ZEILE + '</p>';
    return graderinfoSchreiben(
      qid,
      (vorher) => kopf + (vorher || ''),
      MARKER_ZEILE, false);
  }

  // `mach(vorherigerFeldwert)` liefert den neuen Feldwert; `pruefText` ist der Text,
  // an dem die Gegenprobe nach dem Speichern haengt.
  async function graderinfoSchreiben(qid, mach, pruefText, nurPruefen) {
    const url = fragenUrl(qid);
    const doc = await fetchDoc(url);
    // Die id des Fragenformulars ist pro Aufruf zufällig (mform1_XXXXXXX), und das
    // erste form[method=post] der Seite ist der Bearbeitungsmodus-Schalter im Kopf.
    // Verlässlich ist nur: das Formular, das das graderinfo-Feld enthält.
    const form = [...doc.forms].find((f) => f.querySelector('[name="graderinfo[text]"]'))
              || [...doc.forms].find((f) => f.querySelector('[name*="graderinfo"]'));
    if (!form) {
      throw new Error(doc.querySelector('form#login')
        ? 'Moodle hat auf die Anmeldeseite umgeleitet — bist du noch angemeldet?'
        : 'Bearbeiten-Formular nicht gefunden (ist es eine Freitextfrage?)');
    }
    const felder = formularFelder(form);
    const schluessel = 'graderinfo[text]';
    if (!felder.has(schluessel)) throw new Error('Feld „graderinfo[text]" nicht im Formular');
    if (nurPruefen) return { ok: true, feld: schluessel, vorher: felder.get(schluessel) || '' };

    felder.set(schluessel, mach(felder.get(schluessel) || ''));
    // Live belegt (28.08.2026): updatebutton „Speichern und weiter bearbeiten",
    // submitbutton „Änderungen speichern", cancel „Abbrechen". Wir nehmen
    // submitbutton — cancel darf auf keinen Fall mitgehen.
    const submit = [...form.querySelectorAll('input[type=submit],button[type=submit]')]
      .find((f) => f.name === 'submitbutton')
      || [...form.querySelectorAll('input[type=submit],button[type=submit]')]
      .find((f) => f.name && f.name !== 'cancel');
    if (!submit) throw new Error('Kein Speichern-Knopf im Formular');
    felder.set(submit.name, submit.value);
    const action = new URL(form.getAttribute('action') || url, url).href;
    const antwort = await fetch(action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: felder.toString()
    });
    if (!antwort.ok) throw new Error('HTTP ' + antwort.status + ' beim Speichern');

    // Moodle legt beim Speichern eine NEUE Fragenversion mit NEUER id an. Die alte id
    // liefert weiterhin den alten Stand — eine Gegenprobe dort meldet fälschlich
    // "Text nicht angekommen", obwohl gespeichert wurde (belegt 05.09.2026 an acht
    // Fragen: v2 war da und trug den Marker, die Gegenprobe las v1). Die neue id steht
    // im Parameter lastchanged der Adresse, auf die Moodle nach dem Speichern leitet.
    let neueId = null;
    try { neueId = new URL(antwort.url).searchParams.get('lastchanged'); } catch (e) { /* egal */ }
    const pruefUrl = neueId ? fragenUrl(neueId) : url;

    const kontrolle = await fetchDoc(pruefUrl);
    const feld = kontrolle.querySelector(`[name="${CSS.escape(schluessel)}"]`);
    const drin = feld ? String(feld.value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const soll = String(pruefText).replace(/\s+/g, ' ').trim().slice(0, 30);
    if (!drin || !drin.includes(soll.slice(0, 20))) {
      throw new Error(neueId
        ? 'Text nicht angekommen (geprüft an der neuen Fragenversion)'
        : 'Nicht gegengeprüft: Moodle hat keine neue Fragen-Nummer zurückgemeldet. '
          + 'Sieh in der Frage selbst nach — gespeichert sein kann es trotzdem.');
    }
    return { ok: true, feld: schluessel, neueId };
  }

  /* ================= Prompts ================= */

  const DATEN_PLATZHALTER = '[MOODLE_AI_COACH_DATEN]';

  // Fuer wen die Rueckmeldung geschrieben wird – aus dem Jahrgang der Horizonte.
  function leserKurz() {
    const jg = rolleAktuell().jahrgang;
    return jg ? 'Jahrgang ' + jg : 'Sekundarstufe I';
  }
  function leserSatz() {
    const jg = rolleAktuell().jahrgang;
    if (stufeVon(jg) === 'sek2') {
      return `Es lesen Schülerinnen und Schüler der Oberstufe (Jahrgang ${jg}). Sie sollen daraus
lernen — also klar, fachlich genau und ohne Umschweife, wie eine Lehrkraft, die einer
Oberstufenschülerin etwas erklärt.`;
    }
    return `Es lesen Schülerinnen und Schüler ${jg ? 'des Jahrgangs ' + jg : 'der Mittelstufe'}, viele davon
schreibschwach. Sie sollen daraus lernen — also schreibst du wie eine Deutschlehrkraft, die
einem Kind dieses Alters etwas erklärt.`;
  }

  function vorlageAktiv() { return optionen.kompaktPrompt ? kompaktPromptVorlage() : bewertungsPromptVorlage(); }

  function bewertungsPromptVorlage() {
    const maxAb = rsStandard();
    return `═══════════════════════════════════════════════════════
MOODLE AI FREITEXT GRADER – BEWERTUNG KURZTEST
═══════════════════════════════════════════════════════

BEGRÜSSUNG
Beginne mit genau diesen drei Punkten, dann folge den Arbeitsanweisungen:
1. „Willkommen beim Moodle AI Freitext Grader."
2. „Ich bewerte kurze Freitextantworten nach dem Erwartungshorizont, der in der
   Aufgabe hinterlegt ist, und schreibe jedem Schüler eine Rückmeldung zur Sprache.
   Entscheiden tust du."
3. „Der „Moodle AI Freitext Grader" wurde von T. Henken und A. Spielhoff entwickelt und ist unter der Lizenz
   CC BY-SA 4.0 veröffentlicht – du darfst ihn frei verwenden, teilen und anpassen,
   solange du ihn nennst."

═══════════════════════════════════════════════════════
BEWERTUNGSMASSSTAB
═══════════════════════════════════════════════════════

${bewertungsKopf(rolleAktuell())}

═══════════════════════════════════════════════════════
AUSGANGSLAGE
═══════════════════════════════════════════════════════

Die Schülerinnen und Schüler haben eine Frage in ein bis drei Sätzen beantwortet.
Zu jeder Aufgabe steht unter „horizont" der Erwartungshorizont der Lehrkraft: die
Kernaussage, was enthalten sein muss, was auch als richtig gilt und – am wichtigsten –
eine Abstufung, welcher Prozentsatz wofür vergeben wird.

Deine Aufgabe hat zwei Teile, die STRIKT getrennt bleiben:
  1. INHALT  – wie gut trifft die Antwort den Erwartungshorizont?
  2. SPRACHE – welche Sprachfehler stehen im Text?

═══════════════════════════════════════════════════════
TEIL 1 – INHALT
═══════════════════════════════════════════════════════

Vergib einen Prozentwert nach der Abstufung, die im Horizont unter „Inhalt:" steht.
Halte dich an diese Stufen. Erfinde keine Zwischenwerte und keine eigene Skala –
die Lehrkraft hat für diese Aufgabe bereits entschieden.

Steht im Horizont ausnahmsweise keine Abstufung, benutze 100 / 75 / 50 / 25 / 0.

Es gelten die Grundregeln oben. Dazu: Eine Antwort in Stichworten ist inhaltlich nicht
schlechter – der Satzbau wird in Teil 2 bewertet, nicht hier.

═══════════════════════════════════════════════════════
TEIL 2 – SPRACHE
═══════════════════════════════════════════════════════

Du zählst die Fehler. Den Abzug rechnet die Erweiterung daraus selbst aus –
schreibe nirgends einen Abzug oder eine Punktzahl hin.

Zähle als Fehler, was eine strenge Deutschlehrkraft anstreichen würde:

SCHWER (zählt doppelt):
  • Satz ohne Prädikat oder abgebrochener Satz
  • Satzbau so falsch, dass man den Satz zweimal lesen muss

NORMAL (zählt einfach):
  • falscher Fall oder falscher Numerus („die Atome verbindet sich")
  • falsche Zeitform
  • Nomen kleingeschrieben oder Verb großgeschrieben
  • Fachbegriff falsch geschrieben
  • sonstiger Rechtschreibfehler
  • fehlender Punkt am Satzende oder fehlendes Komma vor dem Nebensatz
  • Umgangssprache statt Fachsprache („das Zeug", „macht kaputt")

Zählregeln:
• Derselbe Fehler im selben Wort zählt nur einmal, auch wenn das Wort mehrfach
  vorkommt.
• Zähle nur, was du benennen kannst. Ein Bauchgefühl ist kein Fehler.
• Eine leere Antwort hat keine Sprachfehler – dort ist der Inhalt 0 %.

${rsPromptSatz(maxAb, 'der Aufgabenpunkte')}

═══════════════════════════════════════════════════════
TEIL 3 – RÜCKMELDUNG
═══════════════════════════════════════════════════════

Das Feedback ist das eigentliche Produkt. ${leserSatz()}

SPRACHE — so schreibst du:
• Kurze Hauptsätze. Ein Gedanke pro Satz. KEINE verschachtelten Sätze.
• Sag die Regel, nicht nur die Korrektur.
  Schwach: „Der Name wird großgeschrieben."
  Gut:     „Vor „Löschsand" kannst du „der" setzen. Solche Wörter sind Nomen. Nomen
            schreibt man groß: Löschsand."
• Stell falsch und richtig direkt gegenüber: löchsand → Löschsand.
  Lange Satzzitate sind für schwache Leser schwerer als ein Wortpaar.
• Kein Fachjargon ohne Erklärung. „Nomen", „Satzende", „Komma" sind bekannt;
  „Prädikat", „Kasus", „Numerus" erklärst du in eigenen Worten.
• Höchstens zwei Korrekturen je Zeile. Der Rest bleibt ungesagt — lieber weniger,
  das dafür verstanden.
• Freundlich und sachlich. Keine Floskeln, keine Emojis, kein Ausrufezeichen-Gewitter.

GLIEDERUNG — du schreibst KEINEN Fließtext, sondern füllst Felder:
Aus ihnen baut die Erweiterung selbst das fertige Feedback mit Überschrift, Umbrüchen
und Unterstreichungen. Schreib deshalb nirgends HTML, keine Sternchen, keine Zeilen-
umbrüche in die Felder.

  lob             – nur bei 95 % und mehr der Punkte: ein Satz Anerkennung,
                    konkret auf die Aufgabe bezogen („Du hast die Aufgabe zum
                    Löschsand richtig gut beantwortet.")
  inhalt          – was inhaltlich fehlte oder falsch war, und wie es richtig heißt.
                    Bei voller Punktzahl: was genau gut war.
  rechtschreibung – nur Rechtschreibung: Groß- und Kleinschreibung, falsch
                    geschriebene Wörter. Mit der Regel dahinter.
  grammatik       – nur Satzbau und Zeichensetzung: fehlende Punkte und Kommas,
                    Sätze ohne Trennung, falsche Fälle und Zeitformen.
  tipp            – freiwillig: EIN Merksatz für das nächste Mal. Nur, wenn er wirklich
                    hilft. Nicht bei jeder Antwort.

Felder, zu denen es nichts zu sagen gibt, lässt du weg. Eine Antwort ohne
Rechtschreibfehler bekommt keine Zeile „Rechtschreibung".

DIE DREI FÄLLE:

1. Volle Punktzahl, keine Sprachfehler → NUR das Feld „lob", sonst nichts.
   Beispiel: lob = „Das hast du super beantwortet — Name und Funktion sind richtig."

2. 95 % oder mehr, aber eine Kleinigkeit → zuerst „lob", dann die eine Zeile, die es
   betrifft. Erst loben, dann verbessern.
   Beispiel: lob = „Du hast die Aufgabe zum Löschsand richtig gut beantwortet."
             grammatik = „Am Satzende fehlt der Punkt."

3. Unter 95 % → kein Lob-Feld. Zuerst „inhalt", dann Rechtschreibung und Grammatik,
   wo nötig.

Die Musterlösung schreibst du NICHT. Liegt die Antwort unter 100 %, hängt die
Erweiterung von sich aus die Zeile „So hättest du es schreiben können: …" an und setzt
dort die Kernaussage aus dem Erwartungshorizont ein — wörtlich das, was die Lehrkraft
hinterlegt hat. Im Feld „inhalt" steht deshalb nur, WAS fehlte oder falsch war, nicht
die fertige Lösung.

═══════════════════════════════════════════════════════
MODUSFRAGE – STELLE SIE ZUERST UND WARTE
═══════════════════════════════════════════════════════

Stelle nach der Begrüßung GENAU DIESE EINE Frage und gib danach nichts weiter aus, bis
die Lehrkraft geantwortet hat:

„Wie sollen wir vorgehen?
  1. GEMEINSAM – Ich zeige dir alle Bewertungen als Tabelle, du kannst einzelne ändern,
     dann gebe ich das JSON aus. (empfohlen)
  2. AUTOMATISCH – Ich bewerte alles und gebe sofort das JSON aus.
Antworte mit 1 oder 2."

AUTOMATISCH ist eine bewusste Wahl der Lehrkraft, kein stiller Standard.
Bei 1 folgst du Schritt 1 und Schritt 2. Bei 2 überspringst du Schritt 1.
Im JSON steht ganz oben "besprochen": true (Modus 1) oder false (Modus 2).

═══════════════════════════════════════════════════════
SCHRITT 1 – TABELLE ZUR PRÜFUNG
═══════════════════════════════════════════════════════

Gib zuerst alle Antworten aus, nach Frage gruppiert. Je Frage eine Kopfzeile mit der
Aufgabe und der Kernaussage aus dem Horizont, darunter die Tabelle:

| Nr | Antwort (gekürzt) | Inhalt | Sprachfehler | Begründung |
|---|---|---|---|---|
| 1 | „Hefe wandelt Zucker in Alkohol um" | 50 | 1 normal | Prozess nicht benannt |

• „Nr" ist die Zahl aus dem Feld „nr" – nicht deine eigene Zählung.
• „Sprachfehler": Anzahl und Art, zum Beispiel „2 normal, 1 schwer".
• „Begründung": ein Halbsatz, der sich auf die Abstufung im Horizont bezieht.
• Keine Punkte- und keine Abzugsspalte. Das rechnet die Erweiterung.

Halte danach an und schreibe:
„Passt das so? Nenne mir die Nummern, die ich ändern soll, zum Beispiel: 3 auf 75.
Wenn alles stimmt, antworte mit ok – dann gebe ich dir das JSON aus."

═══════════════════════════════════════════════════════
SCHRITT 2 – JSON
═══════════════════════════════════════════════════════

Erst nach „ok" (Modus GEMEINSAM) bzw. sofort (Modus AUTOMATISCH):

\`\`\`json
{
  "besprochen": true,
  "bewertungen": [
    { "frage": "alkoholischen Gärung (AFB I)", "qubaid": "2433013", "slot": "6",
      "inhalt": 50,
      "fehler": [
        { "art": "Nomen kleingeschrieben", "stelle": "zucker", "schwer": false }
      ],
      "rueckmeldung": {
        "inhalt": "Du hast geschrieben, dass Hefe Zucker umwandelt. Das stimmt. Es fehlt, was dabei entsteht: Alkohol und Kohlenstoffdioxid.",
        "rechtschreibung": "Vor „Zucker" kannst du „der" setzen. Solche Wörter sind Nomen, und Nomen schreibt man groß: Zucker.",
        "grammatik": "Am Satzende fehlt der Punkt."
      } },
    { "frage": "Löschsand (AFB I)", "qubaid": "2433020", "slot": "6",
      "inhalt": 100, "fehler": [],
      "rueckmeldung": { "lob": "Das hast du super beantwortet — Name und Funktion sind richtig." } }
  ]
}
\`\`\`

• Ein Eintrag je Versuch. „qubaid" und „slot" unverändert aus den Daten.
• „inhalt" ist der Prozentwert aus der Abstufung des Horizonts.
• „fehler" ist die Liste der gezählten Sprachfehler, leer bei fehlerfreiem Text.
• „rueckmeldung" enthält die Felder aus Teil 3. Nur die füllen, zu denen es etwas zu
  sagen gibt; leere Felder ganz weglassen. Jedes Feld ist ein oder zwei ganze Sätze,
  ohne Zeilenumbruch und ohne Formatierungszeichen — Überschrift, Absätze und
  Unterstreichungen setzt die Erweiterung selbst.
• JEDER Eintrag bekommt eine Rückmeldung, auch die fehlerfreien: dort steht das
  Lob-Feld allein.
• Keine Punktzahlen, kein Abzug, keine Feldnamen.
• WICHTIG – Anführungszeichen im JSON: Willst du in einem Rückmeldungstext ein Wort
  hervorheben oder ein Zitat setzen, benutze dafür EINFACHE Anführungszeichen ('so')
  oder schreibe es ohne Anführungszeichen. Gerade doppelte Anführungszeichen ("so")
  NIEMALS in einem JSON-Textfeld verwenden – das ist dasselbe Zeichen wie die
  JSON-Begrenzung und macht das ganze JSON kaputt. Das ist schon mehrfach passiert.

Schreibe darunter: „Kopiere diesen Block in die Erweiterung, Reiter „2 · Eintragen" —
die Prüfung startet beim Einfügen von selbst."

═══════════════════════════════════════════════════════
SCHRITT 3 – HORIZONT NACHZIEHEN (nur wenn korrigiert wurde)
═══════════════════════════════════════════════════════

Hat die Lehrkraft in Schritt 1 Prozentwerte geändert, ist das mehr als eine
Einzelfallentscheidung: Der Horizont bildet ihren Maßstab an dieser Stelle nicht ab
und würde beim nächsten Durchgang denselben Fehler wieder erzeugen.

Deshalb NACH dem JSON – aber nur, wenn tatsächlich korrigiert wurde:

1. Nenne je betroffener Frage in einem Satz, welche Regel sich aus der Korrektur
   ergibt. Nicht „Nr. 7 wurde auf 100 gesetzt", sondern die dahinterliegende
   Entscheidung: „Beim Löschsand reicht ‚löscht Brände' für 100 % – der Metallbrand
   muss nicht genannt werden."
2. Sag dazu, was sich im Horizont ändern müsste: meist wandert ein Teilaspekt von
   „Muss enthalten" nach „Auch richtig", und die betroffene Prozentstufe entfällt
   oder wird neu beschrieben.
3. Biete an, die Horizonte dieser Fragen neu zu schreiben, mit dem Weg dorthin:
   „Reiter 3 · Horizont, Häkchen ‚Auch Fragen einbeziehen, die schon einen Horizont
   haben' setzen, Prompt kopieren – ich baue die Korrekturen dann direkt ein."
4. Merke dir die Korrekturen für diesen Fall, damit sie in den neuen Horizont
   einfließen, wenn der Horizont-Prompt gleich nachkommt.

Wurde nichts geändert, lässt du diesen Schritt ersatzlos weg – kein „hier gab es
nichts zu korrigieren".

═══════════════════════════════════════════════════════
DATEN AUS MOODLE
═══════════════════════════════════════════════════════

- „fragen"    – je Frage: Aufgabentext, Maximalpunkte und der Erwartungshorizont
                aus dem Moodle-Feld „Bewerterinformation".
- „antworten" – je Versuch die Schülerantwort mit „nr", „qubaid" und „slot".

${DATEN_PLATZHALTER}`;
  }

  function horizontPromptVorlage(stufe) {
    return kurztestHorizontVorlage({ einzeln: false, stufe: stufe || 'Mittel' });
  }

  // Kompakte Fassung: setzt voraus, dass die KI die Skills "2-didaktik-bewertung"
  // (Bewertungsstufen, Notenmodell, Sprachabzug, Feedbackregeln) und
  // "3-moodle-erweiterungen" (Zustaendigkeits-Marker Coach/Grader) von A. Spielhoff
  // kennt. Das Ausgabeformat (Tabelle, JSON-Schema, Horizont-Nachziehen) ist NICHT
  // Teil dieser Skills und bleibt deshalb ausgeschrieben.
  function kompaktPromptVorlage() {
    const maxAb = rsStandard();
    return `═══════════════════════════════════════════════════════
MOODLE AI FREITEXT GRADER – BEWERTUNG KURZTEST (KOMPAKT)
═══════════════════════════════════════════════════════

${bewertungsKopf(rolleAktuell())}

Falls du Zugriff auf die Skills „2-didaktik-bewertung“ und „3-moodle-erweiterungen“
von A. Spielhoff hast: Wende deren Bewertungslogik an — Inhalt strikt getrennt von
Sprache, die Abstufung im Horizont ist verbindlich (keine eigene Skala erfinden),
Sprachfehler zählen (schwer = doppelt) statt selbst Punkte abzuziehen, die
Feedback-Gliederung in Felder (lob/inhalt/rechtschreibung/grammatik/tipp) mit
kurzen, schülergerechten Sätzen (${leserKurz()}), und die drei Rückmeldungsfälle
(volle Punktzahl → nur Lob; ≥95 % → Lob zuerst; darunter → kein Lob).

Hast du diese Skills NICHT: Bitte um den ausführlichen Prompt (⚙ → Häkchen
„Kompakter Prompt“ ausschalten) statt zu raten — ohne die genauen Regeln (besonders
die Trennung Inhalt/Sprache und die Feld-Gliederung) sind falsche Bewertungen und
unpassendes Feedback wahrscheinlich.

${rsPromptSatz(maxAb, 'der Aufgabenpunkte')}
Punkte NICHT selbst ausrechnen, nur Inhalt-Prozent und Fehlerliste angeben — das
rechnet die Erweiterung.

═══════════════════════════════════════════════════════
MODUSFRAGE – STELLE SIE ZUERST UND WARTE
═══════════════════════════════════════════════════════

Stelle nach der Begrüßung GENAU DIESE EINE Frage und gib danach nichts weiter aus, bis
die Lehrkraft geantwortet hat:

„Wie sollen wir vorgehen?
  1. GEMEINSAM – Ich zeige dir alle Bewertungen als Tabelle, du kannst einzelne ändern,
     dann gebe ich das JSON aus. (empfohlen)
  2. AUTOMATISCH – Ich bewerte alles und gebe sofort das JSON aus.
Antworte mit 1 oder 2."

AUTOMATISCH ist eine bewusste Wahl der Lehrkraft, kein stiller Standard.
Bei 1 folgst du Schritt 1 und Schritt 2. Bei 2 überspringst du Schritt 1.
Im JSON steht ganz oben "besprochen": true (Modus 1) oder false (Modus 2).

═══════════════════════════════════════════════════════
SCHRITT 1 – TABELLE ZUR PRÜFUNG
═══════════════════════════════════════════════════════

Gib zuerst alle Antworten aus, nach Frage gruppiert, mit Kopfzeile (Aufgabe +
Kernaussage aus dem Horizont), dann eine Tabelle:

| Nr | Antwort (gekürzt) | Inhalt | Sprachfehler | Begründung |
|---|---|---|---|---|

„Nr“ ist die Zahl aus „nr“ im Datensatz. Keine Punkte- und keine Abzugsspalte. Halte
danach an und frage: „Passt das so? Nenne mir die Nummern, die ich ändern soll, zum
Beispiel: 3 auf 75. Wenn alles stimmt, antworte mit ok.“ Warte auf die Antwort.

═══════════════════════════════════════════════════════
SCHRITT 2 – JSON
═══════════════════════════════════════════════════════

Erst nach „ok“ (Modus GEMEINSAM) bzw. sofort (Modus AUTOMATISCH) ausgeben:

\`\`\`json
{
  "besprochen": true,
  "bewertungen": [
    { "frage": "alkoholischen Gärung (AFB I)", "qubaid": "2433013", "slot": "6",
      "inhalt": 50,
      "fehler": [
        { "art": "Nomen kleingeschrieben", "stelle": "zucker", "schwer": false }
      ],
      "rueckmeldung": {
        "inhalt": "…",
        "rechtschreibung": "…",
        "grammatik": "…"
      } }
  ]
}
\`\`\`

Ein Eintrag je Versuch, „qubaid“/„slot“ unverändert übernehmen. „inhalt“ ist der
Prozentwert aus der Horizont-Abstufung. „fehler“ leer bei fehlerfreiem Text.
„rueckmeldung“ nur die Felder füllen, zu denen es etwas zu sagen gibt (leere Felder
weglassen), jedes ein bis zwei ganze Sätze ohne Formatierung. Musterlösung NICHT
selbst schreiben — das hängt die Erweiterung an. WICHTIG: Hebst du in einem
Rückmeldungstext ein Wort hervor, benutze dafür einfache Anführungszeichen ('so'),
nie gerade doppelte ("so") — die brechen das JSON, weil sie die JSON-Begrenzung
sind. Satz danach: „Kopiere diesen Block
in die Erweiterung, Reiter „2 · Eintragen“ — die Prüfung startet beim Einfügen von selbst.“

═══════════════════════════════════════════════════════
SCHRITT 3 – HORIZONT NACHZIEHEN (nur wenn korrigiert wurde)
═══════════════════════════════════════════════════════

Wurden in Schritt 1 Prozentwerte geändert, nenne je betroffener Frage in einem Satz
die dahinterliegende Regel (nicht „Nr. 7 auf 100", sondern z. B. „Beim Löschsand
reicht ‚löscht Brände' für 100 % – der Metallbrand muss nicht genannt werden"), sag
was sich im Horizont ändern müsste, und biete an, die Horizonte über Reiter 3 neu zu
schreiben. Ohne Korrektur diesen Schritt ersatzlos weglassen.

═══════════════════════════════════════════════════════
DATEN AUS MOODLE
═══════════════════════════════════════════════════════

„fragen“ – je Frage: Aufgabentext, Maximalpunkte, Erwartungshorizont aus
„Bewerterinformation“. „antworten“ – je Versuch die Schülerantwort mit „nr“,
„qubaid“, „slot“.

${DATEN_PLATZHALTER}`;
  }

  function bauePrompt(daten) {
    const eigen = (optionen.promptOverride || '').trim();
    const vorlage = eigen || (optionen.kompaktPrompt ? kompaktPromptVorlage() : bewertungsPromptVorlage());
    const kurz = Object.values((daten && daten.fragen) || {}).some((f) => f && f.feedback === 'Kurz');
    const regel = kurz
      ? 'FEEDBACKLÄNGE JE AUFGABE: Steht bei einer Aufgabe "feedback": "Kurz", gib für diese Aufgabe '
        + 'höchstens zwei Felder aus (inhalt und höchstens ein weiteres), je EIN kurzer Satz. '
        + 'Bei "Mittel" gilt das Format wie beschrieben.\n\n'
      : '';
    const block = regel + '```json\n' + JSON.stringify(daten, (k, v) => (k === 'bisher' ? undefined : v), 1) + '\n```';
    return vorlage.includes(DATEN_PLATZHALTER)
      ? vorlage.replace(DATEN_PLATZHALTER, block)
      : vorlage + '\n\n' + block;
  }

  function baueHorizontPrompt(fragenListe) {
    const eigen = (optionen.horizontPromptOverride || '').trim();
    const stufen = new Set(fragenListe.map((f) => f.feedback === 'Kurz' ? 'Kurz' : 'Mittel'));
    const vorlage = eigen || horizontPromptVorlage(stufen.size > 1 ? 'gemischt' : [...stufen][0]);
    // Bei Fragen, die schon einen Horizont haben, wandert er als horizont_bisher mit:
    // die KI soll wissen, wovon sie abweicht, statt blind neben dem Vorhandenen zu schreiben.
    const block = '```json\n' + JSON.stringify(
      fragenListe.map((f) => {
        const e = { qid: f.qid, frage: f.name, aufgabe: f.aufgabe, max: f.max };
        if (stufen.size > 1) e.feedback = f.feedback === 'Kurz' ? 'Kurz' : 'Mittel';
        if (f.horizont) e.horizont_bisher = horizontOhneMarker(f.horizont);
        return e;
      }),
      null, 1) + '\n```';
    // Aenderungswuensche der Lehrkraft. Ohne sie steht im Prompt nur der bisherige
    // Horizont — und der sagt ja gerade das, was geaendert werden soll. Ein fremdes
    // Modell hat dann keine Chance, davon abzuweichen: es schreibt den alten Stand fort.
    const wunsch = String((typeof aenderungsWunsch === 'function' ? aenderungsWunsch() : '') || '').trim();
    const wunschBlock = wunsch
      ? '═══════════════════════════════════════════════════════\n'
        + 'ÄNDERUNGSWÜNSCHE DER LEHRKRAFT\n'
        + '═══════════════════════════════════════════════════════\n\n'
        + 'Diese Vorgaben haben Vorrang vor allem, was in „horizont_bisher" steht.\n'
        + 'Wo sie einem bisherigen Horizont widersprechen, gilt der Wunsch.\n\n'
        + wunsch + '\n\n'
      : '';
    const platz = '[MOODLE_AI_COACH_AUFGABEN]';
    const mat = materialBlock(fragenListe.map((f) => f.aufgabe), []);
    const alles = wunschBlock + (mat ? mat + '\n\n' : '') + block;
    return vorlage.includes(platz) ? vorlage.replace(platz, alles) : vorlage + '\n\n' + alles;
  }

  /* ================= Oberfläche ================= */

  // Kein Emoji: das Mörtelbrett rendert als bunter Aufkleber und passt nicht zu
  // 🔎 und 🪄. „Co" ist einfarbig und steht schlicht für Coach — „Aa" hatte Arne
  // als verwirrend empfunden, weil es nach Schriftgröße aussieht.
  // Echtes Logo aus dem icons-Ordner statt des Zeichens „Co". Faellt auf das
  // Zeichen zurueck, wenn das Bild nicht geladen werden kann (z. B. wenn der Eintrag
  // web_accessible_resources im Manifest fehlt).
  const knopf = el('button', 'co-fab');
  knopf.title = 'Moodle AI Freitext Grader';
  try {
    const bild = document.createElement('img');
    bild.src = browser.runtime.getURL('icon/128.png');
    bild.alt = 'Freitext Grader';
    bild.className = 'co-fab-icon';
    bild.addEventListener('error', () => { bild.remove(); knopf.textContent = 'Co'; });
    knopf.appendChild(bild);
  } catch (e) { knopf.textContent = 'Co'; }
  if (!ZIEL) document.body.appendChild(knopf);

  const panel = el('div', ZIEL ? 'co-panel co-eingebettet' : 'co-panel co-hidden');
  panel.innerHTML = `
    <div class="co-head">
      <div class="co-titelblock">
        <span class="co-title">Freitext Grader · Kurztest <span class="co-version"></span></span>
        <span class="co-untertitel">(Zufalls-)Freitexte als Kurztest bewerten</span>
      </div>
      <button class="co-close" title="Schließen">✕</button>
    </div>
    <div class="co-tabs">
      <button class="co-tab co-aktiv" data-tab="lesen">1 · Bewerten</button>
      <button class="co-tab" data-tab="eintrag">2 · Eintragen</button>
      <button class="co-tab" data-tab="horizont">3 · Horizonte <span class="co-badge co-hidden"></span></button>
      <button class="co-tab" data-tab="opt">⚙</button>
    </div>

    <div class="co-body" data-panel="lesen">
      <details class="co-details co-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="co-hinweis">Hier bewertest du alle Kurztest-Antworten dieses Tests auf einmal. Die Erweiterung sammelt die Antworten aller Versuche und baut daraus mit den Erwartungshorizonten einen Prompt. Diesen in die KI einfügen; deren Antwort kommt in Reiter 2.</p>
      </details>
      <p class="co-meta"></p>
      <div class="co-kasten">
        <div class="co-kastenkopf">Für diese Bewertung</div>
        <label class="co-label">Anrede im Feedback
          <select class="co-anrede">
            <option value="auto">Automatisch nach Jahrgang</option>
            <option value="du">Du</option><option value="sie">Sie</option>
          </select>
        </label>
        <label class="co-label"><span class="co-abzuglabel">Rechtschreibung: Höchstabzug in % der Aufgabenpunkte</span>
          <select class="co-abzug">
            <option value="0">0 % – kein Abzug</option><option value="5">5 %</option>
            <option value="10">10 %</option><option value="15">15 %</option>
            <option value="20">20 %</option><option value="25">25 %</option><option value="30">30 %</option>
          </select>
        </label>
        <p class="co-abzuginfo"></p>
        <details class="co-details co-mehr">
          <summary>Was bedeuten Anrede und Rechtschreibung?</summary>
          <p class="co-hinweis"><strong>Anrede:</strong> „Automatisch" schreibt bis Jahrgang 10 „Du hast …",
          ab Jahrgang 11 „Sie haben …". Der Jahrgang steht im Erwartungshorizont der Aufgaben.</p>
          <p class="co-hinweis"><strong>Rechtschreibung:</strong> So viel Prozent der Aufgabenpunkte kann die
          Sprache höchstens kosten. Es gibt einen Wert für die Sekundarstufe I (bis Jahrgang 10) und einen für
          die Oberstufe – dieselben wie bei Klausuren. Auch bei 0 % bekommen die Lernenden eine Rückmeldung
          zur Sprache.</p>
        </details>
        <p class="co-kastenfuss"></p>
      </div>
      <label class="co-check"><input type="checkbox" class="co-bereits">
        Auch schon bewertete Versuche noch einmal vorlegen</label>
      <button class="co-go">Kurztest-Aufgaben durchsuchen</button>
      <p class="co-hinweis">Klausur-Aufgaben in diesem Test werden erkannt, hier übersprungen und
      im Ergebnis verlinkt – sie werden auf ihrer eigenen Bewertungsseite bewertet.</p>
      <div class="co-progress co-hidden"><div class="co-bar"></div><span class="co-ptext"></span></div>
      <div class="co-result co-hidden">
        <p class="co-summary"></p>
        <p class="co-hinweis co-hzhinweis co-hidden"></p>
        <p class="co-warn co-hidden"></p>
        <div class="co-prozentbox co-hidden"></div>
        <div class="co-zust co-hidden"></div>
        <div class="co-uebersichtshinweis co-hidden">
          <p class="co-hinweis">Mehrere Kurztests lassen sich auch auf einmal bewerten: auf der Übersicht des
          Tests, alle Kurztest-Fragen zusammen in einem Prompt.</p>
          <a class="co-zweit co-uebersichtlink">Zur Übersicht →</a>
        </div>
        <button class="co-copy">📋 Prompt + Daten kopieren</button>
        <button class="co-copy2 co-zweit">📋 nur JSON</button>
        <p class="co-groesse"></p>
        <div class="co-list"></div>
      </div>
      <p class="co-error co-hidden"></p>
      <details class="co-details">
        <summary>Bewertungs-Prompt anpassen</summary>
        <p class="co-hinweis"><strong>Damit bewertet die KI die Schülerantworten.</strong>
        Hier steht der vollständige Prompt, den „📋 Prompt + Daten kopieren" verschickt —
        du kannst ihn lesen und ändern. „Standard einfügen" holt die mitgelieferte Fassung
        zurück. Der Platzhalter <code>[MOODLE_AI_COACH_DATEN]</code> wird beim Kopieren
        durch die Fragen und Antworten aus Moodle ersetzt.</p>
        <textarea class="co-prompt" rows="8"></textarea>
        <button class="co-promptstd co-zweit">Standard einfügen</button>
        <button class="co-promptsave co-zweit">Prompt speichern</button>
      </details>
    </div>

    <div class="co-body co-hidden" data-panel="eintrag">
      <details class="co-details co-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="co-hinweis">Hier fügst du die Bewertung der KI ein. Die Erweiterung rechnet die Punkte aus Inhaltsstufe und Fehlerzahl selbst, zeigt alles zur Kontrolle und trägt Punkte und Rückmeldung je Versuch in Moodle ein.</p>
      </details>
      <p class="co-hinweis">Hier das Bewertungs-JSON der KI einfügen. Die Punkte rechnet
      die Erweiterung aus Inhalt und Fehlerzahl selbst.</p>
      <textarea class="co-json" rows="6" placeholder='{ "bewertungen": [ … ] }'></textarea>
      <label class="co-check"><input type="checkbox" class="co-ki" checked>
        KI-Hinweis ans Feedback anhängen <span class="co-hinweis">(Standard und Wortlaut unter ⚙)</span></label>
      <p class="co-kivorschau"></p>
      <button class="co-pruef co-hidden">🔍 Prüfen</button>
      <p class="co-pinfo co-hidden"></p>
      <div class="co-schreibknoepfe co-hidden">
        <button class="co-alle">Alle eintragen</button>
      </div>
      <div class="co-progress2 co-hidden"><div class="co-bar2"></div><span class="co-ptext2"></span></div>
      <p class="co-abschluss co-hidden"></p>
      <div class="co-log co-hidden"></div>
      <div class="co-vorschau"></div>
    </div>

    <div class="co-body co-hidden" data-panel="horizont">
      <details class="co-details co-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="co-hinweis">Übersicht über alle Freitextaufgaben dieses Tests: Ist es ein Kurztest oder eine
        Klausur? Hat sie einen aktuellen Erwartungshorizont? Erstellt oder überarbeitet wird ein Horizont
        immer für <strong>eine</strong> Aufgabe – im Frageneditor oder auf ihrer Bewertungsseite (Reiter
        „Horizont"). Nur dort lassen sich Modus, Feedbacklänge, Fach, Jahrgang und Niveau einstellen.</p>
      </details>
      <p class="co-hinweis co-hzregel"><strong>Horizonte entstehen Aufgabe für Aufgabe.</strong> Öffne die
      Aufgabe über einen der Links unten – im Frageneditor oder auf ihrer Bewertungsseite – und erstelle
      oder überarbeite ihren Horizont dort im Reiter „Horizont“.</p>
      <div class="co-aufgabenliste"><p class="co-hinweis">Erst in Reiter 1 „Kurztest-Aufgaben durchsuchen" –
      dann stehen hier alle Aufgaben mit ihren Links.</p></div>
      <div class="co-hidden co-althorizont">
      <p class="co-hinweis">Der Erwartungshorizont gehört in die Frage, nicht in die
      Erweiterung — einmal erstellt, gilt er dauerhaft und wandert beim Export mit.
      Hier wird er angelegt, wo er fehlt — oder für vorhandene neu geschrieben.</p>
      <div class="co-ohneliste"></div>
      <label class="co-check"><input type="checkbox" class="co-halle">
        Auch Fragen einbeziehen, die schon einen Horizont haben — <strong>der wird dabei
        überschrieben</strong></label>
      <label class="co-feldkopf">Was soll anders werden? (geht mit in den Prompt)</label>
      <textarea class="co-hwunsch" rows="3"
        placeholder="z. B.: Beim Löschsand müssen Metallbrände NICHT genannt werden — Name plus „löscht Brände“ reicht für 100 %."></textarea>
      <p class="co-hinweis">Ohne diese Zeilen sieht das Sprachmodell nur den bisherigen
      Horizont — und der sagt ja gerade das, was du ändern willst. Es schreibt ihn dann
      fort. Was hier steht, hat im Prompt Vorrang vor dem bisherigen Horizont.</p>
      <p class="co-hinweis">Beim Neuschreiben bekommt die KI den bisherigen Horizont mit,
      damit sie weiß, wovon sie abweicht. Ersetzt wird er erst, wenn du die Antwort in
      Schritt 2 einfügst und einträgst.</p>
      <p class="co-schritt">Schritt 1 — Prompt holen</p>
      <button class="co-hcopy">📋 Prompt für Erwartungshorizont kopieren</button>
      <details class="co-details">
        <summary>Horizont-Prompt anpassen</summary>
        <p class="co-hinweis"><strong>Damit schreibt die KI den Erwartungshorizont</strong>
        für Fragen, die noch keinen haben — also das, was später in der Frage steht und
        wonach der Bewertungs-Prompt dann bewertet. Hier steht der vollständige Prompt,
        den der Knopf oben kopiert. Der Platzhalter
        <code>[MOODLE_AI_COACH_AUFGABEN]</code> wird beim Kopieren durch die Aufgaben
        ohne Horizont ersetzt.</p>
        <textarea class="co-hprompt" rows="8"></textarea>
        <button class="co-hpromptstd co-zweit">Standard einfügen</button>
        <button class="co-hpromptsave co-zweit">Prompt speichern</button>
      </details>
      <p class="co-schritt">Schritt 2 — Antwort der KI einfügen</p>
      <textarea class="co-hjson" rows="5" placeholder='{ "horizonte": [ … ] }'></textarea>
      <button class="co-hpruef co-hidden">🔍 Prüfen</button>
      <p class="co-hinfo co-hidden"></p>
      <div class="co-hliste"></div>
      <div class="co-progress3 co-hidden"><div class="co-bar3"></div><span class="co-ptext3"></span></div>
      <p class="co-habschluss co-hidden"></p>
      <div class="co-hlog co-hidden"></div>
      <div class="co-hknoepfe co-hidden">
        <button class="co-hschreib">In die Aufgaben eintragen</button>
      </div>
      </div>
    </div>

    <div class="co-body co-hidden" data-panel="opt">
      <details class="co-details co-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="co-hinweis">Hier steht nur, was für alle Aufgaben gleich ist. Fach, Jahrgang, Niveau und
        Feedbacklänge gehören zur Aufgabe und stehen in ihrem Erwartungshorizont; Anrede und Rechtschreibung
        stehen im Reiter „1 · Bewerten" unter „Für diese Bewertung".</p>
      </details>
      <p class="co-hinweis">Diese Einstellungen gelten überall in der Erweiterung – auf der Kurztest-Übersicht
      ebenso wie auf der Bewertungsseite einer Aufgabe.</p>
      <label class="co-check"><input type="checkbox" class="co-kian"> KI-Hinweis unter das Feedback</label>
      <label class="co-label">Text des KI-Hinweises
        <textarea class="co-kitext" rows="3"></textarea>
      </label>
      <button class="co-kistd co-zweit">Standardtext einsetzen</button>
      <details class="co-details co-mehr">
        <summary>Was bedeutet „KI-Hinweis“?</summary>
        <p class="co-hinweis">Unter jedes eingetragene Feedback setzt die Erweiterung diesen Satz, kursiv
        und klein. Er kommt von der Erweiterung, nicht von der KI. Den Wortlaut kannst du ändern.</p>
      </details>
      <label class="co-check"><input type="checkbox" class="co-quellen"> Quellenangaben entfernen</label>
      <details class="co-details co-mehr">
        <summary>Was bedeutet „Quellenangaben entfernen“?</summary>
        <p class="co-hinweis">Manche KI-Chats hängen Quellenmarken wie [1] oder 【4†source】 an. Mit Häkchen
        entfernt die Erweiterung sie aus dem Feedback, bevor es eingetragen wird.</p>
      </details>
      <label class="co-check"><input type="checkbox" class="co-kompakt">
        Kompakter Prompt (nur für KI mit eigenen Skills, z. B. Claude)</label>
      <details class="co-details co-mehr">
        <summary>Was bedeutet „Kompakter Prompt“?</summary>
        <p class="co-hinweis">Der Bewertungsprompt verweist für die Bewertungslogik auf die Skills
        „2-didaktik-bewertung" und „3-moodle-erweiterungen", statt sie auszuschreiben – spart mehrere Tausend
        Zeichen. <strong>Nur einschalten, wenn die verwendete KI diese Skills wirklich kennt.</strong> Den
        Prompt selbst kannst du im Reiter 1 unter „Bewertungs-Prompt anpassen" lesen und ändern.</p>
      </details>
      <p class="co-hinweis"><strong>Nur auf der Kurztest-Übersicht:</strong></p>
      <label class="co-check"><input type="checkbox" class="co-nurmarker">
        Nur Fragen bewerten, die als Kurztest markiert sind</label>
      <details class="co-details co-mehr">
        <summary>Was bedeutet „Nur markierte Fragen bewerten“?</summary>
        <p class="co-hinweis">Ein Erwartungshorizont trägt in der ersten Zeile, wie die Aufgabe bewertet
        wird: <code>[moodle-ai-freitext: kurztest]</code> oder <code>[moodle-ai-freitext: klausur]</code>
        (ältere Horizonte: <code>[moodle-ai-coach]</code> bzw. <code>[moodle-ai-grader]</code>).
        Klausur-Aufgaben werden hier <strong>immer</strong> übersprungen. Das Häkchen betrifft nur Aufgaben
        <em>ohne</em> Marker: aus (Standard) werden sie hier bewertet, wenn ihr Horizont wie ein Kurztest
        aussieht, und im Ergebnis gemeldet; an bleiben sie liegen.</p>
      </details>
      <button class="co-optsave">Speichern</button>
      <button class="co-optreset co-zweit">Alles zurücksetzen</button>
      <p class="co-optinfo co-hidden"></p>
    </div>`;
  (ZIEL || document.body).appendChild(panel);
  panel.querySelector('.co-version').textContent = VERSION;

  const $ = (s) => panel.querySelector(s);
  let ausgabe = null, eintraege = null, horizonte = null;

  // Den Auslese-Durchlauf sichern. Ohne das ist er nach jedem Neuladen der Seite weg
  // und Reiter 2 kann die Punkte nicht mehr rechnen — man müsste alles neu durchsuchen.
  const ERNTE_KEY = 'coachErnte_' + CMID + (EINZEL ? '_slot' + EINZEL.slot : '');
  function ernteSichern() {
    try { browser.storage.local.set({ [ERNTE_KEY]: ausgabe }); } catch (e) { /* egal */ }
  }
  try {
    browser.storage.local.get([ERNTE_KEY], (r) => {
      const d = r && r[ERNTE_KEY];
      if (d && !ausgabe) {
        ausgabe = d;
        const m = $('.co-meta');
        if (m) m.textContent += ` · ${(d.antworten || []).length} Antworten aus einem `
                              + 'früheren Durchlauf geladen';
      }
    });
  } catch (e) { /* egal */ }

  knopf.addEventListener('click', () => panel.classList.toggle('co-hidden'));
  if (ZIEL) {
    // Eingebettet: kein eigener Kopf, keine Reiter – „Bewerten" und „Eintragen" stehen
    // untereinander. Horizont und ⚙ gibt es im umgebenden Panel.
    panel.querySelector('.co-head').classList.add('co-hidden');
    panel.querySelector('.co-tabs').classList.add('co-hidden');
    panel.querySelectorAll('[data-panel="horizont"], [data-panel="opt"]').forEach((x) => x.classList.add('co-hidden'));
    panel.querySelector('[data-panel="eintrag"]').classList.remove('co-hidden');
    const wl = panel.querySelector('[data-panel="lesen"] .co-wozu'); if (wl) wl.classList.add('co-hidden');
    const we = panel.querySelector('[data-panel="eintrag"] .co-wozu'); if (we) we.classList.add('co-hidden');
    const go = panel.querySelector('.co-go'); if (go) go.textContent = 'Antworten dieser Aufgabe laden';
    const kh = [...panel.querySelectorAll('[data-panel="lesen"] .co-hinweis')].find((p) => /Klausur-Aufgaben in diesem Test/.test(p.textContent));
    if (kh) kh.classList.add('co-hidden');
    const ue = panel.querySelector('.co-uebersichtshinweis');
    if (ue && opts.uebersicht) {
      ue.classList.remove('co-hidden');
      const a = ue.querySelector('.co-uebersichtlink'); a.href = opts.uebersicht;
      // Ganz nach oben: Wer alle Kurztests zusammen bewerten will, soll das sehen,
      // BEVOR er hier Antworten laedt – nicht erst danach.
      panel.querySelector('[data-panel="lesen"]').prepend(ue);
    }
    const zw = el('p', 'co-schritttitel', 'Ergebnis der KI einfügen und eintragen');
    panel.querySelector('[data-panel="eintrag"]').prepend(zw);
  }
  $('.co-close').addEventListener('click', () => panel.classList.add('co-hidden'));
  function reiterZeigen(name) {
    if (ZIEL) {
      const b = panel.querySelector('[data-panel="' + name + '"]');
      if (b && (name === 'lesen' || name === 'eintrag')) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    panel.querySelectorAll('.co-tab').forEach((x) =>
      x.classList.toggle('co-aktiv', x.dataset.tab === name));
    panel.querySelectorAll('[data-panel]').forEach((p) =>
      p.classList.toggle('co-hidden', p.dataset.panel !== name));
  }
  // Nach „Prompt + Daten kopieren" springt die Ansicht automatisch in den Reiter
  // „Eintragen" — der Knopf bestätigt sich, und man landet ohne Suchen dort, wo
  // der naechste Schritt stattfindet. Klickt Arne in der Zwischenzeit selbst auf
  // einen Reiter, wird der Sprung abgebrochen, statt ihm die Ansicht wegzuziehen.
  let reiterAutoTimer = null;
  function reiterAutoAbbrechen() {
    if (reiterAutoTimer) { clearTimeout(reiterAutoTimer); clearInterval(reiterAutoTimer); reiterAutoTimer = null; }
  }
  panel.querySelectorAll('.co-tab').forEach((t) => {
    t.addEventListener('click', () => { reiterAutoAbbrechen(); reiterZeigen(t.dataset.tab); });
  });

  function abzugWert() {
    const v = num($('.co-abzug').value);
    if (v === null || v < 0) return OPT_STANDARD.maxSprachabzug;
    return Math.min(100, v);
  }
  function abzugInfo() {
    const v = abzugWert();
    $('.co-abzuginfo').textContent = rsErklaerung(v, 'der Aufgabenpunkte');
  }
  function kiVorschau() {
    const p = $('.co-kivorschau');
    const satz = (optionen.kiHinweisText || KI_HINWEIS_STANDARD).trim();
    if (!$('.co-ki').checked || !satz) { p.classList.add('co-hidden'); return; }
    p.classList.remove('co-hidden');
    p.textContent = 'Angehängt wird: „' + satz + '" (kursiv, kleine Schrift). Ändern unter ⚙.';
  }
  $('.co-ki').addEventListener('change', kiVorschau);
  $('.co-abzug').addEventListener('input', abzugInfo);
  $('.co-abzug').addEventListener('change', async () => {
    abzugInfo(); await optionenSpeichern({ maxSprachabzug: abzugWert() });
    // Derselbe Wert gilt im Klausur-Weg: je Stufe gemeinsam speichern.
    const k = stufeVon(rolleAktuell().jahrgang) === 'sek2' ? 'rsSek2' : 'rsSek1';
    RAHMEN[k] = abzugWert();
    await gemeinsamSpeichern(k, String(abzugWert()));
    abzugFeldAktualisieren();
  });
  function abzugFeldAktualisieren() {
    const f = $('.co-abzug');
    const r = rolleAktuell();
    if (f) { f.value = String(rsStandard()); abzugInfo(); }
    const l = $('.co-abzuglabel');
    if (l) l.textContent = 'Rechtschreibung: Höchstabzug in % der Aufgabenpunkte – '
      + (stufeVon(r.jahrgang) === 'sek2' ? 'Oberstufe (ab Jahrgang 11)' : 'Sekundarstufe I (bis Jahrgang 10)');
    const a = $('.co-anrede'); if (a) a.value = RAHMEN.anredeWahl || 'auto';
    const fuss = $('.co-kastenfuss');
    if (fuss) fuss.textContent = 'Im Feedback steht „' + (r.anrede === 'sie' ? 'Sie haben' : 'Du hast') + ' …"'
      + (r.jahrgang ? ' · Jahrgang ' + r.jahrgang : ' · Jahrgang unbekannt (Horizont ohne Angabe)') + '.';
  }
  async function gemeinsamSpeichern(feld, wert) {
    try {
      const rr = await browser.storage.local.get(['magSettings']);
      const m = (rr && rr.magSettings) || {};
      m[feld] = wert;
      await browser.storage.local.set({ magSettings: m });
    } catch (e) { /* ohne Speicher bleibt es beim lokalen Wert */ }
  }
  $('.co-anrede').addEventListener('change', async () => {
    RAHMEN.anredeWahl = $('.co-anrede').value;
    await gemeinsamSpeichern('anredeWahl', RAHMEN.anredeWahl);
    abzugFeldAktualisieren();
  });
  $('.co-nurmarker').addEventListener('change', async (e) => {
    await optionenSpeichern({ nurMitMarker: e.target.checked });
  });

  optionenLaden().then(() => {
    abzugFeldAktualisieren();
    $('.co-kitext').value = optionen.kiHinweisText || KI_HINWEIS_STANDARD;
    // Ein leeres Feld, das „Standard" bedeutet, ist eine Blackbox: man sieht nicht,
    // was tatsächlich verschickt wird. Deshalb steht hier immer der volle Text.
    // Gespeichert wird nur, was vom Standard abweicht.
    $('.co-prompt').value = optionen.promptOverride || vorlageAktiv();
    $('.co-hprompt').value = optionen.horizontPromptOverride || horizontPromptVorlage();
    $('.co-nurmarker').checked = !!optionen.nurMitMarker;
    $('.co-kompakt').checked = !!optionen.kompaktPrompt;
    $('.co-kian').checked = optionen.kiHinweis !== false;
    $('.co-ki').checked = optionen.kiHinweis !== false;
    $('.co-quellen').checked = optionen.entferneQuellen !== false;
    abzugInfo(); kiVorschau();
  });
  $('.co-kistd').addEventListener('click', () => { $('.co-kitext').value = KI_HINWEIS_STANDARD; kurzQuittung($('.co-kistd'), '✓ Eingesetzt – mit „Speichern“ übernehmen', 'Standardtext einsetzen'); });

  function optInfo(t) {
    const i = $('.co-optinfo');
    i.textContent = t; i.classList.remove('co-hidden');
    setTimeout(() => i.classList.add('co-hidden'), 3000);
  }
  $('.co-optsave').addEventListener('click', async () => {
    await optionenSpeichern({
      maxSprachabzug: abzugWert(),
      nurMitMarker: $('.co-nurmarker').checked,
      kompaktPrompt: $('.co-kompakt').checked,
      kiHinweis: $('.co-kian').checked,
      entferneQuellen: $('.co-quellen').checked,
      kiHinweisText: $('.co-kitext').value.trim() || KI_HINWEIS_STANDARD
    });
    $('.co-ki').checked = optionen.kiHinweis !== false;
    // Der Bewertungsprompt haengt am kompakten Schalter: Feld neu fuellen, wenn kein eigener.
    if (!optionen.promptOverride) $('.co-prompt').value = vorlageAktiv();
    $('.co-kitext').value = optionen.kiHinweisText;
    abzugInfo(); kiVorschau(); optInfo('Gespeichert ✓');
    // Der Einstellungs-Reiter schliesst sich nach dem Speichern von selbst. Bleibt er
    // offen, sieht das Panel unveraendert aus und man klickt aus Unsicherheit ein
    // zweites Mal. Die kurze Pause laesst die Quittung noch lesbar werden.
    kurzQuittung($('.co-optsave'), '✓ Gespeichert', 'Speichern');
    setTimeout(() => reiterZeigen('lesen'), 900);
  });

  // Die Prompts werden dort bearbeitet, wo sie benutzt werden — der Bewertungs-Prompt
  // in Reiter 1, der Horizont-Prompt in Reiter 3. Sonst steht das Anpassen eines
  // Prompts weit weg von dem Knopf, der ihn kopiert.
  function kurzQuittung(knopf, text, urText) {
    knopf.textContent = text;
    setTimeout(() => (knopf.textContent = urText), 2000);
  }
  $('.co-promptstd').addEventListener('click', () => {
    $('.co-prompt').value = vorlageAktiv();
    kurzQuittung($('.co-promptstd'), '✓ eingefügt', 'Standard einfügen');
  });
  $('.co-promptsave').addEventListener('click', async () => {
    const v = $('.co-prompt').value.trim();
    // Deckungsgleich mit dem Standard = kein eigener Prompt. Sonst friert man die
    // mitgelieferte Fassung ein und bekommt spätere Verbesserungen nicht mehr mit.
    const eigen = (v === vorlageAktiv().trim() || v === bewertungsPromptVorlage().trim()) ? '' : v;
    await optionenSpeichern({ promptOverride: eigen });
    kurzQuittung($('.co-promptsave'), eigen ? '✓ eigener Prompt gespeichert' : '✓ Standard',
                 'Prompt speichern');
  });
  $('.co-hpromptstd').addEventListener('click', () => {
    $('.co-hprompt').value = horizontPromptVorlage();
    kurzQuittung($('.co-hpromptstd'), '✓ eingefügt', 'Standard einfügen');
  });
  $('.co-hpromptsave').addEventListener('click', async () => {
    const v = $('.co-hprompt').value.trim();
    const eigen = (v === horizontPromptVorlage().trim()) ? '' : v;
    await optionenSpeichern({ horizontPromptOverride: eigen });
    kurzQuittung($('.co-hpromptsave'), eigen ? '✓ eigener Prompt gespeichert' : '✓ Standard',
                 'Prompt speichern');
  });
  $('.co-optreset').addEventListener('click', async () => {
    await optionenSpeichern({ ...OPT_STANDARD, ...GEMEINSAM_STANDARD });
    $('.co-kian').checked = true; $('.co-ki').checked = true; $('.co-quellen').checked = true;
    $('.co-abzug').value = prozentText(OPT_STANDARD.maxSprachabzug);
    $('.co-nurmarker').checked = OPT_STANDARD.nurMitMarker;
    $('.co-kompakt').checked = OPT_STANDARD.kompaktPrompt;
    $('.co-kitext').value = KI_HINWEIS_STANDARD;
    $('.co-prompt').value = vorlageAktiv();
    $('.co-hprompt').value = horizontPromptVorlage();
    abzugInfo(); kiVorschau();
    optInfo('Auf Standard zurückgesetzt — auch die Prompts in Reiter 1 und 3.');
  });

  $('.co-meta').textContent = (document.title || '').replace(/\s*\|.*$/, '').trim()
    || 'Manuelle Bewertung';

  /* ---- Reiter 1: Auslesen ---- */

  $('.co-go').addEventListener('click', async () => {
    const b = $('.co-go');
    b.disabled = true; b.textContent = 'läuft …';
    $('.co-error').classList.add('co-hidden');
    $('.co-result').classList.add('co-hidden');
    $('.co-progress').classList.remove('co-hidden');
    try {
      ausgabe = await ernten((fertig, gesamt, treffer) => {
        $('.co-bar').style.width = Math.round((fertig / gesamt) * 100) + '%';
        $('.co-ptext').textContent = `${fertig} / ${gesamt} Fragen · ${treffer} Antworten`;
      }, $('.co-bereits').checked);

      const m = ausgabe.meta;
      const mitH = Object.values(ausgabe.fragen).filter((f) => f.horizont);
      const ohneH = Object.values(ausgabe.fragen).filter((f) => !f.horizont);

      const fremde = Object.values(ausgabe.fremde || {});
      // Fragen, deren Horizont aus einer neueren Fassung geholt wurde, als der Versuch
      // sie kennt — der Hinweis erklaert, warum im Prompt etwas anderes steht als auf
      // der Seite darunter.
      const nachgeladen = Object.values(ausgabe.fragen)
        .filter((f) => f.horizont_aus_fassung).length;
      $('.co-summary').textContent =
        `${m.antworten} Antworten auf ${Object.keys(ausgabe.fragen).length} Freitextfragen · `
        + `${mitH.length} mit Horizont, ${ohneH.length} ohne · ${m.uebersprungen} übersprungen`
        + (fremde.length ? ` · ${fremde.length} Klausur-Aufgabe(n), siehe unten` : '')
        + (nachgeladen ? ` · ${nachgeladen} Horizont(e) aus der neuesten Fragenfassung geholt` : '');

      const warn = $('.co-warn');
      if (ohneH.length) {
        warn.classList.remove('co-hidden');
        warn.textContent = `⚠ ${ohneH.length} Frage(n) haben keinen Erwartungshorizont. `
          + 'Sie sind im Prompt nicht enthalten — leg ihn in Reiter 3 an.';
      } else warn.classList.add('co-hidden');

      /* ---- Rechtschreibungs-Prozent: Horizont gegen Einstellung (seit 1.8.0) ---- */
      // Eigene Funktion, nicht nur Inline-Code: der Umschalt-Knopf ruft sie erneut
      // auf, ohne die Fragen ein zweites Mal von Moodle zu laden.
      function zeichnenProzentbox() {
        const prozentBox = $('.co-prozentbox'); prozentBox.innerHTML = '';
        prozentBox.classList.add('co-hidden'); return;   // ab 0.9: eine Quelle, kein Abgleich mehr
        const aktuellerProzent = rsStandard();
        const prozentAbweichend = Object.values(ausgabe.fragen)
          .filter((f) => f.horizont && f.horizontProzent != null && f.horizontProzent !== aktuellerProzent);
        if (!prozentAbweichend.length) { prozentBox.classList.add('co-hidden'); return; }
        prozentBox.classList.remove('co-hidden');
        prozentBox.appendChild(el('div', 'co-zustkopf',
          `⚠ ${prozentAbweichend.length} Frage(n) tragen im Horizont eine andere `
          + `Rechtschreibungs-Prozentzahl als aktuell eingestellt (${prozentText(aktuellerProzent)} %):`));
        prozentAbweichend.forEach((f) => prozentBox.appendChild(el('div', 'co-logzeile',
          `${f.name} — Horizont: ${prozentText(f.horizontProzent)} %`)));
        prozentBox.appendChild(el('div', 'co-hinweis',
          prozentEinstellungErzwingen
            ? `Es gilt gerade überall die eingestellte Prozentzahl (${prozentText(aktuellerProzent)} %).`
            : 'Es gilt gerade je Frage der Wert aus dem Horizont — so, wie beim Erstellen des '
              + 'Erwartungshorizonts bewusst festgelegt.'));
        const umschalten = el('button', 'co-marker co-zweit',
          prozentEinstellungErzwingen
            ? 'Stattdessen die Horizont-Werte verwenden'
            : `Stattdessen überall ${prozentText(aktuellerProzent)} % verwenden`);
        umschalten.addEventListener('click', () => {
          prozentEinstellungErzwingen = !prozentEinstellungErzwingen;
          zeichnenProzentbox();
        });
        prozentBox.appendChild(umschalten);
      }
      zeichnenProzentbox();

      /* ---- Zuständigkeit: was gehört wem, und was ist zu tun ---- */
      const zustBox = $('.co-zust'); zustBox.innerHTML = '';
      const ohneMarker = Object.values(ausgabe.fragen).filter((f) => f.horizont && !f.zustaendig);
      if (fremde.length || ohneMarker.length) {
        zustBox.classList.remove('co-hidden');
        const fuerGrader = fremde.filter((f) => f.grund === 'grader');
        const streng = fremde.filter((f) => f.grund !== 'grader');
        if (fuerGrader.length) {
          zustBox.appendChild(el('div', 'co-zustkopf',
            `↷ ${fuerGrader.length} Klausur-Frage(n) — werden auf ihrer Einzelseite bewertet, hier übersprungen.`));
          // Rundgang: Klausur-Fragen als Links, Liste fuer die Einzelseiten ablegen.
          const klausurListe = fuerGrader.map((f) => ({ slot: f.slot, qid: f.qid, name: f.name }));
          if (!EINZEL) rundgangSpeichern(CMID, klausurListe);
          fuerGrader.forEach((f) => {
            const a = el('a', 'co-logzeile', '→ ' + f.name);
            a.href = einzelseiteUrl(CMID, f);
            zustBox.appendChild(a);
          });
          const kurztestZahl = Object.keys(ausgabe.fragen || {}).length;
          const los = el('button', 'co-jetzt', kurztestZahl
            ? `Nach den Kurztests: weiter zur Klausur-Frage 1 von ${klausurListe.length}`
            : `Weiter zur Klausur-Frage 1 von ${klausurListe.length}`);
          los.addEventListener('click', () => { location.href = einzelseiteUrl(CMID, klausurListe[0]); });
          zustBox.appendChild(los);
          // Keine Kurztest-Fragen in diesem Test: gleich zur ersten Klausur-Frage springen.
          if (!kurztestZahl) {
            let rest = 3;
            const hinweis = el('div', 'co-logzeile', `Nur Klausur-Fragen — Sprung zur ersten in ${rest} s … (Klick hier bricht ab)`);
            zustBox.appendChild(hinweis);
            const uhr = setInterval(() => {
              rest--;
              if (rest > 0) { hinweis.textContent = `Nur Klausur-Fragen — Sprung zur ersten in ${rest} s … (Klick hier bricht ab)`; return; }
              clearInterval(uhr);
              location.href = einzelseiteUrl(CMID, klausurListe[0]);
            }, 1000);
            hinweis.addEventListener('click', () => { clearInterval(uhr); hinweis.textContent = 'Automatischer Sprung abgebrochen.'; });
          }
        }
        if (streng.length) {
          zustBox.appendChild(el('div', 'co-zustkopf',
            `↷ ${streng.length} Frage(n) ohne Marker — übersprungen, weil „nur mit Marker" `
            + 'eingeschaltet ist (⚙).'));
          streng.forEach((f) => zustBox.appendChild(el('div', 'co-logzeile', f.name)));
        }
        if (ohneMarker.length) {
          zustBox.appendChild(el('div', 'co-zustkopf',
            `⚠ ${ohneMarker.length} Frage(n) haben einen Horizont, aber keinen Marker — sie `
            + 'wurden mitbewertet. Markiere sie als Kurztest (Knopf unten), dann ist die Zuständigkeit dauerhaft geklärt.'));
          ohneMarker.forEach((f) => zustBox.appendChild(el('div', 'co-logzeile', f.name)));
          const urText = ohneMarker.length === 1 ? 'Diese Frage als Kurztest markieren' : `Diese ${ohneMarker.length} Fragen als Kurztest markieren`;
          const nach = el('button', 'co-marker co-zweit', urText);
          let bestaetigt = false, rueckfallUhr = null;
          nach.addEventListener('click', async () => {
            // Das schreibt in die Fragensammlung — deshalb zwei Klicks.
            if (!bestaetigt) {
              bestaetigt = true;
              nach.textContent = 'Wirklich? Ändert die Fragen — noch einmal klicken';
              rueckfallUhr = setTimeout(() => {
                if (bestaetigt) { bestaetigt = false; nach.textContent = urText; }
              }, 8000);
              return;
            }
            // Die Rückfall-Uhr aus dem ersten Klick MUSS hier sterben: sonst setzt sie
            // mitten im Lauf den Knopftext auf "nachtragen" zurück, und es sieht aus,
            // als sei nichts passiert (genau das ist am 05.09.2026 aufgefallen).
            if (rueckfallUhr) { clearTimeout(rueckfallUhr); rueckfallUhr = null; }
            nach.disabled = true;

            // Jede Frage ist ein eigener Seitenaufruf und dauert eine knappe Sekunde.
            // Ohne mitlaufende Anzeige wirkt die Erweiterung tot: deshalb Zähler im Knopf
            // und je Frage sofort eine Zeile — nicht erst am Ende gesammelt.
            const lauf = el('div', 'co-marklog');
            zustBox.appendChild(lauf);
            let ok = 0; const schlecht = [];
            for (let i = 0; i < ohneMarker.length; i++) {
              const f = ohneMarker[i];
              nach.textContent = `Trage nach … ${i + 1} von ${ohneMarker.length}: ${f.name}`;
              const zeile = el('div', 'co-logzeile', `… ${f.name}`);
              lauf.appendChild(zeile);
              lauf.scrollTop = lauf.scrollHeight;
              try {
                await markerNachtragen(f.qid); ok++;
                zeile.textContent = `✓ ${f.name}`;
              } catch (e) {
                schlecht.push(`${f.name}: ${e.message}`);
                zeile.textContent = `✗ ${f.name}: ${e.message}`;
                zeile.classList.add('co-logfehler');
              }
            }
            nach.textContent = `${ok} nachgetragen`
              + (schlecht.length ? `, ${schlecht.length} fehlgeschlagen` : '');
            if (ok) zustBox.appendChild(el('div', 'co-logzeile',
              'Bitte „Kurztest-Aufgaben durchsuchen" noch einmal laufen lassen — dann liest '
              + 'die Erweiterung den neuen Stand.'));
          });
          zustBox.appendChild(nach);

          // Zweiter Weg: Wer nicht weiss, was in diesen Fragen ueberhaupt steht, will den
          // Horizont oft lieber neu schreiben als einen fremden nur mit Marker versehen.
          const neuSchreiben = el('button', 'co-hneu co-zweit', 'Horizonte einzeln überarbeiten →');
          neuSchreiben.title = 'Springt zu Reiter 3 · Horizonte: Liste aller Aufgaben mit Links';
          neuSchreiben.addEventListener('click', () => reiterZeigen('horizont'));
          zustBox.appendChild(neuSchreiben);
        }
      } else zustBox.classList.add('co-hidden');

      const badge = panel.querySelector('.co-badge');

      const liste = $('.co-list'); liste.innerHTML = '';
      Object.values(ausgabe.fragen).forEach((f) => {
        const kopf = el('div', 'co-qname');
        kopf.appendChild(el('span', f.horizont ? 'co-ok' : 'co-fehlt', f.horizont ? '✓' : '✗'));
        kopf.appendChild(el('span', 'co-qtext', ` ${f.name} · ${komma(f.max)} P.`));
        liste.appendChild(kopf);
        ausgabe.antworten.filter((a) => a.qid === f.qid).forEach((a) => {
          const z = el('a', 'co-row');
          z.href = versuchLink(a); z.target = '_blank'; z.rel = 'noopener';
          z.appendChild(el('span', 'co-nr', '#' + a.nr));
          z.appendChild(el('span', 'co-ans', a.antwort.slice(0, 90)));
          liste.appendChild(z);
        });
      });

      // Reiter 3 gleich mit den fehlenden Fragen füllen
      const oh = $('.co-ohneliste'); oh.innerHTML = '';
      if (ohneH.length) {
        oh.appendChild(el('div', 'co-fehlendkopf', 'Ohne Erwartungshorizont:'));
        ohneH.forEach((f) => oh.appendChild(el('div', 'co-logzeile', `${f.name} — ${f.aufgabe.slice(0, 90)}`)));
      } else {
        oh.appendChild(el('div', 'co-fehlendkopf',
          'Alle Fragen haben einen Horizont. Willst du einen neuen für die Aufgaben schreiben?'));
        oh.appendChild(el('div', 'co-logzeile',
          'Setz dazu unten das Häkchen — der vorhandene Horizont wird beim Eintragen überschrieben.'));
      }
      // Fehlt nirgends ein Horizont, ist Neuschreiben der einzig sinnvolle Weg —
      // dann steht das Häkchen von vornherein.
      if (!ohneH.length && mitH.length) $('.co-halle').checked = true;
      hcopyBeschriften();
      aufgabenlisteZeigen();
      abzugFeldAktualisieren();

      ernteSichern();
      const gr = bauePrompt(ausgabe).length;
      $('.co-groesse').textContent = `Prompt ≈ ${Math.round(gr / 1000)} 000 Zeichen`;
      $('.co-result').classList.remove('co-hidden');
      if (ausgabe.fehler.length) {
        $('.co-error').textContent = ausgabe.fehler.length + ' Frage(n) konnten nicht geladen werden.';
        $('.co-error').classList.remove('co-hidden');
      }
    } catch (e) {
      $('.co-error').textContent = 'Fehler: ' + e.message;
      $('.co-error').classList.remove('co-hidden');
    } finally {
      $('.co-progress').classList.add('co-hidden');
      b.disabled = false;
      const urText = EINZEL ? 'Antworten dieser Aufgabe neu laden' : 'Kurztest-Aufgaben durchsuchen';
      const n = (ausgabe && ausgabe.antworten) ? ausgabe.antworten.length : 0;
      // Sichtbare Quittung am Knopf – auch wenn das Ergebnis gleich aussieht wie vorher.
      b.textContent = $('.co-error').classList.contains('co-hidden') ? `✓ Fertig – ${n} Antworten geladen` : '⚠ Nicht fertig – siehe Meldung';
      setTimeout(() => { b.textContent = urText; }, 2500);
    }
  });

  function nurMitHorizont(a) {
    const kopie = { meta: { ...a.meta }, fragen: {}, antworten: [] };
    Object.entries(a.fragen).forEach(([k, f]) => { if (f.horizont) kopie.fragen[k] = f; });
    const qids = new Set(Object.values(kopie.fragen).map((f) => f.qid));
    kopie.antworten = a.antworten.filter((x) => qids.has(x.qid));
    kopie.meta.antworten = kopie.antworten.length;
    return kopie;
  }

  // Einheitlicher Ablauf aller Erweiterungen (24.09.2026): Kopieren quittiert,
  // zaehlt 3 s herunter und springt dann dorthin, wo eingefuegt wird. Ein Klick
  // auf einen Reiter bricht den Sprung ab (reiterAutoAbbrechen).
  function quittung(kl, urText, ziel, feldKlasse) {
    const b = $(kl);
    reiterAutoAbbrechen();
    let rest = 3;
    b.textContent = `✓ Kopiert — weiter in ${rest} s`;
    reiterAutoTimer = setInterval(() => {
      rest--;
      if (rest > 0) { b.textContent = `✓ Kopiert — weiter in ${rest} s`; return; }
      reiterAutoAbbrechen();
      b.textContent = urText;
      if (ziel) reiterZeigen(ziel);
      const feld = feldKlasse && $(feldKlasse);
      if (feld) { feld.focus(); feld.scrollIntoView({ block: 'nearest' }); }
    }, 1000);
  }
  $('.co-copy').addEventListener('click', async () => {
    if (!ausgabe) return;
    await inZwischenablage(bauePrompt(nurMitHorizont(ausgabe)));
    quittung('.co-copy', '📋 Prompt + Daten kopieren', 'eintrag', '.co-json');
  });
  $('.co-copy2').addEventListener('click', async () => {
    if (!ausgabe) return;
    await inZwischenablage(JSON.stringify(nurMitHorizont(ausgabe), null, 1));
    quittung('.co-copy2', '📋 nur JSON', 'eintrag', '.co-json');
  });

  /* ---- Reiter 3: Aufgabenliste mit Links (ab 0.9) ----
     Horizonte werden nur noch einzeln erstellt: im Frageneditor oder auf der
     Bewertungsseite der Aufgabe. Hier steht nur, welche Aufgabe was braucht. */
  function aufgabenlisteZeigen() {
    const box = $('.co-aufgabenliste');
    if (!box || !ausgabe) return;
    box.innerHTML = '';
    const editorUrl = (qid) => location.origin + '/question/bank/editquestion/question.php?id=' + qid
      + (CMID ? '&cmid=' + CMID : '');
    const zeile = (f, art) => {
      const z = el('div', 'co-aufgabe');
      const h = f.horizont ? (f.vonFreitext ? 'Horizont aktuell' : 'alter Horizont – bitte überarbeiten')
        : 'kein Horizont';
      const angaben = [f.jahrgang ? 'Jg. ' + f.jahrgang : '', f.feedback && f.vonFreitext ? 'Feedback ' + f.feedback : '']
        .filter(Boolean).join(' · ');
      z.appendChild(el('div', 'co-aufgabekopf', f.name || ('Aufgabe ' + f.slot)));
      z.appendChild(el('div', 'co-aufgabestatus' + (f.horizont && f.vonFreitext ? ' co-ok' : ' co-fehlt'),
        art + ' · ' + h + (angaben ? ' · ' + angaben : '')));
      const links = el('div', 'co-aufgabelinks');
      if (f.qid) {
        const a1 = el('a', 'co-link', 'Im Frageneditor öffnen');
        a1.href = editorUrl(f.qid); a1.target = '_blank'; a1.rel = 'noopener';
        links.appendChild(a1);
      }
      if (f.qid && f.slot && CMID) {
        const a2 = el('a', 'co-link', 'Auf der Bewertungsseite öffnen');
        a2.href = einzelseiteUrl(CMID, { slot: f.slot, qid: f.qid }); a2.target = '_blank'; a2.rel = 'noopener';
        links.appendChild(a2);
      }
      z.appendChild(links);
      return z;
    };
    const kurz = Object.values(ausgabe.fragen || {});
    const klausur = Object.values(ausgabe.fremde || {});
    box.appendChild(el('p', 'co-hinweis', 'Frageneditor: für Aufgaben, die noch nicht geschrieben wurden oder '
      + 'gestaltet werden sollen. Bewertungsseite: für schon geschriebene Tests – dort im Reiter „Horizont".'));
    kurz.forEach((f) => box.appendChild(zeile(f, 'Kurztest')));
    klausur.forEach((f) => box.appendChild(zeile(f, f.grund === 'grader' ? 'Klausur' : 'ohne Marker')));
    if (!kurz.length && !klausur.length) box.appendChild(el('p', 'co-hinweis', 'Keine Freitextaufgaben gefunden.'));
    // Reiter 1 und Abzeichen: wie viele Aufgaben brauchen einen (neuen) Horizont?
    const offen = [...kurz, ...klausur].filter((f) => !(f.horizont && f.vonFreitext)).length;
    const badge = panel.querySelector('.co-badge');
    if (badge) { badge.textContent = offen ? String(offen) : ''; badge.classList.toggle('co-hidden', !offen || !!EINZEL); }
    const hh = $('.co-hzhinweis');
    if (hh) {
      hh.innerHTML = '';
      hh.classList.toggle('co-hidden', !offen || !!EINZEL);
      if (offen && !EINZEL) {
        hh.appendChild(document.createTextNode(offen + (offen === 1 ? ' Aufgabe hat' : ' Aufgaben haben')
          + ' keinen aktuellen Horizont. '));
        const a = el('a', null, 'Zu Reiter 3 · Horizonte →');
        a.addEventListener('click', () => reiterZeigen('horizont'));
        hh.appendChild(a);
      }
    }
  }

  /* ---- Reiter 2: Eintragen ---- */

  const KEINE_ERNTE = 'Zu diesem Test liegen keine ausgelesenen Daten vor. Bitte zuerst in '
    + 'Reiter 1 „Kurztest-Aufgaben durchsuchen" laufen lassen.';

  function jsonAusFeld(feld) {
    const roh = feld.value.replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '').trim();
    if (!roh) throw new Error('Das Feld ist leer.');
    if (!/^[{[]/.test(roh)) throw new Error('Das sieht nicht nach JSON aus — der Text muss mit { beginnen.');
    return JSON.parse(roh);
  }

  $('.co-pruef').addEventListener('click', () => {
    const info = $('.co-pinfo');
    info.classList.remove('co-hidden');
    $('.co-schreibknoepfe').classList.add('co-hidden');
    $('.co-abschluss').classList.add('co-hidden');
    $('.co-log').classList.add('co-hidden');
    $('.co-vorschau').innerHTML = '';
    eintraege = null;
    try {
      if (!ausgabe) throw new Error(KEINE_ERNTE);
      const daten = jsonAusFeld($('.co-json'));
      const liste = daten.bewertungen || [];
      if (!liste.length) throw new Error('Keine „bewertungen" im JSON gefunden.');
      const idx = new Map(ausgabe.antworten.map((a) => [a.qubaid + '|' + a.slot, a]));

      const raus = [];
      liste.forEach((e, i) => {
        const nr = i + 1;
        if (e.qubaid == null || e.slot == null) throw new Error(`Eintrag ${nr}: „qubaid" oder „slot" fehlt.`);
        const a = idx.get(String(e.qubaid) + '|' + String(e.slot));
        if (!a) throw new Error(`Eintrag ${nr}: zu qubaid ${e.qubaid} / slot ${e.slot} gibt es keine `
          + 'ausgelesene Antwort. Stammt das JSON zu diesem Durchlauf?');
        const inhalt = Number(e.inhalt);
        if (isNaN(inhalt) || inhalt < 0 || inhalt > 100) {
          throw new Error(`Eintrag ${nr}: „inhalt" ist kein Prozentwert (${e.inhalt}).`);
        }
        // Musterloesung nur, wenn inhaltlich etwas fehlte — bei voller Punktzahl waere
        // sie eine Belehrung fuer eine richtige Antwort.
        const frageDaten = (ausgabe.fragen && ausgabe.fragen[a.frage]) || {};
        const r = punkteRechnen(a.max, inhalt, e.fehler, hoechstabzugFuer(frageDaten), a.antwort);
        // Neue Form: gegliederte Rueckmeldung, aus der das Plugin das HTML baut.
        // Alte Form („text" als fertiger Satz) bleibt gueltig, damit gespeicherte
        // eigene Prompts weiter funktionieren.
        const muster = inhalt < 100 ? kernaussage(frageDaten.horizont) : '';
        const rmText = rueckmeldungHtml(optionen.entferneQuellen ? ohneQuellenTief(e.rueckmeldung) : e.rueckmeldung, muster,
          { inhalt: r.inhaltPunkte, inhaltMax: a.max, abzug: r.abzugPunkte, gewicht: r.gewicht })
          || String(e.text || '').trim();
        raus.push({
          ...a, inhalt, fehler: e.fehler || [], text: rmText,
          punkte: r.punkte, gewicht: r.gewicht, abzug: r.abzug,
          rechnung: `Inhalt ${prozentText(inhalt)} % = ${komma(r.inhaltPunkte)} · `
            + `${r.gewicht} Fehlerpunkt(e) → −${prozentText(Math.round(r.abzug * 10) / 10)} % · `
            + `= ${komma(r.punkte)} von ${komma(a.max)}`
        });
      });

      eintraege = raus;
      // Seit der gegliederten Rückmeldung bekommt JEDER Eintrag einen Text — die
      // fehlerfreien ein Lob. Ein Eintrag ohne Text ist deshalb ein Hinweis auf ein
      // vergessenes Feld, nicht mehr der Normalfall.
      const ohneText = raus.filter((e) => !e.text).length;
      const seiten = new Set(raus.map((e) => e.slot + '|' + e.qid)).size;
      info.className = 'co-pinfo co-ok';
      info.textContent = `✓ ${raus.length} Bewertungen auf ${seiten} Fragenseiten — bereit. `
        + 'Punkte und Abzug wurden aus Inhalt und Fehlerzahl berechnet '
        + `(Rechtschreib-Höchstabzug ${prozentText(rsStandard())} %).`
        + (ohneText ? ` ⚠ ${ohneText} Eintrag/Einträge ohne Rückmeldungstext.` : '');

      // Vergleich mit der bisherigen Bewertung (nur bei schon bewerteten Versuchen)
      const mitAlt = raus.filter((e) => e.bisher != null);
      const gleich = mitAlt.filter((e) => Math.abs(e.bisher - e.punkte) < 0.005).length;
      const hoeher = mitAlt.filter((e) => e.punkte - e.bisher >= 0.005).length;
      const niedriger = mitAlt.length - gleich - hoeher;
      if (mitAlt.length) {
        info.textContent += ` Vergleich mit der bisherigen Bewertung: ${gleich} gleich, `
          + `${hoeher} höher, ${niedriger} niedriger.`;
      }
      const bespr = typeof daten.besprochen === 'boolean' ? daten.besprochen : null;
      if (bespr === true) info.textContent += ' Mit der KI gemeinsam besprochen.';
      if (bespr === false) info.textContent += ' Automatisch bewertet – ein Blick in die Liste lohnt sich.';
      const box = el('div', 'co-rechnung');
      raus.forEach((e) => {
        const z = el('a', 'co-logzeile co-vorschauzeile');
        const href = versuchLink(e);
        if (href) { z.href = href; z.target = '_blank'; z.rel = 'noopener'; }
        z.appendChild(el('span', 'co-vfrage', e.frage));
        z.appendChild(el('span', 'co-vans', '„' + e.antwort.slice(0, 60) + '"'));
        z.appendChild(el('span', 'co-vpkt', e.rechnung));
        if (e.bisher != null) {
          const anders = Math.abs(e.bisher - e.punkte) >= 0.005;
          const v = el('span', 'co-vbisher' + (anders ? ' co-vanders' : ''),
            'bisher ' + komma(e.bisher) + ' → neu ' + komma(e.punkte));
          z.appendChild(v);
        }
        box.appendChild(z);
      });
      $('.co-vorschau').appendChild(box);
      $('.co-schreibknoepfe').classList.remove('co-hidden');
      // Die Knöpfe stehen jetzt direkt unter der Meldung, die lange Vorschau darunter.
      // Vorher lag „Alle eintragen" hinter 78 Zeilen und war nicht zu sehen.
      $('.co-schreibknoepfe').scrollIntoView({ block: 'nearest' });
    } catch (e) {
      info.className = 'co-pinfo co-error';
      info.textContent = 'Fehler: ' + e.message;
    }
  });

  function logSchreiber(logEl) {
    return (t, href) => {
      const z = href ? el('a', 'co-logzeile', t) : el('div', 'co-logzeile', t);
      if (href) { z.href = href; z.target = '_blank'; z.rel = 'noopener'; }
      if (t.startsWith('✗') || t.startsWith('⚠')) z.classList.add('co-logfehler');
      logEl.appendChild(z); logEl.scrollTop = logEl.scrollHeight;
    };
  }

  async function schreibLauf(trocken) {
    if (!eintraege) return;
    const log = $('.co-log'), abschluss = $('.co-abschluss');
    log.innerHTML = ''; log.classList.remove('co-hidden');
    abschluss.classList.add('co-hidden');
    $('.co-progress2').classList.remove('co-hidden');
    $('.co-alle').disabled = true;
    $('.co-progress2').scrollIntoView({ block: 'nearest' });
    const schreibLog = logSchreiber(log);
    const fortschritt = (f, g) => {
      $('.co-bar2').style.width = Math.round((f / g) * 100) + '%';
      $('.co-ptext2').textContent = `${f} / ${g} Fragenseiten`;
    };
    try {
      const r = trocken
        ? await trockenlauf(eintraege, schreibLog, fortschritt)
        : await eintragenMitWiederholung(eintraege, $('.co-ki').checked, schreibLog, fortschritt);
      log.prepend(el('div', 'co-logkopf', trocken
        ? `${r.ok} Felder gefunden · ${r.fehler} fehlen · ${r.gruppen} Seiten geprüft`
        : `${r.ok} eingetragen und geprüft · ${r.fehler} fehlgeschlagen · ${r.gruppen} Seiten`
          + (r.versuche > 1 ? ` · ${r.versuche} Versuche gebraucht` : '')));
      abschluss.classList.remove('co-hidden');
      if (r.fehler > 0) {
        abschluss.className = 'co-abschluss co-abfehler';
        abschluss.textContent = trocken
          ? `⚠ ${r.fehler} Feld/Felder fehlen. Trag noch nichts ein — stammt das JSON zu diesem Durchlauf?`
          : `⚠ ${r.fehler} Eintrag/Einträge sind nicht angekommen. Sieh sie im Protokoll nach.`;
        // Seit 1.8.10: der Knopf selbst sagt, dass noch etwas fehlt — ein Klick
        // genuegt zum erneuten Versuch, statt nur "Alle eintragen" zu lesen und
        // sich zu fragen, ob das dasselbe nochmal macht (Arne, 17.09.2026: schon
        // ein einziger Fehlschlag verunsichert).
        if (!trocken) $('.co-alle').textContent = 'Erneut versuchen';
      } else {
        abschluss.className = 'co-abschluss co-abok';
        abschluss.textContent = trocken
          ? `✓ Alles vorhanden — ${r.ok} Felder auf ${r.gruppen} Seiten. Du kannst eintragen.`
          : `✓ Fertig — ${r.ok} Einträge auf ${r.gruppen} Seiten, keine Fehler.`;
        if (!trocken) $('.co-alle').textContent = 'Alle eintragen';
        // Ohne Fehler gibt es nichts mehr nachzusehen: das Panel schließt sich selbst,
        // damit das Ende sichtbar ist. Mit Fehlern bleibt es offen — sonst verschwände
        // genau die Zeile, die man lesen muss. Ein Klick ins Panel bricht ab.
        if (!trocken && EINZEL) {
          // Einzelseite: Das Formular unten zeigt noch den alten Stand. Neu laden, damit
          // niemand mit Moodles „Speichern" die eben eingetragenen Werte ueberschreibt.
          abschluss.textContent = `✓ Fertig — ${r.ok} Einträge, keine Fehler. Die Seite lädt neu und zeigt die neuen Punkte …`;
          setTimeout(() => location.reload(), 2500);
        } else if (!trocken) {
          let rest = 3;
          const zaehler = setInterval(() => {
            rest--;
            abschluss.textContent =
              `✓ Fertig — ${r.ok} Einträge auf ${r.gruppen} Seiten, keine Fehler. `
              + `Fenster schließt in ${rest} …`;
            if (rest <= 0) {
              clearInterval(zaehler);
              panel.classList.add('co-hidden');
              abschluss.textContent =
                `✓ Fertig — ${r.ok} Einträge auf ${r.gruppen} Seiten, keine Fehler.`;
            }
          }, 1000);
          panel.addEventListener('click', () => clearInterval(zaehler), { once: true });
        }
      }
      abschluss.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      schreibLog('✗ Abbruch: ' + e.message);
    } finally {
      $('.co-progress2').classList.add('co-hidden');
      $('.co-alle').disabled = false;
    }
  }
  $('.co-alle').addEventListener('click', () => schreibLauf(false));
  // Eingefuegt wird fast immer die fertige KI-Antwort: gleich pruefen.
  $('.co-json').addEventListener('paste', () => setTimeout(() => $('.co-pruef').click(), 0));
  $('.co-hjson').addEventListener('paste', () => setTimeout(() => $('.co-hpruef').click(), 0));
  // Ohne sichtbaren Prüfen-Knopf (wie Reviewer 1.7.2): geprüft wird beim Einfügen
  // sofort und nach Handänderungen nach einer kurzen Tipp-Pause.
  [['.co-json', '.co-pruef'], ['.co-hjson', '.co-hpruef']].forEach(([feld, knopf]) => {
    let uhr = null;
    $(feld).addEventListener('input', (ev) => {
      if (ev.inputType === 'insertFromPaste') return;
      clearTimeout(uhr);
      uhr = setTimeout(() => { if ($(feld).value.trim()) $(knopf).click(); }, 800);
    });
  });

  /* ---- Reiter 3: Erwartungshorizont ---- */

  // Welche Fragen kommen in den Horizont-Prompt: die ohne Horizont immer, die mit
  // Horizont nur auf ausdruecklichen Wunsch — dort wird ein vorhandener Text ersetzt.
  function horizontAuswahl() {
    if (!ausgabe) return [];
    const alle = Object.values(ausgabe.fragen);
    return $('.co-halle').checked ? alle : alle.filter((f) => !f.horizont);
  }
  // Der Wunschtext ueberlebt das Neuladen der Seite: er wird oft in zwei Anlaeufen
  // formuliert, und ein verlorener Text aergert mehr als ein paar Bytes im Speicher.
  const WUNSCH_KEY = 'coachWunsch_' + CMID;
  function aenderungsWunsch() {
    const f = panel.querySelector('.co-hwunsch');
    return f ? f.value.trim() : '';
  }
  try {
    browser.storage.local.get([WUNSCH_KEY], (r) => {
      const t = r && r[WUNSCH_KEY];
      if (t && !aenderungsWunsch()) panel.querySelector('.co-hwunsch').value = t;
    });
  } catch (e) { /* egal */ }
  panel.querySelector('.co-hwunsch').addEventListener('input', () => {
    try { browser.storage.local.set({ [WUNSCH_KEY]: aenderungsWunsch() }); } catch (e) { /* egal */ }
  });

  function hcopyBeschriften() {
    const n = horizontAuswahl().length;
    const neu = $('.co-halle').checked;
    $('.co-hcopy').textContent = neu
      ? `📋 Prompt zum Neuschreiben kopieren (${n} Frage${n === 1 ? '' : 'n'})`
      : '📋 Prompt für Erwartungshorizont kopieren';
  }
  $('.co-halle').addEventListener('change', hcopyBeschriften);

  $('.co-hcopy').addEventListener('click', async () => {
    if (!ausgabe) { $('.co-hinfo').className = 'co-hinfo co-error';
      $('.co-hinfo').classList.remove('co-hidden');
      $('.co-hinfo').textContent = KEINE_ERNTE; return; }
    const auswahl = horizontAuswahl();
    if (!auswahl.length) { $('.co-hinfo').className = 'co-hinfo';
      $('.co-hinfo').classList.remove('co-hidden');
      $('.co-hinfo').textContent = 'Es fehlt kein Horizont. Setz das Häkchen darüber, '
        + 'wenn du die vorhandenen neu schreiben lassen willst.'; return; }
    await inZwischenablage(baueHorizontPrompt(auswahl));
    const urText = $('.co-hcopy').textContent;
    quittung('.co-hcopy', urText, 'horizont', '.co-hjson');
  });

  $('.co-hpruef').addEventListener('click', () => {
    const info = $('.co-hinfo');
    info.classList.remove('co-hidden');
    $('.co-hknoepfe').classList.add('co-hidden');
    $('.co-habschluss').classList.add('co-hidden');
    $('.co-hlog').classList.add('co-hidden');
    $('.co-hliste').innerHTML = '';
    horizonte = null;
    try {
      const daten = jsonAusFeld($('.co-hjson'));
      const liste = daten.horizonte || [];
      if (!liste.length) throw new Error('Keine „horizonte" im JSON gefunden.');
      const bekannt = ausgabe
        ? new Map(Object.values(ausgabe.fragen).map((f) => [String(f.qid), f])) : new Map();

      horizonte = liste.map((h, i) => {
        if (!h.qid) throw new Error(`Horizont ${i + 1}: „qid" fehlt.`);
        const f = bekannt.get(String(h.qid));
        const text = String(h.text || '').trim();
        if (!text) throw new Error(`Horizont ${i + 1}: „text" ist leer.`);
        return { qid: String(h.qid), frage: h.frage || (f ? f.name : 'Frage ' + h.qid),
                 text, bekannt: !!f, hatteHorizont: !!(f && f.horizont) };
      });

      const ueberschreibt = horizonte.filter((h) => h.hatteHorizont).length;
      const unbekannt = horizonte.filter((h) => !h.bekannt).length;
      info.className = 'co-hinfo co-ok';
      info.textContent = `✓ ${horizonte.length} Horizont(e) gelesen.`
        + (unbekannt ? ` ⚠ ${unbekannt} gehören zu keiner ausgelesenen Frage.` : '')
        + (ueberschreibt ? ` ⚠ ${ueberschreibt} würden einen vorhandenen Horizont überschreiben.` : '');

      const box = $('.co-hliste');
      horizonte.forEach((h, i) => {
        const k = el('div', 'co-hcard');
        k.appendChild(el('div', 'co-fehlendkopf', `${h.frage}  ·  qid ${h.qid}`));
        const ta = el('textarea', 'co-htext');
        ta.value = h.text; ta.rows = 10;
        ta.addEventListener('input', () => { horizonte[i].text = ta.value; });
        k.appendChild(ta);
        box.appendChild(k);
      });
      $('.co-hknoepfe').classList.remove('co-hidden');
      info.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      info.className = 'co-hinfo co-error';
      info.textContent = 'Fehler: ' + e.message;
    }
  });

  async function horizontLauf(trocken) {
    if (!horizonte || !horizonte.length) return;
    const log = $('.co-hlog'), abschluss = $('.co-habschluss');
    log.innerHTML = ''; log.classList.remove('co-hidden');
    abschluss.classList.add('co-hidden');
    $('.co-progress3').classList.remove('co-hidden');
    $('.co-hschreib').disabled = true;
    $('.co-progress3').scrollIntoView({ block: 'nearest' });
    const schreibLog = logSchreiber(log);
    let ok = 0, fehler = 0, fertig = 0;
    try {
      for (const h of horizonte) {
        try {
          const r = await horizontSchreiben(h.qid, h.text, trocken);
          ok++;
          schreibLog(trocken
            ? `✓ ${h.frage} — Feld „${r.feld}" vorhanden`
              + (r.vorher && r.vorher.replace(/<[^>]*>/g, '').trim() ? ' (enthält schon Text!)' : '')
            : `✓ ${h.frage} — Horizont eingetragen`);
        } catch (e) {
          fehler++; schreibLog(`✗ ${h.frage}: ${e.message}`);
        }
        fertig++;
        $('.co-bar3').style.width = Math.round((fertig / horizonte.length) * 100) + '%';
        $('.co-ptext3').textContent = `${fertig} / ${horizonte.length} Fragen`;
      }
      log.prepend(el('div', 'co-logkopf', trocken
        ? `${ok} Fragen erreichbar · ${fehler} nicht`
        : `${ok} Horizonte eingetragen · ${fehler} fehlgeschlagen`));
      abschluss.classList.remove('co-hidden');
      abschluss.className = 'co-habschluss ' + (fehler ? 'co-abfehler' : 'co-abok');
      abschluss.textContent = fehler
        ? `⚠ ${fehler} Frage(n) konnten nicht geschrieben werden. Sieh ins Protokoll.`
        : (trocken
          ? `✓ Alle ${ok} Fragen sind erreichbar und haben das Feld. Du kannst eintragen.`
          : `✓ ${ok} Horizonte stehen jetzt in den Fragen. Führe Reiter 1 noch einmal aus, `
            + 'dann sind sie im Bewertungs-Prompt dabei.');
      abschluss.scrollIntoView({ block: 'nearest' });
      if (!fehler && !trocken) {
        abschluss.textContent += ' Weiter zu Reiter 1 in 3 s …';
        reiterAutoAbbrechen();
        reiterAutoTimer = setTimeout(() => { reiterAutoTimer = null; reiterZeigen('lesen'); }, 3000);
      }
    } finally {
      $('.co-progress3').classList.add('co-hidden');
      $('.co-hschreib').disabled = false;
    }
  }
  $('.co-hschreib').addEventListener('click', () => {
    // Das schreibt in die Fragensammlung, nicht in eine Bewertung. Einmal nachfragen.
    const n = horizonte ? horizonte.length : 0;
    if (!n) return;
    const box = $('.co-habschluss');
    box.classList.remove('co-hidden');
    box.className = 'co-habschluss co-abfrage';
    box.innerHTML = '';
    box.appendChild(el('div', null,
      `Der Erwartungshorizont wird in ${n} Frage(n) der Fragensammlung geschrieben. `
      + 'Das ändert die Fragen selbst, nicht nur eine Bewertung.'));
    const ja = el('button', 'co-jetzt', `Ja, in ${n} Frage(n) eintragen`);
    box.appendChild(ja);
    ja.addEventListener('click', () => { box.classList.add('co-hidden'); horizontLauf(false); });
  });
}
