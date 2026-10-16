/* Moodle AI Freitext Grader 0.7.0 — Klausur-Weg und Frageneditor (aus Moodle AI Grader 3.2.2)
 *
 * Wirkt auf zwei Seiten:
 *   A) Bewertungsseite   mod/quiz/report.php               → Reiter Korrektur + Horizont
 *   B) Bearbeiten-Seite  question/bank/editquestion/…      → Reiter Horizont + Antwortvorlage
 *
 * Grundsaetze (siehe Projektdokumentation):
 *   - Der Erwartungshorizont steht in der FRAGE (Moodle-Feld graderinfo), nicht im Plugin.
 *   - Die ERWEITERUNG RECHNET, die KI beurteilt nur. Sie liefert Prozente je Aufgabe und
 *     eine gezaehlte Fehlerliste; Punkte, Rundung und Rechtschreibabzug rechnet der Code.
 *   - Kein Zugriff auf Seiten-JavaScript: kein background.js, kein world:'MAIN',
 *     keine host_permissions. Geschrieben wird ueber fetch des Formulars + Absenden.
 *   - Projekteigene Konventionen (AFB-Kartendesign, Antwortvorlage) sind eine
 *     VERBESSERUNG, nie eine VORAUSSETZUNG. Drei Stufen, siehe zerlegeAbgabe().
 *
 * © 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
 *
 * WXT-Umzug 17.09.2026: chrome.* -> browser.* (Polyfill), IIFE -> export
 * function starteGrader(), Icon-Pfad icons/icon128.png -> icon/128.png
 * (WXT legt public/icon/ als icon/ ab). Sonst zeilengleich mit v3.1.0.
 */
import { browser } from 'wxt/browser';
import { MARKER_RE as GEMEINSAM_MARKER_RE, MARKER_ZEILE_RE_M, MARKER_KLAUSUR, MARKER_KURZTEST, markerWer, modusAus } from './gemeinsam/marker.js';
import { kurztestHorizontVorlage } from './gemeinsam/kurztest-horizont.js';
import { bewertungsKopf } from './gemeinsam/bewertungsregeln.js';
import { stufenBlock, materialBlock as materialBaustein, horizontRegeln, HORIZONT_ZWECK } from './gemeinsam/horizont-bausteine.js';
import { schreibeEditorfeldLive, leseEditorfeldLive } from './gemeinsam/editor-live.js';
import { gestalteAufgabe, istGestaltet, afbAusText, antwortKasten, zerlegeAufgabentext, nrKey } from './gemeinsam/aufgaben-layout.js';
import { rundgangLaden, rundgangPosition, einzelseiteUrl, uebersichtUrl } from './gemeinsam/rundgang.js';

export function starteGrader() {
  'use strict';

  // Versionsnummer aus dem Manifest fuer die Kopfzeile des Panels — so ist nach
  // "↺ neu laden" sofort sichtbar, welche Fassung aktiv ist, ohne sie doppelt zu pflegen.
  const VERSION = (browser.runtime.getManifest ? browser.runtime.getManifest().version : '');

  /* ═══════════════════════════════════════════════════════════════════
     1 · KONTEXT
     ═══════════════════════════════════════════════════════════════════ */

  // Die Bearbeiten-Seite erkennt man am Formularfeld des Erwartungshorizonts.
  // Live geprueft 04.09.2026: die Seite hat ZWEI Formulare, nur eines traegt das Feld.
  function istBearbeitenSeite() {
    return !!document.querySelector('[name="graderinfo[text]"]');
  }

  // Die Bewertungsseite erkennt man an den Punktefeldern plus einem Merkmal, das es
  // nur auf einer Moodle-Bewertungsseite gibt (Gegenprobe bei breitem matches-Muster).
  function istBewertungsSeite() {
    if (document.querySelectorAll('input[id$="-mark"]').length === 0) return false;
    return !!(document.querySelector('.qtype_essay_response')
           || document.querySelector('textarea[id$="-comment_id"]')
           || document.querySelector('textarea[name$="-comment"]')
           || document.querySelector('.ablock'));
  }

  const KONTEXT = istBearbeitenSeite() ? 'bearbeiten'
                : istBewertungsSeite() ? 'bewertung'
                : null;
  if (!KONTEXT) return;

  /* ═══════════════════════════════════════════════════════════════════
     2 · KONSTANTEN
     ═══════════════════════════════════════════════════════════════════ */

  // Zustaendigkeits-Marker in der ersten Zeile des Horizonts. Toleriert Klammern/keine,
  // Gross-/Kleinschreibung, Leer- statt Bindestrich, Text dahinter.
  const MARKER_RE   = GEMEINSAM_MARKER_RE;
  const MARKER_ZEILE = MARKER_KLAUSUR;

  // Meta-Zeilen direkt nach dem Marker (seit 3.1.0): Rechtschreibungs-Prozent und
  // Punkteschritte, wie sie beim Erzeugen des Horizonts eingestellt waren. Reine
  // Verwaltung wie der Marker — fliessen nie in einen Prompt ein. Grund: Bei mehreren
  // Kursen (8./9./10. Klasse) wird sonst leicht vergessen, die Einstellung vor jeder
  // Korrektur an die richtige Klasse anzupassen.
  const RS_ZEILE_RE = /rechtschreibung\s*[:\-]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i;
  const SCHRITTE_ZEILE_RE = /punkteschritte\s*[:\-]?\s*([\d.,]+)/i;

  function metaZeilen(prozent, punkteschritte, feedback) {
    return '<p>[Rechtschreibung: ' + komma(prozent) + '%]</p>'
         + '<p>[Punkteschritte: ' + komma(punkteschritte) + ']</p>'
         + (feedback ? '<p>[Feedback: ' + feedback + ']</p>' : '');
  }

  // Die Meta-Zeilen stehen ganz oben im Horizont, vor der ersten "Aufgabe N"-Zeile.
  // Danach wird nicht mehr gesucht — Inhalt koennte zufaellig aehnlich aussehen.
  function metaKopf(horizontRoh) {
    const zeilen = htmlZuText(horizontRoh).split('\n').map(z => z.trim());
    const kopf = [];
    for (const z of zeilen) {
      if (!z) continue;
      if (AUFGABE_RE.test(z)) break;
      kopf.push(z);
      if (kopf.length >= 6) break;
    }
    return kopf.join('\n');
  }

  function rechtschreibungAusHorizont(horizontRoh) {
    const m = metaKopf(horizontRoh).match(RS_ZEILE_RE);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }

  // Freitext Grader: Feedbacklaenge je Frage als Meta-Zeile, Vorrang vor der Einstellung.
  const FEEDBACK_ZEILE_RE = /^\s*\[?\s*feedback\s*[:\-]?\s*(kurz|mittel|ausführlich|umfangreich)\s*\]?\s*$/im;
  function feedbackAusHorizont(horizontRoh) {
    const m = metaKopf(horizontRoh).match(FEEDBACK_ZEILE_RE);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
  }
  function fbLaenge() {
    if (KONTEXT === 'bearbeiten' && typeof FEEDBACK !== 'undefined') return FEEDBACK;
    let roh = '';
    try { roh = leseHorizontRoh() || E.horizontLokal || ''; } catch (e) { /* Seite ohne Horizont */ }
    return feedbackAusHorizont(roh) || E.feedbacklaenge;
  }

  function punkteschritteAusHorizont(horizontRoh) {
    const m = metaKopf(horizontRoh).match(SCHRITTE_ZEILE_RE);
    return m ? zahl(m[1]) : null;
  }

  // Eine Aufgabengrenze — in der Horizont-Ueberschrift wie in der Kopfzeile der
  // Antwortvorlage. Die eingekreiste Ziffer davor ist optional.
  // „Aufgabe 2a" (Horizont, alte Vorlagen) oder „2a · …" (Kopfzeile der neuen Antwortvorlage).
  const AUFGABE_RE = /^\s*[①-⑳⓪]?\s*(?:Aufgabe\s+(\d{1,2}\s*[a-h]?)(?![a-z])|(\d{1,2}[a-h]?)\s*·)/i;
  const aufgabeNr = (m) => nrKey(m[1] || m[2]);

  // AFB-Farblogik des Projekts. Nur wirksam, wenn die Option eingeschaltet ist —
  // fremde Nutzer bekommen das neutrale Layout.
  const AFB_FARBEN = {
    'I':   { kopf: '#eaf4ea', feld: '#f5faf5' },
    'II':  { kopf: '#fdf2e0', feld: '#fffaf0' },
    'III': { kopf: '#fbe9e9', feld: '#fdf3f3' },
    'neutral': { kopf: '#eceff3', feld: '#f8f9fb' }
  };

  // Rechtschreibabzug: Stufen nach Fehlern je 100 Woertern. Anteil vom Hoechstabzug.
  // Seit 3.1.0 fest im Code statt als Voreinstellung waehlbar (keine/mild/normal/streng
  // entfielen) — die drei Stufen waren nur eine Kalibrierungs-Reserve ohne eigenstaendige
  // didaktische Bedeutung, und mehr Prozent wirkt ueber den Hoechstabzug ohnehin schon
  // 'strenger'. Einzige verbleibende Einstellung ist der Prozentwert (`rechtschreibung`).
  // Unter MINDESTWOERTER greift die Dichte nicht — dort wird nach absoluter Fehlerzahl
  // gestaffelt (wie im Coach).
  const RS_LEITER = [ [1.0, 0], [2.0, 1/3], [3.5, 2/3], [Infinity, 1] ];
  const RS_ABSOLUT   = [0, 1/3, 1/2, 2/3, 5/6, 1]; // 0,1,2,3,4,5+ Fehler
  const MINDESTWOERTER = 40;

  const STANDARD = {
    fach:            '',
    jahrgang:        '',
    kursniveau:      'G',
    punkteschritte:  '0.5',
    rechtschreibung: '10',      // Prozent der Gesamtpunktzahl, 0 = kein Abzug
    feedbacklaenge:  'Ausführlich',
    afbFarben:       true,      // Antwortvorlage in AFB-Farblogik statt neutral
    vorlagePunkte:   true,
    vorlageAfb:      true,
    kartePunkte:     true,      // Aufgaben-Layout: Punkte je Teilaufgabe in der Karte
    layoutAufgabe:   true,      // Layout-Reiter: Aufgabenstellung gestalten
    layoutAntwort:   true,      // Layout-Reiter: Antwortvorlage gestalten
    kiHinweis:       true,
    entferneQuellen: true,
    promptHorizont:  null,
    promptKorrektur: null,
    horizontLokal:   '',        // Rueckfallebene: Horizont im Plugin statt in der Frage
    sprachabzugKurztest: '30'   // Kurztest-Modus: hoechster Sprachabzug in % vom Inhalt (wie Coach)
  };

  let E = JSON.parse(JSON.stringify(STANDARD));   // aktive Einstellungen
  // Gilt nur fuer den aktuellen Korrektur-Durchlauf, wird nie gespeichert: erzwingt die
  // eingestellte Rechtschreibungs-Prozentzahl statt der im Horizont hinterlegten (3.1.0).
  let rsEinstellungErzwingen = false;

  /* ═══════════════════════════════════════════════════════════════════
     3 · KLEINE HELFER
     ═══════════════════════════════════════════════════════════════════ */

  const $  = (sel, wurzel) => (wurzel || document).querySelector(sel);
  const $$ = (sel, wurzel) => [...(wurzel || document).querySelectorAll(sel)];

  function el(tag, klasse, text) {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Punkte im deutschen Format — sonst nimmt Moodle den Wert nicht an.
  function komma(z) { return String(z).replace('.', ','); }
  function zahl(s)  { return parseFloat(String(s == null ? '' : s).replace(',', '.')); }

  // Auf die eingestellten (oder aus dem Horizont uebernommenen) Punkteschritte runden,
  // nie ueber max.
  function rundePunkte(wert, max, schrittOverride) {
    const schritt = schrittOverride || parseFloat(E.punkteschritte) || 0.5;
    let p = Math.round(wert / schritt) * schritt;
    p = Math.max(0, Math.min(p, max));
    return Math.round(p * 100) / 100;
  }

  function woerter(text) {
    return (String(text || '').trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  }

  function ersteZeile(text) {
    return (String(text || '').split('\n').map(z => z.trim()).find(Boolean)) || '';
  }

  function ohneMarker(text) {
    let t = String(text || '');
    const z = ersteZeile(t);
    if (MARKER_RE.test(z)) {
      t = t.replace(z, z.replace(MARKER_RE, '')).replace(/^\s*\n/, '');
    } else {
      // Steht der Marker als eigene Zeile irgendwo am Anfang, ebenfalls entfernen.
      t = t.replace(MARKER_ZEILE_RE_M, '').replace(/^\s*\n+/, '');
    }
    // Rechtschreibungs- und Punkteschritte-Meta-Zeilen ebenfalls entfernen (3.1.0) — sie
    // sind Verwaltung, kein Bewertungsmassstab, egal ob als eigene <p>-Zeile oder Text.
    for (let i = 0; i < 3; i++) {
      const zz = ersteZeile(t);
      if (zz && (RS_ZEILE_RE.test(zz) || SCHRITTE_ZEILE_RE.test(zz) || FEEDBACK_ZEILE_RE.test(zz))) {
        t = t.replace(zz, '').replace(/^\s*\n/, '');
      } else break;
    }
    return t;
  }

  function quellenWeg(text) {
    if (!E.entferneQuellen) return String(text || '');
    return String(text || '').replace(/\[\w+:\d+\]/g, '').replace(/ {2,}/g, ' ').trim();
  }

  // Anrede nach Jahrgang — ab Jahrgang 11 wird gesiezt.
  function anrede() {
    const jg = parseInt(E.jahrgang, 10);
    return (!isNaN(jg) && jg >= 11) ? 'Sie haben' : 'Du hast';
  }

  // ACHTUNG: innerText liefert bei einem Element, das NICHT im Dokument haengt,
  // dasselbe wie textContent — ohne Zeilenumbrueche. Deshalb die Blockenden vorher
  // selbst zu Umbruechen machen, statt sich auf die Darstellung zu verlassen.
  // DOMParser statt innerHTML-Zuweisung: entschluesselt HTML genauso, fuehrt aber
  // nie Skripte aus dem Eingabetext aus und triggert AMOs "Unsafe assignment to
  // innerHTML"-Pruefung nicht, weil hier keine .innerHTML gesetzt wird.
  function htmlZuText(html) {
    const bearbeitet = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '</$1>\n');
    const d = new DOMParser().parseFromString(bearbeitet, 'text/html').body;
    return (d.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Baut aus einem HTML-String echte, aber NIE ins Live-Dokument gehaengte DOM-Knoten
  // (via DOMParser) — fuer .children/.outerHTML/.tagName-Zugriffe wie im herkoemmlichen
  // Detached-Div-Muster, nur ohne die von AMO bemaengelte innerHTML-Zuweisung.
  function wurzelAus(html) {
    return new DOMParser().parseFromString(String(html || ''), 'text/html').body;
  }

  // Setzt sichtbaren HTML-Inhalt, ohne .innerHTML zuzuweisen: der String wird per
  // DOMParser geparst (darin enthaltene <script>-Elemente sind lt. HTML-Spezifikation
  // inert und werden nie ausgefuehrt, auch nicht nach dem Einhaengen) und die daraus
  // entstandenen Knoten werden dann in das Zielelement verschoben.
  function setzeHtml(el, html) {
    el.replaceChildren(...wurzelAus(html).childNodes);
  }

  // Blockelemente — nur sie gliedern; alles andere ist Inline und gehoert zum Elterntext.
  const BLOCK_RE = /^(DIV|P|H[1-6]|UL|OL|LI|TABLE|TBODY|TR|TD|TH|BLOCKQUOTE|SECTION|ARTICLE|PRE)$/;

  function nurText(knoten) {
    return String(knoten.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* ═══════════════════════════════════════════════════════════════════
     4 · FORMULAR-MECHANIK  (uebernommen aus Moodle AI Coach / Reviewer)

     Es wird NIE ein Feld der offenen Seite befuellt: TinyMCE liegt ueber den
     Textareas und wuerde beim Absenden seinen eigenen Inhalt darueberschreiben.
     Stattdessen: Formular per fetch holen, Felder ersetzen, selbst absenden,
     danach neu holen und gegenpruefen. Das braucht keine Sonderberechtigung.
     ═══════════════════════════════════════════════════════════════════ */

  async function holeDok(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);   // Fehlerstatus nie durchwinken
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  // Aus form.elements nur INPUT, SELECT und TEXTAREA uebernehmen.
  // Das Fragenformular enthaelt fuenf FIELDSETs MIT name (live geprueft 04.09.2026) —
  // ohne diesen Filter gingen sie als "undefined" mit.
  function formularFelder(form) {
    const p = new URLSearchParams();
    [...form.elements].forEach(f => {
      if (!f.name || f.disabled) return;
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName)) return;
      if (f.type === 'file' || f.type === 'submit' || f.type === 'button') return;
      if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) return;
      if (f.tagName === 'SELECT') {
        [...f.selectedOptions].forEach(o => p.append(f.name, o.value));
      } else {
        p.append(f.name, f.value);
      }
    });
    return p;
  }

  // WICHTIG: ausdruecklich `submitbutton` („Aenderungen speichern"). Der erste Knopf im
  // Fragenformular heisst `updatebutton` („Speichern und weiter bearbeiten") — damit
  // speichert Moodle NICHT, das Formular kommt ohne Fehlermeldung unveraendert zurueck
  // (live belegt 04.09.2026). `cancel` darf nie mitgehen.
  async function sendeFormular(form, felder, url) {
    const knoepfe = [...form.querySelectorAll('input[type=submit],button[type=submit]')]
      .filter(b => b.name && b.name !== 'cancel');
    const submit = knoepfe.find(b => b.name === 'submitbutton') || knoepfe[0];
    if (submit) felder.set(submit.name, submit.value);
    const action = new URL(form.getAttribute('action') || url, url).href;
    const antwort = await fetch(action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: felder.toString()
    });
    if (!antwort.ok) throw new Error('HTTP ' + antwort.status + ' beim Speichern');
    return antwort;
  }

  // Nach dem Speichern zeigt die ALTE id weiter den ALTEN Stand: Moodle legt eine neue
  // Fragenversion mit neuer id an. Die neue id steht im `lastchanged` der Weiterleitung;
  // Rueckfall ist der Fragename in der zurueckgelieferten Fragensammlung.
  async function neueFrageUrl(antwort, fragename, altUrl) {
    try {
      const ziel = new URL(antwort.url || altUrl);
      const lc = ziel.searchParams.get('lastchanged');
      const cmid = new URL(altUrl).searchParams.get('cmid') || ziel.searchParams.get('cmid');
      if (lc) return location.origin + '/question/bank/editquestion/question.php?id=' + lc
                    + (cmid ? '&cmid=' + cmid : '');
      const dok = new DOMParser().parseFromString(await antwort.clone().text(), 'text/html');
      const e = [...dok.querySelectorAll('[data-itemtype="questionname"]')]
        .find(x => (x.getAttribute('data-value') || '') === fragename);
      if (e && e.getAttribute('data-itemid')) {
        return location.origin + '/question/bank/editquestion/question.php?id='
             + e.getAttribute('data-itemid') + (cmid ? '&cmid=' + cmid : '');
      }
    } catch (e) { /* Rueckfall unten */ }
    return null;
  }

  // Vergleicht streng genug, um eine NICHT erfolgte Speicherung zu erkennen: der alte
  // Inhalt kann genauso anfangen wie der neue (bei der Antwortvorlage passiert).
  function inhaltPasst(gespeichert, gewollt) {
    const norm = t => htmlZuText(t).replace(/\s+/g, ' ').trim();
    const ist = norm(gespeichert), soll = norm(gewollt);
    if (!ist || !soll) return false;
    if (ist === soll) return true;
    if (Math.abs(ist.length - soll.length) > Math.max(40, soll.length * 0.2)) return false;
    const mitte = soll.slice(Math.floor(soll.length / 2), Math.floor(soll.length / 2) + 40);
    return ist.includes(soll.slice(0, 40)) && (mitte.length < 20 || ist.includes(mitte));
  }

  /* --- Bearbeiten-Seite: graderinfo und responsetemplate in EINEM Absenden --- */

  // eintraege: { 'graderinfo[text]': html, 'responsetemplate[text]': html }
  // nurPruefen = Trockenlauf: sagt, ob die Felder da sind und ob schon etwas drinsteht.
  async function schreibeFrageFelder(eintraege, nurPruefen) {
    const url = location.href;
    const dok = await holeDok(url);
    const form = [...dok.forms].find(f => f.querySelector('[name="graderinfo[text]"]'));
    if (!form) {
      throw new Error(dok.querySelector('form#login')
        ? 'Moodle hat auf die Anmeldeseite umgeleitet — bist du noch angemeldet?'
        : 'Bearbeiten-Formular nicht gefunden (ist es eine Freitextfrage?)');
    }
    const felder = formularFelder(form);
    const bericht = [];
    for (const name of Object.keys(eintraege)) {
      if (!felder.has(name)) throw new Error('Feld „' + name + '" nicht im Formular');
      const vorher = felder.get(name) || '';
      bericht.push({ feld: name, belegt: htmlZuText(vorher).length > 0 });
      if (!nurPruefen) felder.set(name, eintraege[name]);
    }
    if (nurPruefen) return { bericht };

    const fragename = (form.querySelector('[name="name"]') || {}).value || '';
    const antwort = await sendeFormular(form, felder, url);

    // Gegenprobe an der NEUEN Version — die alte id liefert weiter den alten Stand.
    const zielUrl = await neueFrageUrl(antwort, fragename, url);
    const kontrolle = await holeDok(zielUrl || url);
    const kform = [...kontrolle.forms].find(f => f.querySelector('[name="graderinfo[text]"]'));
    const ergebnis = [];
    for (const name of Object.keys(eintraege)) {
      const feld = kform && kform.querySelector('[name="' + CSS.escape(name) + '"]');
      ergebnis.push({ feld: name, ok: !!feld && inhaltPasst(feld.value, eintraege[name]) });
    }
    return { bericht, ergebnis, neueUrl: zielUrl,
             warnung: zielUrl ? null : 'Die neue Fragenversion war nicht auffindbar — '
               + 'die Gegenprobe lief gegen den alten Stand und kann falsch sein.' };
  }

  /* ═══════════════════════════════════════════════════════════════════
     5 · MOODLE LESEN
     ═══════════════════════════════════════════════════════════════════ */

  // Rohe Aufgabenstellung — Grundlage fuer den Horizont-Prompt.
  function leseAufgabenstellung() {
    if (KONTEXT === 'bearbeiten') {
      const ta = $('[name="questiontext[text]"]');
      return ta ? htmlZuText(ta.value) : '';
    }
    const q = $('.que .qtext') || $('.qtext');
    return q ? q.innerText.trim() : '';
  }

  function leseGesamtpunkte() {
    if (KONTEXT === 'bearbeiten') {
      const dm = $('[name="defaultmark"]');
      return dm ? (zahl(dm.value) || 0) : 0;
    }
    const mm = $('input[name$="-maxmark"]');
    if (mm) return zahl(mm.value) || 0;
    const anzeige = $('.que .grade');
    const m = anzeige && anzeige.innerText.match(/([\d.,]+)\s*$/);
    return m ? zahl(m[1]) : 0;
  }

  // Roher Horizont — aus dem Formularfeld (Bearbeiten) oder aus dem DOM der
  // Bewertungsseite (dort steht er als div.graderinfo, kein Umweg noetig).
  function leseHorizontRoh() {
    if (KONTEXT === 'bearbeiten') {
      return leseEditorfeldLive('graderinfo[text]');
    }
    const gi = $('.que .graderinfo') || $('.graderinfo');
    return gi ? gi.innerHTML : '';
  }

  // Welche Erweiterung ist zustaendig? Der Grader sperrt nie, er sagt nur Bescheid.
  function zustaendigkeit() {
    const roh = htmlZuText(leseHorizontRoh());
    if (!roh) return { horizont: false, wer: null };
    // Auf der Bewertungsseite steht vor dem Horizont noch Moodles Ueberschrift
    // („Informationen für Bewerter/innen") — deshalb die ersten Zeilen durchsuchen.
    const zeilen = roh.split('\n').map(z => z.trim()).filter(Boolean).slice(0, 5);
    const treffer = zeilen.map(z => z.match(MARKER_RE)).find(Boolean) || null;
    return { horizont: true, wer: markerWer(treffer) };
  }

  /* --- Horizont in Aufgabenbloecke zerlegen --- */

  // Der Horizont traegt je Aufgabe eine Ueberschrift „Aufgabe N …".
  // Faellt die Zerlegung aus (fremd erstellter Horizont, freier Fliesstext), gibt es
  // EINEN Block mit der ganzen Arbeit — Stufe 2 der Abstufung.
  function zerlegeHorizont(html) {
    const wurzel = wurzelAus(ohneMarker(String(html || '')));
    const bloecke = [];
    let aktuell = null;
    [...wurzel.children].forEach(kind => {
      const zeile = nurText(kind);
      const m = zeile.match(AUFGABE_RE);
      if (m && /^(H[1-6]|P|DIV)$/.test(kind.tagName) && zeile.length < 200) {
        aktuell = { nr: aufgabeNr(m), kopf: zeile, html: '', text: '' };
        bloecke.push(aktuell);
        return;
      }
      if (aktuell) {
        aktuell.html += kind.outerHTML;
        aktuell.text += htmlZuText(kind.outerHTML) + '\n';
      }
    });
    if (!bloecke.length) {
      // Kein gegliederter Horizont (fremd erstellt, freier Fließtext): ein Block mit der
      // ganzen Arbeit. Der Marker muss auch hier raus — er ist Verwaltung, kein Maßstab.
      const ganz = ohneMarker(htmlZuText(html));
      if (!ganz) return [];
      return [{ nr: '1', kopf: 'Aufgabe 1', html: String(html || ''), text: ganz,
                punkte: null, afb: null, ganzeArbeit: true }];
    }
    bloecke.forEach(b => {
      b.text = b.text.trim();
      const p = b.kopf.match(/\(\s*([\d.,]+)\s*(?:P\.?|Punkte?)\s*\)/i);
      b.punkte = p ? zahl(p[1]) : null;
      const a = b.kopf.match(/AFB\s*(I{1,3}(?:\s*[-–]\s*I{1,3})?)/i);
      b.afb = a ? a[1].replace(/\s/g, '') : null;
    });
    return bloecke;
  }

  /* --- Abgaben der Bewertungsseite --- */

  function containerVon(feld) {
    let e = feld;
    for (let i = 0; i < 12 && e; i++) {
      e = e.parentElement;
      if (e && e.classList && (e.classList.contains('que') || e.classList.contains('content'))) return e;
    }
    return null;
  }

  // Eine Abgabe je Versuch. Namen statt Indizes, damit beim Schreiben nichts verrutscht.
  function leseAbgaben() {
    return $$('input[id$="-mark"]').map((feld, i) => {
      const c = containerVon(feld);
      const essay = c && c.querySelector('.qtype_essay_response');
      const kommentar = c && c.querySelector('textarea[name$="-comment"]');
      const maxFeld = c && c.querySelector('input[name$="-maxmark"]');
      const roh = essay ? (essay.innerHTML || '') : '';
      const text = essay ? essay.innerText.trim() : '';
      return {
        nr: i + 1,
        markfeld: feld.name || '',
        kommentarfeld: kommentar ? kommentar.name : '',
        ist: zahl(feld.value) || 0,
        max: maxFeld ? (zahl(maxFeld.value) || 0) : leseGesamtpunkte(),
        rohHtml: roh,
        text: text,
        anker: c && c.id ? '#' + c.id : ''
      };
    }).filter(a => a.markfeld);
  }

  /* --- Abgabe in Aufgaben zerlegen (die drei Stufen) ---

     1) Kopfzeilen der Antwortvorlage gefunden  → je Aufgabe zerlegen (bester Fall)
     2) keine Gliederung                        → ein Block, die KI ordnet zu
     Stufe 3 (kein Horizont) entscheidet nicht hier, sondern in der Oberflaeche.

     Wichtig: Das ist rein intern. Am Arbeitsablauf aendert es nichts — ein Prompt,
     ein JSON zurueck. Niemals je Aufgabe einzeln kopieren lassen.                    */
  function zerlegeAbgabe(rohHtml, klartext) {
    const wurzel = wurzelAus(rohHtml);
    const bloecke = [];
    let aktuell = null;

    // Strukturell absteigen: Ein Element mit Block-Kindern ist ein Behaelter, kein
    // Inhalt. Nur ein Blatt-Block kann Kopfzeile sein. Sich auf Zeilenumbrueche zu
    // verlassen geht schief — siehe Hinweis bei htmlZuText.
    const lauf = (knoten) => {
      const kinder = [...knoten.children];
      const bloeckeDrin = kinder.filter(k => BLOCK_RE.test(k.tagName));
      if (!bloeckeDrin.length) {
        const t = nurText(knoten);
        if (!t) return;
        const m = t.match(AUFGABE_RE);
        if (m && t.length < 160) {
          aktuell = { nr: aufgabeNr(m), text: '' };
          bloecke.push(aktuell);
        } else if (aktuell) {
          aktuell.text += t + '\n';
        }
        return;
      }
      bloeckeDrin.forEach(lauf);
    };
    lauf(wurzel);

    // Eine gefundene Kopfzeile genuegt: Auch eine Abgabe, in der noch nichts steht, ist
    // gegliedert — sonst bekaeme eine leere Klausur den Rueckfall statt sauberer Nuller
    // je Aufgabe. Erst wenn gar keine Kopfzeile da ist, greift Stufe 2.
    if (bloecke.length >= 1) {
      bloecke.forEach(b => { b.text = b.text.trim(); });
      return { gegliedert: true, aufgaben: bloecke, leer: bloecke.every(b => !b.text) };
    }
    return { gegliedert: false, aufgaben: [{ nr: '1', text: String(klartext || '').trim() }] };
  }

  /* ═══════════════════════════════════════════════════════════════════
     6 · RECHNEN — hier, nicht in der KI

     Die KI liefert je Aufgabe einen Erfuellungsgrad in Prozent und je Abgabe eine
     gezaehlte Fehlerliste. Alles Weitere rechnet dieser Abschnitt.
     ═══════════════════════════════════════════════════════════════════ */

  // Anteil vom Hoechstabzug. Unter MINDESTWOERTER greift die Dichte nicht —
  // dort nach absoluter Fehlerzahl staffeln, wie im Coach.
  function rsAnteil(fehlerGewichtet, wortzahl) {
    if (wortzahl < MINDESTWOERTER) {
      const i = Math.min(Math.round(fehlerGewichtet), RS_ABSOLUT.length - 1);
      return RS_ABSOLUT[i];
    }
    const dichte = wortzahl > 0 ? (fehlerGewichtet * 100) / wortzahl : 0;
    for (const [grenze, anteil] of RS_LEITER) if (dichte <= grenze) return anteil;
    return 1;
  }

  // Schwere Fehler zaehlen doppelt — welche schwer sind, sagt die KI in der Kategorie.
  function fehlerGewicht(liste) {
    return (liste || []).reduce((s, f) => s + (f && f.schwer ? 2 : 1), 0);
  }

  /* Rechnet eine Abgabe durch.
     bewertung = { aufgaben: [{nr, prozent}], fehler: [{wort, korrektur, kategorie, schwer}] }
     horizont  = Bloecke aus zerlegeHorizont(), fuer die Punkteverteilung             */
  // rsProzentOverride/schrittOverride: der aus dem Horizont gelesene Wert (siehe
  // korrekturPruefen) hat Vorrang vor der Einstellung — es sei denn, die Lehrkraft hat
  // ausdruecklich "Einstellung erzwingen" angeklickt. null/undefined heisst: Einstellung.
  function rechneAbgabe(abgabe, bewertung, horizontBloecke, rsProzentOverride, schrittOverride) {
    const gesamtMax = abgabe.max || leseGesamtpunkte() || 0;

    // Punkte je Aufgabe: Verteilung aus dem Horizont, sonst gleichmaessig.
    const ausHorizont = (horizontBloecke || []).filter(b => b.punkte != null);
    const summeHorizont = ausHorizont.reduce((s, b) => s + b.punkte, 0);

    // Massgeblich ist die Aufgabenliste des HORIZONTS, nicht die der KI-Antwort:
    // laesst die KI eine Aufgabe aus, bekommt sie 0 % — sonst verschoebe sich still
    // die Punkteverteilung aller uebrigen Aufgaben.
    const nummern = (horizontBloecke && horizontBloecke.length)
      ? horizontBloecke.map(b => b.nr)
      : (bewertung.aufgaben || []).map(a => nrKey(a.nr));
    const anzahl = Math.max(1, nummern.length);
    const fehlendeAufgaben = [];

    const teil = nummern.map(nr => {
      const a = (bewertung.aufgaben || []).find(x => nrKey(x.nr) === nr)
             || (fehlendeAufgaben.push(nr), { nr: nr, prozent: 0 });
      const block = (horizontBloecke || []).find(b => b.nr === nr);
      let max;
      if (block && block.punkte != null && summeHorizont > 0) {
        // Horizontpunkte auf die tatsaechliche Gesamtpunktzahl skalieren, falls sie abweicht
        max = gesamtMax > 0 ? (block.punkte * gesamtMax) / summeHorizont : block.punkte;
      } else {
        max = gesamtMax / anzahl;
      }
      const prozent = Math.max(0, Math.min(100, Number(a.prozent) || 0));
      return { nr: nr, max: max, prozent: prozent, roh: (max * prozent) / 100 };
    });

    const inhalt = teil.reduce((s, t) => s + t.roh, 0);

    // Rechtschreibabzug: Prozentsatz der GESAMTpunktzahl, nicht je Aufgabe.
    const rsProzent = (rsProzentOverride != null) ? rsProzentOverride : (parseFloat(E.rechtschreibung) || 0);
    const hoechstabzug = (gesamtMax * rsProzent) / 100;
    const gew = fehlerGewicht(bewertung.fehler);
    const wz = woerter(abgabe.text);
    const anteil = rsAnteil(gew, wz);
    const abzug = Math.min(hoechstabzug * anteil, inhalt);

    // Abzug proportional zur Aufgabenpunktzahl verteilen.
    teil.forEach(t => {
      const anteilT = inhalt > 0 ? t.roh / inhalt : 0;
      t.abzug = abzug * anteilT;
      t.netto = Math.max(0, t.roh - t.abzug);
    });

    // Gerundet wird die GESAMTpunktzahl — nur sie traegt Moodle ein. Wuerde jede
    // Teilaufgabe einzeln gerundet, verschwaende ein kleiner Rechtschreibabzug
    // spurlos und die Summe kletterte nach oben.
    const schritt = schrittOverride || parseFloat(E.punkteschritte) || 0.5;
    const summe = rundePunkte(teil.reduce((s, t) => s + t.netto, 0), gesamtMax, schritt);

    // Die Teilpunkte fuers Feedback so runden, dass ihre Summe die Gesamtpunktzahl
    // wirklich ergibt (groesste Reste zuerst) — sonst widerspricht sich das Feedback.
    teil.forEach(t => {
      t.punkte = Math.max(0, Math.floor(t.netto / schritt + 1e-9) * schritt);
      t.rest = t.netto - t.punkte;
    });
    let offen = Math.round((summe - teil.reduce((s, t) => s + t.punkte, 0)) / schritt);
    const nachRest = teil.slice().sort((a, b) => b.rest - a.rest);
    for (let i = 0; offen > 0 && i < nachRest.length * 4; i++) {
      const t = nachRest[i % nachRest.length];
      if (t.punkte + schritt <= t.max + 1e-9) { t.punkte += schritt; offen--; }
    }
    for (let i = 0; offen < 0 && i < nachRest.length * 4; i++) {
      const t = nachRest[nachRest.length - 1 - (i % nachRest.length)];
      if (t.punkte - schritt >= -1e-9) { t.punkte -= schritt; offen++; }
    }
    teil.forEach(t => { t.punkte = Math.round(t.punkte * 100) / 100; });
    return {
      teil: teil,
      wortzahl: wz,
      fehlerGewichtet: gew,
      fehlerDichte: wz > 0 ? Math.round((gew * 1000) / wz) / 10 : 0,
      hoechstabzug: Math.round(hoechstabzug * 100) / 100,
      abzug: Math.round(abzug * 100) / 100,
      gesamt: summe,
      max: gesamtMax,
      fehlendeAufgaben: fehlendeAufgaben
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     7 · HORIZONT UND ANTWORTVORLAGE BAUEN

     Das Layout baut die ERWEITERUNG aus einer eingebauten Vorlage, nicht die KI.
     Formvorgaben setzt kein Prompt durch — die KI liefert nur den Inhalt.
     ═══════════════════════════════════════════════════════════════════ */

  function afbFarbe(afb) {
    if (!E.afbFarben) return AFB_FARBEN.neutral;
    const stufe = String(afb || '').toUpperCase().split(/[-–]/).pop().trim();
    return AFB_FARBEN[stufe] || AFB_FARBEN.neutral;
  }

  // Kopfzeile im HORIZONT (nicht sichtbar fuer Lernende): immer vollstaendig, damit
  // AFB und Punkte spaeter wieder herausgelesen werden koennen.
  function kopfzeile(a) {
    let s = escapeHtml('Aufgabe ' + a.nr);
    if (a.afb) s += ' <span style="font-size:13px;font-style:italic;font-weight:normal;color:#6b6b6b;">AFB '
      + escapeHtml(a.afb) + '</span>';
    if (a.schlagwort) s += ' · ' + escapeHtml(a.schlagwort);
    if (a.punkte != null) s += ' <span style="font-size:12px;font-weight:600;color:#6b6b6b;">('
      + escapeHtml(komma(a.punkte)) + (Number(a.punkte) === 1 ? ' Punkt' : ' Punkte') + ')</span>';
    return s;
  }

  // Antwortvorlage: je Aufgabe ein Kasten mit derselben Marke wie in der Aufgabenstellung.
  // Kein <table>, kein display:flex (uebersteht das Tippen nicht), zwei leere Absaetze.
  function kastenOpts() {
    return { farbig: E.afbFarben !== false, zeigeAfb: !!E.vorlageAfb, zeigePunkte: !!E.vorlagePunkte };
  }
  function baueAntwortvorlage(aufgaben) {
    return (aufgaben || []).map(a => antwortKasten(Object.assign({
      label: String(a.nr), titel: a.schlagwort || 'Deine Antwort', afb: a.afb, punkte: a.punkte
    }, kastenOpts()))).join('\n');
  }

  // Kurztest: Punkte je Teil stehen im Horizont unter „Teile:" („a) … – 1 Punkt").
  function kurztestTeilePunkte(text) {
    const t = String(text || '').replace(/\r/g, '');
    const m = t.match(/Teile\s*:\s*\n([\s\S]*?)(?:\n\s*\n|$)/i);
    const map = {};
    if (!m) return map;
    m[1].split('\n').forEach(z => {
      const x = z.match(/^\s*[-•]?\s*([a-h])\s*[).:]?\s.*?([\d]+(?:[.,]\d+)?)\s*Punkt/i);
      if (x) map[x[1].toLowerCase()] = zahl(x[2]);
    });
    return map;
  }
  function kurztestHorizontText() {
    return horizontKurztest || htmlZuText(leseHorizontRoh() || '');
  }
  // Teile a, b … aus dem Fragetext, mit Punkten aus dem Horizont.
  function kurztestTeile() {
    const roh = leseEditorfeldLive('questiontext[text]') || '';
    const seg = zerlegeAufgabentext(istGestaltet(roh) ? '' : roh).segmente.filter(x => x.typ === 'aufgabe');
    const pkt = kurztestTeilePunkte(kurztestHorizontText());
    const gesamtAfb = afbAusText(htmlZuText(roh));
    return seg.filter(x => /^[a-h]$/.test(x.label)).map(x => ({
      nr: x.label,
      afb: afbAusText(x.knoten.map(k => k.textContent || '').join(' ')) || gesamtAfb,
      punkte: pkt[x.label] != null ? pkt[x.label] : null
    }));
  }
  function baueKurztestVorlage() {
    const teile = kurztestTeile();
    const o = kastenOpts();
    if (teile.length >= 2) {
      return teile.map(t => antwortKasten(Object.assign({ label: t.nr, titel: 'Deine Antwort', afb: t.afb, punkte: t.punkte }, o))).join('\n');
    }
    const roh = leseEditorfeldLive('questiontext[text]') || '';
    return antwortKasten(Object.assign({ label: '', titel: 'Deine Antwort', afb: afbAusText(htmlZuText(roh)),
      punkte: leseGesamtpunkte() || null }, o));
  }

  // Teilaufgaben fuers Layout: frisch eingelesen oder aus dem gespeicherten Horizont.
  function aufgabenFuerLayout() {
    if (horizontAufgaben) return horizontAufgaben;
    const b = zerlegeHorizont(leseHorizontRoh());
    if (!b.length || b[0].ganzeArbeit) return null;
    return b.map(x => {
      const sw = (x.kopf.match(/·\s*([^()]+?)\s*(?:\(|$)/) || [])[1] || '';
      return { nr: x.nr, afb: x.afb, punkte: x.punkte, schlagwort: sw };
    });
  }
  function horizontDa() {
    return !!(horizontAufgaben || horizontKurztest || htmlZuText(leseHorizontRoh() || '').trim());
  }
  // Nur der HTML-Editor zeigt die Vorlage gestaltet; bei „Nur Text" stuenden die Tags im Feld.
  function vorlageFormatOk() {
    if (KONTEXT !== 'bearbeiten') return true;
    const sel = $('[name="responseformat"]');
    return !sel || /editor/i.test(sel.value || '');
  }
  function layoutVorlageHtml() {
    if (KONTEXT === 'bearbeiten' && MODUS === 'kurztest') return baueKurztestVorlage();
    const a = aufgabenFuerLayout();
    return a ? baueAntwortvorlage(a) : null;
  }
  function aufgabeLayout() {
    const roh = leseEditorfeldLive('questiontext[text]');
    if (!htmlZuText(roh || '').trim()) return { fehler: 'Die Aufgabenstellung ist noch leer.' };
    if (istGestaltet(roh)) return { fehler: 'Die Aufgabenstellung ist schon im Kartendesign gestaltet. '
      + 'Zum Neugestalten erst den ursprünglichen Text wiederherstellen (Moodle-Versionsverlauf der Frage).' };
    const kurz = MODUS === 'kurztest';
    const auf = kurz ? kurztestTeile() : (aufgabenFuerLayout() || []);
    const r = gestalteAufgabe(roh, { aufgaben: auf, punkte: kurz ? true : E.kartePunkte !== false,
      gesamtAfb: kurz ? afbAusText(htmlZuText(roh)) : '' });
    if (kurz && auf.length >= 2 && auf.some(t => t.punkte == null)) {
      r.hinweise.push('Im Horizont fehlen die Punkte je Teil (Abschnitt „Teile:"). Horizont neu erstellen, dann stehen sie dort.');
    }
    return r;
  }
  // Hat die Aufgabe schon einen Horizont? Dann sagen, was er ist, und die Schritte
  // so benennen, dass klar ist: hier wird ueberarbeitet und ersetzt, nicht neu angelegt.
  function horizontStatusAnzeigen() {
    if (KONTEXT !== 'bearbeiten' || !R('hstatus')) return;
    const roh = leseHorizontRoh() || '';
    const text = htmlZuText(roh).trim();
    const l1 = R('hschritt1');
    const k1 = panel.querySelector('[data-tu="hprompt"]');
    const k3 = panel.querySelector('[data-tu="hschreiben"]');
    const bis = R('hbisher');
    if (!text) {
      if (l1) l1.textContent = '1 · Prompt zum Erstellen des Erwartungshorizonts kopieren';
      if (k1) k1.textContent = '📋 Horizont-Prompt kopieren';
      if (k3) k3.textContent = '3 · In die Aufgabe eintragen';
      if (bis) bis.hidden = true;
      return status('hstatus', 'Noch kein Erwartungshorizont in dieser Aufgabe.'
        + (einstellungenUnvollstaendig() ? ' Tipp: Fach und Jahrgang im Zahnrad ⚙ eintragen – sie gehen in den Prompt ein.' : ''));
    }
    const alt = /moodle[-\s]?ai[-\s]?(coach|grader)/i.test(text);
    const m = modusAus(text);
    const fb = feedbackAusHorizont(roh);
    const art = [m === 'kurztest' ? 'Kurztest' : m === 'klausur' ? 'Klausur' : '', fb ? 'Feedback ' + fb : ''].filter(Boolean).join(', ');
    status('hstatus', alt
      ? 'Dieser Horizont stammt noch aus Coach oder Grader. Bitte neu erstellen – der alte geht als Vorlage in den Prompt ein.'
      : 'Diese Aufgabe hat schon einen Erwartungshorizont' + (art ? ' (' + art + ')' : '')
        + '. Der Prompt nimmt ihn als Vorlage mit; die KI sagt dir, was sie übernimmt und was sie ändert.');
    if (l1) l1.textContent = '1 · Prompt zum Überarbeiten des Erwartungshorizonts kopieren';
    if (k1) k1.textContent = '📋 Horizont-Prompt kopieren';
    if (k3) k3.textContent = '3 · Vorhandenen Horizont in der Aufgabe ersetzen';
    if (bis) { bis.hidden = false; const pre = bis.querySelector('pre'); if (pre) pre.textContent = ohneMarker(text); }
  }

  // Nach dem Eintragen: Beschriftungen auf „ersetzen" umstellen, Statusmeldung des Schreibens stehen lassen.
  function horizontStatusAnzeigenNachSchreiben() {
    const st = R('hstatus') ? R('hstatus').textContent : '';
    horizontStatusAnzeigen();
    if (st && R('hstatus')) R('hstatus').textContent = st;
  }

  function layoutAnzeigen() {
    const vt = panel.querySelector('.mag-tab[data-tab="vorlage"]');
    if (vt) vt.hidden = !(KONTEXT === 'bearbeiten' && horizontDa());
    if (!R('lseca')) return;
    R('lseca').hidden = E.layoutAufgabe === false;
    R('lsecv').hidden = E.layoutAntwort === false;
    const kurz = MODUS === 'kurztest';
    R('lpunktezeile').hidden = kurz; R('lpunktehinweis').hidden = kurz;
    const knopf = panel.querySelector('[data-tu="lein"]');
    if (knopf) knopf.disabled = E.layoutAufgabe === false && E.layoutAntwort === false;
    if (E.layoutAufgabe !== false) {
      const r = aufgabeLayout();
      if (r.fehler) {
        setzeHtml(R('lavorschau'), '<p class="mag-hinweis">' + escapeHtml(r.fehler) + '</p>');
        R('lahinweise').textContent = '';
      } else {
        setzeHtml(R('lavorschau'), r.html);
        R('lahinweise').textContent = r.hinweise.join(' ');
      }
    }
  }

  // Erwartungshorizont: Marker, dann je Aufgabe eine Ueberschrift und der Text.
  // Die Ueberschrift ist die Grenze, an der spaeter wieder zerlegt wird — sie muss
  // maschinenlesbar bleiben. Deshalb <h4> mit „Aufgabe N" am Anfang.
  function baueHorizont(aufgaben) {
    // Der Zustaendigkeits-Marker wird IMMER von der Erweiterung gesetzt, nie von der KI:
    // eine Formvorgabe setzt kein Prompt zuverlaessig durch, und der Marker entscheidet,
    // ob der Coach die Frage anfasst. Hat die KI ihn (etwa aus einem eigenen Prompt)
    // trotzdem in den ersten Block geschrieben, nicht doppelt setzen — wie im Coach.
    const schonDa = (aufgaben || []).some(a => MARKER_RE.test(ersteZeile(htmlZuText(a.horizont))));
    const kopf = schonDa ? ''
      : '<p>' + MARKER_ZEILE + '</p>' + metaZeilen(E.rechtschreibung, E.punkteschritte, KONTEXT === 'bearbeiten' ? FEEDBACK : fbLaenge());
    const bloecke = (aufgaben || []).map(a => {
      let inhalt = String(a.horizont || '').trim();
      if (!/<[a-z][\s\S]*>/i.test(inhalt)) {
        inhalt = '<p>' + escapeHtml(inhalt).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
      }
      return '<h4>' + kopfzeile(a) + '</h4>' + inhalt;
    });
    return kopf + bloecke.join('\n');
  }

  /* ═══════════════════════════════════════════════════════════════════
     8 · PROMPTS
     ═══════════════════════════════════════════════════════════════════ */

  const NIVEAU = { G: 'G — gymnasial', M: 'M — mittel', E: 'E — einfach' };

  function rahmendaten() {
    return [
      'Fach: '                 + (E.fach || '[nicht angegeben]'),
      'Jahrgang: '             + (E.jahrgang || '[nicht angegeben]'),
      'Kursniveau: '           + (NIVEAU[E.kursniveau] || E.kursniveau),
      'Feedbacklänge: '        + fbLaenge(),
      'Anrede im Feedback: '   + anrede() + ' …'
    ].join('\n');
  }

  // Horizont-Prompts: keine Feedbacklaenge/Anrede (das ist Bewertungs-Sache).
  function horizontRahmen() {
    return [
      'Fach: '       + (E.fach || '[nicht angegeben]'),
      'Jahrgang: '   + (E.jahrgang || '[nicht angegeben]'),
      'Kursniveau: ' + (NIVEAU[E.kursniveau] || E.kursniveau)
    ].join('\n');
  }

  function horizontPromptVorlage() {
    return `═══════════════════════════════════════════════════════
MOODLE AI FREITEXT GRADER – ERWARTUNGSHORIZONT (KLAUSUR)
═══════════════════════════════════════════════════════

Du bist erfahrene Lehrkraft und erstellst den Erwartungshorizont für eine Klausur. Er
wird in Moodle im Feld „Informationen für Bewerter/innen" gespeichert; Schülerinnen und
Schüler sehen ihn nicht.

${HORIZONT_ZWECK}

RAHMENDATEN
[MAG_RAHMENDATEN]

AUFGABENSTELLUNG (aus Moodle übernommen, Gesamtpunktzahl: [MAG_GESAMTPUNKTE])
[MAG_AUFGABEN]

WAS DU TUST
1. Zerlege die Aufgabenstellung in ihre Teilaufgaben. Übernimm die Nummerierung der
   Aufgabenstellung. Steht dort eine Punktzahl je Aufgabe, übernimm sie unverändert;
   fehlt sie, verteile die Gesamtpunktzahl begründet und weise darauf hin.
   Hat eine Aufgabe Teile (a, b …), ist JEDER TEIL eine eigene Aufgabe mit eigener
   Punktzahl, eigenem Operator und eigenem AFB: "nr": "2a", "2b". Eine übergeordnete
   Aufgabe 2 ohne eigene Punkte gibt es dann nicht. Die Punkte aller Einträge ergeben
   zusammen die Gesamtpunktzahl.
2. Bestimme je Aufgabe den Operator und den Anforderungsbereich AFB (I, II, III oder
   eine Spanne wie II-III).
3. Schreibe je Aufgabe einen Erwartungshorizont in dieser Reihenfolge:
   Kernaussage · Muss enthalten · Auch richtig · Inhalt in Stufen · Reicht nicht ·
   Häufiger Fehler.
4. Gib je Aufgabe ein Schlagwort von zwei bis vier Wörtern an, das die Aufgabe benennt.

REGELN
${horizontRegeln('[MAG_JAHRGANG]')}

BEISPIEL „AUCH RICHTIG"
Schlecht: „Von links nach rechts werden die Atome kleiner, weil die Kernladung zunimmt
und die Elektronen stärker angezogen werden." So schreibt eine Lehrkraft – wer so
antwortet, liegt ohnehin bei 100 %.
Gut: „nach rechts wird es kleiner" · „der Kern zieht doller" · „es kommt eine Schale
dazu, deshalb wird es dicker" · „mehr Protonen, gleiche Schale".

BEISPIEL ZÄHLBARE STUFEN
100 — beide Trends beschrieben UND beide erklärt · 75 — beide beschrieben, einer
erklärt · 50 — beide beschrieben, keiner erklärt ODER einer beschrieben und erklärt.

[MAG_STUFE]

ARBEITSWEISE
Zeige mir zuerst je Aufgabe eine lesbare Übersicht (Nummer, Operator, AFB, Punkte,
Schlagwort, Erwartungshorizont) und frage: „Passt das so? Wenn ja, antworte mit ok."
Ändere, bis ich zustimme. Stelle immer nur EINE Frage auf einmal.

ERST WENN ICH BESTÄTIGE, gib genau EINEN Codeblock aus – nichts davor, nichts danach:

\`\`\`json
{ "aufgaben": [
  { "nr": "1",
    "schlagwort": "kurzes Stichwort",
    "afb": "I",
    "punkte": 2,
    "operator": "Nenne",
    "horizont": "<p><strong>Kernaussage:</strong> …</p><p><strong>Muss enthalten:</strong> …</p>" },
  { "nr": "2a", "schlagwort": "…", "afb": "II", "punkte": 3, "operator": "Erläutere", "horizont": "…" }
] }
\`\`\`

Das Feld "horizont" ist HTML (erlaubt: p, br, ul, li, strong, em). Jeder Abschnitt ist
ein eigenes <p> mit fettem Abschnittsnamen. Keine Überschrift für die Aufgabe selbst –
die setzt die Erweiterung. Keine Punktzahlen im Fließtext.`;
  }

  // Bilder und Dateien in der Aufgabenstellung — die Erweiterung kann nur Text kopieren.
  function materialDateien() {
    const ta = $('[name="questiontext[text]"]');
    const html = ta ? ta.value : (($('.que .qtext') || {}).innerHTML || '');
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const namen = [];
    doc.querySelectorAll('img').forEach(i => namen.push('Bild: ' + (i.getAttribute('alt') || decodeURIComponent((i.getAttribute('src') || '').split('/').pop().split('?')[0]) || 'ohne Namen')));
    doc.querySelectorAll('a[href*="pluginfile"]').forEach(a => namen.push('Datei: ' + (a.textContent.trim() || decodeURIComponent(a.getAttribute('href').split('/').pop().split('?')[0]))));
    return namen;
  }
  function materialBlock() {
    return materialBaustein([leseAufgabenstellung()], materialDateien());
  }

  function baueHorizontPrompt() {
    if (KONTEXT === 'bearbeiten' && MODUS === 'kurztest') {
      const name = ($('[name="name"]') || {}).value || 'Diese Frage';
      const e = { qid: 'diese-frage', frage: name, aufgabe: leseAufgabenstellung(), max: leseGesamtpunkte() };
      const bisher = htmlZuText(leseHorizontRoh());
      if (bisher) e.horizont_bisher = ohneMarker(bisher);
      const mat = materialBlock();
      const block = 'Rahmendaten:\n' + horizontRahmen() + '\n\n' + (mat ? mat + '\n\n' : '') + '```json\n' + JSON.stringify([e], null, 1) + '\n```';
      return kurztestHorizontVorlage({ einzeln: true, jahrgang: E.jahrgang, stufe: fbLaenge() }).replace('[MOODLE_AI_COACH_AUFGABEN]', block);
    }
    const eigen = (E.promptHorizont || '').trim();
    let v = eigen || horizontPromptVorlage();
    const stufe = stufenBlock('klausur', fbLaenge());
    v = v.includes('[MAG_STUFE]') ? v.replace('[MAG_STUFE]', stufe) : v + '\n\n' + stufe;
    const mat = materialBlock();
    return v
      .replace('Lernende der Jahrgangsstufe [MAG_JAHRGANG]', E.jahrgang ? 'Lernende der Jahrgangsstufe ' + E.jahrgang : 'Lernende dieser Jahrgangsstufe')
      .replace('[MAG_RAHMENDATEN]', horizontRahmen())
      .replace('[MAG_GESAMTPUNKTE]', komma(leseGesamtpunkte() || '?'))
      .replace('[MAG_AUFGABEN]', (leseAufgabenstellung() || '[keine Aufgabenstellung gefunden]')
        + (mat ? '\n\n' + mat : '')
        + (htmlZuText(leseHorizontRoh()) ? '\n\nBISHERIGER HORIZONT (Ausgangspunkt, keine Vorlage zum Abschreiben – '
          + 'übernimm, was gut ist, und erstelle ihn im aktuellen Format neu. Sag mir ZUERST in zwei, drei Sätzen, '
          + 'dass ein bisheriger Horizont vorliegt, was du übernimmst und was du änderst):\n' + ohneMarker(htmlZuText(leseHorizontRoh())) : ''));
  }

  const FB_LAENGE = {
    'Kurz':        'ein bis zwei Sätze je Aufgabe',
    'Mittel':      'drei bis vier Sätze je Aufgabe',
    'Ausführlich': 'ein Absatz je Aufgabe mit konkretem Bezug auf die Antwort',
    'Umfangreich': 'ein ausführlicher Absatz je Aufgabe, dazu ein eigener Abschnitt zur Operatorerfüllung'
  };

  function korrekturPromptVorlage() {
    return `Du bewertest Klausurantworten nach einem vorgegebenen Erwartungshorizont.

[MAG_KOPF]

RAHMENDATEN
[MAG_RAHMENDATEN]

ERWARTUNGSHORIZONT (gilt für alle Abgaben)
[MAG_HORIZONT]

[MAG_MODUS]

WICHTIG — WAS DU NICHT TUST
Du vergibst KEINE Punkte und rechnest NICHT. Die Erweiterung rechnet Punkte, Rundung,
Rechtschreibabzug und Gesamtsumme selbst. Du lieferst ausschließlich Prozentwerte,
gezählte Fehler und Begründungstexte OHNE Zahlenangaben. Schreibe in keiner Begründung
„x von y Punkten" — die Zahlen setzt die Erweiterung ein.

JE AUFGABE
Vergib einen Erfüllungsgrad in Prozent, nur diese Stufen: 100, 75, 50, 25, 0.
Verankere jede Einstufung an einer Formulierung des Erwartungshorizonts.
Prüfe dabei den Operator: Wer „erläutere" liest und nur beschreibt, erfüllt die Aufgabe
nicht vollständig, auch wenn der Inhalt stimmt.

JE ABGABE
Zähle die sprachlichen Fehler und gib sie EINZELN an — Wort, Korrektur, Kategorie.
Kategorien: satzbau · kasus · zeitform · grossschreibung · fachbegriff · rechtschreibung ·
zeichensetzung · umgangssprache. Ein Satz ohne Prädikat, ein abgebrochener Satz oder ein
Satzbau, den man zweimal lesen muss, zählt als "schwer": true. Denselben Fehler im selben
Wort nur einmal zählen. Zähle vollständig — die Erweiterung leitet daraus den Abzug ab.

FEEDBACKTEXTE
Länge: [MAG_FBLAENGE]. Anrede: [MAG_ANREDE] … Sachlich, konkret, zugewandt.
Bei Sprachfehlern den fehlerhaften Satz wörtlich zitieren und richtig danebenschreiben,
nicht „achte auf die Satzstellung". Höchstens zwei bis drei Vorschläge.
Jede Aufgabe bekommt eine Begründung — auch eine vollständig richtige.

ABGABEN
[MAG_ABGABEN]

AUSGABE — am Ende genau EIN Codeblock (im Modus AUTOMATISCH nichts davor, nichts danach):

\`\`\`json
{ "bewertungen": [
  { "nr": 1,
    "besprochen": true,
    "staerken": "was gut gelungen ist",
    "aufgaben": [ { "nr": 1, "prozent": 75, "begruendung": "…", "operator": "erfüllt" } ],
    "fehler": [ { "wort": "Atomradiuse", "korrektur": "Atomradien",
                  "kategorie": "rechtschreibung", "schwer": false } ],
    "sprachfeedback": "…",
    "zusammenfassung": "…" }
] }
\`\`\`

"nr" ist die Nummer der Abgabe aus dem Datenblock, nicht die des Schülers.
In "aufgaben" ist "nr" die Aufgabennummer wie im Datenblock (z. B. "1", "2a").
"besprochen": true nur für Arbeiten, die du im Modus GEMEINSAM mit der Lehrkraft durchgegangen
bist und die sie mit OK bestätigt hat; sonst false.
Liefere für JEDE Abgabe des Blocks einen Eintrag, auch für leere Abgaben
(dort alle Prozentwerte 0 und ein Hinweis in der Zusammenfassung).`;
  }

  // Modusfrage NUR in Teil 1 (mit Stop-Regel); Teil 2/3 setzen nur fort.
  function modusBlock(teil, gesamtTeile) {
    if ((teil || 1) > 1) {
      return `MODUS
Der Modus wurde in Teil 1 gewählt und gilt weiter. Frage NICHT erneut. Im Modus GEMEINSAM gehst
du diese Arbeiten wieder einzeln mit mir durch, im Modus AUTOMATISCH gibst du sofort das JSON aus.`;
    }
    return `MODUSFRAGE — STELLE SIE ZUERST UND WARTE
Bevor du irgendetwas bewertest, stelle GENAU DIESE EINE Frage und gib danach nichts weiter aus,
bis ich geantwortet habe:

„Wie sollen wir vorgehen?
  1. GEMEINSAM – Ich zeige dir jede Arbeit einzeln, du bestätigst oder änderst, dann kommt die
     nächste. (empfohlen)
  2. AUTOMATISCH – Ich bewerte alle Arbeiten und gebe sofort das JSON aus.
Antworte mit 1 oder 2."

AUTOMATISCH ist eine bewusste Wahl, kein stiller Standard. Triff keine Annahme.

MODUS GEMEINSAM — je Arbeit dieses Schema, dann warten:
  ABGABE [nr]
  Je Aufgabe: Antwort (gekürzt) · Stufe in % · Begründung (ein Satz, Bezug auf den Horizont)
  Sprachfehler: Wort → Korrektur (Kategorie)
  Rückmeldung an die Schülerin / den Schüler (so, wie sie eingetragen würde)
  Grobe Punkteschätzung (nur zur Orientierung – genau rechnet die Erweiterung)
  „1 OK – weiter · 2 Stufe ändern · 3 Rückmeldung ändern · 4 neu bewerten"
Erst nach OK kommt die nächste Arbeit. Nach der letzten Arbeit${gesamtTeile > 1 ? ' dieses Teils' : ''} das JSON.`;
  }

  function baueKorrekturPrompt(abgaben, horizontHtml, teil, gesamtTeile) {
    const bloecke = zerlegeHorizont(horizontHtml);
    const horizontText = bloecke.length
      ? bloecke.map(b => b.kopf + '\n' + b.text).join('\n\n')
      : htmlZuText(horizontHtml);

    const daten = abgaben.map(a => {
      const z = zerlegeAbgabe(a.rohHtml, a.text);
      const kopf = 'ABGABE ' + a.nr + (z.gegliedert ? '' : '  (ohne Gliederung)');
      const koerper = z.gegliedert
        ? z.aufgaben.map(x => '  Aufgabe ' + x.nr + ':\n  ' + (x.text || '(leer)')).join('\n')
        : '  ' + (a.text || '(leer)');
      return kopf + '\n' + koerper;
    }).join('\n\n');

    const eigen = (E.promptKorrektur || '').trim();
    const kopf = bewertungsKopf({ fach: E.fach, jahrgang: E.jahrgang, niveau: NIVEAU[E.kursniveau] || E.kursniveau });
    let p = eigen || korrekturPromptVorlage();
    p = (p.includes('[MAG_KOPF]') ? p.replace('[MAG_KOPF]', kopf) : kopf + '\n\n' + p)
      .replace('[MAG_RAHMENDATEN]', rahmendaten())
      .replace('[MAG_HORIZONT]', horizontText || '[kein Horizont hinterlegt]')
      .replace('[MAG_FBLAENGE]', FB_LAENGE[fbLaenge()] || FB_LAENGE['Ausführlich'])
      .replace('[MAG_ANREDE]', anrede())
      .replace('[MAG_ABGABEN]', daten)
      .replace('[MAG_MODUS]', modusBlock(teil, gesamtTeile));

    if (gesamtTeile > 1) {
      p = 'TEIL ' + teil + ' VON ' + gesamtTeile + ' — bewerte NUR die unten stehenden Abgaben '
        + 'und gib nur für sie JSON aus. Warte auf den nächsten Teil.\n\n' + p;
    }
    return p;
  }

  /* --- Feedbacktext zusammensetzen: die Zahlen kommen aus der Rechnung --- */

  function baueFeedback(bewertung, rechnung, horizontBloecke) {
    const abs = [];
    if (bewertung.staerken) abs.push(bewertung.staerken.trim());

    (bewertung.aufgaben || []).forEach(a => {
      const t = rechnung.teil.find(x => x.nr === a.nr);
      const block = (horizontBloecke || []).find(b => b.nr === a.nr);
      const name = 'Aufgabe ' + a.nr + (block && block.kopf.includes('·')
        ? ' – ' + block.kopf.split('·').slice(1).join('·').replace(/\(.*?\)/, '').trim() : '');
      let zeile = name + ': ' + (t ? komma(t.punkte) : '?') + ' von ' + (t ? komma(Math.round(t.max * 100) / 100) : '?') + ' P.';
      if (t && t.abzug > 0.004) zeile += ' (davon −' + komma(Math.round(t.abzug * 100) / 100) + ' P. Rechtschreibung)';
      abs.push(zeile + '\n' + (a.begruendung || '').trim());
    });

    if (fbLaenge() === 'Umfangreich') {
      const ops = (bewertung.aufgaben || []).filter(a => a.operator);
      if (ops.length) {
        abs.push('Operatorerfüllung:\n' + ops.map(a => 'Aufgabe ' + a.nr + ': ' + a.operator).join('\n'));
      }
    }

    const fehler = bewertung.fehler || [];
    let sprache = 'Rechtschreibung und Sprache: ';
    if (rechnung.abzug > 0.004) {
      sprache += 'Abzug ' + komma(rechnung.abzug) + ' von höchstens '
               + komma(rechnung.hoechstabzug) + ' P. ('
               + komma(rechnung.fehlerDichte) + ' Fehler je 100 Wörter).';
    } else if (fehler.length) {
      sprache += 'kein Punktabzug, aber ein paar Stellen zum Nachschauen.';
    } else {
      sprache += 'keine Auffälligkeiten.';
    }
    if (fehler.length) {
      sprache += '\n' + fehler.slice(0, 12).map(f =>
        '• ' + (f.wort || '') + ' → ' + (f.korrektur || '')).join('\n');
      if (fehler.length > 12) sprache += '\n• … und ' + (fehler.length - 12) + ' weitere';
    }
    if (bewertung.sprachfeedback) sprache += '\n' + bewertung.sprachfeedback.trim();
    abs.push(sprache);

    if (bewertung.zusammenfassung) abs.push(bewertung.zusammenfassung.trim());
    abs.push('Gesamt: ' + komma(rechnung.gesamt) + ' von ' + komma(rechnung.max) + ' Punkten.');

    return abs.filter(Boolean).map(quellenWeg).join('\n\n');
  }

  function feedbackAlsHtml(text) {
    let html = text.split(/\n{2,}/)
      .map(b => '<p>' + escapeHtml(b).replace(/\n/g, '<br>') + '</p>').join('');
    if (E.kiHinweis) {
      html += '<p><em><small>Dieses Feedback wurde von der Lehrkraft mithilfe von '
            + 'KI-Unterstützung erstellt und geprüft.</small></em></p>';
    }
    return html;
  }

  /* ═══════════════════════════════════════════════════════════════════
     9 · KI-ANTWORT EINLESEN
     ═══════════════════════════════════════════════════════════════════ */

  // Nimmt mehrere Teile in einem Rutsch an: Codebloecke, blanke Objekte, Arrays.
  function jsonObjekteImText(text) {
    const stuecke = [];
    let tiefe = 0, start = -1, inString = false, escape = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { if (tiefe > 0) inString = true; continue; }
      if (c === '{') { if (tiefe === 0) start = i; tiefe++; }
      else if (c === '}' && tiefe > 0) {
        tiefe--;
        if (tiefe === 0 && start >= 0) { stuecke.push(text.slice(start, i + 1)); start = -1; }
      }
    }
    return stuecke;
  }

  function leseJson(roh, schluessel) {
    const treffer = [];
    const bloecke = [];
    const cb = /```(?:json)?\s*([\s\S]*?)```/g;
    let m;
    while ((m = cb.exec(roh)) !== null) bloecke.push(m[1]);
    // Was ausserhalb der ```-Bloecke steht, zaehlt auch: ein Teil mit, der naechste
    // ohne Codezeilen eingefuegt, muss beides ergeben.
    bloecke.push(roh.replace(/```(?:json)?\s*[\s\S]*?```/g, ''));

    bloecke.forEach(b => {
      const text = b.trim();
      if (!text) return;
      try {
        const o = JSON.parse(text);
        const liste = Array.isArray(o) ? o : (o[schluessel] || (o.nr != null ? [o] : null));
        if (liste) treffer.push(...liste);
        return;
      } catch (e) { /* weiter mit der Suche nach Teilobjekten */ }
      // Mehrere Teile ohne ```-Zeilen (der Kopier-Knopf im KI-Chat laesst sie weg)
      // stehen einfach hintereinander: alle vollstaendigen {...}-Objekte der obersten
      // Ebene einzeln herausloesen, Klammern in Zeichenketten zaehlen nicht mit.
      jsonObjekteImText(text).forEach(stueck => {
        try {
          const o = JSON.parse(stueck);
          const liste = Array.isArray(o) ? o : (o[schluessel] || (o.nr != null ? [o] : null));
          if (liste) treffer.push(...liste);
        } catch (e) { /* dieses Stueck ist unbrauchbar */ }
      });
    });
    if (!treffer.length) throw new Error('Kein verwertbares JSON gefunden.');
    return treffer;
  }

  // Vollstaendigkeit pruefen: fehlende und doppelte Nummern melden statt still eintragen.
  function pruefeVollstaendig(liste, sollNummern) {
    const gesehen = new Set();
    const doppelt = [];
    liste.forEach(e => {
      const n = Number(e.nr);
      if (gesehen.has(n)) doppelt.push(n);
      gesehen.add(n);
    });
    const fehlend = sollNummern.filter(n => !gesehen.has(n));
    return { fehlend, doppelt };
  }

  /* ═══════════════════════════════════════════════════════════════════
     10 · BEWERTUNGEN EINTRAGEN  (Bewertungsseite)

     Wie im Reviewer: Formular frisch holen, Felder setzen, absenden, neu holen und
     jeden Wert gegenpruefen. Es wird nichts als Erfolg gemeldet, was nicht wirklich
     angekommen ist.
     ═══════════════════════════════════════════════════════════════════ */

  async function holeBewertungsFormular(zweiterVersuch) {
    const dok = await holeDok(location.href);
    let form = dok.querySelector('form#manualgradingform')
            || [...dok.forms].find(f => f.querySelector('input[name$="-mark"]'));
    if (!form && !zweiterVersuch) {
      // Direkt nach einem Speichern liefert Moodle die Seite gelegentlich unvollstaendig.
      await new Promise(r => setTimeout(r, 900));
      return holeBewertungsFormular(true);
    }
    if (!form) throw new Error('Bewertungsformular nicht gefunden');
    return { dok, form };
  }

  // eintraege: [{ markfeld, kommentarfeld, punkte, feedbackHtml, nr }]
  // trocken = true → nur pruefen, ob jedes Feld da ist; nichts absenden.
  async function trageEin(eintraege, trocken, log) {
    const { form } = await holeBewertungsFormular(false);
    const felder = formularFelder(form);

    const gesetzt = [];
    let fehlend = 0;
    eintraege.forEach(e => {
      const hatMark = felder.has(e.markfeld);
      const hatKomm = !e.kommentarfeld || felder.has(e.kommentarfeld);
      if (!hatMark || !hatKomm) {
        fehlend++;
        log('✗ Abgabe ' + e.nr + ': ' + (!hatMark ? 'Punktefeld' : 'Kommentarfeld') + ' nicht auf der Seite');
        return;
      }
      if (!trocken) {
        felder.set(e.markfeld, komma(e.punkte));
        if (e.kommentarfeld) felder.set(e.kommentarfeld, e.feedbackHtml);
      }
      gesetzt.push(e);
    });

    if (trocken) {
      log(gesetzt.length + ' von ' + eintraege.length + ' Abgaben vollständig vorhanden.');
      return { ok: gesetzt.length, fehler: fehlend, trocken: true };
    }
    if (!gesetzt.length) return { ok: 0, fehler: eintraege.length };

    await sendeFormular(form, felder, location.href);

    // Gegenprobe an einer frisch geholten Seite
    const { form: kform } = await holeBewertungsFormular(false);
    let ok = 0, fehler = fehlend;
    gesetzt.forEach(e => {
      const f = kform.querySelector('input[name="' + CSS.escape(e.markfeld) + '"]');
      const ist = f ? zahl(f.value) : null;
      if (ist !== null && Math.abs(ist - e.punkte) < 0.005) {
        ok++;
        log('✓ Abgabe ' + e.nr + ' — ' + komma(e.punkte) + ' P. eingetragen');
      } else {
        fehler++;
        log('✗ Abgabe ' + e.nr + ' — steht auf '
          + (ist == null ? 'keinem Wert' : komma(ist)) + ' statt ' + komma(e.punkte));
      }
    });
    return { ok, fehler };
  }

  /* ═══════════════════════════════════════════════════════════════════
     11 · OBERFLAECHE

     Panel-Regeln: Eingabefelder stehen UNTER ihrer Beschriftung und fuellen die
     Breite; Fortschritt und Protokoll stehen UEBER den Knoepfen, sonst laufen sie
     aus dem Sichtfeld und die Erweiterung wirkt tot.
     ═══════════════════════════════════════════════════════════════════ */

  // Beim Bearbeiten stehen die Einstellungen VORNE: ihre Werte gehen ungeprüft als
  // Rahmendaten in den Horizont-Prompt, und davon hängt alles Weitere ab.
  // Beim Bearbeiten ist das eine feste Reihenfolge — deshalb nummeriert:
  // erst die Rahmendaten, dann der Horizont, dann die Vorlage daraus.
  // Auf der Bewertungsseite steht die Korrektur vorn; Horizont und Einstellungen
  // sind dort Nacharbeit und bekommen keine Nummer.
  const REITER = KONTEXT === 'bearbeiten'
    ? [['horizont', '1 · Horizont'], ['vorlage', '2 · Layout-Vorlage'], ['einst', '⚙']]
    : [['korrektur', '1 · Bewerten'], ['horizont', '2 · Horizont'], ['einst', '⚙']];

  const panel = el('div', 'mag-panel');
  panel.innerHTML = `
    <div class="mag-kopf">
      <img class="mag-kopfbild" alt="">
      <div class="mag-titelblock">
        <span class="mag-titel">Freitext Grader <span class="mag-version"></span></span>
        <span class="mag-untertitel"></span>
      </div>
      <button class="mag-ikon" data-tu="zu" title="Schließen">✕</button>
    </div>
    <div class="mag-banner" hidden></div>
    <div class="mag-reiter">

    </div>

    <div class="mag-inhalt" data-panel="horizont">
      <details class="mag-details mag-hilfe mag-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="mag-hinweis">Hier entsteht der Erwartungshorizont dieser Aufgabe – der Maßstab, nach dem die KI später alle Antworten bewertet. Du kopierst einen Prompt, lässt die KI den Horizont schreiben und trägst ihn in die Aufgabe ein. Das geschieht einmal je Aufgabe; danach bleibt er in der Aufgabe gespeichert, auch beim Export.</p>
      </details>
      <div class="mag-status" data-rolle="hstatus"></div>
      <details class="mag-details" data-rolle="hbisher" hidden>
        <summary>Gespeicherten Horizont ansehen</summary>
        <pre class="mag-hinweis" style="white-space:pre-wrap;max-height:220px;overflow:auto;"></pre>
      </details>
      <div class="mag-modus" data-rolle="hmodus" hidden>
        <div class="mag-rahmen-titel">Diese Aufgabe</div>
        <label>Modus</label>
        <select data-rolle="hmodussel">
          <option value="kurztest">Kurztest – kurze Antworten, schnelle Bewertung</option>
          <option value="klausur">Klausur – Teilaufgaben, Portionen, Review</option>
        </select>
        <div class="mag-hinweis" data-rolle="hmodushinweis"></div>
        <label>Feedbacklänge</label>
        <select data-rolle="hfeedbacksel"></select>
        <div class="mag-hinweis" data-rolle="hfeedbackhinweis"></div>
      </div>
      <div class="mag-rahmen">
        <div class="mag-rahmen-titel">Diese Angaben gehen in den Prompt</div>
        <div data-rolle="hrahmen"></div>
        <button class="mag-btn mag-btn-klein mag-btn-rand" data-tu="zueinst">ändern</button>
      </div>
      <details class="mag-details mag-hilfe" data-rolle="hhilfe">
        <summary>So funktioniert's</summary>
        <p class="mag-hinweis">Der Erwartungshorizont sagt der KI später beim Bewerten, was eine
        richtige Antwort ist. So entsteht er:</p>
        <p class="mag-hinweis"><strong>1 · Horizont-Prompt kopieren:</strong> Die Erweiterung nimmt
        Aufgabenstellung, Punkte und Einstellungen und baut daraus einen Prompt, mit dem die KI den
        Erwartungshorizont schreibt. Mit den Antworten der Lernenden hat er nichts zu tun – die
        kommen erst beim Bewerten.</p>
        <p class="mag-hinweis"><strong>2 · In die KI einfügen</strong> (z. B. Claude, ChatGPT). Verweist die
        Aufgabe auf Material, fragt die KI danach. Sie zeigt den Horizont zuerst als lesbaren Text –
        prüfen, ggf. ändern lassen, dann mit „ok" antworten. Erst dann kommt ein Codeblock: diesen hier einfügen.</p>
        <p class="mag-hinweis"><strong>3 · Eintragen:</strong> Der Horizont wird im Feld
        „Informationen für Bewerter/innen" dieser Aufgabe gespeichert. Schülerinnen und Schüler sehen ihn nicht.</p>
      </details>
      <label data-rolle="hschritt1">1 · Prompt zum Erstellen des Erwartungshorizonts kopieren</label>
      <div class="mag-reihe">
        <button class="mag-btn mag-btn-primary" data-tu="hprompt">📋 Horizont-Prompt kopieren</button>
        <button class="mag-btn mag-btn-rand" data-tu="hedit" title="Prompt anpassen">✏️</button>
      </div>
      <div class="mag-hinweis" data-rolle="hmaterial" hidden></div>
      <label>2 · Erwartungshorizont der KI einfügen</label>
      <div class="mag-hinweis">Die Erweiterung hat bewusst keinen eigenen KI-Zugang: Du wählst die KI,
      und Aufgaben gehen nur dorthin, wo du sie einfügst. Den Codeblock der KI vollständig hier
      einfügen – er wird sofort geprüft und angezeigt. Gespeichert wird erst in Schritt 3.
      Den lesbaren Text vor dem „ok" brauchst du hier nicht, nur den Codeblock danach.</div>
      <textarea data-rolle="hjson" rows="5" placeholder='{ "aufgaben": [ … ] }'></textarea>
      <button class="mag-btn mag-btn-primary" data-tu="hpruefen" hidden>🔍 Prüfen</button>
      <div class="mag-liste" data-rolle="hliste"></div>
      <div class="mag-protokoll" data-rolle="hlog" hidden></div>
      <div class="mag-reihe" data-rolle="hknoepfe" hidden></div>
      <details class="mag-details">
        <summary>Kein Bearbeitungsrecht? Horizont hier behalten</summary>
        <p class="mag-hinweis">Wer Fragen nicht bearbeiten darf, klebt den fertigen Horizont
        hierher. Er bleibt dann in der Erweiterung statt in der Frage.</p>
        <textarea data-rolle="hlokal" rows="4" placeholder="Erwartungshorizont …"></textarea>
        <button class="mag-btn mag-btn-rand" data-tu="hlokalsichern">Hier speichern</button>
      </details>
    </div>

    <div class="mag-inhalt" data-panel="vorlage" hidden>
      <details class="mag-details mag-hilfe mag-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="mag-hinweis">Hier gestaltest du das Aussehen der Aufgabe für die Lernenden – ein
        Zusatz nach Geschmack, für die Bewertung nicht nötig. Er erscheint, sobald die Aufgabe einen
        Erwartungshorizont hat, weil Teilaufgaben, Anforderungsbereiche und Punkte von dort kommen.
        Du kannst die Aufgabenstellung, die Antwortvorlage oder beides gestalten.</p>
        <p class="mag-hinweis"><strong>Aufgabenstellung gestalten:</strong> Der Fragetext kommt in
        farbige Karten – eine Karte je Teilaufgabe, vorn eine Marke (1, 2a, 2b; im Kurztest a, b),
        hinten die Punkte. Eine Kurztest-Aufgabe ohne Teile bekommt eine Karte. Links steht der Anforderungsbereich, der Operator wird fett in der AFB-Farbe
        hervorgehoben (AFB I grün, II orange, III rot). Der Wortlaut bleibt gleich.</p>
        <p class="mag-hinweis"><strong>Antwortvorlage gestalten:</strong> Statt eines leeren weißen
        Eingabefelds sehen die Lernenden einen Antwortkasten mit Kopfzeile – einen je Teilaufgabe, mit
        derselben Marke wie in der Aufgabenstellung. So schreiben sie jede Antwort an die richtige Stelle, und die Erweiterung kann sie
        beim Bewerten sicher zuordnen. Die Kopfzeile zählt beim Bewerten nicht als Schülertext.</p>
        <p class="mag-hinweis"><strong>Nichts wird automatisch gespeichert.</strong> Die Erweiterung
        fügt das Layout nur in das geöffnete Formular ein. Gefällt es dir, speicherst du mit
        „Änderungen speichern". Sonst „Abbrechen" – dann bleibt die Aufgabe, wie sie war.</p>
      </details>
      <div class="mag-status" data-rolle="vstatus"></div>
      <label>Was möchtest du gestalten?</label>
      <label class="mag-haken"><input type="checkbox" data-opt="layoutAufgabe"> Aufgabenstellung</label>
      <label class="mag-haken"><input type="checkbox" data-opt="layoutAntwort"> Antwortvorlage</label>
      <div class="mag-hinweis">Beides zusammen ist der Normalfall: Aufgabe und Antwortkasten tragen dann
      dieselbe Marke (1, 2a, 2b …), dieselbe AFB-Farbe und dieselben Punkte.</div>

      <div data-rolle="lseca" hidden>
        <div class="mag-hinweis">Der Fragetext kommt ins AFB-Kartendesign. Text und Bilder bleiben
        erhalten, nur die Gestaltung ändert sich. Material (M1, M2 …) bleibt außerhalb der Karten.</div>
        <label class="mag-haken" data-rolle="lpunktezeile"><input type="checkbox" data-opt="kartePunkte"> Punkte je Teilaufgabe anzeigen</label>
        <div class="mag-hinweis" data-rolle="lpunktehinweis">Moodle zeigt nur die Gesamtpunktzahl der Aufgabe. Bei mehreren
        Teilaufgaben sehen die Lernenden so, wie viel jede einzelne bringt.</div>
        <div class="mag-hinweis" data-rolle="lahinweise"></div>
        <label>Vorschau – so sieht die Aufgabe aus</label>
        <div class="mag-vorschau" data-rolle="lavorschau"></div>
      </div>

      <div data-rolle="lsecv" hidden>
        <label class="mag-haken"><input type="checkbox" data-opt="afbFarben"> Farben nach Anforderungsbereich</label>
        <div class="mag-hinweis">AFB I grün, AFB II orange, AFB III rot. Ohne Häkchen: neutrales Grau.</div>
        <label class="mag-haken"><input type="checkbox" data-opt="vorlagePunkte"> Punkte anzeigen</label>
        <div class="mag-hinweis">z. B. „(2 Punkte)" – die Lernenden sehen, wie ausführlich sie antworten sollten.</div>
        <label class="mag-haken"><input type="checkbox" data-opt="vorlageAfb"> Anforderungsbereich anzeigen</label>
        <div class="mag-hinweis">z. B. „AFB II" – nur, wenn er bekannt ist (Klausur: aus dem Horizont;
        Kurztest: wenn „AFB …" in der Aufgabenstellung steht).</div>
        <div class="mag-hinweis" data-rolle="vformat" hidden></div>
        <label>Vorschau – so sieht das Eingabefeld aus</label>
        <div class="mag-vorschau" data-rolle="vvorschau"></div>
      </div>
      <div class="mag-reihe">
        <button class="mag-btn mag-btn-ok" data-tu="lein">Ins Formular einfügen</button>
      </div>
      <p class="mag-hinweis">Eingefügt wird nur ins Formular. Speichern mit „Änderungen speichern" –
      oder „Abbrechen", wenn es dir nicht gefällt.</p>
    </div>

    <div class="mag-inhalt" data-panel="korrektur" hidden>
      <details class="mag-details mag-hilfe mag-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="mag-hinweis">Hier werden alle Antworten zu dieser Aufgabe mit KI-Hilfe bewertet und
        danach mit Punkten und Rückmeldung in Moodle eingetragen. Maßstab ist der Erwartungshorizont
        der Aufgabe (Reiter „Horizont").</p>
      </details>
      <details class="mag-details mag-hilfe" data-rolle="khilfe">
        <summary>So funktioniert's</summary>
        <p class="mag-hinweis"><strong>1 · Bewertungsprompt kopieren:</strong> Die Erweiterung packt
        Erwartungshorizont, Einstellungen und alle Antworten in einen Prompt. Namen gehen nicht mit –
        die Antworten sind nur nummeriert.</p>
        <p class="mag-hinweis"><strong>2 · In die KI einfügen</strong> (z. B. Claude, ChatGPT). Die KI fragt
        zuerst: <em>gemeinsam durchgehen</em> (Arbeit für Arbeit, du kannst jede ändern – empfohlen) oder
        <em>automatisch</em>. Die KI beurteilt nur: Stufe je Aufgabe, Sprachfehler, Begründung,
        Rückmeldung. Sie rechnet keine Punkte.</p>
        <p class="mag-hinweis"><strong>3 · Antwort der KI hier einfügen.</strong> Die Erweiterung rechnet
        Punkte und Rechtschreibabzug und zeigt jede Bewertung zur Kontrolle („bisher → neu").</p>
        <p class="mag-hinweis"><strong>4 · Eintragen.</strong> Gemeinsam besprochene Arbeiten lassen sich
        direkt eintragen. Automatisch bewertete musst du einmal ansehen – überspringen geht nur mit
        ausdrücklicher Bestätigung.</p>
      </details>
      <div class="mag-status" data-rolle="kstatus"></div>
      <div class="mag-rahmen">
        <div class="mag-rahmen-titel">Diese Angaben gehen in den Prompt und in die Rechnung</div>
        <div data-rolle="krahmen"></div>
        <button class="mag-btn mag-btn-klein mag-btn-rand" data-tu="zueinst">ändern</button>
      </div>
      <label>Abgaben je Durchgang</label>
      <select data-rolle="kgroesse"></select>
      <div class="mag-hinweis" data-rolle="kgroessehinweis"></div>
      <div class="mag-hinweis">Eine KI kann pro Antwort nur begrenzt viel Text schreiben. Bei vielen oder
      langen Arbeiten bricht sie sonst mitten im Ergebnis ab oder wird ungenau. Deshalb teilt die
      Erweiterung die Lerngruppe in Portionen – den Vorschlag rechnet sie aus der Textlänge. Geteilt
      wird immer nach Personen, nie nach Aufgaben: Jede Arbeit wird als Ganzes bewertet.</div>
      <label>1 · Bewertungsprompt mit allen Antworten kopieren</label>
      <div class="mag-reihe" data-rolle="kknoepfe"></div>
      <div class="mag-reihe">
        <button class="mag-btn mag-btn-rand mag-btn-klein" data-tu="kedit">✏️ Prompt anpassen</button>
        <button class="mag-btn mag-btn-rand mag-btn-klein" data-tu="krohdaten">📋 Rohdaten</button>
      </div>
      <label>2 · Ergebnis der KI einfügen</label>
      <div class="mag-hinweis">Hier den Codeblock einfügen, den die KI am Ende ausgibt – nicht den Text
      davor. <strong>Bei mehreren Teilen:</strong> Teil 1 kopieren → in die KI → Ergebnis hier einfügen.
      Dann Teil 2 im <em>selben</em> KI-Chat einfügen und sein Ergebnis <em>unter</em> das erste in dieses
      Feld setzen – alle Teile untereinander. Die Erweiterung setzt sie zusammen und meldet, welche
      Arbeiten noch fehlen.</div>
      <textarea data-rolle="kjson" rows="5" placeholder='{ "bewertungen": [ … ] }'></textarea>
      <button class="mag-btn mag-btn-primary" data-tu="kpruefen" hidden>🔍 Prüfen</button>
      <div class="mag-hinweis" data-rolle="rsabgleich" hidden></div>
      <div class="mag-liste" data-rolle="kliste"></div>
      <div class="mag-protokoll" data-rolle="klog" hidden></div>
      <div class="mag-reihe" data-rolle="keintragen" hidden>
        <button class="mag-btn mag-btn-ok" data-tu="kschreiben">Alle eintragen</button>
      </div>
    </div>

    <div class="mag-inhalt" data-panel="einst" hidden>
      <details class="mag-details mag-hilfe mag-wozu">
        <summary>Wozu dieser Reiter?</summary>
        <p class="mag-hinweis">Grundangaben für alle Aufgaben: Fach, Jahrgang, Kursniveau, Anrede, Rechtschreibung. Sie stehen als Rahmendaten im Prompt und steuern die Rechnung. Was nur für eine Aufgabe gilt (Modus, Feedbacklänge), stellst du im Reiter „Horizont" der Aufgabe ein.</p>
      </details>
      <div class="mag-status" data-rolle="estatus"></div>
      <p class="mag-hinweis">Diese Angaben stehen später als Rahmendaten im Prompt und
      steuern, wie die Erweiterung rechnet. Bitte einmal durchsehen, bevor du den Prompt
      kopierst — nachträglich lässt sich ein Horizont nur neu erzeugen.</p>
      <label>Fach</label><input type="text" data-opt="fach" placeholder="z. B. Chemie">
      <label>Jahrgang</label><input type="text" data-opt="jahrgang" placeholder="z. B. 10">
      <div class="mag-hinweis" data-rolle="anredehinweis"></div>
      <label>Kursniveau</label>
      <select data-opt="kursniveau">
        <option value="G">G — gymnasial</option>
        <option value="M">M — mittel</option>
        <option value="E">E — einfach</option>
      </select>
      <label>Punkteschritte</label>
      <select data-opt="punkteschritte">
        <option value="0.25">0,25</option><option value="0.5">0,5 (Standard)</option>
        <option value="1">1,0 — nur ganze Punkte</option>
      </select>
      <label>Rechtschreibung: Höchstabzug in % der Gesamtpunktzahl</label>
      <select data-opt="rechtschreibung">
        <option value="0">0 % — kein Abzug</option><option value="5">5 %</option>
        <option value="10">10 % (Standard Mittelstufe)</option><option value="15">15 %</option>
        <option value="20">20 %</option><option value="25">25 % (Oberstufe, Klausuren)</option>
        <option value="30">30 %</option>
      </select>
      <div class="mag-hinweis" data-rolle="rshinweis"></div>
      <label class="mag-haken"><input type="checkbox" data-opt="kiHinweis"> KI-Transparenzhinweis unter das Feedback</label>
      <label class="mag-haken"><input type="checkbox" data-opt="entferneQuellen"> Quellenangaben entfernen</label>
      <div class="mag-reihe">
        <button class="mag-btn mag-btn-ok" data-tu="esichern">Speichern und weiter</button>
        <button class="mag-btn mag-btn-grau" data-tu="eabbruch">Verwerfen</button>
      </div>
    </div>

    <div class="mag-inhalt" data-panel="prompt" hidden>
      <label data-rolle="ptitel">Prompt bearbeiten</label>
      <textarea data-rolle="ptext" rows="16"></textarea>
      <div class="mag-reihe">
        <button class="mag-btn mag-btn-ok" data-tu="psichern">Speichern</button>
        <button class="mag-btn mag-btn-rand" data-tu="pzurueck">↺ Original</button>
        <button class="mag-btn mag-btn-grau" data-tu="pabbruch">Abbrechen</button>
      </div>
    </div>`;

  // Reiter-Buttons und die Knopfzeile "hknoepfe" werden per echten DOM-Aufrufen befuellt,
  // nicht als HTML-String in die grosse Vorlage interpoliert. REITER und KONTEXT sind
  // rein intern und ungefaehrlich, aber ein .map().join() direkt in der innerHTML-
  // Zuweisung loest AMOs "Unsafe assignment to innerHTML"-Pruefung trotzdem aus.
  panel.querySelector('.mag-version').textContent = VERSION;

  const reiterContainer = panel.querySelector('.mag-reiter');
  REITER.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.className = 'mag-tab' + (i === 0 ? ' aktiv' : '');
    btn.dataset.tab = r[0];
    btn.textContent = r[1];
    reiterContainer.appendChild(btn);
  });

  function knoepfchen(label, klasse, tu) {
    const b = document.createElement('button');
    b.className = klasse;
    b.dataset.tu = tu;
    b.textContent = label;
    return b;
  }
  const hknoepfeContainer = panel.querySelector('[data-rolle="hknoepfe"]');
  if (KONTEXT !== 'bearbeiten') {
    hknoepfeContainer.appendChild(knoepfchen('In die Frage eintragen', 'mag-btn mag-btn-ok', 'hschreiben'));
  }

  // Runder Knopf mit dem Erweiterungs-Icon — wie bei Reviewer und Coach.
  // Das Bild braucht web_accessible_resources im Manifest, sonst bleibt es leer.
  const knopf = el('button', 'mag-knopf');
  knopf.title = 'Moodle AI Freitext Grader';
  const knopfBild = document.createElement('img');
  knopfBild.className = 'mag-knopf-bild';
  knopfBild.alt = 'Moodle AI Freitext Grader';
  try { knopfBild.src = browser.runtime.getURL('icon/128.png'); } catch (e) { knopf.textContent = 'AI'; }
  if (knopfBild.src) knopf.appendChild(knopfBild);

  const R = rolle => panel.querySelector('[data-rolle="' + rolle + '"]');
  const P = name  => panel.querySelector('[data-panel="' + name + '"]');

  /* --- Zustand --- */
  let horizontAufgaben = null;   // aus der KI gelesen, noch nicht geschrieben
  let bewertungen      = null;   // geprüfte Bewertungen
  let eintragungen     = null;   // fertig gerechnete Einträge
  let letzterReiter    = REITER[0][0];
  let kurztestSeite    = false;  // Einzelseite einer Kurztest-Frage -> auf die Uebersicht verweisen
  let mehrereFragen    = false;  // Zufallsfrage ohne qid-Filter -> Korrektur gesperrt
  let reviewTrotzdem   = false;  // zweiter Klick auf „Alle eintragen" trotz ungesehener Karten

  // Review: Karten der Pruefliste als „gesehen" markieren, sobald sie zur Haelfte sichtbar waren.
  if (typeof IntersectionObserver !== 'undefined') {
    const sicht = new IntersectionObserver(eintraege => eintraege.forEach(e => {
      if (e.isIntersecting) { e.target.dataset.gesehen = '1'; sicht.unobserve(e.target); }
    }), { threshold: 0.5 });
    const liste = R('kliste');
    if (liste) new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.classList.contains('mag-karte')) { reviewTrotzdem = false; sicht.observe(n); }
    }))).observe(liste, { childList: true });
  }

  /* --- Modus der Frage (Freitext Grader) ---
     Kurztest = Horizont im Coach-Format, Bewertung auf der Uebersicht.
     Klausur  = Horizont je Teilaufgabe, Bewertung auf der Einzelseite.
     Vorbelegt aus dem Marker; ohne Marker ein aenderbarer Vorschlag. */
  function istNeueFrage() {
    return KONTEXT === 'bearbeiten' && !new URLSearchParams(location.search).get('id');
  }
  function modusVorschlag() {
    const z = zustaendigkeit();
    if (z.wer === 'coach') return 'kurztest';
    if (z.wer === 'grader') return 'klausur';
    const text = leseAufgabenstellung();
    const teilaufgaben = /(^|\n)\s*(?:[a-h]\)|aufgabe\s*\d|\d+[.)]\s)/i.test(text);
    return (!teilaufgaben && (leseGesamtpunkte() || 0) <= 3) ? 'kurztest' : 'klausur';
  }
  let MODUS = KONTEXT === 'bearbeiten' ? modusVorschlag() : 'klausur';
  // Feedbacklaenge je Aufgabe (steht als Meta-Zeile im Horizont). Auswahl haengt vom Modus ab.
  const FB_STUFEN = {
    kurztest: [['Kurz', 'Kurz – 1–2 Sätze'], ['Mittel', 'Mittel – 3–5 Sätze (Standard)']],
    klausur:  [['Mittel', 'Mittel – 3–4 Sätze je Teilaufgabe'], ['Ausführlich', 'Ausführlich – ein Absatz je Teilaufgabe (Standard)'],
               ['Umfangreich', 'Umfangreich – dazu Abschnitt Operatorerfüllung']]
  };
  const FB_STANDARD = { kurztest: 'Mittel', klausur: 'Ausführlich' };
  let FEEDBACK = (() => {
    const h = KONTEXT === 'bearbeiten' ? feedbackAusHorizont(leseHorizontRoh()) : null;
    return (h && FB_STUFEN[MODUS].some(o => o[0] === h)) ? h : FB_STANDARD[MODUS];
  })();
  function feedbackAnzeigen() {
    const sel = R('hfeedbacksel'); if (!sel) return;
    sel.innerHTML = '';
    FB_STUFEN[MODUS].forEach(([w, t]) => { const o = document.createElement('option'); o.value = w; o.textContent = t; sel.appendChild(o); });
    if (!FB_STUFEN[MODUS].some(o => o[0] === FEEDBACK)) FEEDBACK = FB_STANDARD[MODUS];
    sel.value = FEEDBACK;
    R('hfeedbackhinweis').textContent = MODUS === 'kurztest'
      ? 'Bei „Kurz" und „Mittel" passt die ganze Klasse meist in einen Durchgang.'
      : 'Klausuren werden in Portionen bewertet; längeres Feedback heißt kleinere Portionen.';
  }
  let horizontKurztest = null;   // Kurztest-Horizont als Text, noch nicht geschrieben

  if (KONTEXT === 'bearbeiten') {
    hknoepfeContainer.appendChild(knoepfchen('3 · In die Aufgabe eintragen', 'mag-btn mag-btn-ok', 'hschreiben'));
  }
  function modusAnzeigen() {
    const box = R('hmodus');
    if (!box) return;
    box.hidden = KONTEXT !== 'bearbeiten';
    R('hmodussel').value = MODUS;
    R('hmodushinweis').textContent = MODUS === 'kurztest'
      ? 'Kurztest: kurze Antworten, Horizont mit Kernaussage und „Auch richtig". Bewertet wird auf '
        + 'der Übersicht, alle Kurztest-Aufgaben eines Tests zusammen. Layout-Vorlage: ein Kasten „Deine Antwort".'
      : 'Klausur: Horizont je Teilaufgabe mit Punkten, Operator und AFB, dazu eine Layout-Vorlage mit einem Kasten je Teilaufgabe. '
        + 'Bewertet wird auf der Einzelseite der Aufgabe, in Portionen, mit Review vor dem Eintragen.';
    feedbackAnzeigen();
    layoutAnzeigen();
    if (KONTEXT === 'bearbeiten') {
      const h = hknoepfeContainer.querySelector('[data-tu="hschreiben"]');
      if (h) h.hidden = false;
    }
  }
  if (KONTEXT === 'bearbeiten') {
    R('hfeedbacksel').addEventListener('change', () => { FEEDBACK = R('hfeedbacksel').value; });
    R('hmodussel').addEventListener('change', () => {
      MODUS = R('hmodussel').value;
      FEEDBACK = FB_STANDARD[MODUS];
      horizontAufgaben = null; horizontKurztest = null;
      R('hliste').innerHTML = ''; R('hknoepfe').hidden = true;
      status('hstatus', 'Modus: ' + (MODUS === 'kurztest' ? 'Kurztest' : 'Klausur')
        + '. Bitte den Prompt jetzt (neu) kopieren.');
      modusAnzeigen();
    });
  }
  modusAnzeigen();

  // Kurztest-Horizont als HTML fuer graderinfo: Marker, Sprachabzug-Zeile, Text.
  function kurztestHorizontHtml(text) {
    const ohne = ohneMarker(String(text || '').replace(/\r/g, '')).trim();
    const absaetze = ohne.split(/\n\s*\n/).filter(a => a.trim())
      .map(a => '<p>' + escapeHtml(a.trim()).replace(/\n/g, '<br>') + '</p>').join('');
    return '<p>' + MARKER_KURZTEST + '</p><p>[Rechtschreibung: '
      + komma(E.rechtschreibung) + '%]</p><p>[Feedback: ' + FEEDBACK + ']</p>' + absaetze;
  }

  // Neue Frage: direkt ins offene Formular, Moodle speichert mit der Frage.
  function liveEintragen(felder, statusRolle) {
    try {
      const arten = Object.keys(felder).map(n => n + ' (' + schreibeEditorfeldLive(n, felder[n]) + ')');
      status(statusRolle, 'Ins Formular eingesetzt: ' + arten.join(', ')
        + '. Wird mit „Änderungen speichern" zusammen mit der Frage gespeichert.');
    } catch (e) {
      status(statusRolle, 'Fehler: ' + e.message, true);
    }
  }

  /* --- Bearbeiten-URL der Frage, auch von der Bewertungsseite aus --- */
  function frageBearbeitenUrl() {
    if (KONTEXT === 'bearbeiten') return location.href;
    const p = new URLSearchParams(location.search);
    const qid = p.get('qid'), cmid = p.get('id') || p.get('cmid');
    if (!qid) return null;
    return location.origin + '/question/bank/editquestion/question.php?id=' + qid
         + (cmid ? '&cmid=' + cmid : '');
  }

  /* --- Statuszeilen und Protokoll --- */
  function status(rolle, text, fehler) {
    const n = R(rolle);
    if (!n) return;
    n.textContent = text || '';
    n.className = 'mag-status' + (text ? (fehler ? ' fehler' : ' ok') : '');
  }
  function protokoll(rolle) {
    const n = R(rolle);
    n.hidden = false; n.innerHTML = '';
    return zeile => { n.appendChild(el('div', 'mag-logzeile', zeile)); n.scrollTop = n.scrollHeight; };
  }

  /* --- Einstellungen --- */
  function ladeEinstellungen() {
    return new Promise(fertig => {
      if (!(typeof browser !== 'undefined' && browser.storage)) return fertig();
      browser.storage.local.get(['magSettings'], r => {
        if (r.magSettings) E = Object.assign({}, STANDARD, r.magSettings);
        fertig();
      });
    });
  }
  function sichereEinstellungen() {
    if (typeof browser !== 'undefined' && browser.storage) browser.storage.local.set({ magSettings: E });
  }
  function formularAusEinstellungen() {
    panel.querySelectorAll('[data-opt]').forEach(f => {
      const k = f.dataset.opt;
      if (f.type === 'checkbox') f.checked = !!E[k]; else f.value = E[k] == null ? '' : E[k];
    });
    hinweiseAktualisieren();
  }
  function einstellungenAusFormular() {
    panel.querySelectorAll('[data-opt]').forEach(f => {
      const k = f.dataset.opt;
      E[k] = (f.type === 'checkbox') ? f.checked : f.value;
    });
    // Eigene Prompts zurücksetzen: sonst bleiben veraltete Parameter eingebettet.
    E.promptHorizont = null;
    E.promptKorrektur = null;
    sichereEinstellungen();
    hinweiseAktualisieren();
  }
  // Kurzfassung der Einstellungen fuer die Zeile ueber den Kopierknoepfen.
  function einstellungenZeile() {
    const rs = (parseFloat(E.rechtschreibung) === 0)
      ? 'Rechtschreibung: kein Abzug'
      : 'Rechtschreibung: ' + E.rechtschreibung + ' %';
    return [
      (E.fach || '⚠ Fach fehlt'),
      'Jahrgang ' + (E.jahrgang || '⚠ fehlt'),
      'Niveau ' + (NIVEAU[E.kursniveau] || E.kursniveau).split(' ')[0],
      'Feedback ' + fbLaenge(),
      rs,
      'Schritte ' + komma(E.punkteschritte)
    ].join(' · ');
  }

  function einstellungenUnvollstaendig() {
    return !String(E.fach || '').trim() || !String(E.jahrgang || '').trim();
  }

  function rahmenzeilenAktualisieren() {
    const text = einstellungenZeile();
    const fehlt = einstellungenUnvollstaendig();
    ['hrahmen', 'krahmen'].forEach(r => {
      const n = R(r);
      if (!n) return;
      n.textContent = text;
      n.parentElement.classList.toggle('unvollstaendig', fehlt);
    });
  }

  function hinweiseAktualisieren() {
    rahmenzeilenAktualisieren();
    const a = R('anredehinweis');
    if (a) a.textContent = 'Im Feedback wird „' + anrede() + ' …" verwendet.';
    const rs = R('rshinweis');
    if (rs) {
      if (parseFloat(E.rechtschreibung) === 0) {
        rs.textContent = 'Kein Punktabzug — das Sprachfeedback wird trotzdem geschrieben.';
      } else {
        rs.textContent = 'Voller Abzug ab ' + komma(RS_LEITER[2][0]) + ' Fehlern je 100 Wörtern; '
          + 'unter ' + MINDESTWOERTER + ' Wörtern zählt die absolute Fehlerzahl.';
      }
    }
    const v = R('vvorschau');
    const lv = layoutVorlageHtml();
    if (v) setzeHtml(v, lv || '<p class="mag-hinweis">Im Horizont sind keine Teilaufgaben erkennbar – '
      + 'daraus entstehen die Kästen.</p>');
    const vf = R('vformat');
    if (vf) {
      vf.hidden = vorlageFormatOk();
      vf.textContent = 'Hinweis: Das Antwortformat dieser Aufgabe ist nicht „HTML-Editor". '
        + 'Beim Einfügen stellt die Erweiterung es auf „HTML-Editor" um – „Nur Text" kann kein Layout darstellen.';
    }
    layoutAnzeigen();
    const vh = R('vhorizont');
    if (vh) setzeHtml(vh, (MODUS === 'kurztest' && KONTEXT === 'bearbeiten')
      ? (horizontKurztest ? kurztestHorizontHtml(horizontKurztest) : '<p class="mag-hinweis">Noch kein Horizont eingelesen.</p>')
      : horizontAufgaben ? baueHorizont(horizontAufgaben)
      : '<p class="mag-hinweis">Noch kein Horizont eingelesen.</p>');
  }

  /* --- Reiter --- */
  function zeige(name) {
    panel.querySelectorAll('.mag-inhalt').forEach(n => { n.hidden = n.dataset.panel !== name; });
    panel.querySelectorAll('.mag-tab').forEach(t => t.classList.toggle('aktiv', t.dataset.tab === name));
    const istReiter = REITER.some(r => r[0] === name);
    panel.querySelector('.mag-reiter').hidden = !istReiter;
    if (istReiter && name !== 'einst') letzterReiter = name;
    if (name === 'vorlage') hinweiseAktualisieren();
    if (name === 'korrektur') stapelAufbauen();
  }

  /* --- Zwischenablage --- */
  // Einheitlicher Ablauf aller Erweiterungen (24.09.2026): nach dem Kopieren
  // 3 s Countdown, dann steht der Cursor im Einfuegefeld (feldRolle).
  let weiterUhr = null;
  function kopiere(text, rolle, meldung, feldRolle) {
    navigator.clipboard.writeText(text)
      .then(() => {
        const basis = meldung + '  (' + text.length.toLocaleString('de-DE') + ' Zeichen)';
        status(rolle, basis);
        if (!feldRolle || !R(feldRolle)) return;
        clearInterval(weiterUhr);
        let rest = 3;
        status(rolle, basis + ' — weiter in ' + rest + ' s');
        weiterUhr = setInterval(() => {
          rest--;
          if (rest > 0) return status(rolle, basis + ' — weiter in ' + rest + ' s');
          clearInterval(weiterUhr); weiterUhr = null;
          status(rolle, basis + ' — jetzt die Antwort der KI einfügen.');
          const f = R(feldRolle); f.focus(); f.scrollIntoView({ block: 'nearest' });
        }, 1000);
      })
      .catch(() => status(rolle, 'Kopieren fehlgeschlagen — Text bitte von Hand markieren.', true));
  }

  /* ═══════════════════════════════════════════════════════════════════
     12 · ABLAEUFE
     ═══════════════════════════════════════════════════════════════════ */

  /* --- Horizont --- */

  function horizontPruefen() {
    const roh = R('hjson').value.trim();
    if (!roh) return status('hstatus', 'Bitte erst die Antwort der KI einfügen.', true);
    if (KONTEXT === 'bearbeiten' && MODUS === 'kurztest') return horizontPruefenKurztest(roh);
    try {
      const liste = leseJson(roh, 'aufgaben')
        .map(a => ({
          nr: nrKey(a.nr), schlagwort: a.schlagwort || '', afb: a.afb || '',
          punkte: a.punkte == null ? null : zahl(a.punkte),
          operator: a.operator || '', horizont: a.horizont || a.text || ''
        }))
        .filter(a => /^\d{1,2}[a-h]?$/.test(a.nr))
        .sort((a, b) => (parseInt(a.nr, 10) - parseInt(b.nr, 10)) || a.nr.localeCompare(b.nr));
      if (!liste.length) throw new Error('Keine Aufgaben im JSON.');

      const { doppelt } = pruefeVollstaendig(liste, liste.map(a => a.nr));
      if (doppelt.length) throw new Error('Aufgabe ' + doppelt.join(', ') + ' kommt doppelt vor.');

      const summe = liste.reduce((s, a) => s + (a.punkte || 0), 0);
      const gesamt = leseGesamtpunkte();
      horizontAufgaben = liste;

      const box = R('hliste'); box.innerHTML = '';
      liste.forEach(a => {
        const k = el('div', 'mag-karte');
        k.appendChild(el('div', 'mag-kartenkopf',
          'Aufgabe ' + a.nr + (a.afb ? ' · AFB ' + a.afb : '')
          + (a.schlagwort ? ' · ' + a.schlagwort : '')
          + (a.punkte != null ? '  (' + komma(a.punkte) + ' P.)' : '')));
        const ta = el('textarea', 'mag-kartentext');
        ta.value = htmlZuText(a.horizont);
        ta.rows = 5;
        ta.addEventListener('input', () => { a.horizont = ta.value; });
        k.appendChild(ta);
        box.appendChild(k);
      });

      let meldung = liste.length + ' Aufgaben gelesen.';
      if (gesamt && Math.abs(summe - gesamt) > 0.005) {
        meldung += '  ⚠ Punktsumme ' + komma(summe) + ' weicht von der Fragenpunktzahl '
                 + komma(gesamt) + ' ab — die Erweiterung rechnet sie beim Bewerten um.';
      }
      if (KONTEXT === 'bearbeiten') {
        meldung += '  Dann „3 · In die Aufgabe eintragen".';
      }
      status('hstatus', meldung);
      R('hknoepfe').hidden = false;
      hinweiseAktualisieren();
    } catch (e) {
      status('hstatus', 'Konnte nicht gelesen werden: ' + e.message, true);
    }
  }

  function horizontPruefenKurztest(roh) {
    try {
      const liste = leseJson(roh, 'horizonte');
      const h = liste.find(x => x && (x.text || x.horizont));
      if (!h) throw new Error('Kein Horizont im JSON (erwartet: "horizonte").');
      horizontKurztest = String(h.text || h.horizont).trim();
      const box = R('hliste'); box.innerHTML = '';
      const k = el('div', 'mag-karte');
      k.appendChild(el('div', 'mag-kartenkopf', 'Kurztest-Horizont'));
      const ta = el('textarea', 'mag-kartentext');
      ta.value = horizontKurztest;
      ta.rows = 12;
      ta.addEventListener('input', () => { horizontKurztest = ta.value; });
      k.appendChild(ta);
      box.appendChild(k);
      status('hstatus', 'Horizont gelesen. Prüfen, bei Bedarf ändern, dann „In die Frage eintragen".');
      R('hknoepfe').hidden = false;
      modusAnzeigen();
    } catch (e) {
      status('hstatus', 'Konnte nicht gelesen werden: ' + e.message, true);
    }
  }

  async function horizontSchreiben(trocken) {
    if (KONTEXT === 'bearbeiten' && MODUS === 'kurztest') {
      if (!horizontKurztest) return status('hstatus', 'Es liegt noch kein geprüfter Horizont vor.', true);
      const f = { 'graderinfo[text]': kurztestHorizontHtml(horizontKurztest) };
      if (istNeueFrage()) { liveEintragen(f, 'hstatus'); return layoutAnzeigen(); }
      await schreibenAusfuehren(f, trocken, protokoll('hlog'), 'hstatus');
      if (!trocken) offenesFormularAngleichen(f);
      layoutAnzeigen();
      return setTimeout(horizontStatusAnzeigenNachSchreiben, 50);
    }
    if (istNeueFrage() && horizontAufgaben) {
      const f = { 'graderinfo[text]': baueHorizont(horizontAufgaben) };
      liveEintragen(f, 'hstatus');
      return layoutAnzeigen();
    }
    const sRolle = 'hstatus';
    if (!horizontAufgaben) {
      return status(sRolle, 'Es liegt noch kein geprüfter Horizont vor — '
        + 'bitte erst im Reiter „Horizont" die Antwort der KI einlesen und prüfen.', true);
    }
    const ziel = frageBearbeitenUrl();
    if (!ziel) return status(sRolle, 'Die Adresse der Frage lässt sich hier nicht bestimmen — '
      + 'bitte die Frage zum Bearbeiten öffnen.', true);
    const log = protokoll('hlog');
    const felder = { 'graderinfo[text]': baueHorizont(horizontAufgaben) };
    await schreibenAusfuehren(felder, trocken, log, sRolle);
    if (!trocken && KONTEXT === 'bearbeiten') offenesFormularAngleichen(felder);
    layoutAnzeigen();
    setTimeout(horizontStatusAnzeigenNachSchreiben, 50);
  }

  // Nach dem Speichern im Hintergrund zeigt das offene Formular noch den alten Stand.
  // Speichert die Lehrkraft danach selbst (etwa nach dem Layout), wuerde sie den neuen
  // Horizont ueberschreiben. Deshalb dasselbe auch ins offene Formular setzen.
  function offenesFormularAngleichen(felder) {
    try { Object.keys(felder).forEach(n => schreibeEditorfeldLive(n, felder[n])); } catch (e) { /* Feld fehlt */ }
  }

  function layoutEinfuegen() {
    try {
      const teile = [];
      let extra = '';
      if (E.layoutAufgabe !== false) {
        const r = aufgabeLayout();
        if (r.fehler) return status('vstatus', r.fehler, true);
        schreibeEditorfeldLive('questiontext[text]', r.html);
        teile.push('Aufgabenstellung');
      }
      if (E.layoutAntwort !== false) {
        const v = layoutVorlageHtml();
        if (!v) return status('vstatus', 'Für die Antwortvorlage fehlen die Teilaufgaben aus dem Horizont.', true);
        if (!vorlageFormatOk()) {
          const sel = $('[name="responseformat"]');
          sel.value = 'editor';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          extra = ' Das Antwortformat wurde auf „HTML-Editor" umgestellt – nur so wird das Layout dargestellt.';
        }
        schreibeEditorfeldLive('responsetemplate[text]', v);
        teile.push('Antwortvorlage');
      }
      if (!teile.length) return status('vstatus', 'Bitte oben auswählen, was gestaltet werden soll.', true);
      status('vstatus', teile.join(' und ') + ' ins Formular eingefügt.' + extra
        + ' Gefällt es dir, „Änderungen speichern" – sonst „Abbrechen".');
      hinweiseAktualisieren();
    } catch (e) {
      status('vstatus', 'Fehler: ' + e.message, true);
    }
  }


  async function schreibenAusfuehren(felder, trocken, log, statusRolle) {
    const namen = Object.keys(felder);
    try {
      status(statusRolle, trocken ? 'Trockenlauf läuft …' : 'Wird eingetragen …');
      if (KONTEXT !== 'bearbeiten') {
        // Nachtragen von der Bewertungsseite aus: gleiche Mechanik, andere Adresse.
        const ziel = frageBearbeitenUrl();
        const dok = await holeDok(ziel);
        const form = [...dok.forms].find(f => f.querySelector('[name="graderinfo[text]"]'));
        if (!form) throw new Error('Bearbeiten-Formular der Frage nicht erreichbar.');
        const werte = formularFelder(form);
        namen.forEach(n => {
          if (!werte.has(n)) throw new Error('Feld „' + n + '" nicht im Formular');
          log((trocken ? '✓ ' : '') + 'Feld ' + n + ' vorhanden'
            + (htmlZuText(werte.get(n)).length ? ' (enthält schon Text!)' : ''));
          if (!trocken) werte.set(n, felder[n]);
        });
        if (trocken) return status(statusRolle, 'Alles vorhanden. Jetzt eintragen.');
        const fragename = (form.querySelector('[name="name"]') || {}).value || '';
        const antwort = await sendeFormular(form, werte, ziel);
        const neu = await neueFrageUrl(antwort, fragename, ziel);
        const kontrolle = await holeDok(neu || ziel);
        const kform = [...kontrolle.forms].find(f => f.querySelector('[name="graderinfo[text]"]'));
        let schlecht = 0;
        namen.forEach(n => {
          const feld = kform && kform.querySelector('[name="' + CSS.escape(n) + '"]');
          const ok = !!feld && inhaltPasst(feld.value, felder[n]);
          log((ok ? '✓ ' : '✗ ') + n + (ok ? ' eingetragen' : ' NICHT angekommen'));
          if (!ok) schlecht++;
        });
        if (!neu) log('⚠ Neue Fragenversion nicht auffindbar — Gegenprobe unsicher.');
        return status(statusRolle, schlecht
          ? schlecht + ' Feld(er) nicht angekommen — Protokoll lesen.'
          : 'In die Frage eingetragen und gegengeprüft.', schlecht > 0);
      }

      const r = await schreibeFrageFelder(felder, trocken);
      r.bericht.forEach(b => log((trocken ? '✓ ' : '') + 'Feld ' + b.feld + ' vorhanden'
        + (b.belegt ? ' (enthält schon Text!)' : '')));
      if (trocken) return status(statusRolle, 'Alles vorhanden. Jetzt eintragen.');
      if (r.warnung) log('⚠ ' + r.warnung);
      let fehler = 0;
      (r.ergebnis || []).forEach(x => {
        log((x.ok ? '✓ ' : '✗ ') + x.feld + (x.ok ? ' eingetragen' : ' NICHT angekommen'));
        if (!x.ok) fehler++;
      });
      if (fehler) return status(statusRolle, fehler + ' Feld(er) nicht angekommen — Protokoll lesen.', true);
      // Speichern hat eine neue Fragenversion erzeugt. Das offene Formular zeigt weiter
      // den ALTEN Stand — wer dort auf „Änderungen speichern" drückt, überschreibt das
      // eben Geschriebene wieder. Deshalb deutlich warnen und wechseln, nicht still.
      log('✓ gespeichert und gegengeprüft');
      veralteteSeiteMelden(r.neueUrl);
      status(statusRolle, r.neueUrl
        ? 'Eingetragen und gegengeprüft. Diese Seite zeigt jetzt einen veralteten Stand.'
        : 'Eingetragen und gegengeprüft. Bitte die Frage neu öffnen — Moodle hat beim '
          + 'Speichern eine neue Version angelegt.', false);
    } catch (e) {
      log('✗ ' + e.message);
      status(statusRolle, 'Fehler: ' + e.message, true);
    }
  }

  /* --- Korrektur --- */

  // Geteilt wird die KLASSE, nie die Aufgabe: eine Klausur wird als Ganzes bewertet.
  // Der Vorschlag richtet sich nach der tatsächlichen Textlänge, nicht nach einer festen Zahl.
  function stapelVorschlag(abgaben) {
    const schnitt = abgaben.length
      ? abgaben.reduce((s, a) => s + woerter(a.text), 0) / abgaben.length : 0;
    const zeichenBudget = 22000;                  // grober Richtwert je Durchgang
    const proAbgabe = Math.max(200, schnitt * 6); // Wörter → Zeichen, plus Feedback-Rückweg
    return Math.max(1, Math.min(30, Math.floor(zeichenBudget / proAbgabe)));
  }

  function stapelAufbauen() {
    const abgaben = leseAbgaben();
    const sel = R('kgroesse');
    if (!sel.options.length) {
      [1, 2, 3, 5, 8, 10, 15, 20, 30].forEach(n => sel.appendChild(new Option(n + ' Abgaben', n)));
      sel.value = String(stapelVorschlag(abgaben));
      sel.addEventListener('change', stapelAufbauen);
    }
    const schnitt = abgaben.length
      ? Math.round(abgaben.reduce((s, a) => s + woerter(a.text), 0) / abgaben.length) : 0;
    R('kgroessehinweis').textContent = abgaben.length + ' Abgaben, im Schnitt ' + schnitt
      + ' Wörter. Vorschlag: ' + stapelVorschlag(abgaben) + ' je Durchgang.';

    const horizont = leseHorizontRoh() || E.horizontLokal;
    const groesse = parseInt(sel.value, 10) || 5;
    const teile = Math.ceil(abgaben.length / groesse) || 1;
    const box = R('kknoepfe'); box.innerHTML = '';
    for (let t = 0; t < teile; t++) {
      const von = t * groesse, bis = Math.min(von + groesse, abgaben.length);
      const b = el('button', 'mag-btn mag-btn-primary',
        teile === 1 ? '📋 Bewertungsprompt kopieren' : '📋 Teil ' + (t + 1) + ' kopieren (Arbeit ' + (von + 1) + '–' + bis + ')');
      b.addEventListener('click', () => {
        if (!horizont) return status('kstatus',
          'Kein Erwartungshorizont — bitte erst den Reiter „Horizont" verwenden.', true);
        kopiere(baueKorrekturPrompt(abgaben.slice(von, bis), horizont, t + 1, teile),
          'kstatus', teile === 1 ? 'Prompt kopiert.' : 'Teil ' + (t + 1) + ' kopiert.', 'kjson');
      });
      box.appendChild(b);
    }
  }

  // Mehrteilige Korrektur (Klasse in Durchgaenge geteilt): Solange Abgaben fehlen,
  // wird nur der Stand gemeldet — keine Liste, kein Eintragen-Knopf. Sonst traegt man
  // versehentlich nur Teil 1 ein, die Seite laedt neu und die uebrigen Teile sind weg.
  // Der Link „Trotzdem nur diese pruefen" setzt teilErlaubt fuer genau diesen Text.
  let teilErlaubt = false;
  function korrekturPruefen() {
    if (mehrereFragen) return status('kstatus', kurztestSeite
      ? 'Kurztest – bitte auf der Übersicht bewerten (Link oben).'
      : 'Gesperrt: Antworten zu mehreren Fragen auf dieser Seite. Bitte jede Frage einzeln über die Übersicht öffnen.', true);
    const roh = R('kjson').value.trim();
    if (!roh) return status('kstatus', 'Bitte erst die Antworten der KI einfügen.', true);
    try {
      const abgaben = leseAbgaben();
      const horizont = leseHorizontRoh() || E.horizontLokal;
      const bloecke = zerlegeHorizont(horizont);
      const liste = leseJson(roh, 'bewertungen').filter(b => b && b.nr != null);
      const { fehlend, doppelt } = pruefeVollstaendig(liste, abgaben.map(a => a.nr));
      if (doppelt.length) throw new Error('Abgabe ' + doppelt.join(', ') + ' kommt doppelt vor.');
      if (fehlend.length && !teilErlaubt) {
        const box0 = R('kliste'); box0.innerHTML = '';
        R('keintragen').hidden = true;
        eintragungen = null;
        const abgl0 = R('rsabgleich'); if (abgl0) abgl0.hidden = true;
        const da = abgaben.length - fehlend.length;
        status('kstatus', 'Teil erkannt: ' + da + ' von ' + abgaben.length + ' Abgaben. '
          + 'Nächsten Teil einfach dazu einfügen — geprüft wird, sobald alle da sind. '
          + '(Es fehlen: ' + fehlend.join(', ') + ')');
        const link = el('button', 'mag-btn mag-btn-klein mag-btn-grau',
          'Trotzdem nur diese ' + da + ' prüfen');
        link.addEventListener('click', () => { teilErlaubt = true; korrekturPruefen(); });
        box0.appendChild(link);
        return;
      }

      // Rechtschreibungs-Prozent: Horizont gegen Einstellung abgleichen (seit 3.1.0).
      // Ohne "erzwingen" hat der Horizont-Wert Vorrang — er wurde beim Anlegen des
      // Erwartungshorizonts bewusst so gewaehlt. Punkteschritte kommen ohne Abgleich
      // direkt aus dem Horizont (wirken sich auf die Note kaum aus).
      const aktuellerRs = parseFloat(E.rechtschreibung) || 0;
      const rsHorizont = rechtschreibungAusHorizont(horizont);
      const schritteHorizont = punkteschritteAusHorizont(horizont);
      const effRs = (rsHorizont != null && !rsEinstellungErzwingen) ? rsHorizont : aktuellerRs;
      const effSchritt = schritteHorizont != null ? schritteHorizont : (parseFloat(E.punkteschritte) || 0.5);

      const box = R('kliste'); box.innerHTML = '';
      const abgleich = R('rsabgleich');
      if (abgleich) {
        abgleich.innerHTML = '';
        if (rsHorizont != null && rsHorizont !== aktuellerRs) {
          abgleich.hidden = false;
          abgleich.appendChild(el('div', null,
            '⚠ Im Horizont steht ' + komma(rsHorizont) + ' % Rechtschreibung, eingestellt sind '
            + komma(aktuellerRs) + ' %. Es gilt gerade: '
            + (rsEinstellungErzwingen ? komma(aktuellerRs) + ' % (Einstellung)'
                                       : komma(rsHorizont) + ' % (Horizont)') + '.'));
          const umschalten = el('button', 'mag-btn mag-btn-grau',
            rsEinstellungErzwingen
              ? 'Stattdessen den Horizont-Wert verwenden'
              : 'Stattdessen ' + komma(aktuellerRs) + ' % (Einstellung) verwenden');
          umschalten.addEventListener('click', () => {
            rsEinstellungErzwingen = !rsEinstellungErzwingen;
            korrekturPruefen();
          });
          abgleich.appendChild(umschalten);
        } else {
          abgleich.hidden = true;
        }
      }

      eintragungen = [];
      let ohneAenderung = 0;

      liste.forEach(b => {
        const abgabe = abgaben.find(a => a.nr === Number(b.nr));
        if (!abgabe) return;
        const rechnung = rechneAbgabe(abgabe, b, bloecke, effRs, effSchritt);
        const text = baueFeedback(b, rechnung, bloecke);
        if (Math.abs(rechnung.gesamt - abgabe.ist) < 0.005 && !abgabe.kommentarfeld) {
          ohneAenderung++; return;
        }
        eintragungen.push({
          nr: abgabe.nr, markfeld: abgabe.markfeld, kommentarfeld: abgabe.kommentarfeld,
          punkte: rechnung.gesamt, feedbackHtml: feedbackAlsHtml(text), text: text
        });
        const k = el('div', 'mag-karte');
        if (b.besprochen === true) { k.dataset.gesehen = '1'; k.dataset.besprochen = '1'; }
        k.appendChild(el('div', 'mag-kartenkopf',
          (b.besprochen === true ? '✓ besprochen · ' : '') + 'Arbeit ' + abgabe.nr + ':  bisher ' + komma(abgabe.ist) + ' → neu ' + komma(rechnung.gesamt)
          + ' von ' + komma(rechnung.max) + ' P.'
          + (rechnung.abzug > 0.004 ? '   (−' + komma(rechnung.abzug) + ' P. Sprache)' : '')));
        k.appendChild(el('div', 'mag-kartenzeile', rechnung.teil
          .map(t => 'A' + t.nr + ': ' + t.prozent + '%').join('   ')
          + '   ·   ' + rechnung.wortzahl + ' Wörter, ' + komma(rechnung.fehlerDichte) + ' Fehler/100'
          + (rechnung.fehlendeAufgaben.length
             ? '   ·   ⚠ Aufgabe ' + rechnung.fehlendeAufgaben.join(', ') + ' von der KI nicht bewertet (0 %)'
             : '')));
        const ta = el('textarea', 'mag-kartentext');
        ta.value = text; ta.rows = 6;
        const eintrag = eintragungen[eintragungen.length - 1];
        ta.addEventListener('input', () => {
          eintrag.text = ta.value; eintrag.feedbackHtml = feedbackAlsHtml(ta.value);
        });
        k.appendChild(ta);
        box.appendChild(k);
      });

      const nBespr = liste.filter(b => b.besprochen === true).length;
      let meldung = eintragungen.length + ' Arbeiten vorbereitet.'
        + (nBespr === liste.length ? ' Alle gemeinsam besprochen – du kannst direkt eintragen.'
          : nBespr ? ' ' + nBespr + ' besprochen, ' + (liste.length - nBespr) + ' automatisch bewertet – diese bitte ansehen.'
          : ' Automatisch bewertet – bitte jede Arbeit einmal ansehen.');
      if (ohneAenderung) meldung += '  ' + ohneAenderung + ' ohne Änderung übersprungen.';
      if (fehlend.length) meldung += '  ⚠ Es fehlen die Abgaben ' + fehlend.join(', ')
        + ' — bitte den fehlenden Teil nachreichen.';
      status('kstatus', meldung, fehlend.length > 0);
      R('keintragen').hidden = eintragungen.length === 0;
      bewertungen = liste;
    } catch (e) {
      status('kstatus', 'Konnte nicht gelesen werden: ' + e.message, true);
    }
  }

  async function korrekturEintragen(trocken) {
    if (!eintragungen || !eintragungen.length) return;
    const log = protokoll('klog');
    try {
      status('kstatus', trocken ? 'Trockenlauf läuft …' : 'Wird eingetragen …');
      const r = await trageEin(eintragungen, trocken, log);
      if (trocken) {
        return status('kstatus', r.fehler
          ? r.fehler + ' Abgabe(n) nicht auf der Seite — Protokoll lesen.'
          : 'Alles vorhanden. Jetzt eintragen.', r.fehler > 0);
      }
      log('— ' + r.ok + ' eingetragen · ' + r.fehler + ' fehlgeschlagen —');
      if (r.fehler) {
        // Bei Fehlern bleibt das Panel offen: sonst verschwindet genau die Zeile,
        // die man lesen müsste.
        status('kstatus', r.fehler + ' fehlgeschlagen — Protokoll lesen.', true);
      } else {
        // Einheitlich: ohne Fehler schliesst das Fenster nach 3 s, danach laedt die
        // Seite neu, damit die eingetragenen Punkte sichtbar sind.
        // Rundgang: weiter zur naechsten Klausur-Frage, nach der letzten zur Uebersicht.
        const q = new URLSearchParams(location.search);
        const cmid = q.get('id');
        const pos = rundgangPosition(await rundgangLaden(cmid), q.get('slot'), q.get('qid'));
        let ziel = null, wohin = 'Fenster schließt';
        if (pos && pos.naechste) {
          ziel = einzelseiteUrl(cmid, pos.naechste);
          wohin = 'Weiter zur Klausur-Frage ' + (pos.index + 2) + ' von ' + pos.gesamt;
        } else if (pos) {
          ziel = uebersichtUrl(cmid);
          wohin = 'Alle Klausur-Fragen bewertet — zurück zur Übersicht';
        }
        let rest = 3;
        const basis = r.ok + ' Bewertungen eingetragen und gegengeprüft.';
        status('kstatus', basis + ' ' + wohin + ' in ' + rest + ' s …');
        const uhr = setInterval(() => {
          rest--;
          if (rest > 0) return status('kstatus', basis + ' ' + wohin + ' in ' + rest + ' s …');
          clearInterval(uhr);
          AKTIONEN.zu();
          if (ziel) location.href = ziel; else location.reload();
        }, 1000);
      }
    } catch (e) {
      log('✗ ' + e.message);
      status('kstatus', 'Fehler: ' + e.message, true);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     13 · EREIGNISSE UND START
     ═══════════════════════════════════════════════════════════════════ */

  let promptZiel = 'horizont';

  const AKTIONEN = {
    einst:   () => { formularAusEinstellungen(); zeige('einst'); },
    zueinst: () => { formularAusEinstellungen(); zeige('einst'); },
    zu:     () => { panel.classList.remove('offen'); knopf.classList.remove('versteckt'); },

    hprompt: () => kopiere(baueHorizontPrompt(), 'hstatus', 'Prompt kopiert.', 'hjson'),
    hedit:   () => oeffnePromptEditor('horizont'),
    hpruefen: horizontPruefen,
    hschreiben: () => horizontSchreiben(false),
    hlokalsichern: () => {
      E.horizontLokal = R('hlokal').value.trim();
      sichereEinstellungen();
      status('hstatus', E.horizontLokal
        ? 'Horizont in der Erweiterung gespeichert (nicht in der Frage).'
        : 'Gespeicherter Horizont gelöscht.');
      stapelAufbauen();
    },

    lein:   () => layoutEinfuegen(),

    kedit:    () => oeffnePromptEditor('korrektur'),
    kpruefen: korrekturPruefen,
    kschreiben: () => {
      // Review-Pflicht im Klausur-Weg: jede Karte muss einmal sichtbar gewesen sein.
      const karten = $$('.mag-karte', R('kliste'));
      const offen = karten.filter(k => k.dataset.gesehen !== '1').length;
      const knopfE = panel.querySelector('[data-tu="kschreiben"]');
      if (offen && !reviewTrotzdem) {
        reviewTrotzdem = true;
        if (knopfE) knopfE.textContent = '⚠ Ja, ' + offen + ' ungeprüft eintragen';
        return status('kstatus', '⚠ ' + offen + ' automatisch bewertete Arbeit(en) noch nicht angesehen. '
          + 'Bitte durchblättern. Willst du sie ungeprüft eintragen, bestätige das mit dem Knopf unten.', true);
      }
      reviewTrotzdem = false;
      if (knopfE) knopfE.textContent = 'Alle eintragen';
      korrekturEintragen(false);
    },
    krohdaten: () => kopiere(JSON.stringify({
      stand: new Date().toLocaleString('de-DE'),
      fach: E.fach, jahrgang: E.jahrgang,
      gesamtpunkte: leseGesamtpunkte(),
      aufgabenstellung: leseAufgabenstellung(),
      horizont: htmlZuText(leseHorizontRoh() || E.horizontLokal),
      abgaben: leseAbgaben().map(a => {
        const z = zerlegeAbgabe(a.rohHtml, a.text);
        return { nr: a.nr, ist: a.ist, max: a.max, gegliedert: z.gegliedert, aufgaben: z.aufgaben };
      })
    }, null, 2), 'kstatus', 'Rohdaten kopiert.'),

    esichern: () => {
      einstellungenAusFormular();
      if (einstellungenUnvollstaendig()) {
        return status('estatus', 'Fach und Jahrgang fehlen noch — beides steht im Prompt '
          + 'und bestimmt Anspruchsniveau und Anrede.', true);
      }
      status('estatus', '');
      zeige(KONTEXT === 'bearbeiten' ? 'horizont'
            : (letzterReiter === 'einst' ? 'korrektur' : letzterReiter));
    },
    eabbruch: () => { formularAusEinstellungen(); status('estatus', ''); },

    psichern: () => {
      const t = R('ptext').value.trim();
      const original = promptZiel === 'horizont' ? horizontPromptVorlage() : korrekturPromptVorlage();
      const wert = (t === original.trim()) ? null : t;
      if (promptZiel === 'horizont') E.promptHorizont = wert; else E.promptKorrektur = wert;
      sichereEinstellungen();
      zeige(letzterReiter);
    },
    pzurueck: () => {
      R('ptext').value = promptZiel === 'horizont' ? horizontPromptVorlage() : korrekturPromptVorlage();
    },
    pabbruch: () => zeige(letzterReiter)
  };

  // Nach dem Schreiben ist die offene Seite tot: Moodle hat eine neue Fragenversion
  // angelegt. Das muss man sehen, nicht erraten — sonst speichert man den alten Stand
  // darüber. Der Wechsel läuft automatisch, lässt sich aber anhalten.
  let wechselTimer = null;
  function veralteteSeiteMelden(neueUrl) {
    const banner = panel.querySelector('.mag-banner');
    banner.hidden = false;
    banner.className = 'mag-banner warnung';
    banner.innerHTML = '';
    banner.appendChild(el('div', null,
      'Moodle hat beim Speichern eine neue Fassung der Frage angelegt. '
      + 'Dieses Formular zeigt den alten Stand — hier nichts mehr speichern!'));
    if (!neueUrl) return;
    const knopf = el('button', 'mag-btn mag-btn-ok', 'Zur neuen Fassung der Frage');
    const halt = el('button', 'mag-btn mag-btn-klein mag-btn-grau', 'hier bleiben');
    knopf.addEventListener('click', () => { location.href = neueUrl; });
    banner.appendChild(knopf);
    banner.appendChild(halt);
    let rest = 8;
    const zaehler = el('div', 'mag-hinweis', 'Wechsel in ' + rest + ' Sekunden …');
    banner.appendChild(zaehler);
    halt.addEventListener('click', () => {
      clearInterval(wechselTimer); wechselTimer = null;
      zaehler.textContent = 'Wechsel angehalten. Diese Seite bitte nicht mehr speichern.';
      halt.remove();
    });
    wechselTimer = setInterval(() => {
      rest--;
      if (rest <= 0) { clearInterval(wechselTimer); location.href = neueUrl; return; }
      zaehler.textContent = 'Wechsel in ' + rest + ' Sekunden …';
    }, 1000);
  }

  function oeffnePromptEditor(ziel) {
    promptZiel = ziel;
    R('ptitel').textContent = ziel === 'horizont'
      ? 'Prompt für den Erwartungshorizont' : 'Prompt für die Korrektur';
    const eigen = ziel === 'horizont' ? E.promptHorizont : E.promptKorrektur;
    R('ptext').value = (eigen && eigen.trim())
      || (ziel === 'horizont' ? horizontPromptVorlage() : korrekturPromptVorlage());
    zeige('prompt');
  }

  panel.addEventListener('click', ev => {
    const tab = ev.target.closest('.mag-tab');
    if (tab) {
      if (weiterUhr) { clearInterval(weiterUhr); weiterUhr = null; }
      return tab.dataset.tab === 'einst' ? AKTIONEN.einst() : zeige(tab.dataset.tab);
    }
    const tu = ev.target.closest('[data-tu]');
    if (tu && AKTIONEN[tu.dataset.tu]) { ev.preventDefault(); AKTIONEN[tu.dataset.tu](); }
  });

  // Eingefuegt wird fast immer die fertige KI-Antwort: gleich pruefen, ein Klick weniger.
  panel.addEventListener('paste', ev => {
    const rolle = ev.target && ev.target.dataset && ev.target.dataset.rolle;
    if (rolle === 'hjson') setTimeout(horizontPruefen, 0);
    if (rolle === 'kjson') {
      // Jeder weitere Teil wird ans Ende gehaengt, egal wo der Cursor steht — ein
      // Klick mitten ins Feld wuerde sonst einen Teil in einen anderen hineinsetzen.
      const neu = ev.clipboardData && ev.clipboardData.getData('text');
      if (neu) {
        ev.preventDefault();
        const f = ev.target, alt = f.value.replace(/\s+$/, '');
        f.value = alt ? alt + '\n\n' + neu : neu;
        f.scrollTop = f.scrollHeight;
      }
      teilErlaubt = false;
      setTimeout(korrekturPruefen, 0);
    }
  });
  // Ohne sichtbaren Prüfen-Knopf (wie Reviewer 1.7.2): geprüft wird beim Einfügen
  // sofort und nach Handänderungen nach einer kurzen Tipp-Pause.
  let pruefUhr = null;
  panel.addEventListener('input', ev => {
    const rolle = ev.target && ev.target.dataset && ev.target.dataset.rolle;
    if ((rolle !== 'hjson' && rolle !== 'kjson') || ev.inputType === 'insertFromPaste') return;
    if (rolle === 'kjson') teilErlaubt = false;
    clearTimeout(pruefUhr);
    pruefUhr = setTimeout(() => {
      if (!ev.target.value.trim()) return;
      (rolle === 'hjson' ? horizontPruefen : korrekturPruefen)();
    }, 800);
  });

  panel.addEventListener('change', ev => {
    const f = ev.target.closest('[data-opt]');
    if (!f) return;
    // Die Aussehen-Häkchen der Antwortvorlage wirken sofort auf die Vorschau.
    if (['afbFarben', 'vorlagePunkte', 'vorlageAfb', 'kartePunkte', 'layoutAufgabe', 'layoutAntwort'].includes(f.dataset.opt)) {
      E[f.dataset.opt] = f.checked;
      sichereEinstellungen();
      hinweiseAktualisieren();
    }
  });

  knopf.addEventListener('click', () => {
    panel.classList.add('offen');
    knopf.classList.add('versteckt');
  });

  /* --- Start --- */
  ladeEinstellungen().then(() => {
    try {
      const kb = panel.querySelector('.mag-kopfbild');
      if (kb) kb.src = browser.runtime.getURL('icon/128.png');
    } catch (e) { const kb = panel.querySelector('.mag-kopfbild'); if (kb) kb.remove(); }
    document.body.appendChild(knopf);
    document.body.appendChild(panel);
    formularAusEinstellungen();
    R('hlokal').value = E.horizontLokal || '';

    const z = zustaendigkeit();
    const banner = panel.querySelector('.mag-banner');
    // Zufallsfrage ohne qid-Filter: dann stehen Antworten auf VERSCHIEDENE Fragen mit
    // verschiedenen Horizonten auf einer Seite. Bewertet wuerde alles gegen den ersten
    // Horizont — deshalb hier anhalten und auf die Seiten je Frage verweisen.
    const verschiedene = KONTEXT === 'bewertung'
      ? new Set($$('.que .graderinfo').map(g => g.innerText.trim()).filter(Boolean)).size : 0;
    mehrereFragen = verschiedene > 1;
    if (verschiedene > 1) {
      banner.hidden = false;
      banner.textContent = 'Auf dieser Seite stehen Antworten zu ' + verschiedene + ' verschiedenen '
        + 'Fragen (Zufallsfrage). Bitte über die Übersicht jede Frage einzeln öffnen — sonst würde '
        + 'alles gegen einen einzigen Horizont bewertet.';
      R('kstatus') && status('kstatus', 'Gesperrt: mehrere Fragen auf einer Seite (siehe oben).', true);
      const ks = panel.querySelector('[data-tu="kschreiben"]');
      if (ks) ks.disabled = true;
    } else if (z.wer === 'coach' && KONTEXT === 'bewertung') {
      // Kurztests werden auf der Uebersicht bewertet (alle Kurztest-Fragen in einem Prompt).
      // Hier im Klausur-Weg passte weder Prompt noch Horizont-Format — deshalb sperren und verweisen.
      mehrereFragen = true; kurztestSeite = true;
      banner.hidden = false;
      banner.textContent = 'Diese Frage ist ein Kurztest. Kurztests werden auf der Übersicht des Tests '
        + 'bewertet – alle Kurztest-Fragen zusammen in einem Prompt. ';
      const cmid = new URLSearchParams(location.search).get('id');
      if (cmid) {
        const a = document.createElement('a');
        a.href = uebersichtUrl(cmid); a.textContent = 'Zur Übersicht →';
        a.className = 'mag-btn mag-btn-ok mag-btn-klein';
        banner.appendChild(a);
      }
      R('kstatus') && status('kstatus', 'Kurztest – bitte auf der Übersicht bewerten (Link oben).', true);
      const ks = panel.querySelector('[data-tu="kschreiben"]');
      if (ks) ks.disabled = true;
    } else if (!z.horizont && KONTEXT === 'bewertung' && !E.horizontLokal) {
      banner.hidden = false;
      banner.textContent = 'Diese Frage hat noch keinen Erwartungshorizont. '
        + 'Er lässt sich hier nachtragen.';
    }

    // Reihenfolge der Selbstauswahl: fehlende Einstellungen zuerst — ohne Fach und
    // Jahrgang taugt der Prompt nicht. Danach der fehlende Horizont.
    const ut = panel.querySelector('.mag-untertitel');
    if (ut) ut.textContent = KONTEXT === 'bearbeiten' ? 'Aufgabe vorbereiten' : 'Antworten bewerten';
    let start;
    if (einstellungenUnvollstaendig() && KONTEXT !== 'bearbeiten') {
      start = 'einst';
      status('estatus', 'Bitte einmal ausfüllen: Fach und Jahrgang fehlen. '
        + 'Beides geht als Rahmendatum in den Prompt.', true);
    } else if (KONTEXT === 'bewertung' && !z.horizont && !E.horizontLokal) {
      start = 'horizont';
    } else {
      start = KONTEXT === 'bearbeiten' ? 'horizont' : 'korrektur';
    }
    zeige(start);
    rahmenzeilenAktualisieren();

    if (KONTEXT === 'bewertung') {
      const n = leseAbgaben().length;
      if (!mehrereFragen) status('kstatus', n ? n + ' Arbeiten auf dieser Seite.' : 'Keine Arbeiten gefunden.');
      const kh = R('khilfe');
      if (kh) {
        kh.open = !E.khilfeGesehen;
        kh.addEventListener('toggle', () => { if (!kh.open && !E.khilfeGesehen) { E.khilfeGesehen = true; sichereEinstellungen(); } });
      }
    } else {
      horizontStatusAnzeigen();
      const md = materialDateien();
      if (md.length) {
        R('hmaterial').hidden = false;
        R('hmaterial').textContent = 'In der Aufgabe stehen ' + md.length + ' Bild(er)/Datei(en): '
          + md.join(' · ') + ' – bitte zusätzlich in den KI-Chat hochladen.';
      }
      // Hilfe beim ersten Mal offen, danach eingeklappt.
      const hilfe = R('hhilfe');
      if (hilfe) {
        hilfe.open = !E.hilfeGesehen;
        hilfe.addEventListener('toggle', () => { if (!hilfe.open && !E.hilfeGesehen) { E.hilfeGesehen = true; sichereEinstellungen(); } });
      }
      // Im Frageneditor gleich geoeffnet.
      panel.classList.add('offen');
      knopf.classList.add('versteckt');
    }
  });

}
