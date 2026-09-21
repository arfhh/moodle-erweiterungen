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

export function starteCoach() {
  'use strict';

  // Versionsnummer aus dem Manifest — sie steht in der Kopfzeile des Panels, damit
  // nach "↺ neu laden" sofort sichtbar ist, welche Fassung wirklich aktiv ist.
  // Aus dem Manifest gelesen, nie von Hand gepflegt: so kann sie nicht auseinanderlaufen.
  const VERSION = (browser.runtime.getManifest ? browser.runtime.getManifest().version : '');

  const P = new URLSearchParams(location.search);
  if (P.get('mode') !== 'grading') return;
  if (P.get('slot')) return;                 // Einzelfrageseite gehört dem Grader
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
    const m = t.match(/Kernaussage\s*:?\s*([\s\S]*?)(?=\n\s*(?:Muss enthalten|Auch richtig|Inhalt|Reicht nicht|Häufiger Fehler)\s*:|$)/i);
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
  const MARKER_ZEILE = '[moodle-ai-coach]';
  // Toleriert auch die Fassung ohne Klammern, mit Leer- statt Bindestrich und mit
  // nachfolgendem Text in derselben Zeile.
  const MARKER_RE = /^\s*[\[(]?\s*moodle[-\s]?ai[-\s]?(coach|grader)\s*[\])]?\s*[:.–-]?\s*/i;

  function ersteZeile(h) {
    return String(h || '').split('\n').map((z) => z.trim()).find(Boolean) || '';
  }

  // 'coach' | 'grader' | null (kein Marker oder gar kein Horizont)
  function zustaendigkeit(horizont) {
    const m = ersteZeile(horizont).match(MARKER_RE);
    return m ? m[1].toLowerCase() : null;
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

  const KI_HINWEIS_STANDARD =
    'Dieses Feedback wurde von der Lehrkraft mithilfe von KI-Unterstützung erstellt und geprüft.';

  const OPT_STANDARD = {
    // Sprache wird ABGEZOGEN, nicht als zweiter Topf addiert: sonst bekäme eine
    // inhaltsleere Antwort allein für sauberes Deutsch schon 30 %.
    maxSprachabzug: 30,
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
    kompaktPrompt: false
  };
  let optionen = { ...OPT_STANDARD };
  // Gilt nur fuer den aktuellen Ernte-Durchlauf, wird nie gespeichert: erzwingt die
  // eingestellte Prozentzahl statt der im Horizont hinterlegten (Abgleich, 1.8.0).
  let prozentEinstellungErzwingen = false;

  function hoechstabzugFuer(frageDaten) {
    const standard = optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug;
    if (prozentEinstellungErzwingen) return standard;
    const h = frageDaten && frageDaten.horizontProzent;
    return (h === null || h === undefined) ? standard : h;
  }

  function optionenLaden() {
    return new Promise((resolve) => {
      try {
        browser.storage.local.get(['coachOptionen'], (r) => {
          optionen = { ...OPT_STANDARD, ...(r && r.coachOptionen ? r.coachOptionen : {}) };
          resolve(optionen);
        });
      } catch (e) { resolve(optionen); }
    });
  }
  function optionenSpeichern(neu) {
    optionen = { ...optionen, ...neu };
    return new Promise((resolve) => {
      try { browser.storage.local.set({ coachOptionen: optionen }, resolve); }
      catch (e) { resolve(); }
    });
  }

  /* ================= Sprachabzug ================= */

  // Anteile vom eingestellten Höchstabzug. Bewusst bis 5 Fehler gestaffelt:
  // bei einer Leiter bis 3 landen fast alle Antworten sofort am Anschlag und
  // die Bewertung sagt nichts mehr aus.
  const LEITER = [0, 1 / 3, 1 / 2, 2 / 3, 5 / 6, 1];

  function abzugProzent(fehlerzahl, hoechstabzugOverride) {
    const i = Math.min(Math.max(0, Math.round(fehlerzahl)), LEITER.length - 1);
    const basis = hoechstabzugOverride ?? (optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug);
    return LEITER[i] * basis;
  }

  // Schwere Fehler zählen doppelt — ein Satz ohne Prädikat wiegt mehr als ein
  // vergessenes Komma. Das ist der „strenge Deutschlehrer".
  const fehlerGewicht = (liste) =>
    (liste || []).reduce((s, f) => s + (f && f.schwer ? 2 : 1), 0);

  function punkteRechnen(max, inhaltProzent, fehlerListe, hoechstabzugOverride) {
    const gewicht = fehlerGewicht(fehlerListe);
    const ab = abzugProzent(gewicht, hoechstabzugOverride);
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
  const essayWert = (feld) =>
    (feld.tagName === 'TEXTAREA' ? (feld.value || '') : txt(feld)).trim();

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
      horizontProzent: prozentAusHorizont(horizontRoh),
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
        schon_bewertet: schonBewertet
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
          const { bloecke } = await seiteAllerVersucheLaden(z, 8);
          const res = await werteSeiteAus(bloecke, z);
          if (!res) { keinEssay++; }
          else {
            const schluessel = res.frage.name || (z.slot + '|' + z.qid);
            const zust = res.frage.zustaendig;
            // Fremd ist eine Frage, die ausdruecklich dem Grader gehoert — und im
            // strengen Modus zusaetzlich jede ohne Coach-Marker.
            const fuerAnderen = zust === 'grader';
            const strengRaus = optionen.nurMitMarker && zust !== 'coach';
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
        max_sprachabzug_prozent: optionen.maxSprachabzug
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
    const hilf = document.createElement('div');
    hilf.innerHTML = String(feld.value || '');
    const text = hilf.innerText.trim();
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
    const mitProzent = fuegeProzentZeileEin(
      mitMarker, optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug);
    return graderinfoSchreiben(
      qid,
      () => '<p>' + escapeHtml(mitProzent).replace(/\n/g, '<br>') + '</p>',
      mitProzent, nurPruefen);
  }

  // Stellt Marker- UND Rechtschreibungs-Zeile vor einen VORHANDENEN Horizont. Der
  // bisherige Inhalt wird unveraendert uebernommen — er ist HTML, und ihn ueber den
  // Textweg neu zu schreiben wuerde Absaetze und Listen zerstoeren.
  function markerNachtragen(qid) {
    const kopf = '<p>' + MARKER_ZEILE + '</p><p>'
      + prozentZeile(optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug) + '</p>';
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

  function bewertungsPromptVorlage() {
    const maxAb = optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug;
    return `═══════════════════════════════════════════════════════
MOODLE AI COACH – BEWERTUNG KURZER FREITEXTANTWORTEN
═══════════════════════════════════════════════════════

BEGRÜSSUNG
Beginne mit genau diesen drei Punkten, dann folge den Arbeitsanweisungen:
1. „Willkommen beim Moodle AI Coach."
2. „Ich bewerte kurze Freitextantworten nach dem Erwartungshorizont, der in der
   Aufgabe hinterlegt ist, und schreibe jedem Schüler eine Rückmeldung zur Sprache.
   Entscheiden tust du."
3. „Der „Moodle AI Coach" wurde von A. Spielhoff entwickelt und ist unter der Lizenz
   CC BY-SA 4.0 veröffentlicht – du darfst ihn frei verwenden, teilen und anpassen,
   solange du ihn nennst."

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

Grundregeln:
• Bewerte nur, was tatsächlich dasteht. Interpretiere nichts hinein.
• „Auch richtig" im Horizont ist verbindlich: Wer eine dort genannte Formulierung
  benutzt, bekommt die volle Stufe – auch umgangssprachlich.
• Fachlich richtige Zusätze, die nicht verlangt waren, geben keine Punkte, kosten
  aber auch keine.
• Eine Antwort in Stichworten statt in Sätzen ist inhaltlich nicht schlechter.
  Der Satzbau wird in Teil 2 bewertet, nicht hier.

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

Zur Einordnung, was mit deiner Zählung geschieht: Der Höchstabzug ist gerade auf
${maxAb} % der Aufgabenpunkte eingestellt. 1 Fehler kostet ein Drittel davon,
2 Fehler die Hälfte, 3 zwei Drittel, 4 fünf Sechstel, ab 5 den vollen Abzug.

═══════════════════════════════════════════════════════
TEIL 3 – RÜCKMELDUNG
═══════════════════════════════════════════════════════

Das Feedback ist das eigentliche Produkt. Es lesen Schülerinnen und Schüler der
Mittelstufe, viele davon schreibschwach. Sie sollen daraus lernen — also schreibst du
wie eine Deutschlehrkraft, die einem Vierzehnjährigen etwas erklärt.

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

Erst nach „ok":

\`\`\`json
{
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

Schreibe darunter: „Kopiere diesen Block in die Erweiterung, Reiter „2 · Eintragen",
und klicke dort auf „🔍 Prüfen"."

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

  function horizontPromptVorlage() {
    return `═══════════════════════════════════════════════════════
MOODLE AI COACH – ERWARTUNGSHORIZONT ERSTELLEN
═══════════════════════════════════════════════════════

Für die unten stehenden Aufgaben brauchst du einen Erwartungshorizont – einen je
Aufgabe, in genau dem Format unten. Er wird anschließend in das Moodle-Feld
„Bewerterinformation" der Frage geschrieben und dort dauerhaft benutzt.

Steht bei einer Aufgabe „horizont_bisher", gibt es dort schon einen. Er ist der
**Ausgangspunkt, keine Vorlage zum Abschreiben**: Er wird ersetzt, weil an ihm etwas
nicht stimmt. Übernimm, was gut ist, und weiche dort ab, wo die Änderungswünsche der
Lehrkraft es verlangen – auch dann, wenn der bisherige Horizont das Gegenteil sagt.
Steht kein „horizont_bisher" dabei, schreibst du neu.

Die Kernaussage bekommen die Schülerinnen und Schüler zu sehen: Die Erweiterung setzt
sie bei unvollständigen Antworten als „So hättest du es schreiben können" unter die
Rückmeldung. Schreib sie deshalb als vollständige Musterantwort in einfacher Sprache –
Name und Funktion, ein bis zwei kurze Sätze.

WICHTIG – was NICHT hineingehört:
Keine Sprachregeln, kein Rechtschreibabzug, kein Feedback-Stil, keine Rolle, keine
Punktzahl. Das steht global in der Erweiterung. Im Horizont steht ausschließlich,
was für DIESE eine Aufgabe gilt. Sonst entstehen so viele Kopien der Regeln, wie es
Fragen gibt, und sie laufen auseinander.

FORMAT je Aufgabe:

Erwartungshorizont

Kernaussage:
<der eine Satz, der die volle Inhaltspunktzahl trägt>

Muss enthalten:
- <Teilaspekt 1>
- <Teilaspekt 2>

Auch richtig:
<gleichwertige Formulierungen, Synonyme, umgangssprachliche Varianten>

Inhalt:
100 % – <Bedingung>
 75 % – <Bedingung>            (nur wenn die Aufgabe eine solche Stufe hergibt)
 50 % – <Bedingung>
 25 % – <Bedingung>
  0 % – <Bedingung>

Reicht nicht:
<typische halbe Antwort und warum sie nicht reicht>

Häufiger Fehler:
<typischer Denkfehler – hilft später beim Feedback>

REGELN:
• Benutze nur die Stufen 100 / 75 / 50 / 25 / 0. Kein 90 – das ist im Projekt die
  Rechtschreibstufe und hat mit Inhalt nichts zu tun.
• Lass Stufen weg, die die Aufgabe nicht hergibt. Bei einer Aufzählung von drei
  Dingen sind 100 / 75 / 50 / 0 natürlicher als fünf Stufen.
• Die Antwort soll ein bis drei Sätze lang sein. Halte den Horizont entsprechend
  knapp – er ist kein Lehrbuchtext.
• „Auch richtig" ist der wichtigste Abschnitt. Denk daran, wie Vierzehnjährige
  formulieren, und nimm diese Varianten ausdrücklich auf.
• Der Operator der Aufgabe zählt: Bei „Nenne" reicht die Nennung, bei „Erkläre"
  muss ein Zusammenhang dastehen, bei „Vergleiche" beide Seiten.

AUSGABE:
Gib zuerst alle Horizonte als lesbaren Text aus, damit die Lehrkraft sie prüfen kann.
Frage dann: „Passt das so?"
Erst nach „ok" gibst du sie als JSON aus:

\`\`\`json
{
  "horizonte": [
    { "qid": "115576570", "frage": "alkoholischen Gärung (AFB I)",
      "text": "Erwartungshorizont\\n\\nKernaussage:\\n…" }
  ]
}
\`\`\`

„qid" übernimmst du unverändert aus den Daten unten.

═══════════════════════════════════════════════════════
AUFGABEN OHNE ERWARTUNGSHORIZONT
═══════════════════════════════════════════════════════

[MOODLE_AI_COACH_AUFGABEN]`;
  }

  // Kompakte Fassung: setzt voraus, dass die KI die Skills "2-didaktik-bewertung"
  // (Bewertungsstufen, Notenmodell, Sprachabzug, Feedbackregeln) und
  // "3-moodle-erweiterungen" (Zustaendigkeits-Marker Coach/Grader) von A. Spielhoff
  // kennt. Das Ausgabeformat (Tabelle, JSON-Schema, Horizont-Nachziehen) ist NICHT
  // Teil dieser Skills und bleibt deshalb ausgeschrieben.
  function kompaktPromptVorlage() {
    const maxAb = optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug;
    return `═══════════════════════════════════════════════════════
MOODLE AI COACH – BEWERTUNG (KOMPAKTER PROMPT)
═══════════════════════════════════════════════════════

Falls du Zugriff auf die Skills „2-didaktik-bewertung“ und „3-moodle-erweiterungen“
von A. Spielhoff hast: Wende deren Bewertungslogik an — Inhalt strikt getrennt von
Sprache, die Abstufung im Horizont ist verbindlich (keine eigene Skala erfinden),
Sprachfehler zählen (schwer = doppelt) statt selbst Punkte abzuziehen, die
Feedback-Gliederung in Felder (lob/inhalt/rechtschreibung/grammatik/tipp) mit
kurzen, schülergerechten Sätzen für die Mittelstufe, und die drei Rückmeldungsfälle
(volle Punktzahl → nur Lob; ≥95 % → Lob zuerst; darunter → kein Lob).

Hast du diese Skills NICHT: Bitte um den ausführlichen Prompt (⚙ → Häkchen
„Kompakter Prompt“ ausschalten) statt zu raten — ohne die genauen Regeln (besonders
die Trennung Inhalt/Sprache und die Feld-Gliederung) sind falsche Bewertungen und
unpassendes Feedback wahrscheinlich.

Höchstabzug für Sprache ist gerade auf ${maxAb} % der Aufgabenpunkte eingestellt:
1 Fehler kostet ein Drittel davon, 2 die Hälfte, 3 zwei Drittel, 4 fünf Sechstel,
ab 5 den vollen Abzug. Punkte NICHT selbst ausrechnen, nur Inhalt-Prozent und
Fehlerliste angeben — das rechnet die Erweiterung.

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

Erst nach „ok“ ausgeben:

\`\`\`json
{
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
in die Erweiterung, Reiter „2 · Eintragen“, und klicke dort auf „🔍 Prüfen“.“

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
    const block = '```json\n' + JSON.stringify(daten, null, 1) + '\n```';
    return vorlage.includes(DATEN_PLATZHALTER)
      ? vorlage.replace(DATEN_PLATZHALTER, block)
      : vorlage + '\n\n' + block;
  }

  function baueHorizontPrompt(fragenListe) {
    const eigen = (optionen.horizontPromptOverride || '').trim();
    const vorlage = eigen || horizontPromptVorlage();
    // Bei Fragen, die schon einen Horizont haben, wandert er als horizont_bisher mit:
    // die KI soll wissen, wovon sie abweicht, statt blind neben dem Vorhandenen zu schreiben.
    const block = '```json\n' + JSON.stringify(
      fragenListe.map((f) => {
        const e = { qid: f.qid, frage: f.name, aufgabe: f.aufgabe, max: f.max };
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
    const alles = wunschBlock + block;
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
  knopf.title = 'Moodle AI Coach';
  try {
    const bild = document.createElement('img');
    bild.src = browser.runtime.getURL('icon/128.png');
    bild.alt = 'AI Coach';
    bild.className = 'co-fab-icon';
    bild.addEventListener('error', () => { bild.remove(); knopf.textContent = 'Co'; });
    knopf.appendChild(bild);
  } catch (e) { knopf.textContent = 'Co'; }
  document.body.appendChild(knopf);

  const panel = el('div', 'co-panel co-hidden');
  panel.innerHTML = `
    <div class="co-head">
      <span class="co-title">AI Coach <span class="co-version"></span></span>
      <button class="co-close" title="Schließen">✕</button>
    </div>
    <div class="co-tabs">
      <button class="co-tab co-aktiv" data-tab="lesen">1 · Bewerten</button>
      <button class="co-tab" data-tab="eintrag">2 · Eintragen</button>
      <button class="co-tab" data-tab="horizont">3 · Horizont <span class="co-badge co-hidden"></span></button>
      <button class="co-tab" data-tab="opt">⚙</button>
    </div>

    <div class="co-body" data-panel="lesen">
      <p class="co-meta"></p>
      <label class="co-check"><input type="checkbox" class="co-bereits">
        Auch schon bewertete Versuche noch einmal vorlegen</label>
      <button class="co-go">Freitextaufgaben durchsuchen</button>
      <div class="co-progress co-hidden"><div class="co-bar"></div><span class="co-ptext"></span></div>
      <div class="co-result co-hidden">
        <p class="co-summary"></p>
        <p class="co-warn co-hidden"></p>
        <div class="co-prozentbox co-hidden"></div>
        <div class="co-zust co-hidden"></div>
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
      <p class="co-hinweis">Hier das Bewertungs-JSON der KI einfügen. Die Punkte rechnet
      die Erweiterung aus Inhalt und Fehlerzahl selbst.</p>
      <textarea class="co-json" rows="6" placeholder='{ "bewertungen": [ … ] }'></textarea>
      <label class="co-check"><input type="checkbox" class="co-ki" checked>
        KI-Hinweis ans Feedback anhängen</label>
      <p class="co-kivorschau"></p>
      <button class="co-pruef">🔍 Prüfen</button>
      <p class="co-pinfo co-hidden"></p>
      <div class="co-schreibknoepfe co-hidden">
        <button class="co-probe">Trockenlauf — nichts speichern</button>
        <button class="co-alle">Alle eintragen</button>
      </div>
      <div class="co-progress2 co-hidden"><div class="co-bar2"></div><span class="co-ptext2"></span></div>
      <p class="co-abschluss co-hidden"></p>
      <div class="co-log co-hidden"></div>
      <div class="co-vorschau"></div>
    </div>

    <div class="co-body co-hidden" data-panel="horizont">
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
      <button class="co-hpruef">🔍 Prüfen</button>
      <p class="co-hinfo co-hidden"></p>
      <div class="co-hliste"></div>
      <div class="co-progress3 co-hidden"><div class="co-bar3"></div><span class="co-ptext3"></span></div>
      <p class="co-habschluss co-hidden"></p>
      <div class="co-hlog co-hidden"></div>
      <div class="co-hknoepfe co-hidden">
        <button class="co-hprobe">Trockenlauf — nichts speichern</button>
        <button class="co-hschreib">In die Aufgaben eintragen</button>
      </div>
    </div>

    <div class="co-body co-hidden" data-panel="opt">
      <label class="co-label">Maximaler Abzug für Sprache und Ausdruck (% der Aufgabenpunkte)
        <input type="text" class="co-abzug" value="30">
      </label>
      <p class="co-abzuginfo"></p>
      <label class="co-check"><input type="checkbox" class="co-nurmarker">
        Nur Fragen bewerten, die „[moodle-ai-coach]" im Erwartungshorizont tragen</label>
      <p class="co-hinweis">Fragen, deren Horizont mit <code>[moodle-ai-grader]</code>
      beginnt, überspringt der Coach <strong>immer</strong> — dafür ist dieses Häkchen
      nicht nötig. Es entscheidet nur über Fragen <em>ohne</em> Marker: aus (Standard)
      werden sie bewertet und im Ergebnis gemeldet, an bleiben sie liegen. Leg es um,
      wenn dein Bestand vollständig markiert ist.</p>
      <label class="co-check"><input type="checkbox" class="co-kompakt">
        Kompakter Prompt (nur für KI mit eigenen Skills, z. B. Claude)</label>
      <p class="co-hinweis">Verweist für die Bewertungslogik auf die Skills
      „2-didaktik-bewertung“ und „3-moodle-erweiterungen“ statt sie komplett
      auszuschreiben – spart pro Aufruf mehrere Tausend Zeichen. <strong>Nur
      einschalten, wenn du sicher bist, dass die verwendete KI diese Skills wirklich
      kennt</strong> (z. B. dein eigener Claude-Cowork-Zugang). Andere Lehrkräfte
      oder andere KI-Systeme lassen dieses Häkchen aus – die bekommen automatisch den
      vollständigen Prompt. Wirkt nur auf den Bewertungs-Prompt in Reiter 1, nicht
      auf den Horizont-Prompt in Reiter 3.</p>
      <label class="co-label">KI-Hinweis unter dem Feedback
        <textarea class="co-kitext" rows="3"></textarea>
      </label>
      <p class="co-hinweis">Die beiden Prompts stehen dort, wo sie gebraucht werden:
      der <strong>Bewertungs-Prompt</strong> in Reiter 1 (damit bewertet die KI die
      Antworten), der <strong>Horizont-Prompt</strong> in Reiter 3 (damit schreibt sie
      den Erwartungshorizont für Fragen, die noch keinen haben) — jeweils unter
      „Prompt anpassen". In beiden Feldern steht der volle Text zum Lesen und Ändern.</p>
      <button class="co-optsave">Speichern</button>
      <button class="co-optreset co-zweit">Alles zurücksetzen</button>
      <p class="co-optinfo co-hidden"></p>
    </div>`;
  document.body.appendChild(panel);
  panel.querySelector('.co-version').textContent = VERSION;

  const $ = (s) => panel.querySelector(s);
  let ausgabe = null, eintraege = null, horizonte = null;

  // Den Auslese-Durchlauf sichern. Ohne das ist er nach jedem Neuladen der Seite weg
  // und Reiter 2 kann die Punkte nicht mehr rechnen — man müsste alles neu durchsuchen.
  const ERNTE_KEY = 'coachErnte_' + CMID;
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
  $('.co-close').addEventListener('click', () => panel.classList.add('co-hidden'));
  function reiterZeigen(name) {
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
    if (reiterAutoTimer) { clearTimeout(reiterAutoTimer); reiterAutoTimer = null; }
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
    $('.co-abzuginfo').textContent = v === 0
      ? 'Sprache zählt nicht für die Punkte. Das Sprachfeedback wird trotzdem geschrieben.'
      : `Höchstabzug ${prozentText(v)} %. Ein Fehler kostet ${prozentText(Math.round(v / 3 * 10) / 10)} %, `
        + `zwei ${prozentText(Math.round(v / 2 * 10) / 10)} %, drei ${prozentText(Math.round(v * 2 / 3 * 10) / 10)} %, `
        + `vier ${prozentText(Math.round(v * 5 / 6 * 10) / 10)} %, ab fünf ${prozentText(v)} %. `
        + 'Schwere Fehler zählen doppelt.';
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
  });
  $('.co-nurmarker').addEventListener('change', async (e) => {
    await optionenSpeichern({ nurMitMarker: e.target.checked });
  });

  optionenLaden().then(() => {
    $('.co-abzug').value = prozentText(optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug);
    $('.co-kitext').value = optionen.kiHinweisText || KI_HINWEIS_STANDARD;
    // Ein leeres Feld, das „Standard" bedeutet, ist eine Blackbox: man sieht nicht,
    // was tatsächlich verschickt wird. Deshalb steht hier immer der volle Text.
    // Gespeichert wird nur, was vom Standard abweicht.
    $('.co-prompt').value = optionen.promptOverride || bewertungsPromptVorlage();
    $('.co-hprompt').value = optionen.horizontPromptOverride || horizontPromptVorlage();
    $('.co-nurmarker').checked = !!optionen.nurMitMarker;
    $('.co-kompakt').checked = !!optionen.kompaktPrompt;
    abzugInfo(); kiVorschau();
  });

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
      kiHinweisText: $('.co-kitext').value.trim() || KI_HINWEIS_STANDARD
    });
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
    $('.co-prompt').value = bewertungsPromptVorlage();
    kurzQuittung($('.co-promptstd'), '✓ eingefügt', 'Standard einfügen');
  });
  $('.co-promptsave').addEventListener('click', async () => {
    const v = $('.co-prompt').value.trim();
    // Deckungsgleich mit dem Standard = kein eigener Prompt. Sonst friert man die
    // mitgelieferte Fassung ein und bekommt spätere Verbesserungen nicht mehr mit.
    const eigen = (v === bewertungsPromptVorlage().trim()) ? '' : v;
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
    await optionenSpeichern({ ...OPT_STANDARD });
    $('.co-abzug').value = prozentText(OPT_STANDARD.maxSprachabzug);
    $('.co-nurmarker').checked = OPT_STANDARD.nurMitMarker;
    $('.co-kompakt').checked = OPT_STANDARD.kompaktPrompt;
    $('.co-kitext').value = KI_HINWEIS_STANDARD;
    $('.co-prompt').value = bewertungsPromptVorlage();
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
        + (fremde.length ? ` · ${fremde.length} nicht für den Coach` : '')
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
        const aktuellerProzent = optionen.maxSprachabzug ?? OPT_STANDARD.maxSprachabzug;
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
            `↷ ${fuerGrader.length} Frage(n) sind für den Moodle AI Grader gebaut — übersprungen.`));
          fuerGrader.forEach((f) => zustBox.appendChild(el('div', 'co-logzeile', f.name)));
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
            + 'wurden mitbewertet. Trag den Marker nach, dann ist die Zuständigkeit dauerhaft geklärt.'));
          ohneMarker.forEach((f) => zustBox.appendChild(el('div', 'co-logzeile', f.name)));
          const urText = `${MARKER_ZEILE} in ${ohneMarker.length} Frage(n) nachtragen`;
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
              'Bitte „Freitextaufgaben durchsuchen" noch einmal laufen lassen — dann liest '
              + 'die Erweiterung den neuen Stand.'));
          });
          zustBox.appendChild(nach);

          // Zweiter Weg: Wer nicht weiss, was in diesen Fragen ueberhaupt steht, will den
          // Horizont oft lieber neu schreiben als einen fremden nur mit Marker versehen.
          const neuSchreiben = el('button', 'co-hneu co-zweit', 'Horizont neu schreiben');
          neuSchreiben.title = 'Springt zu Reiter 3 und nimmt diese Fragen in den Prompt auf';
          neuSchreiben.addEventListener('click', () => {
            $('.co-halle').checked = true;
            hcopyBeschriften();
            reiterZeigen('horizont');
            $('.co-hcopy').scrollIntoView({ block: 'nearest' });
          });
          zustBox.appendChild(neuSchreiben);
        }
      } else zustBox.classList.add('co-hidden');

      const badge = panel.querySelector('.co-badge');
      badge.classList.toggle('co-hidden', !ohneH.length);
      badge.textContent = ohneH.length || '';

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
      b.disabled = false; b.textContent = 'Freitextaufgaben durchsuchen';
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

  function quittung(kl, urText) {
    const b = $(kl); b.textContent = '✓ kopiert';
    setTimeout(() => (b.textContent = urText), 2000);
  }
  $('.co-copy').addEventListener('click', async () => {
    if (!ausgabe) return;
    await inZwischenablage(bauePrompt(nurMitHorizont(ausgabe)));
    quittung('.co-copy', '📋 Prompt + Daten kopieren');
    // Erst nach erfolgreichem Kopieren wechselt der Reiter — schlaegt writeText fehl,
    // bleibt die Ansicht stehen und die Fehlermeldung sichtbar.
    reiterAutoAbbrechen();
    reiterAutoTimer = setTimeout(() => {
      reiterAutoTimer = null;
      reiterZeigen('eintrag');
      const feld = $('.co-json');
      if (feld) feld.focus();
    }, 1300);
  });
  $('.co-copy2').addEventListener('click', async () => {
    if (!ausgabe) return;
    await inZwischenablage(JSON.stringify(nurMitHorizont(ausgabe), null, 1));
    quittung('.co-copy2', '📋 nur JSON');
  });

  /* ---- Reiter 2: Eintragen ---- */

  const KEINE_ERNTE = 'Zu diesem Test liegen keine ausgelesenen Daten vor. Bitte zuerst in '
    + 'Reiter 1 „Freitextaufgaben durchsuchen" laufen lassen.';

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
        const r = punkteRechnen(a.max, inhalt, e.fehler, hoechstabzugFuer(frageDaten));
        // Neue Form: gegliederte Rueckmeldung, aus der das Plugin das HTML baut.
        // Alte Form („text" als fertiger Satz) bleibt gueltig, damit gespeicherte
        // eigene Prompts weiter funktionieren.
        const muster = inhalt < 100 ? kernaussage(frageDaten.horizont) : '';
        const rmText = rueckmeldungHtml(e.rueckmeldung, muster,
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
        + 'Punkte und Abzug wurden aus Inhalt und Fehlerzahl berechnet.'
        + (ohneText ? ` ⚠ ${ohneText} Eintrag/Einträge ohne Rückmeldungstext.` : '');

      const box = el('div', 'co-rechnung');
      raus.forEach((e) => {
        const z = el('a', 'co-logzeile co-vorschauzeile');
        const href = versuchLink(e);
        if (href) { z.href = href; z.target = '_blank'; z.rel = 'noopener'; }
        z.appendChild(el('span', 'co-vfrage', e.frage));
        z.appendChild(el('span', 'co-vans', '„' + e.antwort.slice(0, 60) + '"'));
        z.appendChild(el('span', 'co-vpkt', e.rechnung));
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
    $('.co-probe').disabled = $('.co-alle').disabled = true;
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
        if (!trocken) {
          let rest = 4;
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
      $('.co-probe').disabled = $('.co-alle').disabled = false;
    }
  }
  $('.co-probe').addEventListener('click', () => schreibLauf(true));
  $('.co-alle').addEventListener('click', () => schreibLauf(false));

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
    quittung('.co-hcopy', urText);
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
    $('.co-hprobe').disabled = $('.co-hschreib').disabled = true;
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
    } finally {
      $('.co-progress3').classList.add('co-hidden');
      $('.co-hprobe').disabled = $('.co-hschreib').disabled = false;
    }
  }
  $('.co-hprobe').addEventListener('click', () => horizontLauf(true));
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
