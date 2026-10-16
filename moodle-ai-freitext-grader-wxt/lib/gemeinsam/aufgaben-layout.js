/* Moodle AI Freitext Grader — einheitliches Layout fuer Aufgabenstellung und
 * Antwortvorlage. Reine Funktionen: HTML rein, HTML raus. Eingefuegt wird nur ins
 * offene Formular; speichern tut die Lehrkraft selbst.
 * Design (abgestimmt 16.10.2026): AFB-Kartendesign v2 ohne Icon; Marke als weisser
 * Kreis mit dunklem Rand und schwarzer Schrift (1, 2a, 2b; Kurztest a, b); jede
 * Teilaufgabe eine eigene Karte; Punkte immer am Ende.
 * A. Spielhoff · CC BY-SA 4.0
 */

export const KARTEN_FARBEN = {
  I:   { op: '#2e7d32', block: '#eaf4ea', feld: '#f5faf5' },
  II:  { op: '#b45309', block: '#fdf2e0', feld: '#fffaf0' },
  III: { op: '#c62828', block: '#fbe9e9', feld: '#fdf3f3' },
  neutral: { op: '#33404d', block: '#eceff3', feld: '#f8f9fb' }
};

const AFB_RE = /AFB\s*(I{1,3}(?:\s*[-–]\s*I{1,3})?)/i;
const AFB_KLAMMER_RE = /\s*\(\s*AFB\s*I{1,3}(?:\s*[-–]\s*I{1,3})?\s*\)\s*/gi;
// Nummer am Anfang: „1.", „2a)", „Aufgabe 3:", „b)", „①"
const NUM_RE = /^\s*(?:Aufgabe\s*)?(\d{1,2})?\s*([a-h])?\s*[.):]\s*|^\s*[①-⑳]\s*/i;
const START_ZAHL_RE = /^\s*(?:Aufgabe\s*)?(\d{1,2})\s*([a-h])?\s*[.):]\s*/i;
const START_BUCHST_RE = /^\s*([a-h])\s*\)\s*/i;
const KREIS_RE = /^\s*([①-⑳])/;
const MAT_RE = /^\s*(?:M\s?\d+\b|Material\b)/i;
const OPERATOR_RE = /^(Nenne|Benenne|Gib|Beschreibe|Erkläre|Erläutere|Begründe|Vergleiche|Beurteile|Bewerte|Diskutiere|Erörtere|Stelle|Skizziere|Zeichne|Berechne|Ermittle|Bestimme|Formuliere|Deute|Interpretiere|Analysiere|Untersuche|Entwickle|Plane|Prüfe|Überprüfe|Ordne|Fasse|Werte|Leite|Definiere|Charakterisiere|Gliedere|Zeige|Notiere|Markiere|Kennzeichne|Ergänze|Wende|Übertrage|Gestalte|Entwirf|Nimm)\b/;
const KREISE = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function afbAusText(t) {
  const m = String(t || '').match(AFB_RE);
  return m ? m[1].replace(/\s+/g, '') : '';
}
export function afbStufe(afb) {
  const s = String(afb || '').toUpperCase().split(/[-–]/).pop().trim();
  return KARTEN_FARBEN[s] ? s : null;
}
export function farbenFuer(afb) { return KARTEN_FARBEN[afbStufe(afb)] || KARTEN_FARBEN.neutral; }
export function istGestaltet(html) { return /#B9C7DA/i.test(String(html || '')); }
export function nrKey(x) { return String(x == null ? '' : x).replace(/\s+/g, '').toLowerCase(); }

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function komma(z) { return String(z).replace('.', ','); }

export function markeHtml(label) {
  return '<span style="display:inline-block;min-width:22px;height:22px;line-height:20px;padding:0 5px;'
    + 'box-sizing:border-box;border:1.5px solid #33404d;border-radius:11px;background:#fff;color:#222;'
    + 'font-weight:700;font-size:13px;text-align:center;">' + esc(label) + '</span>';
}
export function punkteHtml(p) {
  if (p == null || p === '') return '';
  return '<span style="font-size:12px;font-weight:600;color:#6b6b6b;">(' + esc(komma(p))
    + (Number(p) === 1 ? ' Punkt' : ' Punkte') + ')</span>';
}

/* --- Antwortkasten (fuer die Antwortvorlage). Kein flex, keine Tabelle. --- */
export function antwortKasten({ label, titel, afb, punkte, farbig, zeigeAfb, zeigePunkte }) {
  const f = farbig ? farbenFuer(afb) : KARTEN_FARBEN.neutral;
  let kopf = (label ? markeHtml(label) + ' · ' : '') + esc(titel || 'Deine Antwort');
  if (zeigeAfb && afb) kopf += ' <span style="font-size:13px;font-style:italic;font-weight:normal;color:#6b6b6b;">AFB ' + esc(afb) + '</span>';
  if (zeigePunkte && punkte != null) kopf += ' ' + punkteHtml(punkte);
  return '<div style="border:1.5px solid #9e9e9e;border-radius:12px;overflow:hidden;margin:10px 0;">'
    + '<div style="background:' + f.block + ';padding:9px 14px;font-size:16px;font-weight:bold;'
    + 'color:#33404d;border-bottom:1.5px solid #9e9e9e;">' + kopf + '</div>'
    + '<div style="background:' + f.feld + ';padding:10px 14px;font-size:15px;line-height:1.45;">'
    + '<p style="margin:0;">&nbsp;</p><p style="margin:0;">&nbsp;</p></div></div>';
}

/* --- Aufgabenkarte --- */
function karte(innerHtml, afb) {
  const f = farbenFuer(afb);
  const label = afb ? 'AFB<br>' + esc(afb) : '';
  return '<div style="display:flex;border:1.5px solid #9e9e9e;border-radius:12px;overflow:hidden;margin:6px 0 10px;">'
    + '<div style="width:40px;flex-shrink:0;background:#B9C7DA;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;padding:10px 4px;">'
    + '<span style="font-size:10px;font-weight:bold;line-height:1.2;text-align:center;color:#6b6b6b;">' + label + '</span></div>'
    + '<div style="flex:1;"><div style="padding:10px 14px 8px;background:' + f.block + ';font-size:15px;line-height:1.6;border-radius:0 12px 12px 0;">'
    + innerHtml + '</div></div></div>';
}

// Erstes Textstueck: Nummer weg, Marke davor, Operator fett/farbig; Punkte ans Ende.
function karteninhalt(box, label, farbe, punkte) {
  const doc = box.ownerDocument;
  const w = doc.createTreeWalker(box, 4);
  let n;
  while ((n = w.nextNode()) && !n.data.trim()) { /* leer */ }
  let opGefunden = false;
  if (n) {
    let t = n.data.replace(AFB_KLAMMER_RE, ' ').replace(/^\s+/, '').replace(NUM_RE, '');
    const lead = (t.match(/^\s*/) || [''])[0];
    t = t.slice(lead.length);
    const m = t.match(OPERATOR_RE);
    const fr = doc.createDocumentFragment();
    if (m) {
      const op = doc.createElement('span');
      op.setAttribute('style', 'font-weight:700;color:' + farbe + ';');
      op.textContent = m[1];
      fr.appendChild(op);
      fr.appendChild(doc.createTextNode(t.slice(m[1].length)));
      opGefunden = true;
    } else fr.appendChild(doc.createTextNode(t));
    n.parentNode.replaceChild(fr, n);
  }
  let html = box.innerHTML.replace(AFB_KLAMMER_RE, ' ').trim();
  const vorne = label ? markeHtml(label) + ' ' : '';
  const hinten = punkte != null ? ' ' + punkteHtml(punkte) : '';
  // Marke in den ersten Absatz, Punkte in den letzten — sonst stehen sie auf eigenen Zeilen.
  if (/^<p[\s>]/i.test(html)) html = html.replace(/^(<p[^>]*>)/i, '$1' + vorne);
  else html = vorne + html;
  if (/<\/p>\s*$/i.test(html)) html = html.replace(/<\/p>\s*$/i, hinten + '</p>');
  else html = html + hinten;
  return { html, opGefunden };
}

/* Zerlegt den Fragetext in Segmente: frei (Einleitung, Material) und Teilaufgaben
 * mit Label „1", „2a", „a". Eine Zahl, auf die Buchstaben-Teile folgen, ist nur
 * Ueberschrift: Ihr Text bleibt als Einleitung stehen, die Nummer faellt weg. */
export function zerlegeAufgabentext(html) {
  const doc = new DOMParser().parseFromString('<div id="w">' + String(html || '') + '</div>', 'text/html');
  const w = doc.getElementById('w');
  const kinder = [...w.childNodes].filter(k => k.nodeType === 1 || (k.nodeType === 3 && k.data.trim()));
  const txt = k => (k.textContent || '').replace(/ /g, ' ');
  const seg = [];
  let akt = null, zahl = '';
  let kreisNr = 0;
  kinder.forEach(k => {
    const t = txt(k);
    let label = null, m;
    if ((m = t.match(START_ZAHL_RE))) {
      zahl = m[1]; label = m[1] + (m[2] ? m[2].toLowerCase() : '');
    } else if ((m = t.match(START_BUCHST_RE))) {
      label = zahl + m[1].toLowerCase();
    } else if ((m = t.match(KREIS_RE))) {
      kreisNr = KREISE.indexOf(m[1]) + 1; zahl = String(kreisNr); label = zahl;
    }
    if (label) { akt = { typ: 'aufgabe', label, knoten: [k] }; seg.push(akt); return; }
    if (MAT_RE.test(t) || !akt || akt.typ === 'frei') {
      if (!akt || akt.typ !== 'frei' || MAT_RE.test(t)) { akt = { typ: 'frei', knoten: [] }; seg.push(akt); }
      akt.knoten.push(k); return;
    }
    akt.knoten.push(k);
  });
  // Nummerierte Liste <ol><li> als Teilaufgaben, wenn sonst nichts gefunden wurde
  if (!seg.some(s => s.typ === 'aufgabe')) {
    const ol = kinder.find(k => k.tagName === 'OL' && k.children.length >= 2);
    if (ol) {
      const neu = [];
      kinder.forEach(k => {
        if (k === ol) [...ol.children].forEach((li, i) => neu.push({ typ: 'aufgabe', label: String(i + 1), knoten: [...li.childNodes] }));
        else neu.push({ typ: 'frei', knoten: [k] });
      });
      return { doc, segmente: neu };
    }
  }
  // Zahl-Ueberschrift vor Buchstaben-Teilen wird Einleitung
  seg.forEach((s, i) => {
    if (s.typ !== 'aufgabe' || !/^\d+$/.test(s.label)) return;
    const naechste = seg.slice(i + 1).find(x => x.typ === 'aufgabe');
    if (naechste && naechste.label.startsWith(s.label) && naechste.label !== s.label) {
      s.typ = 'frei';
      const erster = s.knoten[0];
      const tw = doc.createTreeWalker(erster, 4); let n;
      while ((n = tw.nextNode()) && !n.data.trim()) { /* leer */ }
      if (n) n.data = n.data.replace(START_ZAHL_RE, '');
      if (!txt(erster).trim() && !erster.querySelector?.('img,table')) s.knoten.shift();
    }
  });
  return { doc, segmente: seg };
}

/* opts: { aufgaben: [{nr, afb, punkte}], punkte: bool, gesamtAfb }
 * Kurztest ohne Teile: eine Karte ohne Marke. */
export function gestalteAufgabe(html, opts = {}) {
  const { doc, segmente } = zerlegeAufgabentext(html);
  const hinweise = [];
  const auf = opts.aufgaben || [];
  const nachKey = new Map(auf.map(a => [nrKey(a.nr), a]));
  const teile = segmente.filter(s => s.typ === 'aufgabe');
  const box = list => { const b = doc.createElement('div'); list.forEach(k => b.appendChild(k.cloneNode(true))); return b; };

  if (!teile.length) {
    const b = box(segmente.flatMap(s => s.knoten));
    const afb = (auf.length === 1 && auf[0].afb) || opts.gesamtAfb || afbAusText(b.textContent);
    const r = karteninhalt(b, '', farbenFuer(afb).op, null);
    if (!r.opGefunden) hinweise.push('Kein Operator am Anfang erkannt – der Text steht unverändert in der Karte.');
    if (!afb) hinweise.push('Kein AFB gefunden – die Karte bleibt neutral grau.');
    if (auf.length > 1) hinweise.push('Im Horizont stehen ' + auf.length + ' Teilaufgaben, im Fragetext ist keine Nummerierung zu erkennen (z. B. „1.", „2a)", „b)").');
    return { html: karte(r.html, afb), gefunden: 0, erwartet: auf.length, hinweise };
  }
  if (auf.length && teile.length !== auf.length) {
    hinweise.push('Gefunden: ' + teile.length + ' Teilaufgaben, im Horizont stehen ' + auf.length + '. Bitte die Vorschau genau prüfen.');
  }
  let i = 0, ohneOp = 0, ohnePkt = 0;
  const html2 = segmente.map(s => {
    const b = box(s.knoten);
    if (s.typ === 'frei') {
      // „(AFB …)" steht jetzt in der Karte; leere Absaetze, die davon bleiben, fallen weg.
      return b.innerHTML.replace(AFB_KLAMMER_RE, ' ').replace(/<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '').trim();
    }
    const a = nachKey.get(nrKey(s.label)) || auf[i] || {};
    i++;
    const afb = a.afb || afbAusText(b.textContent) || opts.gesamtAfb || '';
    const pkt = opts.punkte === false ? null : (a.punkte != null ? a.punkte : null);
    if (opts.punkte !== false && pkt == null) ohnePkt++;
    const r = karteninhalt(b, s.label, farbenFuer(afb).op, pkt);
    if (!r.opGefunden) ohneOp++;
    return karte(r.html, afb);
  }).join('\n');
  if (ohneOp) hinweise.push(ohneOp + ' Teilaufgabe(n) ohne erkannten Operator am Anfang – dort ist nichts eingefärbt.');
  if (ohnePkt) hinweise.push(ohnePkt + ' Teilaufgabe(n) ohne Punkte im Horizont – dort steht keine Punktzahl.');
  return { html: html2, gefunden: teile.length, erwartet: auf.length, hinweise, labels: teile.map(t => t.label) };
}
