/* Moodle AI Reviewer — Fehlersammlung in der Erweiterung (ab 2.0.0)
 *
 * Jeder entschiedene Fall wird im Spaltenaufbau von Fehlersammlung.csv gespeichert
 * (browser.storage.local, nur auf diesem Rechner). Noch nicht in den Cloze-Code
 * eingepflegte Varianten dienen beim naechsten Durchlauf als Anker — Entscheidungen
 * der Lehrkraft haben dabei Vorrang vor denen der KI. Export als CSV fuer die
 * gebuendelte Pflege der Fragen (Skill 3-moodle-auswertung).
 */
import { browser } from 'wxt/browser';
import { norm } from './regeln.js';

export const SPALTEN = ['Quelle', 'Stand', 'Kategorie', 'Fragename', 'qid', 'Lücke', 'Lückentyp',
  'Musterlösung', 'Schülerantwort', 'Bewertung %', 'Fehlerkategorie', 'Anzahl', 'Status', 'Bemerkung'];

const KEY = 'reviewerFehlersammlung';
const RANG = { Regel: 1, KI: 1, Lehrkraft: 2 };

const schl = (qid, nr, antwort) => `${qid}|${nr}|${norm(antwort).toLowerCase()}`;

export async function laden() {
  try {
    const r = await browser.storage.local.get([KEY]);
    return (r && r[KEY]) || {};
  } catch (e) { return {}; }
}
async function sichern(daten) {
  try { await browser.storage.local.set({ [KEY]: daten }); return true; } catch (e) { return false; }
}

const kategorieAusName = (name) => ((String(name).match(/^(\d+\.\d+)/) || [])[1] || '');
const prozentText = (p) => (Number(p) === 0 ? '0,01' : String(Number(p)).replace('.', ','));
const prozentZahl = (t) => {
  const v = parseFloat(String(t).replace(',', '.'));
  if (isNaN(v)) return null;
  return v < 1 ? 0 : v;   // 0,01 ist der Marker fuer 0 %
};

/**
 * Entschiedene Faelle aus der Vorschau speichern. meta: { test, kurs, datum }.
 * Exakte Treffer in Varianten, die schon im Cloze-Code stehen, werden nicht erneut
 * gesammelt — die sind ja bereits eingepflegt.
 */
export async function faelleSpeichern(faelle, meta) {
  const daten = await laden();
  let neu = 0, geaendert = 0;
  const quelle = [meta.test, meta.kurs ? '(' + meta.kurs + ')' : ''].filter(Boolean).join(' ');
  faelle.forEach((c) => {
    if (c.entscheidung == null || !norm(c.antwort)) return;
    if (c.regel && c.regel.regel === 'anker' && c.ausCloze) return;
    const k = schl(c.qid, c.lueckeNr, c.antwort);
    const versuch = c.qubaid + '|' + c.slot;
    const wer = c.quelle || 'KI';
    const bemerkung = wer === 'Lehrkraft' ? 'Lehrkraft' : `${wer}${c.grund ? ': ' + c.grund : ''}`;
    const alt = daten[k];
    if (!alt) {
      daten[k] = {
        Quelle: quelle, Stand: meta.datum, Kategorie: kategorieAusName(c.frage), Fragename: c.frage,
        qid: String(c.qid), 'Lücke': String(c.lueckeNr), 'Lückentyp': c.typ || '',
        'Musterlösung': (c.muster || [])[0] || '', 'Schülerantwort': norm(c.antwort),
        'Bewertung %': prozentText(c.entscheidung), Fehlerkategorie: c.kategorie || '',
        Anzahl: '1', Status: 'offen', Bemerkung: bemerkung,
        _quelle: wer, _versuche: [versuch]
      };
      neu++;
      return;
    }
    const versuche = alt._versuche || [];
    if (!versuche.includes(versuch)) {
      versuche.push(versuch);
      alt._versuche = versuche;
      alt.Anzahl = String((parseInt(alt.Anzahl, 10) || 0) + 1);
    }
    // Lehrkraft vor KI: eine KI-Einstufung ueberschreibt nie eine der Lehrkraft.
    if ((RANG[wer] || 1) >= (RANG[alt._quelle] || 1)) {
      if (alt['Bewertung %'] !== prozentText(c.entscheidung) || alt._quelle !== wer) geaendert++;
      alt['Bewertung %'] = prozentText(c.entscheidung);
      alt._quelle = wer; alt.Bemerkung = bemerkung; alt.Stand = meta.datum;
      if (c.kategorie) alt.Fehlerkategorie = c.kategorie;
    }
  });
  const ok = await sichern(daten);
  return { ok, neu, geaendert, gesamt: Object.keys(daten).length };
}

/** Anker je "qid|nr": { antworttext: prozent } aus noch offenen (nicht eingepflegten) Eintraegen. */
export function ankerAusSammlung(daten) {
  const anker = {};
  Object.values(daten || {}).forEach((z) => {
    if (z.Status && z.Status !== 'offen') return;
    const p = prozentZahl(z['Bewertung %']);
    if (p == null) return;
    const k = z.qid + '|' + z['Lücke'];
    (anker[k] = anker[k] || {})[z['Schülerantwort']] = p;
  });
  return anker;
}

const csvFeld = (v) => {
  const s = String(v == null ? '' : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function alsCsv(daten) {
  const zeilen = Object.values(daten || {})
    .sort((a, b) => String(a.Fragename).localeCompare(String(b.Fragename))
      || (Number(a['Lücke']) - Number(b['Lücke'])))
    .map((z) => SPALTEN.map((s) => csvFeld(z[s])).join(';'));
  return '﻿' + [SPALTEN.join(';'), ...zeilen].join('\r\n') + '\r\n';
}

// Einfacher CSV-Leser fuer das eigene Format (Semikolon, Anfuehrungszeichen verdoppelt).
function csvLesen(text) {
  const t = String(text).replace(/^﻿/, '');
  const zeilen = []; let feld = '', zeile = [], inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"' && t[i + 1] === '"') { feld += '"'; i++; }
      else if (ch === '"') inQ = false;
      else feld += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ';') { zeile.push(feld); feld = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      zeile.push(feld); feld = '';
      if (zeile.some((f) => f !== '')) zeilen.push(zeile);
      zeile = [];
    } else feld += ch;
  }
  zeile.push(feld);
  if (zeile.some((f) => f !== '')) zeilen.push(zeile);
  return zeilen;
}

/** Bestehende Fehlersammlung.csv uebernehmen (z. B. die bisher von Hand gefuehrte). */
export async function csvImportieren(text) {
  const zeilen = csvLesen(text);
  if (!zeilen.length) throw new Error('Die Datei ist leer.');
  const kopf = zeilen[0].map((s) => s.trim());
  const fehlt = ['qid', 'Lücke', 'Schülerantwort', 'Bewertung %'].filter((s) => !kopf.includes(s));
  if (fehlt.length) throw new Error('Spalten fehlen: ' + fehlt.join(', ') + ' — ist das eine Fehlersammlung.csv?');
  const daten = await laden();
  let neu = 0;
  zeilen.slice(1).forEach((z) => {
    const o = {};
    kopf.forEach((s, i) => { o[s] = (z[i] || '').trim(); });
    if (!o.qid || !o['Schülerantwort']) return;
    const k = schl(o.qid, o['Lücke'], o['Schülerantwort']);
    if (daten[k]) return;   // vorhandene Eintraege (auch Lehrkraft-Entscheidungen) bleiben
    const wer = /^(KI|Regel)\b/.test(o.Bemerkung || '') ? 'KI' : 'Lehrkraft';
    daten[k] = { ...Object.fromEntries(SPALTEN.map((s) => [s, o[s] || ''])),
                 Anzahl: o.Anzahl || '1', Status: o.Status || 'offen', _quelle: wer, _versuche: [] };
    neu++;
  });
  await sichern(daten);
  return { neu, gesamt: Object.keys(daten).length };
}

export async function leeren() { return sichern({}); }
