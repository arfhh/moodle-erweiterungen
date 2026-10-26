/* Moodle AI Reviewer — feste Regeln (ab 2.0.0)
 *
 * Reine Funktionen ohne DOM und ohne browser.*: dieselben Regeln fuer den Chat-Weg
 * und fuer die direkt angesprochene KI. Ob ein Fall unklar ist, entscheidet dieser
 * Code — nicht das Sprachmodell. Dann verhaelt sich die Erweiterung gleich, egal
 * welches Modell dahinter steht.
 *
 * Messung 26.10.2026 (41 Faelle aus der Fehlersammlung): Gross-/Kleinschreibung
 * uebersieht ein lokales Modell oft — als Code-Regel ist sie sicher. Die bekannten
 * Varianten derselben Luecke (Anker) sind der groesste Hebel fuer die Treffsicherheit.
 */

export const STUFEN = [100, 90, 75, 50, 25, 0];

export const KATEGORIEN = [
  'Tippfehler', 'Vertauschung', 'phonetisch', 'Groß-/Kleinschreibung',
  'Getrennt-/Zusammenschreibung', 'Auslassung', 'Doppelung', 'Endung', 'Wortstamm',
  'Synonym', 'Wortverwechslung', 'Zahlenverwechslung', 'Rateversuch'
];

export const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const klein = (s) => norm(s).toLowerCase();

// Editierabstand (Levenshtein), zeilenweise — kurze Woerter, keine Optimierung noetig.
export function abstand(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let vor = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const akt = [i];
    for (let j = 1; j <= b.length; j++) {
      akt[j] = Math.min(vor[j] + 1, akt[j - 1] + 1,
        vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vor = akt;
  }
  return vor[b.length];
}

// Naechste gueltige Stufe — fuer Werte, die eine KI ausserhalb der Skala liefert.
export function naechsteStufe(p) {
  const v = Number(p);
  if (isNaN(v)) return null;
  return STUFEN.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), 0);
}

const istSac = (typ) => String(typ || '').toUpperCase() === 'SAC';

/**
 * Code-Regeln vor jeder KI. Liefert eine fertige Entscheidung oder null.
 *  1. Exakter Treffer in den bekannten Varianten (bei SAC mit, sonst ohne
 *     Gross-/Kleinschreibung) — die Lehrkraft hat diesen Fall schon entschieden.
 *  2. Antwort unterscheidet sich von einer richtigen Loesung NUR in der Gross-/
 *     Kleinschreibung: SAC 90, SA 100.
 * loesung = { typ, richtig: [..], bekannte_varianten: { text: prozent } }
 */
export function codeRegel(antwort, loesung) {
  const a = norm(antwort);
  if (!a || !loesung) return null;
  const sac = istSac(loesung.typ);
  const bekannt = loesung.bekannte_varianten || {};
  for (const [v, p] of Object.entries(bekannt)) {
    const gleich = sac ? norm(v) === a : klein(v) === klein(a);
    if (gleich) {
      return { prozent: Number(p), regel: 'anker', anker: v,
               grund: `schon entschieden: '${v}' (${p})` };
    }
  }
  for (const r of loesung.richtig || []) {
    if (String(r).includes('*')) continue;
    if (norm(r) !== a && klein(r) === klein(a)) {
      return { prozent: sac ? 90 : 100, regel: 'grossklein', kategorie: 'Groß-/Kleinschreibung',
               grund: sac ? 'nur Groß-/Kleinschreibung (SAC → 90)' : 'nur Groß-/Kleinschreibung (SA → 100)' };
    }
  }
  return null;
}

/**
 * Passender Anker: eine bekannte Variante derselben Luecke mit DEMSELBEN Prozentwert
 * wie der Vorschlag UND aehnlich geschrieben (Abstand <= 2 bzw. <= 30 % der Laenge).
 * Entscheidung Arne 26.10.2026.
 */
export function passenderAnker(antwort, prozent, bekannt) {
  const a = klein(antwort);
  let best = null;
  for (const [v, p] of Object.entries(bekannt || {})) {
    if (Number(p) !== Number(prozent)) continue;
    const b = klein(v);
    const d = abstand(a, b);
    const grenze = Math.max(2, Math.floor(0.3 * Math.max(a.length, b.length)));
    if (d <= grenze && (!best || d < best.d)) best = { text: v, prozent: Number(p), d };
  }
  return best;
}

/**
 * Sicher oder unklar? Unklar ist ein Fall, wenn
 *  - kein passender Anker vorliegt,
 *  - der Vorschlag 25 oder 50 ist,
 *  - der Vorschlag 100 ohne Anker ist (Synonym?),
 *  - Code-Regel und KI sich widersprechen,
 *  - die KI keinen (gueltigen) Wert geliefert hat.
 * regel: Ergebnis von codeRegel oder null; ki: { prozent, grund } oder null.
 */
export function einstufen(antwort, loesung, regel, ki) {
  const kiWert = ki && ki.prozent != null && ki.prozent !== '' ? Number(ki.prozent) : null;
  if (regel) {
    if (kiWert != null && kiWert !== regel.prozent) {
      return { unklar: true, vorschlag: regel.prozent, quelle: 'Regel',
               gruende: [`Regel sagt ${regel.prozent}, KI sagt ${kiWert}`] };
    }
    return { unklar: false, vorschlag: regel.prozent, quelle: 'Regel', gruende: [] };
  }
  if (kiWert == null || isNaN(kiWert)) {
    return { unklar: true, vorschlag: null, quelle: 'KI', gruende: ['kein KI-Vorschlag'] };
  }
  const gruende = [];
  let p = kiWert;
  if (!STUFEN.includes(p)) { gruende.push(`kein Skalenwert (${kiWert})`); p = naechsteStufe(p); }
  const anker = passenderAnker(antwort, p, (loesung || {}).bekannte_varianten);
  if (p === 25 || p === 50) gruende.push(`Vorschlag ${p}`);
  if (!anker) gruende.push(p === 100 ? '100 ohne Anker – Synonym?' : 'kein passender Anker');
  return { unklar: gruende.length > 0, vorschlag: p, quelle: 'KI', anker, gruende };
}
