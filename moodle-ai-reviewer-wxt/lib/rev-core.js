/* Moodle AI Reviewer v1.5.7
 *
 * Schritt 1 (Ernten, nur lesend): sammelt aus der Manuellen Bewertung alle
 *   Antworten ein, die Moodle als "incorrect" bewertet hat, obwohl der
 *   Schueler etwas eingetippt hat. Erfasst werden Cloze-Luecken mit Texteingabe
 *   (SA/SAC/NUM) und Fragen vom Typ Kurzantwort und Numerisch, bei denen die
 *   ganze Frage die eine Luecke ist. Bekannte Fehler (0,01-%-Marker) zaehlen
 *   technisch als Treffer ("partiallycorrect") und fallen automatisch heraus.
 *
 * Schritt 2 (Eintragen, schreibend): traegt die von der KI berechneten neuen
 *   Gesamtpunktzahlen ein — genau so, als haettest du den Wert selbst ins
 *   Punktefeld getippt und auf "Aenderungen speichern" geklickt.
 *
 * WXT-Umzug 17.09.2026: chrome.* -> browser.* (Polyfill), IIFE -> export
 * function starteReviewer(), Icon-Pfad icons/icon128.png -> icon/128.png
 * (WXT legt public/icon/ als icon/ ab). Sonst zeilengleich mit v1.5.9.
 */
import { browser } from 'wxt/browser';

export function starteReviewer() {
  'use strict';

  // Versionsnummer aus dem Manifest fuer die Kopfzeile des Panels — so ist nach
  // "↺ neu laden" sofort sichtbar, welche Fassung aktiv ist, ohne sie doppelt zu pflegen.
  const VERSION = (browser.runtime.getManifest ? browser.runtime.getManifest().version : '');

  const PARAMS = new URLSearchParams(location.search);
  if (PARAMS.get('mode') !== 'grading') return;

  const CMID = PARAMS.get('id');
  if (!CMID) return;

  // Panel nur zeigen, wenn automatisch bewertete Fragen eingeblendet sind.
  // Der Grader arbeitet auf der Einzelfrageseite (slot=), der Coach auf derselben
  // Uebersicht OHNE includeauto=1 — beide bleiben so unberuehrt, und weil sich die
  // drei gegenseitig ausschliessen, duerfen alle dieselbe Panel-Position nutzen.
  if (PARAMS.get('includeauto') !== '1') return;

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

  const escapeHtml = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Moodle erwartet im deutschen Sprachpaket das Komma als Dezimaltrennzeichen.
  const komma = (v) => Number(v).toFixed(2).replace('.', ',');

  // Für Prozentangaben in der Oberfläche: „50" statt „50,00", „12,5" bleibt „12,5".
  const prozentText = (v) => String(Number(v)).replace('.', ',');

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

  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  // Seit 1.7.0 (wie im Coach seit 1.8.5–1.8.8): Hat eine Zufallsfrage viele Versuche,
  // liefert DIESELBE Bewertungsseiten-URL bei jedem Laden eine ANDERE Teilmenge der
  // Versuche (live gesehen am 24.09.2026, Beschriftung-3/-4/-5 im Kurztest 1.1.5:
  // einmal fehlte 2498221, beim naechsten Mal war genau der da und andere fehlten).
  // Ein einzelner fetchDoc() ist deshalb nie verlaesslich vollstaendig. Alles, was
  // Versuche dieser Seite liest oder schreibt, laedt mehrfach und SAMMELT.
  const NACHLADEN = 8;          // Ladeversuche je Seite, 500 ms Abstand
  const SCHREIB_RUNDEN = 3;     // komplette Durchlaeufe fuer noch fehlende Eintraege

  const versuchsId = (q) => ((q.id || '').match(/^question-(\d+)-\d+$/) || [])[1] || q.id;

  // Liest die .que-Bloecke einer Bewertungsseite ueber mehrere Ladevorgaenge.
  // `erwartet` = Versuchszahl aus der Uebersicht; ist sie unbekannt, wird geladen,
  // bis zwei Ladevorgaenge hintereinander nichts Neues mehr bringen.
  async function versucheSammeln(url, erwartet) {
    const gesehen = new Set(), bloecke = [];
    let ohneNeues = 0;
    for (let i = 0; i < NACHLADEN; i++) {
      if (i > 0) await warte(500);
      const doc = await fetchDoc(url);
      let neu = 0;
      doc.querySelectorAll('div.que').forEach((q) => {
        const k = versuchsId(q);
        if (k && !gesehen.has(k)) { gesehen.add(k); bloecke.push(q); neu++; }
      });
      if (erwartet != null && bloecke.length >= erwartet) break;
      ohneNeues = neu ? 0 : ohneNeues + 1;
      if (erwartet == null && ohneNeues >= 2) break;
    }
    return bloecke;
  }

  // Formularfelder einer Bewertungsseite ueber mehrere Ladevorgaenge sammeln, bis
  // alle benoetigten Felder beisammen sind. Das versteckte Feld `qubaids` listet die
  // Versuche, die Moodle beim Speichern ueberhaupt verarbeitet — es wird deshalb
  // VEREINIGT statt vom ersten Ladevorgang uebernommen, sonst blieben Versuche aus
  // spaeteren Ladevorgaengen trotz gesetzter Felder unverarbeitet.
  async function formularSammeln(url, benoetigt) {
    let form = null;
    const felder = new URLSearchParams();
    const qubaids = new Set();
    for (let i = 0; i < NACHLADEN; i++) {
      if (i > 0) await warte(500);
      const doc = await fetchDoc(url);
      const f = doc.querySelector('form#manualgradingform');
      if (!f) throw new Error('Bewertungsformular nicht gefunden');
      form = f;
      const neu = formularFelder(f);
      [...new Set(neu.keys())].forEach((name) => {
        if (name === 'qubaids') {
          neu.get(name).split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => qubaids.add(x));
        } else if (!felder.has(name)) {
          neu.getAll(name).forEach((v) => felder.append(name, v));
        }
      });
      if (benoetigt.every((n) => felder.has(n))) break;
    }
    if (qubaids.size) felder.set('qubaids', [...qubaids].join(','));
    return { form, felder };
  }

  // filter: 'autograded' = nur noch nicht manuell bewertete Versuche (fuers Auslesen),
  //         'all'        = alle Versuche der Frage (fuers Eintragen und Gegenpruefen —
  //                        ein manuell bewerteter Versuch verlaesst 'autograded' sofort).
  const seiteUrl = (slot, qid, filter) =>
    `${BASE}?id=${CMID}&mode=grading&slot=${slot}&qid=${qid}` +
    `&grade=${filter || 'autograded'}&includeauto=1&qperpage=100`;

  /* ================= Fragentext mit Luecken ================= */

  // Cloze-Luecken heissen `…_sub<N>_answer`. Kurzantwort- und Numerisch-Fragen
  // haben nur `…_answer` ohne `sub<N>_` — dort ist die ganze Frage die eine
  // Luecke, und die bekommt fest die Nummer 1.
  const lueckenNummer = (name) => {
    const m = String(name || '').match(/sub(\d+)_/);
    return m ? parseInt(m[1], 10) : 1;
  };

  // Nur echte Eingabefelder zaehlen als Luecke. Multiple-Choice und Wahr/Falsch
  // legen ihre Felder ebenfalls auf `_answer` an — als Radiobutton mit den Werten
  // "0"/"1". Ohne diese Pruefung wuerden die als Schuelerantwort durchgehen.
  const istTextfeld = (i) => !i.type || i.type === 'text' || i.type === 'number';

  function textMitLuecken(root) {
    let s = '';
    if (!root) return s;
    root.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        s += n.textContent;
      } else if (n.nodeType === 1) {
        if (n.tagName === 'INPUT' && /_answer$/.test(n.name || '') && istTextfeld(n)) {
          s += '[[L' + lueckenNummer(n.name) + ']]';
        } else if (['INPUT', 'SELECT', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(n.tagName)) {
          /* Formularfelder ueberspringen */
        } else if (n.tagName === 'IMG') {
          s += '[BILD]';
        } else {
          s += textMitLuecken(n);
        }
      }
    });
    return s;
  }

  const saeubern = (t) =>
    t.replace(/\s+/g, ' ')
      .replace(/^\s*Fragetext\s*/i, '')
      .replace(/Antwort\s+\d+\s+Frage\s+\d+\s*(?=\[\[L)/g, '')
      .trim();

  /* ================= Einstellungen ================= */

  const KI_HINWEIS_STANDARD =
    'Dieses Feedback wurde von der Lehrkraft mithilfe von KI-Unterstützung erstellt und geprüft.';

  const OPT_STANDARD = {
    vollstaendig: false, promptOverride: '', kiHinweisText: KI_HINWEIS_STANDARD,
    // Feedback ist der Zweck der Werkzeugkette, deshalb vorbelegt. Wer das Häkchen
    // vergisst, bekommt die Kommentarfelder gar nicht erst ausgelesen und muss den
    // ganzen Test noch einmal durchsuchen — die Kosten sind einseitig verteilt.
    feedbackSammeln: true,
    // Anteil der erreichbaren Punkte, NICHT eine absolute Punktzahl: 0,50 Punkte
    // hiessen bei einer 1-Punkt-Frage 50 % und bei einer 2-Punkte-Frage 25 %.
    feedbackSchwelleProzent: 50,
    // Standardmaessig AUS: der volle Prompt ist die einzige Fassung, die fuer jedes
    // Sprachmodell (auch ohne eigene Skills) sicher funktioniert. Bewusst pro Lehrkraft
    // per Haekchen einschaltbar, NICHT als Bedingung im Prompt selbst — ein Modell kann
    // nicht zuverlaessig pruefen, ob es die Skills wirklich hat.
    kompaktPrompt: false
  };
  let optionen = { ...OPT_STANDARD };

  function optionenLaden() {
    return new Promise((resolve) => {
      try {
        browser.storage.local.get(['reviewerOptionen'], (r) => {
          optionen = { ...OPT_STANDARD, ...(r && r.reviewerOptionen ? r.reviewerOptionen : {}) };
          resolve(optionen);
        });
      } catch (e) { resolve(optionen); }
    });
  }

  function optionenSpeichern(neu) {
    optionen = { ...optionen, ...neu };
    return new Promise((resolve) => {
      try { browser.storage.local.set({ reviewerOptionen: optionen }, resolve); }
      catch (e) { resolve(); }
    });
  }

  /* ================= Loesungen aus der Fragensammlung ================= */

  // Die Bewertungsseite zeigt die richtige Antwort NICHT an (kein .rightanswer-Block).
  // Das Bearbeiten-Formular der Frage liefert sie dagegen vollstaendig: bei Cloze als
  // Quelltext in der Fragetext-Textarea, bei Kurzantwort/Numerisch als Antwortliste in
  // den Feldern `answer[0]`, `answer[1]`, … Reiner GET, es wird nichts gespeichert.
  async function ladeFrageFormular(qid) {
    try {
      const doc = await fetchDoc(
        `${MOODLE_ROOT}/question/bank/editquestion/question.php?id=${qid}&cmid=${CMID}`);
      // Fehlt das Recht, Fragen zu bearbeiten, leitet Moodle mit Status 200 um.
      // Deshalb auf den Inhalt pruefen, nicht auf den Status.
      return doc.querySelector('textarea[name="questiontext[text]"]') ? doc : null;
    } catch (e) {
      return null;
    }
  }

  const frageQuelltext = (doc) => {
    const ta = doc && doc.querySelector('textarea[name="questiontext[text]"]');
    return ta ? (ta.value || ta.textContent || null) : null;
  };

  // Wert eines Feldes aus dem geparsten Formular. Bei <select> liefert `.value` in
  // einem DOMParser-Dokument nicht ueberall die vorausgewaehlte Option — daher der
  // Rueckfall auf das `selected`-Attribut und danach auf die erste Option.
  function feldWert(el) {
    if (!el) return null;
    if (el.tagName === 'SELECT') {
      const o = el.querySelector('option[selected]') ||
                (el.selectedOptions && el.selectedOptions[0]) ||
                el.querySelector('option');
      return o ? o.value : null;
    }
    return el.value != null ? el.value : el.getAttribute('value');
  }

  const zahlWert = (el) => {
    const v = parseFloat(String(feldWert(el) == null ? '' : feldWert(el)).replace(',', '.'));
    return isNaN(v) ? 0 : v;
  };

  // Trennt an einem Zeichen, das nicht mit \ maskiert ist.
  function trenneUnmaskiert(s, zeichen) {
    const raus = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { cur += s[i] + (s[i + 1] || ''); i++; continue; }
      if (s[i] === zeichen) { raus.push(cur); cur = ''; continue; }
      cur += s[i];
    }
    raus.push(cur);
    return raus;
  }

  const entmaskieren = (t) => t.replace(/\\([{}~=#\\])/g, '$1');

  // Zerlegt den Cloze-Quelltext in seine Luecken.
  // Ergebnis je Luecke: { nr, typ, richtig: [...100%-Antworten], varianten: [{prozent, text}] }
  function parseCloze(quelltext) {
    if (!quelltext) return null;

    // Der Quelltext kommt aus einem HTML-Editor: Tags raus, Entities aufloesen.
    const roh = new DOMParser().parseFromString(quelltext, 'text/html').body.textContent || '';

    const gruppen = [];
    let tiefe = 0, start = -1;
    for (let i = 0; i < roh.length; i++) {
      if (roh[i] === '\\') { i++; continue; }
      if (roh[i] === '{') { if (tiefe === 0) start = i; tiefe++; }
      else if (roh[i] === '}') {
        tiefe--;
        if (tiefe === 0 && start >= 0) { gruppen.push(roh.slice(start + 1, i)); start = -1; }
      }
    }
    if (!gruppen.length) return null;

    return gruppen.map((g, idx) => {
      const m = g.match(/^\s*(\d*)\s*:\s*([A-Za-z_]+)\s*:\s*([\s\S]*)$/);
      if (!m) return { nr: idx + 1, typ: '?', richtig: [], varianten: [] };

      const typ = m[2].toUpperCase();
      const varianten = trenneUnmaskiert(m[3], '~').map((o) => {
        let rest = o, prozent = 0;
        const p = rest.match(/^%(-?[\d.]+)%/);
        if (p) { prozent = parseFloat(p[1]); rest = rest.slice(p[0].length); }
        else if (rest.startsWith('=')) { prozent = 100; rest = rest.slice(1); }
        const text = entmaskieren(trenneUnmaskiert(rest, '#')[0] || '').trim();
        return { prozent, text };
      }).filter((v) => v.text !== '');

      return {
        nr: idx + 1,
        typ,
        richtig: varianten.filter((v) => v.prozent === 100).map((v) => v.text),
        varianten
      };
    });
  }

  // Kurzantwort und Numerisch: die akzeptierten Antworten stehen im Bearbeiten-Formular
  // in `answer[0]`, `answer[1]`, … mit dem Anteil daneben in `fraction[N]` (1 = 100 %).
  // Ergebnis in derselben Form wie parseCloze, damit alles Weitere unveraendert bleibt.
  function parseKurzantwort(doc) {
    if (!doc) return null;
    const varianten = [];
    doc.querySelectorAll('[name^="answer["]').forEach((f) => {
      const i = (f.getAttribute('name').match(/^answer\[(\d+)\]$/) || [])[1];
      if (i == null) return;
      const text = String(feldWert(f) || '').trim();
      if (!text || text === '*') return;   // '*' ist die Auffangregel, kein Loesungswort
      varianten.push({
        prozent: Math.round(zahlWert(doc.querySelector(`[name="fraction[${i}]"]`)) * 100),
        text
      });
    });
    if (!varianten.length) return null;

    // `usecase` = 1 heisst: Moodle unterscheidet Gross-/Kleinschreibung. Das entspricht
    // dem Cloze-Typ SAC, sonst SA. An diesem Typ haengt die 90-%-Stufe im Prompt.
    const typ = zahlWert(doc.querySelector('[name="usecase"]')) === 1 ? 'SAC' : 'SA';

    return [{
      nr: 1,
      typ,
      richtig: varianten.filter((v) => v.prozent === 100).map((v) => v.text),
      varianten
    }];
  }

  /* ================= Auswertungs-Prompt ================= */

  const DATEN_PLATZHALTER = '[MOODLE_AI_REVIEWER_DATEN]';

  function standardPrompt() {
    return `═══════════════════════════════════════════════════════
MOODLE AI REVIEWER – NACHBEWERTUNG FREI EINGETIPPTER ANTWORTEN
═══════════════════════════════════════════════════════

BEGRÜSSUNG
Beginne mit genau diesen drei Punkten, dann folge den Arbeitsanweisungen:

1. „Willkommen beim Moodle AI Reviewer."
2. „Ich sehe die Schülerantworten durch, die Moodle bei den Lückentext- und Kurzantwort-Aufgaben nicht erkannt hat, und schlage dir für jede eine Bewertung vor. Entscheiden tust du."
3. „Der „Moodle AI Reviewer" wurde von A. Spielhoff entwickelt und ist unter der Lizenz CC BY-SA 4.0 veröffentlicht – du darfst ihn frei verwenden, teilen und anpassen, solange du ihn nennst."

═══════════════════════════════════════════════════════
AUSGANGSLAGE
═══════════════════════════════════════════════════════

Moodle prüft frei eingetippte Antworten – in Lückentexten genauso wie in
Kurzantwort-Fragen –, indem es den Text mit hinterlegten Antwortvarianten vergleicht.
Was nicht hinterlegt ist, bekommt 0 Punkte – auch wenn es inhaltlich richtig ist. Ein
Tippfehler, eine andere Wortform oder ein Synonym genügen dafür.

Du bekommst unten genau diese Fälle: Antworten, bei denen KEINE hinterlegte Variante
gegriffen hat, obwohl der Schüler etwas geschrieben hat. Zu jeder Frage steht dabei,
welche Antwort eigentlich gesucht war.

═══════════════════════════════════════════════════════
BEVOR DU BEWERTEST – ZWEI PFLICHTSCHRITTE JE ANTWORT
═══════════════════════════════════════════════════════

**1. Lies den Satz um die Lücke.**
Bei jeder Lücke steht unter „kontext" der Satz, in dem sie vorkommt, mit [[L1]], [[L2]]
an der Stelle der Lücke. Ein einzelnes Wort lässt sich oft nicht beurteilen: Derselbe
Begriff kann in der einen Lücke genau richtig und in der anderen völlig falsch sein.
Beispiel: In „Alle Geräte müssen [[L1]] und an ihren Platz [[L2]] werden" passt
„verstaut" zu L2, aber nicht zu L1 – und umgekehrt „gespült" zu L1, aber nicht zu L2.
Prüfe also immer, welche Tätigkeit oder welcher Gegenstand an DIESER Stelle gemeint ist.

Bei Fragen mit „art": „kurzantwort" gibt es keine Lücke im Satz: die ganze Frage ist die
Aufgabe, das Eingabefeld steht darunter. Dort findest du unter „kontext" den kompletten
Fragetext, und es gibt genau eine Lücke mit der Nummer 1. Alles andere – Skala,
Pflichtschritte, Ausgabeformat – gilt unverändert.

**2. Vergleiche mit ALLEN hinterlegten Antworten, nicht nur mit der ersten.**
Unter „loesungen" steht je Lücke die vollständige Liste der Antworten, die als richtig
gelten – oft fünf oder mehr. Kürze diese Liste niemals ab und beurteile niemals gegen
eine verkürzte Fassung. Passt die Schülerantwort zu IRGENDEINER davon, ist sie richtig.

Steht bei einer Lücke zusätzlich „bekannte_varianten", findest du dort bereits erfasste
Falschschreibungen mit dem Prozentwert, den die Lehrkraft ihnen gegeben hat. Das ist
deine wichtigste Orientierung. **Verankere jede Bewertung an einem dieser Einträge**
und nenne ihn in der Begründung. Steht „Glassmüll" auf 75, kann „Glassmülleimer" nicht
plötzlich 25 bekommen; steht „Müll" auf 25, gilt das auch für „Mülleimer". Erfinde die
Skala nicht neu, wenn die Lehrkraft für dieselbe Lücke bereits entschieden hat.

**3. Beurteile das WORT, nicht die Handlung.**
Du prüfst nicht, ob das im Satz Beschriebene fachlich vernünftig ist. Du prüfst nur, ob
das eingetippte Wort zu dem passt, was für DIESE Lücke hinterlegt ist.

Das ist wichtig, weil viele Sätze verneint sind. Beispiel:
„Chemikalienreste werden NICHT in die Vorratsgefäße [[L1]], sondern entsprechend der
Anleitung [[L2]]." Für L1 ist „zurückgegeben" hinterlegt – obwohl der Satz sagt, dass
man das gerade nicht tun soll. Eine Schülerantwort „zurückgebracht" ist hier also
**100 % richtig**, denn sie trifft genau den gesuchten Begriff.

Fällt dir auf, dass die hinterlegte Lösung dem Sinn des Satzes zu widersprechen scheint,
ist fast immer eine Verneinung im Spiel. Halte dich dann an die hinterlegte Liste.

**4. Prüfe ZUERST auf einen reinen Groß-/Kleinschreibfehler.**
Bevor du irgendetwas anderes überlegst: Unterscheidet sich die Antwort von einem
hinterlegten Eintrag ausschließlich in der Groß-/Kleinschreibung? Dann ist sie bei
Lückentyp SAC genau 90 % und bei Lückentyp SA genau 100 %. Diese Prüfung kommt vor
allen Überlegungen zu Synonymen, Tippfehlern und Inhalt.
„Oben" bei hinterlegtem „oben" und Typ SAC ist 90 – nicht 100 und nicht 75.

Diese vier Schritte sind die häufigste Fehlerquelle. Nimm sie ernst.

═══════════════════════════════════════════════════════
BEWERTUNGSSKALA – VERBINDLICH
═══════════════════════════════════════════════════════

Vergib je Lücke genau einen dieser sechs Werte. Keine Zwischenwerte.

100 %  Richtig geschrieben, oder ein echtes gleichwertiges Synonym.
       Beispiele: „Bunsenbrenner" statt „Gasbrenner"; „Stößel" statt „Pistill";
       eine andere gültige Wortform desselben Begriffs.

 90 %  Wort vollständig korrekt, NUR die Groß-/Kleinschreibung stimmt nicht.
       Beispiel: „pistill" statt „Pistill".
       ACHTUNG – diese Stufe gilt AUSSCHLIESSLICH bei Lücken vom Typ SAC
       (unterscheidet Groß-/Kleinschreibung). Bei Lücken vom Typ SA ignoriert
       Moodle die Groß-/Kleinschreibung ohnehin; dort ist so eine Antwort 100 %.
       Der Lückentyp steht unten bei jeder Lücke.
       Vergib 90 % NIEMALS für „inhaltlich fast richtig" – dafür sind 50/25/0 da.

 75 %  Ein einzelner klarer Tippfehler – ein Buchstabe vertauscht, doppelt oder
       fehlend. Das Wort bleibt eindeutig erkennbar.
       Beispiele: „Mistill" statt „Pistill"; „Bechergals" statt „Becherglas".

 50 %  Mehrere Tippfehler oder eine stärkere Verschreibung. Das Wort ist noch mit
       Mühe erkennbar, man muss aber überlegen.
       Beispiele: „Bechaglas" statt „Becherglas"; „Erlemayer" statt „Erlenmeyerkolben".

 25 %  Nur Wortstamm oder Wortanfang erkennbar, starke Verkürzung.
       Beispiele: „Becher" statt „Becherglas"; „Erlen" statt „Erlenmeyerkolben".

  0 %  Falsches Wort oder falscher Gegenstand – auch dann, wenn das Genannte
       fachlich wirklich existiert. Wer statt des Messzylinders „Reagenzglas"
       schreibt, hat das Gerät nicht erkannt: 0 %.
       Ebenso Rateversuche („A", „xyz"), sinnlose Eingaben und Wörter, die
       erkennbar aus dem Aufgabensatz abgeschrieben wurden.
       ABGRENZUNG: Eine Verwechslung innerhalb derselben Gerätefamilie kann höher
       liegen, wenn sie unter „bekannte_varianten" so hinterlegt ist – etwa
       „Kartuschenbrenner" statt „Gasbrenner" mit 50 %. Steht dort ein Wert, gilt
       er; nur wenn nichts hinterlegt ist, entscheidest du nach dieser Skala.

Zur Grenze 50 gegen 25: Frage dich, ob ein Fachkollege beim Lesen sofort weiß, welches
Wort gemeint war (→ 50) oder ob er nur den Anfang wiedererkennt und raten müsste (→ 25).

WICHTIG: Vergib niemals 0,01 %. Das ist kein Bewertungswert, sondern ein technischer
Eintrag im Aufgaben-Quelltext. Deine unterste Stufe ist 0 %.

═══════════════════════════════════════════════════════
DU RECHNEST KEINE PUNKTE AUS
═══════════════════════════════════════════════════════

Wichtig: Gib ausschließlich Prozentwerte an. Die Punkte berechnet die Erweiterung
selbst — sie kennt den bisherigen Punktestand, die Maximalpunktzahl und die Anzahl
der Lücken und rechnet damit zuverlässiger, als du es im Kopf könntest.

Schreibe also nirgends eine Punktzahl hin. Weder in die Tabelle noch ins JSON.

Zum Verständnis, was mit deinem Prozentwert geschieht: Eine manuelle Bewertung gilt
in Moodle immer für die GANZE Frage. Die Erweiterung rechnet
„bisherige Punkte + (Maximalpunkte ÷ Anzahl Lücken) × dein Prozentwert",
sodass bereits erkannte Teilpunkte erhalten bleiben.

═══════════════════════════════════════════════════════
SCHRITT 1 – TABELLE ZUR PRÜFUNG
═══════════════════════════════════════════════════════

Gib zuerst alle Funde aus, **nach Frage gruppiert**. Schreibe je Frage zuerst eine
Kopfzeile mit dem Satz, dann die Tabelle der Antworten dazu:

**1.1.1-Abwaschen-Aufräumen · Lücke 1:** „Alle Geräte müssen [[L1]] werden."
Hinterlegt: gereinigt · gesäubert · gesäubert werden · gewaschen werden · geputzt · weggeräumt

| Nr | Antwort des Schülers | % | Begründung |
|---|---|---|---|
| 1 | müssen gesäubert werden | 100 | entspricht „gesäubert werden" |
| 2 | Verstaut | 100 | entspricht „weggeräumt" |

- In der Kopfzeile stehen der Satz aus „kontext" und die **vollständige** Liste aus
  „loesungen.richtig" – alle Einträge, nicht die ersten zwei.
- Kommen zu einer Frage mehrere Lücken vor, je Lücke eine eigene Kopfzeile mit Tabelle.
- Bei „art": „kurzantwort" lässt du den Zusatz „· Lücke 1" in der Kopfzeile weg – dort
  ist die Frage selbst die Lücke.
- „Begründung": ein knapper Halbsatz, warum dieser Prozentwert – nicht mehr. Gibt es
  zur Lücke „bekannte_varianten", nenne den Eintrag, an dem du dich orientiert hast,
  zum Beispiel: „wie „Glassmüll" (75)".
- Keine Punktespalte. Die Punkte rechnet die Erweiterung.
- **Als „Nr" verwendest du die Zahl, die im Fund unter „nr" steht** – nicht deine
  eigene Zählung. Nur damit lässt sich eine Zeile im Programm wiederfinden.
- Steht bei einem Fund „kein_zugewinn": true, hat der Versuch schon die volle Punktzahl.
  Bewerte ihn trotzdem ganz normal – die Antwort wird für die Pflege der Aufgabe
  gebraucht –, und schreibe „(bereits voll)" in die Begründung.

Halte danach an und gib NICHTS weiter aus. Schreibe:

„Passt das so? Nenne mir die Nummern, die ich ändern soll, zum Beispiel: 3 auf 50, 7 auf 0.
Wenn alles stimmt, antworte mit ok – dann gebe ich dir ein JSON aus, das du in der
Erweiterung unter „2 · Eintragen" einfügst."

Warte auf die Antwort. Bei Änderungswünschen: Werte anpassen, die geänderten Zeilen
noch einmal zeigen und erneut fragen.

═══════════════════════════════════════════════════════
SCHRITT 2 – JSON ZUM EINTRAGEN
═══════════════════════════════════════════════════════

Erst nach „ok" gibst du das JSON aus – nichts davor.

\`\`\`json
{
  "bewertungen": [
    { "frage": "1.1.4-Pistill", "qubaid": "2429453", "slot": "5",
      "luecken": [ { "nr": 1, "prozent": 75 } ] }
  ]
}
\`\`\`

- **Ein Eintrag je Versuch, nicht je Lücke.** Hat ein Versuch mehrere unerkannte
  Lücken, kommen sie alle in dessen „luecken"-Liste.
- „qubaid" und „slot" übernimmst du unverändert aus den Daten unten. „nr" ist die
  Lückennummer von dort.
- „prozent" ist eine der sechs Stufen: 100, 90, 75, 50, 25 oder 0.
- Versuche, bei denen alle Lücken 0 % bekommen, lässt du weg – da ändert sich nichts.
- Keine Punktzahlen, kein „neu", kein „markfeld". Das ergänzt die Erweiterung.

Schreibe unter das JSON einen Satz: „Kopiere diesen Block in die Erweiterung, Reiter
„2 · Eintragen" — die Prüfung startet beim Einfügen von selbst." 

[FEEDBACK_BLOCK]
═══════════════════════════════════════════════════════
DATEN AUS MOODLE
═══════════════════════════════════════════════════════

Aufbau:
- „fragen"   – je Frage einmal: unter „art" steht „cloze" (Lückentext, eine oder mehrere
               Lücken im Satz) oder „kurzantwort" (eine Frage, ein Eingabefeld, immer
               genau eine Lücke mit der Nummer 1). Dazu der Aufgabentext mit markierten
               Lücken [[L1]], [[L2]], Maximalpunkte, Anzahl Lücken und unter „loesungen"
               je Lücke der Typ (SA / SAC / MC / …) und die als richtig hinterlegten
               Antworten. Ein „*" in einer hinterlegten Antwort ist ein Platzhalter für
               beliebigen Text. Unter „bekannte_varianten" stehen zusätzlich die schon
               erfassten Falschschreibungen dieser Lücke mit dem Prozentwert, den die
               Lehrkraft ihnen früher selbst gegeben hat.
- „funde"    – je Versuch die Lücken, die Moodle nicht erkannt hat, mit „ist" und „max".
               Unter „kontext" steht der Satz, in dem die Lücke vorkommt – bei
               „kurzantwort" der ganze Fragetext.

${DATEN_PLATZHALTER}`;
  }

  const FEEDBACK_BLOCK = `═══════════════════════════════════════════════════════
SCHRITT 3 – FEEDBACK FÜR SCHWACHE ANTWORTEN
═══════════════════════════════════════════════════════

In den Daten steht zusätzlich ein Abschnitt \`feedback\`: Versuche mit wenigen Punkten
oder leeren Lücken. Schreibe dafür je Versuch einen kurzen Text.

- Nenne das Lösungswort. Das ist ausdrücklich erwünscht.
- Bei Verwechslungsgefahr ein erklärender Satz dazu, sonst nichts weiter.
- Bei mehreren Lücken getrennt: „Lücke 1: … · Lücke 2: …"
- Sprich die Schülerin oder den Schüler direkt an, sachlich und ohne Floskeln.
- WICHTIG – Anführungszeichen im JSON: Willst du im Text ein Wort hervorheben,
  benutze dafür EINFACHE Anführungszeichen ('so') oder schreibe es ohne
  Anführungszeichen. Gerade doppelte Anführungszeichen ("so") NIEMALS in einem
  JSON-Textfeld verwenden – das ist dasselbe Zeichen wie die JSON-Begrenzung
  und macht das ganze JSON kaputt. Das ist schon mehrfach passiert.

Gib das Feedback im selben Durchgang wie das Punkte-JSON aus:

\`\`\`json
{
  "kommentare": [
    { "frage": "1.1.4-Pistill", "qubaid": "2429453", "slot": "5",
      "text": "Gesucht war das Pistill …" }
  ]
}
\`\`\`

Auch hier nur „qubaid" und „slot" – das Kommentarfeld schlägt die Erweiterung selbst nach.
Gib „bewertungen" und „kommentare" zusammen in EINEM JSON-Block aus.

`;

  // Kompakte Fassung: setzt voraus, dass die KI die Skills "3-moodle-auswertung"
  // und "2-didaktik-bewertung" von A. Spielhoff kennt und deren Bewertungslogik
  // (Skala, Pflichtschritte, Verankerung) anwendet. Das Ausgabeformat (Tabelle,
  // JSON-Schema) ist NICHT Teil dieser Skills und bleibt deshalb ausgeschrieben.
  function kompaktPromptVorlage() {
    return `═══════════════════════════════════════════════════════
MOODLE AI REVIEWER – NACHBEWERTUNG (KOMPAKTER PROMPT)
═══════════════════════════════════════════════════════

Falls du Zugriff auf die Skills „3-moodle-auswertung“ und „2-didaktik-bewertung“ von
A. Spielhoff hast: Wende deren komplette Bewertungslogik an — Begrüßung, die zwei
Pflichtschritte vor dem Bewerten (Satz um die Lücke lesen, gegen ALLE hinterlegten
Antworten prüfen und an „bekannte_varianten“ verankern, Verneinungs-Falle beachten,
zuerst auf reinen Groß-/Kleinschreibfehler prüfen), die 6-Stufen-Skala
(100/90/75/50/25/0) und die Regel, nie 0,01 % zu vergeben.

Hast du diese Skills NICHT: Bitte um den ausführlichen Prompt (Einstellungen dieser
Erweiterung → Häkchen „Kompakter Prompt“ ausschalten) statt zu raten — ohne die
genauen Regeln (besonders die 90-%-Stufe nur bei Lückentyp SAC, und die
Verneinungs-Falle) sind falsche Bewertungen wahrscheinlich.

Kurzreferenz der Skala, nur zur Orientierung, ersetzt die Skill nicht:
100 = korrekt oder echtes Synonym · 90 = nur Groß-/Kleinschreibung falsch UND
Lückentyp SAC (bei SA: 100) · 75 = ein klarer Tippfehler, Wort erkennbar · 50 =
mehrere Tippfehler, mit Mühe erkennbar · 25 = nur Wortanfang/-stamm erkennbar ·
0 = falsches Wort, Rateversuch oder aus dem Aufgabensatz abgeschrieben.
Punkte NICHT selbst ausrechnen, nur Prozentwerte angeben — das rechnet die Erweiterung.

═══════════════════════════════════════════════════════
SCHRITT 1 – TABELLE ZUR PRÜFUNG
═══════════════════════════════════════════════════════

Gib zuerst alle Funde aus, nach Frage gruppiert, je Lücke eine Kopfzeile mit Satz
und vollständiger Lösungsliste, dann eine Tabelle:

| Nr | Antwort des Schülers | % | Begründung |
|---|---|---|---|

„Nr“ ist die Zahl aus „nr“ im Fund. Keine Punktespalte. Halte danach an und frage:
„Passt das so? Nenne mir die Nummern, die ich ändern soll, zum Beispiel: 3 auf 50,
7 auf 0. Wenn alles stimmt, antworte mit ok.“ Warte auf die Antwort.

═══════════════════════════════════════════════════════
SCHRITT 2 – JSON ZUM EINTRAGEN
═══════════════════════════════════════════════════════

Erst nach „ok“ ausgeben:

\`\`\`json
{
  "bewertungen": [
    { "frage": "1.1.4-Pistill", "qubaid": "2429453", "slot": "5",
      "luecken": [ { "nr": 1, "prozent": 75 } ] }
  ]
}
\`\`\`

Ein Eintrag je Versuch (nicht je Lücke), „qubaid“/„slot“ unverändert übernehmen,
„prozent“ eine der sechs Stufen. Versuche mit 0 % bei allen Lücken weglassen. Keine
Punktzahlen, kein „neu“, kein „markfeld“. Satz danach: „Kopiere diesen Block in die
Erweiterung, Reiter „2 · Eintragen“ — die Prüfung startet beim Einfügen von selbst.“

[FEEDBACK_BLOCK]
═══════════════════════════════════════════════════════
DATEN AUS MOODLE
═══════════════════════════════════════════════════════

„fragen“ – je Frage: „art“ (cloze/kurzantwort), Aufgabentext mit [[L1]],[[L2]],
„loesungen“ je Lücke mit Typ (SA/SAC/…), „richtig“-Liste, ggf. „bekannte_varianten“
mit Prozentwerten. „funde“ – je Versuch die nicht erkannten Lücken mit „kontext“.

${DATEN_PLATZHALTER}`;
  }

  function bauePrompt(daten, mitFeedback) {
    const eigen = (optionen.promptOverride || '').trim();
    let vorlage = eigen || (optionen.kompaktPrompt ? kompaktPromptVorlage() : standardPrompt());
    vorlage = vorlage.replace('[FEEDBACK_BLOCK]', mitFeedback ? FEEDBACK_BLOCK : '');
    const block = '```json\n' + JSON.stringify(daten, null, 1) + '\n```';
    return vorlage.includes(DATEN_PLATZHALTER)
      ? vorlage.replace(DATEN_PLATZHALTER, block)
      : vorlage + '\n\n' + block;
  }

  // Liefert den Satz, in dem eine bestimmte Luecke steht. Ein einzelnes Wort ohne
  // Zusammenhang laesst sich oft nicht beurteilen: derselbe Begriff kann in der einen
  // Luecke richtig und in der anderen falsch sein.
  function satzUmLuecke(text, nr) {
    if (!text) return null;
    const marke = '[[L' + nr + ']]';
    const pos = text.indexOf(marke);
    if (pos < 0) return null;

    let start = 0;
    for (let i = pos; i > 0; i--) {
      if (/[.!?:]/.test(text[i - 1])) { start = i; break; }
    }
    let ende = text.length;
    for (let i = pos + marke.length; i < text.length; i++) {
      if (/[.!?]/.test(text[i])) { ende = i + 1; break; }
    }

    let satz = text.slice(start, ende).trim();

    // Sehr lange Saetze auf ein Fenster um die Luecke kuerzen
    if (satz.length > 260) {
      const p = satz.indexOf(marke);
      const von = Math.max(0, p - 120);
      const bis = Math.min(satz.length, p + marke.length + 120);
      satz = (von > 0 ? '… ' : '') + satz.slice(von, bis).trim() + (bis < satz.length ? ' …' : '');
    }
    return satz;
  }

  // Bei einer Kurzantwort-Frage gibt es keinen Satz „um" die Luecke — das Eingabefeld
  // steht unter der Frage. Der Zusammenhang ist dort der ganze Fragetext.
  function kurzfassung(text) {
    if (!text) return null;
    const t = text.replace(/\s*\[\[L\d+\]\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 400 ? t.slice(0, 400).trim() + ' …' : t;
  }

  /* ================= Ernten ================= */

  async function ladeFragenliste() {
    const doc = await fetchDoc(`${BASE}?id=${CMID}&mode=grading&includeauto=1`);
    const table = [...doc.querySelectorAll('table')].find((t) =>
      [...t.querySelectorAll('th')].some((th) => /Fragename/i.test(th.textContent))
    );
    if (!table) throw new Error('Keine Fragen-Tabelle gefunden. Bist du auf der Übersicht der Manuellen Bewertung?');

    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const iName = heads.findIndex((h) => /Fragename/i.test(h));
    const iAuto = heads.findIndex((h) => /Automatisch/i.test(h));
    // Gesamtzahl der Versuche je Frage (Spalte „Summe"/„Gesamt", sonst die letzte).
    let iSumme = heads.findIndex((h) => /Summe|Gesamt|Total/i.test(h));
    if (iSumme < 0) iSumme = heads.length - 1;

    return [...table.querySelectorAll('tbody tr')]
      .map((tr) => {
        const cells = [...tr.cells];
        let slot = null, qid = null;
        for (const href of [...tr.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter(Boolean)) {
          const u = new URL(href, location.href);
          if (u.searchParams.get('slot')) {
            slot = u.searchParams.get('slot');
            qid = u.searchParams.get('qid');
            break;
          }
        }
        return {
          name: iName >= 0 && cells[iName] ? cells[iName].textContent.trim() : '(ohne Namen)',
          slot, qid,
          auto: iAuto >= 0 && cells[iAuto] ? parseInt(cells[iAuto].textContent, 10) || 0 : 0,
          summe: iSumme >= 0 && cells[iSumme] ? (parseInt(cells[iSumme].textContent, 10) || null) : null
        };
      })
      .filter((r) => r.slot && r.qid && r.auto > 0);
  }

  // Moodle kennzeichnet eine Nachbewertung NICHT zuverlässig im Zustandstext — dort
  // steht weiter „Richtig" / „Teilweise richtig". Verlässlich ist die Rechnung:
  // Eine als `incorrect` markierte Lücke bringt automatisch 0 Punkte. Liegt die
  // Punktzahl über der Summe der übrigen Lücken, hat jemand von Hand nachgetragen.
  function schonNachbewertet(gaps, ist, max) {
    if (ist === null || max === null || !gaps.length) return false;
    const lueckenwert = max / gaps.length;
    const nichtFalsch = gaps.filter((g) => g.status !== 'incorrect').length;
    return ist > (lueckenwert * nichtFalsch) + 0.005;   // Toleranz gegen Rundung
  }

  function werteSeiteAus(bloecke, zeile, mitFeedback, schwelleProzent, mitBereits) {
    const funde = [], feedback = [];
    let uebersprungen = 0;
    let text = null, anzahlLuecken = 0, maxPunkte = null, artFrage = null;

    bloecke.forEach((q) => {
      const qubaid = (q.id.match(/question-(\d+)-/) || [])[1] || null;
      const antwortfelder = [...q.querySelectorAll('input[name$="_answer"]')].filter(istTextfeld);
      const gaps = antwortfelder.map((i) => ({
        nr: lueckenNummer(i.name),
        antwort: i.value,
        status: ['correct', 'partiallycorrect', 'incorrect'].find((c) => i.classList.contains(c)) || 'unbekannt'
      }));
      // Ohne `sub<N>_` im Feldnamen ist es keine Cloze-Frage, sondern eine
      // Kurzantwort- oder Numerisch-Frage mit genau einer Luecke.
      const art = antwortfelder.some((i) => /sub\d+_/.test(i.name)) ? 'cloze' : 'kurzantwort';

      const mark = q.querySelector('input[name$="-mark"]');
      const maxm = q.querySelector('input[name$="-maxmark"]');
      const komm = q.querySelector('textarea[name$="-comment"]');
      const zustand = (q.querySelector('.info .state') || {}).textContent || '';
      const schonManuell = /manuell/i.test(zustand);
      const ist = mark ? num(mark.value) : null;
      const max = maxm ? num(maxm.value) : null;

      if (text === null) {
        text = saeubern(textMitLuecken(q.querySelector('.formulation')));
        anzahlLuecken = gaps.length;
        maxPunkte = max;
        artFrage = art;
      }

      // (a) unerkannte Antworten — schon nachbewertete Versuche ueberspringen
      const bereits = schonManuell || schonNachbewertet(gaps, ist, max);
      if (offen0(gaps).length && bereits && !mitBereits) uebersprungen++;

      const offen = gaps.filter((g) => g.status === 'incorrect' && g.antwort.trim() !== '');
      if (offen.length && (!bereits || mitBereits)) {
        funde.push({
          frage: zeile.name, qid: zeile.qid, slot: zeile.slot, qubaid,
          ist, max, markfeld: mark ? mark.name : null,
          luecken: offen.map((g) => ({ nr: g.nr, antwort: g.antwort })),
          ...(bereits ? { schon_nachbewertet: true } : {})
        });
      }

      // (b) Kandidaten fuer Feedback: schwache oder leere Antworten
      if (mitFeedback) {
        const leer = gaps.some((g) => g.antwort.trim() === '');
        // Anteil statt absoluter Punkte, damit die Schwelle bei 1- und 2-Punkte-Fragen
        // dasselbe bedeutet. Leere Lücken kommen unabhängig davon immer mit.
        const grenze = (max === null ? null : max * schwelleProzent / 100);
        // Fragen ohne Textfeld (Multiple-Choice, Wahr/Falsch, Zuordnung) haben keine
        // Luecken. includeauto=1 listet sie mit auf; ohne erfasste Antwort kann die KI
        // kein Feedback schreiben, und leere `luecken` haben frueher das Sortieren
        // zerlegt ("Cannot read properties of undefined (reading 'nr')").
        if (gaps.length && ((ist !== null && grenze !== null && ist <= grenze) || leer)) {
          feedback.push({
            frage: zeile.name, qid: zeile.qid, slot: zeile.slot, qubaid,
            ist, max,
            kommentarfeld: komm ? komm.name : null,
            hat_kommentar: !!(komm && komm.value.trim()),
            luecken: gaps.map((g) => ({ nr: g.nr, antwort: g.antwort, status: g.status }))
          });
        }
      }
    });

    return { funde, feedback, text, anzahlLuecken, maxPunkte, uebersprungen, art: artFrage };
  }

  const offen0 = (gaps) => gaps.filter((g) => g.status === 'incorrect' && g.antwort.trim() !== '');

  async function ernten(onProgress, mitFeedback, schwelleProzent, vollstaendig, mitBereits) {
    const zeilen = await ladeFragenliste();
    const funde = [], feedback = [], fragen = {}, fehler = [];
    let fertig = 0, uebersprungen = 0;

    const holen = async (z) => {
      try {
        const erwartet = mitFeedback ? z.summe : z.auto;
        const bloecke = await versucheSammeln(
          seiteUrl(z.slot, z.qid, mitFeedback ? 'all' : 'autograded'), erwartet);
        if (erwartet != null && bloecke.length < erwartet) {
          fehler.push(`${z.name}: nur ${bloecke.length} von ${erwartet} Versuchen geladen `
            + '— bitte noch einmal auslesen');
        }
        const res = werteSeiteAus(bloecke, z, mitFeedback, schwelleProzent, mitBereits);
        uebersprungen += res.uebersprungen || 0;
        if (res.text && !fragen[z.name]) {
          fragen[z.name] = {
            qid: z.qid,
            art: res.art || 'cloze',
            max: res.maxPunkte,
            luecken: res.anzahlLuecken,
            punkt_pro_luecke: res.maxPunkte && res.anzahlLuecken
              ? Math.round((res.maxPunkte / res.anzahlLuecken) * 100) / 100 : null,
            text: res.text
          };
        }
        funde.push(...res.funde);
        feedback.push(...res.feedback);
      } catch (e) {
        fehler.push(z.name + ': ' + e.message);
      }
      fertig++;
      onProgress(fertig, zeilen.length, funde.length + feedback.length);
    };

    const q = [...zeilen];
    // Nacheinander statt 5 parallel: gleichzeitige Anfragen an report.php fuer
    // verschiedene Fragen stoeren sich offenbar (im Coach 1.8.7 so gefunden).
    while (q.length) await holen(q.shift());

    const erste = (e) => (e.luecken && e.luecken[0]) || { nr: 0, antwort: '' };
    const nachFrage = (a, b) => {
      const la = erste(a), lb = erste(b);
      return a.frage.localeCompare(b.frage) || ((la.nr || 0) - (lb.nr || 0)) ||
        String(la.antwort || '').localeCompare(String(lb.antwort || ''));
    };
    funde.sort(nachFrage);
    feedback.sort(nachFrage);

    const benutzt = new Set([...funde, ...feedback].map((f) => f.frage));
    Object.keys(fragen).forEach((k) => { if (!benutzt.has(k)) delete fragen[k]; });

    // Laufende Nummer vergeben: die KI benennt ihre Zeilen damit, und im Panel steht
    // dieselbe Nummer mit einem Link zum Versuch. Ohne das ist eine Zeile der Übersicht
    // nicht auf einen Versuch in Moodle zurückzuführen — qubaid sagt niemandem etwas.
    funde.forEach((f, i) => {
      f.nr = i + 1;
      const ist = num(f.ist), max = num(f.max);
      // Versuch hat bereits die volle Punktzahl: Punkte kann es nicht mehr geben,
      // die Antwort ist aber trotzdem eine Variante, die man erfassen möchte.
      if (ist !== null && max !== null && ist >= max) f.kein_zugewinn = true;
    });

    // Satz um jede Lücke ergänzen — direkt beim Fund, nicht nur im Fragetext weiter oben.
    // Sprachmodelle beziehen sich viel zuverlässiger auf das, was unmittelbar daneben steht.
    [...funde, ...feedback].forEach((eintrag) => {
      const f = fragen[eintrag.frage] || {};
      (eintrag.luecken || []).forEach((l) => {
        const satz = f.art === 'kurzantwort' ? kurzfassung(f.text) : satzUmLuecke(f.text, l.nr);
        if (satz) l.kontext = satz;
      });
    });

    // Richtige Antworten aus der Fragensammlung nachladen. Ohne sie kann die KI
    // nicht beurteilen, ob eine unerkannte Antwort trotzdem gemeint war.
    const namen = Object.keys(fragen);
    let ohneLoesung = 0;
    onProgress(zeilen.length, zeilen.length, funde.length + feedback.length,
               'Lösungen werden geladen …');
    const warteschlange = [...namen];
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (warteschlange.length) {
        const name = warteschlange.shift();
        const formular = await ladeFrageFormular(fragen[name].qid);
        const quelltext = frageQuelltext(formular);
        // Cloze zuerst — erkennbar an den {…}-Gruppen im Fragetext. Greift das nicht,
        // ist es eine Kurzantwort-/Numerisch-Frage mit Antwortliste im Formular.
        const luecken = (quelltext ? parseCloze(quelltext) : null) || parseKurzantwort(formular);
        if (!luecken) { ohneLoesung++; continue; }
        // Die bereits erfassten Falschschreibungen mit ihrem Prozentwert mitgeben.
        // Ohne sie muss das Sprachmodell die Skala je Luecke neu erfinden, statt sich
        // an den Einstufungen auszurichten, die die Lehrkraft schon vergeben hat.
        // Die 0,01-%-Marker bleiben draussen: sie sind ein technischer Eintrag im
        // Cloze-Quelltext, kein Bewertungswert, und wuerden die Skala verwaessern.
        fragen[name].loesungen = luecken.map((l) => {
          const eintrag = { nr: l.nr, typ: l.typ, richtig: l.richtig };
          const bekannt = {};
          (l.varianten || []).forEach((v) => {
            if (v.prozent >= 1 && v.prozent < 100) bekannt[v.text] = v.prozent;
          });
          if (Object.keys(bekannt).length) eintrag.bekannte_varianten = bekannt;
          return eintrag;
        });
        if (vollstaendig && quelltext && parseCloze(quelltext)) {
          fragen[name].cloze_quelltext = quelltext;
        }
      }
    }));

    return {
      zeilen: zeilen.length, funde, feedback, fragen, fehler,
      ohneLoesung, mitLoesung: namen.length - ohneLoesung, uebersprungen
    };
  }

  /* ================= Eintragen ================= */

  // Alle Felder eines Formulars einsammeln — so, wie der Browser sie abschicken wuerde.
  function formularFelder(form) {
    const p = new URLSearchParams();
    [...form.elements].forEach((f) => {
      if (!f.name || f.disabled) return;
      if (f.type === 'file') return;
      if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) return;
      if (f.type === 'submit') return;          // wird separat gesetzt
      if (f.tagName === 'SELECT') {
        [...f.selectedOptions].forEach((o) => p.append(f.name, o.value));
      } else {
        p.append(f.name, f.value);
      }
    });
    return p;
  }

  // Link auf genau den Versuch in Moodle. Ohne ihn ist eine Protokollzeile nicht
  // nachzuverfolgen — qubaid sagt niemandem etwas.
  function versuchLink(e) {
    if (!e || !e.slot || !e.qid) return null;
    return seiteUrl(e.slot, e.qid, 'all')
         + (e.qubaid ? '#question-' + e.qubaid + '-' + e.slot : '');
  }

  function kommentarHtml(e, kiHinweis) {
    let html = e.text.trim();
    if (!/<[a-z]/i.test(html)) html = '<p>' + html.replace(/\n+/g, '</p><p>') + '</p>';
    if (kiHinweis) {
      const satz = (optionen.kiHinweisText || KI_HINWEIS_STANDARD).trim();
      if (satz) html += '<p><em><small>' + escapeHtml(satz) + '</small></em></p>';
    }
    return html;
  }

  const kommentarDrin = (f, e) => {
    const drin = f ? f.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const soll = e.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
    return !!(drin && soll && drin.includes(soll));
  };

  // Schreibt eine Fragenseite. `still` = Fehlschlaege nicht protokollieren, weil noch
  // eine weitere Runde folgt — gemeldet wird nur, was am Ende wirklich fehlt.
  // Rueckgabe: bestaetigte Anzahl und die Eintraege, die noch nicht angekommen sind.
  async function seiteSchreiben(gruppe, onLog, kiHinweis, still) {
    const url = seiteUrl(gruppe.slot, gruppe.qid, 'all');
    const benoetigt = [...gruppe.marks.map((e) => e.markfeld),
                       ...gruppe.comments.map((e) => e.kommentarfeld)];
    const { form, felder } = await formularSammeln(url, benoetigt);

    const offenMarks = [], offenKomm = [];
    const gesetzteMarks = [], gesetzteKommentare = [];
    const melde = (t, link) => { if (!still) onLog(t, link); };

    gruppe.marks.forEach((e) => {
      if (!felder.has(e.markfeld)) {
        offenMarks.push(e);
        melde(`✗ Punktefeld nicht auf der Seite — ${e.frage}: ${e.antwort || ''} `
            + `(${e.markfeld})`, versuchLink(e));
        return;
      }
      felder.set(e.markfeld, komma(e.neu));
      gesetzteMarks.push(e);
    });
    gruppe.comments.forEach((e) => {
      if (!felder.has(e.kommentarfeld)) {
        offenKomm.push(e);
        melde(`✗ Kommentarfeld nicht auf der Seite — ${e.frage} (${e.kommentarfeld})`,
              versuchLink(e));
        return;
      }
      felder.set(e.kommentarfeld, kommentarHtml(e, kiHinweis));
      gesetzteKommentare.push(e);
    });

    let ok = 0;
    if (gesetzteMarks.length || gesetzteKommentare.length) {
      const submit = [...form.elements].find((f) => f.type === 'submit' && f.name);
      if (submit) felder.set(submit.name, submit.value);
      const action = new URL(form.getAttribute('action') || url, url).href;
      const antwort = await fetch(action, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: felder.toString()
      });
      if (!antwort.ok) throw new Error('HTTP ' + antwort.status + ' beim Speichern');

      // Gegenprobe ueber mehrere Ladevorgaenge: Ein Versuch, der beim ersten
      // Nachladen nicht angezeigt wird, ist deshalb noch nicht fehlgeschlagen.
      let restM = gesetzteMarks.slice(), restK = gesetzteKommentare.slice();
      const zuletzt = new Map();
      for (let i = 0; i < NACHLADEN && (restM.length || restK.length); i++) {
        if (i > 0) await warte(500);
        const kontrolle = await fetchDoc(url);
        restM = restM.filter((e) => {
          const f = kontrolle.querySelector(`input[name="${CSS.escape(e.markfeld)}"]`);
          if (!f) return true;
          const ist = num(f.value);
          zuletzt.set(e, ist);
          if (ist !== null && Math.abs(ist - e.neu) < 0.005) {
            ok++; onLog(`✓ ${e.frage} — ${e.antwort || ''} → ${komma(e.neu)}`, versuchLink(e));
            return false;
          }
          return true;
        });
        restK = restK.filter((e) => {
          const f = kontrolle.querySelector(`textarea[name="${CSS.escape(e.kommentarfeld)}"]`);
          if (!f) return true;
          if (kommentarDrin(f, e)) {
            ok++; markiereKommentiert(e.kommentarfeld);
            onLog(`💬 ${e.frage} — Feedback eingetragen`); return false;
          }
          return true;
        });
      }
      restM.forEach((e) => {
        offenMarks.push(e);
        const ist = zuletzt.has(e) ? zuletzt.get(e) : undefined;
        melde(`✗ ${e.frage} — ${e.antwort || ''} — steht auf `
          + `${ist == null ? 'keinem Wert' : komma(ist)} statt ${komma(e.neu)}`, versuchLink(e));
      });
      restK.forEach((e) => {
        offenKomm.push(e);
        melde(`✗ ${e.frage} — Feedback nicht angekommen`, versuchLink(e));
      });
    }
    return { ok, offenMarks, offenKomm };
  }

  // Gruppiert Punkte und Kommentare nach Fragenseite — eine Seite, ein POST.
  function gruppieren(punkte, kommentare) {
    const map = new Map();
    const holeGruppe = (e) => {
      const k = e.slot + '|' + e.qid;
      if (!map.has(k)) map.set(k, { slot: e.slot, qid: e.qid, marks: [], comments: [] });
      return map.get(k);
    };
    (punkte || []).forEach((e) => holeGruppe(e).marks.push(e));
    (kommentare || []).forEach((e) => holeGruppe(e).comments.push(e));
    return [...map.values()];
  }

  // Trockenlauf: jede Fragenseite (mehrfach) laden und pruefen, ob jedes Punkte- und
  // Kommentarfeld dort steht — aber NICHTS absenden. Faengt den Fall ab, dass das
  // JSON zu einem anderen Auslese-Durchlauf gehoert, bevor irgendetwas geschrieben ist.
  async function trockenlauf(punkte, kommentare, onLog, onProgress) {
    const gruppen = gruppieren(punkte, kommentare);
    let ok = 0, fehler = 0, fertig = 0;
    for (const g of gruppen) {
      try {
        const benoetigt = [...g.marks.map((e) => e.markfeld), ...g.comments.map((e) => e.kommentarfeld)];
        const { felder } = await formularSammeln(seiteUrl(g.slot, g.qid, 'all'), benoetigt);
        g.marks.forEach((e) => {
          if (felder.has(e.markfeld)) ok++;
          else { fehler++; onLog(`✗ Punktefeld fehlt — ${e.frage}: ${e.antwort || ''}`, versuchLink(e)); }
        });
        g.comments.forEach((e) => {
          if (felder.has(e.kommentarfeld)) ok++;
          else { fehler++; onLog(`✗ Kommentarfeld fehlt — ${e.frage}`, versuchLink(e)); }
        });
      } catch (e) {
        fehler += g.marks.length + g.comments.length;
        onLog(`✗ Seite ${(g.marks[0] || g.comments[0] || {}).frage}: ${e.message}`);
      }
      fertig++;
      onProgress(fertig, gruppen.length);
    }
    return { ok, fehler, gruppen: gruppen.length, trocken: true };
  }

  // Bis zu SCHREIB_RUNDEN Durchlaeufe: Runde 2 und 3 schreiben NUR noch, was vorher
  // nicht bestaetigt wurde. Doppelt schreiben ist unschaedlich — Punkte sind absolute
  // Werte aus dem Auslesen, kein Zuschlag auf den aktuellen Stand.
  async function eintragen(punkte, kommentare, kiHinweis, onLog, onProgress) {
    let restP = punkte || [], restK = kommentare || [];
    let ok = 0, seiten = 0;
    for (let runde = 1; runde <= SCHREIB_RUNDEN && (restP.length || restK.length); runde++) {
      const letzte = runde === SCHREIB_RUNDEN;
      if (runde > 1) {
        onLog(`↻ Runde ${runde}/${SCHREIB_RUNDEN}: ${restP.length + restK.length} `
          + 'noch nicht bestätigte Einträge erneut …');
        await warte(1500);
      }
      const gruppen = gruppieren(restP, restK);
      if (runde === 1) seiten = gruppen.length;
      const naechsteP = [], naechsteK = [];
      let fertig = 0;
      for (const g of gruppen) {
        try {
          const r = await seiteSchreiben(g, onLog, kiHinweis, !letzte);
          ok += r.ok; naechsteP.push(...r.offenMarks); naechsteK.push(...r.offenKomm);
        } catch (e) {
          naechsteP.push(...g.marks); naechsteK.push(...g.comments);
          if (letzte) onLog(`✗ Frage ${(g.marks[0] || g.comments[0] || {}).frage}: ${e.message}`);
        }
        fertig++;
        onProgress(fertig, gruppen.length);
      }
      restP = naechsteP; restK = naechsteK;
    }
    return { ok, fehler: restP.length + restK.length, gruppen: seiten };
  }

  /* ================= Kontext ================= */

  function kontext() {
    const kursLink = [...document.querySelectorAll('a')]
      .find((a) => /\/course\/view\.php/.test(a.getAttribute('href') || ''));
    return {
      test: (document.title || '').replace(/\s*\|.*$/, '').trim(),
      kurs: kursLink ? kursLink.textContent.trim() : ''
    };
  }

  /* ================= Oberflaeche ================= */

  // Echtes Logo aus dem icons-Ordner statt des Zeichens „🔎". Faellt auf das
  // Zeichen zurueck, wenn das Bild nicht geladen werden kann (z. B. wenn der Eintrag
  // web_accessible_resources im Manifest fehlt).
  const knopf = el('button', 'ce-fab');
  knopf.title = 'Moodle AI Reviewer';
  try {
    const bild = document.createElement('img');
    bild.src = browser.runtime.getURL('icon/128.png');
    bild.alt = 'AI Reviewer';
    bild.className = 'ce-fab-icon';
    bild.addEventListener('error', () => { bild.remove(); knopf.textContent = '🔎'; });
    knopf.appendChild(bild);
  } catch (e) { knopf.textContent = '🔎'; }
  knopf.title = 'Moodle AI Reviewer';
  document.body.appendChild(knopf);

  const panel = el('div', 'ce-panel ce-hidden');
  panel.innerHTML = `
    <div class="ce-head">
      <div class="ce-titelblock">
        <span class="ce-title">🔎 AI Reviewer <span class="ce-version"></span></span>
        <span class="ce-untertitel">Unerkannte automatische Antworten nachbewerten</span>
      </div>
      <button class="ce-close" title="Schließen">✕</button>
    </div>
    <div class="ce-tabs">
      <button class="ce-tab ce-aktiv" data-tab="ernte">1 · Auslesen</button>
      <button class="ce-tab" data-tab="eintrag">2 · Eintragen</button>
      <button class="ce-tab" data-tab="opt">⚙</button>
    </div>

    <div class="ce-body" data-panel="ernte">
      <p class="ce-meta"></p>
      <label class="ce-check"><input type="checkbox" class="ce-fb">
        Auch schwache Antworten fürs Feedback sammeln</label>
      <label class="ce-check"><input type="checkbox" class="ce-bereits">
        Auch schon nachbewertete Versuche noch einmal vorlegen</label>
      <label class="ce-label ce-fbschwelle ce-hidden">Schwelle (% der erreichbaren Punkte)
        <input type="text" class="ce-schwelle" value="50">
      </label>
      <p class="ce-schwelleinfo ce-fbschwelle ce-hidden"></p>
      <button class="ce-go">Test durchsuchen</button>
      <div class="ce-progress ce-hidden"><div class="ce-bar"></div><span class="ce-ptext"></span></div>
      <div class="ce-result ce-hidden">
        <p class="ce-summary"></p>
        <button class="ce-copy">📋 Prompt + Daten kopieren</button>
        <button class="ce-copy2 ce-zweit">📋 nur JSON</button>
        <p class="ce-groesse"></p>
        <div class="ce-list"></div>
      </div>
      <p class="ce-error ce-hidden"></p>
    </div>

    <div class="ce-body ce-hidden" data-panel="eintrag">
      <p class="ce-hinweis">Hier die Punkte-JSON von Claude einfügen. Das Eintragen entspricht
      genau dem, was passiert, wenn du den Wert selbst ins Punktefeld tippst und speicherst.</p>
      <textarea class="ce-json" rows="6" placeholder='{ "punkte": [ … ] }'></textarea>
      <label class="ce-check"><input type="checkbox" class="ce-ki" checked>
        KI-Hinweis ans Feedback anhängen</label>
      <p class="ce-kivorschau"></p>
      <button class="ce-pruef ce-hidden">🔍 Prüfen</button>
      <p class="ce-pinfo ce-hidden"></p>
      <div class="ce-progress2 ce-hidden"><div class="ce-bar2"></div><span class="ce-ptext2"></span></div>
      <p class="ce-abschluss ce-hidden"></p>
      <div class="ce-log ce-hidden"></div>
      <div class="ce-schreibknoepfe ce-hidden">
        <button class="ce-alle">Alle eintragen</button>
      </div>
    </div>

    <div class="ce-body ce-hidden" data-panel="opt">
      <label class="ce-check"><input type="checkbox" class="ce-voll">
        Vollständigen Aufgaben-Quelltext mitgeben</label>
      <p class="ce-hinweis">Normalerweise bekommt die KI je Lücke nur die als richtig
      hinterlegten Antworten – das genügt für die Bewertung. Mit dieser Option geht
      zusätzlich der komplette Quelltext jeder Aufgabe mit, also auch alle bereits
      erfassten Fehlervarianten samt Prozentwerten.
      <strong>Das verbraucht sehr viel mehr KI-Ressourcen</strong> – rund 2.000 Zeichen
      je Aufgabe. Nur einschalten, wenn du die vorhandenen Varianten wirklich brauchst.
      Wirkt nur bei Lückentext-Aufgaben; Kurzantwort-Fragen haben keinen Quelltext.</p>

      <label class="ce-check"><input type="checkbox" class="ce-kompakt">
        Kompakter Prompt (nur für KI mit eigenen Skills, z. B. Claude)</label>
      <p class="ce-hinweis">Verweist für die Bewertungslogik auf die Skills
      „3-moodle-auswertung“ und „2-didaktik-bewertung“ statt sie komplett auszuschreiben
      – spart pro Aufruf mehrere Tausend Zeichen. <strong>Nur einschalten, wenn du sicher
      bist, dass die verwendete KI diese Skills wirklich kennt</strong> (z. B. dein eigener
      Claude-Cowork-Zugang). Andere Lehrkräfte oder andere KI-Systeme lassen dieses
      Häkchen aus – die bekommen automatisch den vollständigen Prompt.</p>

      <label class="ce-label">Eigener Prompt (leer = Standard)
        <textarea class="ce-prompt" rows="8" placeholder="Leer lassen, um den mitgelieferten Prompt zu verwenden."></textarea>
      </label>
      <p class="ce-hinweis">Der Platzhalter <code>[MOODLE_AI_REVIEWER_DATEN]</code> wird
      durch die Daten aus Moodle ersetzt, <code>[FEEDBACK_BLOCK]</code> durch die
      Feedback-Anweisungen. Fehlen sie, werden die Daten hinten angehängt.</p>
      <label class="ce-label">KI-Hinweis unter dem Feedback
        <textarea class="ce-kitext" rows="3"></textarea>
      </label>
      <p class="ce-hinweis">Dieser Satz wird unter jedes Feedback gesetzt – kursiv und
      klein –, solange in Tab 2 das Häkchen gesetzt ist. Leer lassen setzt beim
      Speichern den Standardsatz wieder ein.</p>

      <button class="ce-optsave">Speichern</button>
      <button class="ce-optvorlage ce-zweit">Standard einfügen</button>
      <button class="ce-optreset ce-zweit">Zurücksetzen</button>
      <p class="ce-optinfo ce-hidden"></p>
    </div>`;
  document.body.appendChild(panel);

  const $ = (s) => panel.querySelector(s);
  $('.ce-version').textContent = VERSION;
  const ctx = kontext();
  $('.ce-meta').textContent = [ctx.kurs, ctx.test].filter(Boolean).join(' · ') || 'Manuelle Bewertung';
  // Prozentwert aus dem Feld, auf 1..100 begrenzt. Deutsches Komma erlaubt.
  function schwelleWert() {
    const v = num($('.ce-schwelle').value);
    if (v === null || v <= 0) return OPT_STANDARD.feedbackSchwelleProzent;
    return Math.min(100, v);
  }

  // Ein Prozentwert allein sagt niemandem, wen er trifft. Deshalb steht darunter,
  // was er bei den beiden Fragengrößen konkret bedeutet, die Arne verwendet.
  function schwelleInfo() {
    const p = $('.ce-schwelleinfo');
    if (!p) return;
    const v = schwelleWert();
    p.textContent = `${prozentText(v)} % — bei einer 2-Punkte-Frage also alles bis `
      + `${komma(2 * v / 100)} Punkte, bei einer 1-Punkt-Frage bis ${komma(v / 100)}. `
      + 'Leere Lücken kommen immer mit, unabhängig von diesem Wert.';
  }

  function fbAnzeige() {
    const an = $('.ce-fb').checked;
    panel.querySelectorAll('.ce-fbschwelle').forEach((e) => e.classList.toggle('ce-hidden', !an));
    schwelleInfo();
  }

  $('.ce-fb').addEventListener('change', async () => {
    fbAnzeige();
    await optionenSpeichern({ feedbackSammeln: $('.ce-fb').checked });
  });
  $('.ce-schwelle').addEventListener('change', async () => {
    schwelleInfo();
    await optionenSpeichern({ feedbackSchwelleProzent: schwelleWert() });
  });
  $('.ce-schwelle').addEventListener('input', schwelleInfo);

  optionenLaden().then(() => {
    $('.ce-voll').checked = !!optionen.vollstaendig;
    $('.ce-kompakt').checked = !!optionen.kompaktPrompt;
    $('.ce-prompt').value = optionen.promptOverride || '';
    $('.ce-kitext').value = optionen.kiHinweisText || KI_HINWEIS_STANDARD;
    $('.ce-fb').checked = optionen.feedbackSammeln !== false;
    $('.ce-schwelle').value = prozentText(optionen.feedbackSchwelleProzent
      ?? OPT_STANDARD.feedbackSchwelleProzent);
    fbAnzeige();
    kiVorschau();
  });

  // Die Ernte sichern: Tab 2 braucht Punktestand, Lückenzahl und Feldnamen, um aus
  // Prozentwerten Punkte zu rechnen — auch dann noch, wenn die Seite zwischendurch neu lädt.
  const ERNTE_KEY = 'reviewerErnte_' + CMID;
  function ernteSichern() {
    try { browser.storage.local.set({ [ERNTE_KEY]: ausgabe }); } catch (e) { /* egal */ }
  }
  try {
    browser.storage.local.get([ERNTE_KEY], (r) => {
      const d = r && r[ERNTE_KEY];
      if (d && !ausgabe) {
        ausgabe = d;
        const m = $('.ce-meta');
        if (m) m.textContent += ` · ${(d.funde || []).length} Funde aus einem früheren Durchlauf geladen`;
      }
    });
  } catch (e) { /* egal */ }

  // Der Satz, der ans Feedback gehaengt wird, gehoert dorthin, wo man das Haekchen
  // setzt — sonst kreuzt man etwas an, ohne zu wissen, was in Moodle landet.
  function kiVorschau() {
    const p = $('.ce-kivorschau');
    if (!p) return;
    const satz = (optionen.kiHinweisText || KI_HINWEIS_STANDARD).trim();
    if (!$('.ce-ki').checked || !satz) { p.classList.add('ce-hidden'); return; }
    p.classList.remove('ce-hidden');
    p.textContent = 'Angehängt wird: „' + satz + '" (kursiv, kleine Schrift). '
                  + 'Ändern unter ⚙.';
  }

  function optInfo(text) {
    const i = $('.ce-optinfo');
    i.textContent = text;
    i.classList.remove('ce-hidden');
    setTimeout(() => i.classList.add('ce-hidden'), 3000);
  }

  $('.ce-optsave').addEventListener('click', async () => {
    await optionenSpeichern({
      vollstaendig: $('.ce-voll').checked,
      kompaktPrompt: $('.ce-kompakt').checked,
      promptOverride: $('.ce-prompt').value.trim(),
      kiHinweisText: $('.ce-kitext').value.trim() || KI_HINWEIS_STANDARD
    });
    $('.ce-kitext').value = optionen.kiHinweisText;
    kiVorschau();
    optInfo('Gespeichert ✓');
  });

  $('.ce-optvorlage').addEventListener('click', () => {
    $('.ce-prompt').value = standardPrompt();
    optInfo('Standard eingefügt – zum Übernehmen auf Speichern klicken.');
  });

  $('.ce-optreset').addEventListener('click', async () => {
    // Ein eigener Prompt kann veraltete Vorgaben enthalten; beim Zuruecksetzen
    // der Grundeinstellungen faellt er deshalb mit weg.
    await optionenSpeichern({ ...OPT_STANDARD });
    $('.ce-voll').checked = false;
    $('.ce-kompakt').checked = false;
    $('.ce-prompt').value = '';
    $('.ce-kitext').value = KI_HINWEIS_STANDARD;
    $('.ce-fb').checked = OPT_STANDARD.feedbackSammeln;
    $('.ce-schwelle').value = prozentText(OPT_STANDARD.feedbackSchwelleProzent);
    fbAnzeige();
    kiVorschau();
    optInfo('Auf Standard zurückgesetzt.');
  });

  $('.ce-ki').addEventListener('change', kiVorschau);

  knopf.addEventListener('click', () => panel.classList.toggle('ce-hidden'));
  $('.ce-close').addEventListener('click', () => panel.classList.add('ce-hidden'));

  panel.querySelectorAll('.ce-tab').forEach((t) => {
    t.addEventListener('click', (ev) => {
      if (ev.isTrusted && typeof weiterUhr !== 'undefined' && weiterUhr) {
        clearInterval(weiterUhr); weiterUhr = null;
        $('.ce-copy').textContent = '📋 Prompt + Daten kopieren';
        $('.ce-copy2').textContent = '📋 nur JSON';
      }
      panel.querySelectorAll('.ce-tab').forEach((x) => x.classList.toggle('ce-aktiv', x === t));
      panel.querySelectorAll('[data-panel]').forEach((p) =>
        p.classList.toggle('ce-hidden', p.dataset.panel !== t.dataset.tab));
    });
  });

  /* ---- Tab 1 ---- */

  let ausgabe = null;
  let feedbackAktiv = false;

  $('.ce-go').addEventListener('click', async () => {
    const go = $('.ce-go');
    go.disabled = true;
    $('.ce-error').classList.add('ce-hidden');
    $('.ce-result').classList.add('ce-hidden');
    $('.ce-progress').classList.remove('ce-hidden');

    try {
      const mitFeedback = $('.ce-fb').checked;
      const schwelle = schwelleWert();
      const res = await ernten((fertig, gesamt, gefunden, phase) => {
        $('.ce-bar').style.width = Math.round((fertig / gesamt) * 100) + '%';
        $('.ce-ptext').textContent = phase || `${fertig} / ${gesamt} Fragen · ${gefunden} Funde`;
      }, mitFeedback, schwelle, optionen.vollstaendig, $('.ce-bereits').checked);

      ausgabe = {
        meta: {
          test: ctx.test, kurs: ctx.kurs, cmid: CMID, datum: new Date().toISOString().slice(0, 10),
          fragen_geprueft: res.zeilen, funde: res.funde.length,
          loesungen_geladen: res.mitLoesung, loesungen_fehlend: res.ohneLoesung,
          bereits_nachbewertet_uebersprungen: res.uebersprungen
        },
        fragen: res.fragen,
        funde: res.funde
      };
      if (mitFeedback) {
        ausgabe.meta.feedback_schwelle_prozent = schwelle;
        ausgabe.meta.feedback_kandidaten = res.feedback.length;
        ausgabe.feedback = res.feedback;
      }

      feedbackAktiv = mitFeedback;
      ernteSichern();

      $('.ce-summary').textContent =
        `${res.funde.length} unerkannte Antworten in ${Object.keys(res.fragen).length} Fragen ` +
        `(von ${res.zeilen} geprüften Fragen)` +
        (mitFeedback ? ` · ${res.feedback.length} Kandidaten fürs Feedback.` : '.') +
        (res.uebersprungen ? ` ${res.uebersprungen} bereits nachbewertete Versuche übersprungen.` : '');

      if (res.uebersprungen && !res.funde.length) {
        $('.ce-summary').textContent =
          `Nichts zu tun: alle ${res.uebersprungen} gefundenen Antworten wurden bereits ` +
          `von Hand nachbewertet. Zum erneuten Vorlegen oben das Häkchen setzen.`;
      }

      const promptText = bauePrompt(ausgabe, mitFeedback);
      $('.ce-groesse').textContent =
        `Prompt: rund ${Math.round(promptText.length / 1000)}.000 Zeichen` +
        (optionen.vollstaendig ? ' (mit vollständigem Quelltext)' : '') +
        (res.ohneLoesung
          ? ` · Achtung: zu ${res.ohneLoesung} Frage(n) konnten die hinterlegten Antworten nicht geladen werden.`
          : '');

      if (res.ohneLoesung && res.mitLoesung === 0) {
        $('.ce-error').textContent =
          'Zu keiner Frage konnten die hinterlegten Antworten geladen werden – vermutlich fehlt ' +
          'das Recht, Fragen zu bearbeiten. Die KI kann dann nicht beurteilen, was gesucht war. ' +
          'Gib in dem Fall die Fragen-XML zusätzlich in den Chat.';
        $('.ce-error').classList.remove('ce-hidden');
      }

      const liste = $('.ce-list');
      liste.innerHTML = '';
      let letzte = null;
      res.funde.forEach((f) => {
        if (f.frage !== letzte) { liste.appendChild(el('div', 'ce-qname', f.frage)); letzte = f.frage; }
        // Als Link zum Versuch: der Anker springt direkt zur richtigen Stelle der Seite
        const z = el('a', 'ce-row');
        z.href = seiteUrl(f.slot, f.qid, 'all') + '#question-' + f.qubaid + '-' + f.slot;
        z.target = '_blank';
        z.rel = 'noopener';
        z.title = 'Diesen Versuch in Moodle öffnen';
        z.appendChild(el('span', 'ce-nr', '#' + f.nr));
        const l0 = (f.luecken && f.luecken[0]) || { nr: '?', antwort: '' };
        z.appendChild(el('span', 'ce-gap', 'L' + l0.nr));
        z.appendChild(el('span', 'ce-ans', l0.antwort));
        z.appendChild(el('span', 'ce-pts', f.kein_zugewinn ? 'voll' : `${f.ist} / ${f.max}`));
        liste.appendChild(z);
      });

      if (res.fehler.length) {
        $('.ce-error').textContent = '⚠ ' + res.fehler.join(' · ');
        $('.ce-error').classList.remove('ce-hidden');
      }
      $('.ce-result').classList.remove('ce-hidden');
    } catch (e) {
      $('.ce-error').textContent = 'Fehler: ' + e.message;
      $('.ce-error').classList.remove('ce-hidden');
    } finally {
      $('.ce-progress').classList.add('ce-hidden');
      go.disabled = false;
    }
  });

  async function inZwischenablage(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = el('textarea', 'ce-fallback'); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  // Fertig formulierte Nachforderung für den Chat — der Nutzer soll nichts tippen
  // und vor allem nicht selbst heraussuchen müssen, wer fehlt.
  function nachforderungstext(liste) {
    const zeilen = liste.map((f) => {
      const ant = (f.luecken || [])
        .map((l) => `Lücke ${l.nr}: ${String(l.antwort || '').trim() ? '„' + l.antwort + '"' : '(leer gelassen)'}`)
        .join(' · ');
      return `- ${f.frage} · qubaid ${f.qubaid} · slot ${f.slot} · ${ant}`;
    });
    return 'Für diese Versuche fehlt noch ein Feedback-Text. Gib mir bitte ein JSON '
         + 'nur mit „kommentare" aus — genau einen Eintrag je Versuch, auch wenn '
         + 'mehrere zur selben Frage gehören:\n\n' + zeilen.join('\n');
  }

  // Einheitlicher Ablauf aller Erweiterungen (24.09.2026): Kopieren quittiert,
  // zaehlt 3 s herunter und wechselt dann selbst in Reiter 2 — der Cursor steht
  // im Einfuegefeld. Ein Klick auf einen anderen Reiter bricht den Wechsel ab.
  let weiterUhr = null;
  function reiterZeigen(name) {
    const t = panel.querySelector('.ce-tab[data-tab="' + name + '"]');
    if (t) t.click();
  }
  function quittung(knopfKlasse, urText) {
    const b = $(knopfKlasse);
    clearInterval(weiterUhr);
    let rest = 3;
    b.textContent = `✓ Kopiert — weiter in ${rest} s`;
    weiterUhr = setInterval(() => {
      rest--;
      if (rest > 0) { b.textContent = `✓ Kopiert — weiter in ${rest} s`; return; }
      clearInterval(weiterUhr); weiterUhr = null;
      b.textContent = urText;
      reiterZeigen('eintrag');
      $('.ce-json').focus();
    }, 1000);
  }

  // Fertiger Prompt samt Daten — funktioniert in jedem KI-Chat, ohne Vorwissen.
  $('.ce-copy').addEventListener('click', async () => {
    if (!ausgabe) return;
    await inZwischenablage(bauePrompt(ausgabe, feedbackAktiv));
    quittung('.ce-copy', '📋 Prompt + Daten kopieren');
  });

  // Nur die Rohdaten — fuer einen Chat, der die Auswertungsregeln schon kennt.
  $('.ce-copy2').addEventListener('click', async () => {
    if (!ausgabe) return;
    await inZwischenablage('```json\n' + JSON.stringify(ausgabe, null, 1) + '\n```');
    quittung('.ce-copy2', '📋 nur JSON');
  });

  /* ---- Tab 2 ---- */

  let punkte = null, kommentare = null, offeneRueckmeldungen = [];

  /* ================= Von Prozentwerten zu Punkten ================= */

  // Die KI liefert nur den Prozentwert je Luecke. Gerechnet wird HIER — Sprachmodelle
  // rechnen unzuverlaessig und orientieren sich am naechstliegenden Anker (meist max).
  // Auch markfeld und kommentarfeld werden hier nachgeschlagen statt abgetippt.

  // Bestaetigt eingetragenes Feedback in der gespeicherten Ernte vermerken. Sonst
  // meldet die Abdeckungspruefung beim naechsten Einfuegen (etwa eines kleinen
  // Nachtrags-JSON) alle schon versorgten Versuche erneut als „ohne Feedback-Text".
  function markiereKommentiert(feld) {
    if (!ausgabe || !Array.isArray(ausgabe.feedback)) return;
    const f = ausgabe.feedback.find((x) => x.kommentarfeld === feld);
    if (f && !f.hat_kommentar) { f.hat_kommentar = true; ernteSichern(); }
  }
  function ernteIndex() {
    if (!ausgabe) return null;
    const funde = new Map(), rueckmeldungen = new Map();
    (ausgabe.funde || []).forEach((f) => funde.set(f.qubaid + '|' + f.slot, f));
    (ausgabe.feedback || []).forEach((f) => rueckmeldungen.set(f.qubaid + '|' + f.slot, f));
    return { funde, rueckmeldungen, fragen: ausgabe.fragen || {} };
  }

  const KEINE_ERNTE =
    'Zu diesem Test liegen keine ausgelesenen Daten vor. Bitte zuerst in Tab 1 ' +
    '„Test durchsuchen" laufen lassen — daraus stammen Punktestand, Lückenzahl und Feldnamen.';

  function bewertungenZuPunkten(liste) {
    const idx = ernteIndex();
    if (!idx) throw new Error(KEINE_ERNTE);

    const raus = [];
    liste.forEach((e, i) => {
      const nr = i + 1;
      if (e.qubaid == null || e.slot == null) {
        throw new Error(`Bewertung ${nr}: "qubaid" oder "slot" fehlt.`);
      }
      const fund = idx.funde.get(String(e.qubaid) + '|' + String(e.slot));
      if (!fund) {
        throw new Error(`Bewertung ${nr}: zu qubaid ${e.qubaid} / slot ${e.slot} gibt es ` +
          'keinen ausgelesenen Fund. Stammt das JSON zu diesem Durchlauf?');
      }
      const anzahlLuecken = (idx.fragen[fund.frage] || {}).luecken || (fund.luecken || []).length || 1;
      const max = num(fund.max), ist = num(fund.ist);
      if (max === null || ist === null) {
        throw new Error(`Bewertung ${nr}: Punktestand des Versuchs unbekannt.`);
      }

      const lueckenwert = max / anzahlLuecken;
      let zugewinn = 0;
      const prozente = [];
      (e.luecken || []).forEach((l, j) => {
        const p = Number(l.prozent);
        if (isNaN(p) || p < 0 || p > 100) {
          throw new Error(`Bewertung ${nr}, Lücke ${j + 1}: Prozentwert „${l.prozent}" ist ungültig.`);
        }
        prozente.push(`L${l.nr == null ? j + 1 : l.nr}: ${p} %`);
        zugewinn += lueckenwert * p / 100;
      });

      const neu = Math.min(max, Math.round((ist + zugewinn) * 100) / 100);
      if (neu <= ist) return;   // kein Zugewinn — nichts einzutragen

      raus.push({
        frage: fund.frage, qid: fund.qid, slot: String(fund.slot),
        qubaid: String(e.qubaid),
        markfeld: fund.markfeld, neu,
        antwort: (fund.luecken || []).map((l) => l.antwort).join(' / '),
        prozenttext: prozente.join(' · '),
        rechnung: `${komma(ist)} → ${komma(neu)} von ${komma(max)}`
      });
    });
    return raus;
  }

  // Nimmt beide Formate: mit fertigem kommentarfeld (bisheriges JSON) oder mit qubaid+slot.
  function kommentareAufbereiten(liste) {
    if (!liste.length) return [];
    const idx = ernteIndex();
    return liste.map((e, i) => {
      if (e.kommentarfeld && e.qid) return e;
      if (!idx) throw new Error(KEINE_ERNTE);
      if (e.qubaid == null || e.slot == null) {
        throw new Error(`Kommentar ${i + 1}: "qubaid" oder "slot" fehlt.`);
      }
      const schl = String(e.qubaid) + '|' + String(e.slot);
      const f = idx.rueckmeldungen.get(schl) || idx.funde.get(schl);
      if (!f) {
        throw new Error(`Kommentar ${i + 1}: zu qubaid ${e.qubaid} / slot ${e.slot} gibt es ` +
          'keine ausgelesenen Daten.');
      }
      if (!f.kommentarfeld) {
        throw new Error(`Kommentar ${i + 1}: für diesen Versuch wurde kein Kommentarfeld ausgelesen. ` +
          'Beim Auslesen bitte „Auch schwache Antworten fürs Feedback sammeln" ankreuzen.');
      }
      return {
        frage: f.frage, qid: f.qid, slot: String(f.slot), qubaid: String(e.qubaid || f.qubaid || ''),
        kommentarfeld: f.kommentarfeld, text: e.text,
        leereLuecken: (f.luecken || []).filter((l) => !String(l.antwort || '').trim()).map((l) => l.nr)
      };
    });
  }

  $('.ce-pruef').addEventListener('click', () => {
    const info = $('.ce-pinfo');
    info.classList.remove('ce-hidden');
    $('.ce-schreibknoepfe').classList.add('ce-hidden');
    $('.ce-abschluss').classList.add('ce-hidden');
    $('.ce-log').classList.add('ce-hidden');
    offeneRueckmeldungen = [];
    const altFehlend = panel.querySelector('.ce-fehlend');
    if (altFehlend) altFehlend.remove();
    punkte = null; kommentare = null;
    try {
      const roh = $('.ce-json').value.replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '').trim();
      if (!roh) throw new Error('Das Feld ist leer.');
      if (!/^[{[]/.test(roh)) {
        throw new Error('Das sieht nicht nach JSON aus — der Text muss mit { beginnen. '
          + 'Ist beim Kopieren versehentlich etwas anderes in der Zwischenablage gelandet?');
      }
      const daten = JSON.parse(roh);
      const rohKommentare = daten.kommentare || [];
      let pListe;
      let ausProzent = false;

      if (Array.isArray(daten.bewertungen)) {
        // Neues Format: die KI liefert Prozentwerte, wir rechnen.
        ausProzent = true;
        pListe = bewertungenZuPunkten(daten.bewertungen);
      } else {
        // Bisheriges Format: fertige Punktwerte.
        pListe = Array.isArray(daten) ? daten : (daten.punkte || []);
        pListe.forEach((e, i) => {
          ['qid', 'slot', 'markfeld', 'neu'].forEach((f) => {
            if (e[f] === undefined || e[f] === null) throw new Error(`Punkte-Eintrag ${i + 1}: "${f}" fehlt.`);
          });
          if (isNaN(Number(e.neu))) throw new Error(`Punkte-Eintrag ${i + 1}: "neu" ist keine Zahl.`);
        });
      }

      const kListe = kommentareAufbereiten(rohKommentare);

      // Eintraege ohne jeden Zugewinn wuerden nur unnoetig in Moodle schreiben.
      // bewertungenZuPunkten wirft sie bereits weg; hier zaehlen wir sie nur, damit
      // sichtbar wird, wenn eine KI massenhaft 0-%-Zeilen mitgeliefert hat.
      const verworfen = ausProzent
        ? (daten.bewertungen || []).length - pListe.length : 0;

      // Nennt ein Feedback-Text nicht alle leeren Luecken des Versuchs, fehlt der
      // Schuelerin genau die Angabe, wegen der sie das Feedback bekommt.
      // Geprueft wird jede leere Luecke einzeln ueber ihre Nummer („Lücke 4"). Frueher
      // stand hier ein Test auf „Lücke 2" — der schlug falsch an, wenn die leeren
      // Luecken zufaellig 4 und 8 waren (1.1.5-Beschriftung-5 am 24.09.2026).
      const lueckenwarnung = kListe.filter((k) => {
        const leer = Array.isArray(k.leereLuecken) ? k.leereLuecken : [];
        return leer.length > 1 && leer.some((nr) =>
          !new RegExp('Lücke(?:n)?\\s*' + nr + '(?!\\d)', 'i').test(k.text));
      }).length;

      // Abdeckung: Ein Sprachmodell fasst leicht mehrere Versuche derselben Frage
      // zu einem Kommentar zusammen. Dann geht ein Schueler leer aus, ohne dass es
      // jemandem auffaellt. Deshalb hier gegen die ausgelesenen Kandidaten zaehlen.
      const idxAbdeckung = ernteIndex();
      const fehlendeRueckmeldungen = [];
      if (idxAbdeckung && kListe.length) {
        const versorgt = new Set(kListe.map((k) => k.kommentarfeld));
        idxAbdeckung.rueckmeldungen.forEach((f) => {
          if (f.kommentarfeld && !f.hat_kommentar && !versorgt.has(f.kommentarfeld)) {
            fehlendeRueckmeldungen.push(f);
          }
        });
      }
      offeneRueckmeldungen = fehlendeRueckmeldungen;

      if (!pListe.length && !kListe.length) {
        throw new Error('Weder "bewertungen"/"punkte" noch "kommentare" mit Einträgen gefunden.');
      }

      punkte = pListe; kommentare = kListe;
      const seiten = new Set([...pListe, ...kListe].map((e) => e.slot + '|' + e.qid)).size;
      const teile = [];
      if (pListe.length) teile.push(`${pListe.length} Bewertungen`);
      if (kListe.length) teile.push(`${kListe.length} Feedback-Texte`);
      info.className = 'ce-pinfo ce-ok';
      const zusatz = [];
      if (ausProzent) zusatz.push('Die Punkte wurden aus den Prozentwerten berechnet.');
      if (verworfen > 0) {
        zusatz.push(`${verworfen} Eintrag/Einträge ohne Punktzuwachs (alle Lücken 0 %) `
                  + 'wurden weggelassen — sie würden in Moodle nichts ändern.');
      }
      if (fehlendeRueckmeldungen.length) {
        zusatz.push(`⚠ ${fehlendeRueckmeldungen.length} von `
                  + `${(idxAbdeckung ? idxAbdeckung.rueckmeldungen.size : 0)} `
                  + 'Feedback-Kandidaten haben keinen Text bekommen — Liste unten. '
                  + 'Eintragen kannst du trotzdem.');
      }
      if (lueckenwarnung > 0) {
        zusatz.push(`⚠ ${lueckenwarnung} Feedback-Text nennt nur eine Lücke, obwohl der `
                  + 'Versuch mehrere leere Lücken hat — nicht jede leere Lücke wird mit '
                  + 'ihrer Nummer genannt. Bitte vor dem Eintragen ansehen.');
      }
      info.textContent = `✓ ${teile.join(' und ')} auf ${seiten} Fragenseiten — bereit. `
        + zusatz.join(' ');

      // Berechnete Werte offenlegen, damit man sie vor dem Eintragen prüfen kann
      if (ausProzent && pListe.length) {
        const liste = el('div', 'ce-rechnung');
        pListe.forEach((p) => {
          const z = el('a', 'ce-logzeile ce-vorschauzeile');
          const href = versuchLink(p);
          if (href) { z.href = href; z.target = '_blank'; z.rel = 'noopener'; }
          z.title = 'Diesen Versuch in Moodle öffnen';
          z.appendChild(el('span', 'ce-vfrage', p.frage));
          z.appendChild(el('span', 'ce-vans', '„' + (p.antwort || '—') + '"'));
          z.appendChild(el('span', 'ce-vpkt', p.rechnung));
          z.appendChild(el('span', 'ce-vproz', p.prozenttext || ''));
          liste.appendChild(z);
        });
        const alt = panel.querySelector('.ce-rechnung');
        if (alt) alt.remove();
        info.after(liste);
      }
      // Eine Warnung ohne Handlungsmöglichkeit ist wertlos: Wer fehlt, steht hier
      // namentlich, und der Knopf legt die fertige Nachforderung in die Zwischenablage.
      const altF = panel.querySelector('.ce-fehlend');
      if (altF) altF.remove();
      if (fehlendeRueckmeldungen.length) {
        // Eingeklappt: die Liste kann lang sein und soll nicht vom Eintragen ablenken.
        const box = el('details', 'ce-fehlend');
        box.appendChild(el('summary', 'ce-fehlendkopf',
          `${fehlendeRueckmeldungen.length} Versuch(e) ohne Feedback-Text — anzeigen`));
        box.appendChild(el('div', 'ce-logzeile',
          'Für diese Versuche steht im eingefügten JSON kein Feedback. „Nachforderung '
          + 'kopieren" legt eine fertige Bitte an die KI in die Zwischenablage — im '
          + 'KI-Chat einfügen, das neue JSON hier einfügen, eintragen.'));
        fehlendeRueckmeldungen.forEach((f) => {
          const z = el('a', 'ce-logzeile');
          const href = versuchLink(f);
          if (href) { z.href = href; z.target = '_blank'; z.rel = 'noopener'; }
          const ant = (f.luecken || [])
            .map((l) => `L${l.nr}: ${String(l.antwort || '').trim() ? '„' + l.antwort + '"' : '(leer)'}`)
            .join(' · ');
          z.textContent = `${f.frage} — ${ant}`;
          box.appendChild(z);
        });
        const knopf = el('button', 'ce-nachfordern', '📋 Nachforderung kopieren');
        box.appendChild(knopf);
        knopf.addEventListener('click', async () => {
          await inZwischenablage(nachforderungstext(fehlendeRueckmeldungen));
          knopf.textContent = '✓ kopiert — im Chat einfügen';
          setTimeout(() => (knopf.textContent = '📋 Nachforderung kopieren'), 3000);
        });
        info.after(box);
      }

      $('.ce-schreibknoepfe').classList.remove('ce-hidden');
      info.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      info.className = 'ce-pinfo ce-error';
      info.textContent = 'Fehler: ' + e.message;
    }
  });

  async function schreibLauf(trocken) {
    if (!punkte && !kommentare) return;
    const log = $('.ce-log');
    const abschluss = $('.ce-abschluss');
    log.innerHTML = ''; log.classList.remove('ce-hidden');
    abschluss.classList.add('ce-hidden');
    $('.ce-progress2').classList.remove('ce-hidden');
    $('.ce-alle').disabled = true;
    // Das Protokoll steht ueber den Knoepfen, aber ausserhalb des Sichtfelds, wenn
    // das Panel gescrollt ist. Ohne diesen Sprung sieht man nichts und glaubt,
    // der Klick habe nichts bewirkt.
    $('.ce-progress2').scrollIntoView({ block: 'nearest' });

    const schreibLog = (t, href) => {
      const z = href ? el('a', 'ce-logzeile', t) : el('div', 'ce-logzeile', t);
      if (href) { z.href = href; z.target = '_blank'; z.rel = 'noopener';
                  z.title = 'Diesen Versuch in Moodle öffnen'; }
      if (t.startsWith('✗') || t.startsWith('⚠')) z.classList.add('ce-logfehler');
      log.appendChild(z); log.scrollTop = log.scrollHeight;
    };

    const fortschritt = (fertig, gesamt) => {
      $('.ce-bar2').style.width = Math.round((fertig / gesamt) * 100) + '%';
      $('.ce-ptext2').textContent = `${fertig} / ${gesamt} Fragenseiten`;
    };

    try {
      const r = trocken
        ? await trockenlauf(punkte, kommentare, schreibLog, fortschritt)
        : await eintragen(punkte, kommentare, $('.ce-ki').checked, schreibLog, fortschritt);

      const kopf = el('div', 'ce-logkopf', trocken
        ? `${r.ok} Felder gefunden · ${r.fehler} fehlen · ${r.gruppen} Seiten geprüft`
        : `${r.ok} eingetragen und geprüft · ${r.fehler} fehlgeschlagen · ${r.gruppen} Seiten`);
      log.prepend(kopf);
      if (!r.ok && !r.fehler) schreibLog('Nichts zu tun.');

      abschluss.classList.remove('ce-hidden');
      if (r.fehler > 0) {
        abschluss.className = 'ce-abschluss ce-abfehler';
        abschluss.textContent = trocken
          ? `⚠ ${r.fehler} Feld/Felder fehlen auf der Bewertungsseite. Trag noch nichts ein — `
            + 'stammt das JSON zu diesem Auslese-Durchlauf?'
          : `⚠ ${r.fehler} Eintrag/Einträge sind nicht angekommen. Sieh sie im Protokoll `
            + 'nach und prüfe sie in Moodle, bevor du weitermachst.';
      } else {
        abschluss.className = 'ce-abschluss ce-abok';
        abschluss.textContent = trocken
          ? `✓ Alles vorhanden — ${r.ok} Felder auf ${r.gruppen} Seiten. Du kannst eintragen.`
          : `✓ Fertig — ${r.ok} Einträge auf ${r.gruppen} Seiten, keine Fehler.`;
        // Ohne Fehler gibt es nichts mehr nachzusehen: Panel schliesst sich selbst,
        // damit das Ende sichtbar ist. Mit Fehlern bleibt es offen — sonst
        // verschwaende genau die Zeile, die man lesen muss.
        if (!trocken) {
          let rest = 3;
          const zaehler = setInterval(() => {
            rest--;
            abschluss.textContent =
              `✓ Fertig — ${r.ok} Einträge auf ${r.gruppen} Seiten, keine Fehler. `
              + `Fenster schließt in ${rest} …`;
            if (rest <= 0) {
              clearInterval(zaehler);
              panel.classList.add('ce-hidden');
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
      abschluss.classList.remove('ce-hidden');
      abschluss.className = 'ce-abschluss ce-abfehler';
      abschluss.textContent = '⚠ Abgebrochen: ' + e.message;
    } finally {
      $('.ce-progress2').classList.add('ce-hidden');
      $('.ce-alle').disabled = false;
    }
  }

  $('.ce-alle').addEventListener('click', () => schreibLauf(false));

  // Eingefuegt wird fast immer die fertige KI-Antwort: gleich pruefen, ein Klick weniger.
  $('.ce-json').addEventListener('paste', () => setTimeout(() => $('.ce-pruef').click(), 0));
  // Seit 1.7.2 ohne sichtbaren Prüfen-Knopf: Er lief beim Einfügen ohnehin schon, ein
  // zweiter Klick zeigte dasselbe Ergebnis und wirkte wie „tut nichts". Wer den Text
  // von Hand ändert, bekommt die Prüfung nach einer kurzen Tipp-Pause automatisch.
  let pruefUhr = null;
  $('.ce-json').addEventListener('input', () => {
    clearTimeout(pruefUhr);
    pruefUhr = setTimeout(() => { if ($('.ce-json').value.trim()) $('.ce-pruef').click(); }, 800);
  });
}
