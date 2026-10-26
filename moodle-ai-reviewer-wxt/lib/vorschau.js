/* Moodle AI Reviewer — Vorschau im Panel (ab 2.0.0)
 *
 * Der einzige Ort, an dem entschieden wird — egal ob die Vorschlaege aus einem
 * KI-Chat (eingefuegtes JSON) oder von einer direkt angesprochenen KI kommen.
 * Unklare Faelle stehen offen mit allen Angaben und Stufenknoepfen, sichere Faelle
 * eingeklappt (aber aenderbar). Gespeichert wird hier nichts: "Weiter" fuehrt zur
 * Zusammenfassung, eingetragen wird erst dort per Klick.
 */
import { STUFEN, codeRegel, einstufen, norm } from './regeln.js';

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

const schluessel = (qubaid, slot) => String(qubaid) + '|' + String(slot);

/** Teilt die Funde in "Regel entscheidet" und "geht an die KI". */
export function regelFaelle(ausgabe) {
  const fragen = (ausgabe && ausgabe.fragen) || {};
  const ergebnis = new Map();   // "qubaid|slot|nr" -> Regel-Ergebnis
  ((ausgabe && ausgabe.funde) || []).forEach((f) => {
    const loes = ((fragen[f.frage] || {}).loesungen) || [];
    (f.luecken || []).forEach((l) => {
      const r = codeRegel(l.antwort, loes.find((x) => x.nr === l.nr));
      if (r) ergebnis.set(schluessel(f.qubaid, f.slot) + '|' + l.nr, r);
    });
  });
  return ergebnis;
}

/** Kopie der Ernte fuer die KI: Luecken, die eine Code-Regel entscheidet, fallen weg. */
export function datenFuerKi(ausgabe) {
  const regeln = regelFaelle(ausgabe);
  const funde = [];
  (ausgabe.funde || []).forEach((f) => {
    const rest = (f.luecken || []).filter((l) => !regeln.has(schluessel(f.qubaid, f.slot) + '|' + l.nr));
    if (rest.length) funde.push({ ...f, luecken: rest });
  });
  const benutzt = new Set([...funde, ...(ausgabe.feedback || [])].map((f) => f.frage));
  const fragen = {};
  Object.keys(ausgabe.fragen || {}).forEach((k) => { if (benutzt.has(k)) fragen[k] = ausgabe.fragen[k]; });
  const meta = { ...(ausgabe.meta || {}), funde: funde.length,
                 von_regel_entschieden: regeln.size };
  const d = { ...ausgabe, meta, fragen, funde };
  return { daten: d, regelAnzahl: regeln.size };
}

/**
 * Baut aus Ernte und KI-Bewertungen die Liste der Faelle (eine Zeile je Luecke).
 * bewertungen: [{ qubaid, slot, nr?, luecken: [{ nr, prozent, grund, kategorie }] }]
 */
export function faelleBauen(ausgabe, bewertungen) {
  const fragen = ausgabe.fragen || {};
  const kiMap = new Map();
  const nachNr = new Map();
  (bewertungen || []).forEach((b) => {
    (b.luecken || []).forEach((l) => {
      if (b.qubaid != null && b.slot != null) kiMap.set(schluessel(b.qubaid, b.slot) + '|' + l.nr, l);
      if (b.nr != null) nachNr.set(String(b.nr) + '|' + l.nr, l);
    });
  });
  const faelle = [];
  (ausgabe.funde || []).forEach((f) => {
    const frage = fragen[f.frage] || {};
    const loes = frage.loesungen || [];
    (f.luecken || []).forEach((l) => {
      const loesung = loes.find((x) => x.nr === l.nr) || null;
      const regel = codeRegel(l.antwort, loesung);
      const ki = kiMap.get(schluessel(f.qubaid, f.slot) + '|' + l.nr)
              || nachNr.get(String(f.nr) + '|' + l.nr) || null;
      const st = einstufen(l.antwort, loesung, regel, ki);
      faelle.push({
        fund: f, frage: f.frage, qid: f.qid, qubaid: String(f.qubaid), slot: String(f.slot),
        fundNr: f.nr, lueckeNr: l.nr, antwort: l.antwort, kontext: l.kontext || '',
        typ: (loesung && loesung.typ) || '', muster: (loesung && loesung.richtig) || [],
        bekannt: (loesung && loesung.bekannte_varianten) || {},
        // Exakter Anker aus dem Cloze-Code (nicht aus der eigenen Sammlung): schon eingepflegt.
        ausCloze: !!(regel && regel.regel === 'anker'
          && !((loesung && loesung.aus_sammlung) || []).includes(regel.anker)),
        regel, ki, unklar: st.unklar, gruende: st.gruende, anker: st.anker || null,
        vorschlag: st.vorschlag, entscheidung: st.vorschlag,
        quelle: st.quelle === 'Regel' ? 'Regel' : 'KI',
        grund: (regel && regel.grund) || (ki && ki.grund) || '',
        kategorie: (regel && regel.kategorie) || (ki && ki.kategorie) || '',
        angesehen: false
      });
    });
  });
  return faelle;
}

/** Entscheidungen -> "bewertungen" im bekannten Format (fuer bewertungenZuPunkten). */
export function zuBewertungen(faelle) {
  const map = new Map();
  faelle.forEach((c) => {
    if (c.entscheidung == null) return;
    const k = schluessel(c.qubaid, c.slot);
    if (!map.has(k)) map.set(k, { frage: c.frage, qubaid: c.qubaid, slot: c.slot, luecken: [] });
    map.get(k).luecken.push({ nr: c.lueckeNr, prozent: c.entscheidung });
  });
  return [...map.values()];
}

function kontextMitMarke(text, nr) {
  const p = el('p', 'ce-vkontext');
  const teile = String(text || '').split(new RegExp('(\\[\\[L' + nr + '\\]\\])'));
  teile.forEach((t) => {
    if (t === `[[L${nr}]]`) p.appendChild(el('mark', 'ce-vluecke', `Lücke ${nr}`));
    else p.appendChild(document.createTextNode(t.replace(/\[\[L\d+\]\]/g, '…')));
  });
  return p;
}

function stufenKnoepfe(fall, beiKlick) {
  const zeile = el('div', 'ce-stufen');
  const knoepfe = STUFEN.map((s) => {
    const b = el('button', 'ce-stufe', String(s));
    b.type = 'button';
    if (s === 90 && String(fall.typ).toUpperCase() !== 'SAC') b.title = '90 % nur bei Lückentyp SAC';
    if (fall.vorschlag === s) b.classList.add('ce-stufe-vorschlag');
    b.addEventListener('click', () => { beiKlick(s); markiere(); });
    zeile.appendChild(b);
    return [s, b];
  });
  function markiere() {
    knoepfe.forEach(([s, b]) => b.classList.toggle('ce-stufe-an', fall.entscheidung === s));
  }
  markiere();
  return zeile;
}

/**
 * Zeichnet die Vorschau in container.
 * opt.link(fall) -> href zum Versuch · opt.onWeiter(faelle) · opt.titel (Herkunft)
 */
export function zeigeVorschau(container, faelle, opt) {
  container.innerHTML = '';
  container.classList.remove('ce-hidden');
  const unklar = faelle.filter((c) => c.unklar);
  const sicher = faelle.filter((c) => !c.unklar);

  const kopf = el('p', 'ce-vkopf');
  kopf.textContent = `${faelle.length} Fälle${opt.titel ? ' · ' + opt.titel : ''}: `
    + `${unklar.length} unklar, ${sicher.length} sicher.`
    + (unklar.length ? ' Bitte die unklaren entscheiden – der Vorschlag ist vorausgewählt.' : '');
  container.appendChild(kopf);

  const zaehler = el('p', 'ce-vzaehler');
  const aktualisieren = () => {
    const offen = unklar.filter((c) => c.entscheidung == null).length;
    const gesehen = unklar.filter((c) => c.angesehen).length;
    zaehler.textContent = offen
      ? `⚠ ${offen} unklare Fälle haben noch keine Stufe.`
      : `${gesehen} von ${unklar.length} unklaren Fällen angeklickt.`;
    weiter.disabled = offen > 0;
  };

  const karte = (c, kompakt) => {
    const k = el('div', 'ce-vkarte' + (kompakt ? ' ce-vkompakt' : ''));
    const ober = el(opt.link && opt.link(c) ? 'a' : 'div', 'ce-vober');
    const href = opt.link && opt.link(c);
    if (href) { ober.href = href; ober.target = '_blank'; ober.rel = 'noopener'; ober.title = 'Versuch in Moodle öffnen'; }
    ober.textContent = `#${c.fundNr} · ${c.frage} · Lücke ${c.lueckeNr}${c.typ ? ' (' + c.typ + ')' : ''}`
      + (c.fund && c.fund.kein_zugewinn ? ' · bereits voll' : '');
    k.appendChild(ober);
    if (!kompakt && c.kontext) k.appendChild(kontextMitMarke(c.kontext, c.lueckeNr));
    if (!kompakt && c.muster.length) k.appendChild(el('p', 'ce-vmuster', 'Muster: ' + c.muster.join(' · ')));
    const ant = el('p', 'ce-vantwort');
    ant.appendChild(el('span', 'ce-vlabel', 'Antwort: '));
    ant.appendChild(el('strong', null, norm(c.antwort) ? '„' + c.antwort + '“' : '(leer)'));
    k.appendChild(ant);
    const vor = el('p', 'ce-vki');
    const wer = c.regel ? 'Regel' : 'KI';
    vor.textContent = c.vorschlag == null
      ? 'KI: kein Vorschlag'
      : `${wer}: ${c.vorschlag} %${c.grund ? ' – ' + c.grund : ''}`
        + (c.regel && c.ki && c.ki.prozent != null ? ` · KI: ${c.ki.prozent} %` : '')
        + (c.anker ? ` · Anker: '${c.anker.text}' (${c.anker.prozent})` : '');
    k.appendChild(vor);
    if (c.gruende.length) k.appendChild(el('p', 'ce-vgrund', 'Unklar: ' + c.gruende.join(' · ')));
    if (!kompakt) {
      const bek = Object.entries(c.bekannt);
      if (bek.length) {
        k.appendChild(el('p', 'ce-vbekannt', 'Bekannt: '
          + bek.slice(0, 8).map(([t, p]) => `'${t}' ${p}`).join(' · ') + (bek.length > 8 ? ' …' : '')));
      }
    }
    k.appendChild(stufenKnoepfe(c, (s) => {
      c.entscheidung = s; c.angesehen = true;
      // Wer klickt, entscheidet selbst — auch wenn es derselbe Wert ist wie der Vorschlag.
      c.quelle = 'Lehrkraft';
      k.classList.add('ce-ventschieden');
      aktualisieren();
    }));
    return k;
  };

  if (unklar.length) {
    const box = el('div', 'ce-vunklar');
    unklar.forEach((c) => box.appendChild(karte(c, false)));
    container.appendChild(box);
  } else {
    container.appendChild(el('p', 'ce-vok', '✓ Keine unklaren Fälle.'));
  }

  if (sicher.length) {
    const d = el('details', 'ce-vsicher');
    d.appendChild(el('summary', null, `${sicher.length} sichere Fälle – anzeigen und ggf. ändern`));
    sicher.forEach((c) => d.appendChild(karte(c, true)));
    container.appendChild(d);
  }

  container.appendChild(zaehler);
  const weiter = el('button', 'ce-vweiter', 'Weiter: Zusammenfassung →');
  weiter.type = 'button';
  weiter.addEventListener('click', () => {
    weiter.textContent = '… wird berechnet';
    try { opt.onWeiter(faelle); } finally { weiter.textContent = 'Weiter: Zusammenfassung →'; }
  });
  container.appendChild(weiter);
  aktualisieren();
}
