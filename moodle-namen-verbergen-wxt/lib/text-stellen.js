/* Moodle Namen verbergen — Namen und Adressen in reinem Text finden (ohne Browser-Abhaengigkeit,
 * damit der Rechentest sie pruefen kann).
 *
 * Manche Moodle-Seiten schreiben Namen ohne eigenes Element in einen Text, z. B. die manuelle
 * Bewertung im Test: "Versuch Nummer 1 von Hanka Jessel (hanka.jessel@schule.de)".
 * findeStellen() liefert die Zeichenbereiche [von, bis), die verwischt werden sollen.
 *
 * A. Spielhoff · MIT-Lizenz
 */

// E-Mail-Adresse mitten im Text.
const EMAIL = /[^\s@()<>,;:"'[\]]+@[^\s@()<>,;:"'[\]]+\.[A-Za-z]{2,}/g;
// Bis zu vier gross geschriebene Woerter direkt vor "(Adresse)" sind der Name dazu.
const NAME_VOR_KLAMMER = /((?:\p{Lu}[\p{L}'’.-]*\s+){0,3}\p{Lu}[\p{L}'’.-]*)\s*\($/u;
// Ueberschrift der manuellen Bewertung (quiz_grading), deutsch und englisch, auch ohne Adresse.
const VERSUCH_VON = /^(\s*(?:Versuch(?:\s+Nummer)?|Attempt(?:\s+number)?)\s+\d+\s+(?:von|for)\s+)(\S[\s\S]*?)\s*$/i;

function verschmelze(bereiche) {
  bereiche.sort((a, b) => a[0] - b[0]);
  const aus = [];
  for (const b of bereiche) {
    const letzt = aus[aus.length - 1];
    if (letzt && b[0] <= letzt[1]) letzt[1] = Math.max(letzt[1], b[1]);
    else aus.push([b[0], b[1]]);
  }
  return aus;
}

export function findeStellen(text, istUeberschrift = false) {
  const s = String(text || '');
  const bereiche = [];
  if (istUeberschrift) {
    const m = VERSUCH_VON.exec(s);
    if (m) bereiche.push([m[1].length, m[1].length + m[2].length]);
  }
  if (s.includes('@')) {
    for (const m of s.matchAll(EMAIL)) {
      let von = m.index;
      let bis = m.index + m[0].length;
      const davor = NAME_VOR_KLAMMER.exec(s.slice(0, von));
      if (davor) {
        von = davor.index;
        if (s[bis] === ')') bis += 1;
      }
      bereiche.push([von, bis]);
    }
  }
  return verschmelze(bereiche);
}

// Schneller Vorfilter: lohnt sich ein Blick in diesen Text?
export function verdaechtig(text) {
  return /@|Versuch|Attempt/i.test(text || '');
}
