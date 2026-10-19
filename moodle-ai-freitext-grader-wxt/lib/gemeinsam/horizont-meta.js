/* Moodle AI Freitext Grader — Verwaltungszeilen im Erwartungshorizont.
 *
 * Ab 0.9 stehen im Horizont nur Angaben, die zur AUFGABE gehoeren:
 *   [Fach: Chemie] [Jahrgang: 9] [Niveau: gymnasial] [Feedback: Mittel]
 * Rechtschreibung, Punkteschritte und Anrede gehoeren zur BEWERTUNG und werden dort
 * eingestellt. Alte Zeilen [Rechtschreibung: …] / [Punkteschritte: …] werden nur noch
 * erkannt und ausgeblendet, aber nicht mehr verwendet (keine zweite Quelle).
 * Alle Verwaltungszeilen gehen nie in einen Prompt.
 * A. Spielhoff · CC BY-SA 4.0
 */

const ZEILEN = {
  fach:     /^\s*\[?\s*fach\s*:\s*([^\]\n]+?)\s*\]?\s*$/im,
  jahrgang: /^\s*\[?\s*jahrgang\s*:\s*(\d{1,2})\s*\]?\s*$/im,
  niveau:   /^\s*\[?\s*(?:kurs)?niveau\s*:\s*(gymnasial|mittel|einfach|[GME])\b[^\]\n]*\]?\s*$/im,
  feedback: /^\s*\[?\s*feedback\s*[:\-]?\s*(kurz|mittel|ausführlich|umfangreich)\s*\]?\s*$/im
};
const ALT = /^\s*\[?\s*(?:rechtschreibung\s*[:\-]?\s*\d{1,3}(?:[.,]\d+)?\s*%|punkteschritte\s*[:\-]?\s*[\d.,]+)\s*\]?\s*$/i;

// Ist diese Zeile eine Verwaltungszeile (neu oder alt)?
export function istMetaZeile(z) {
  const t = String(z || '').trim();
  if (!t) return false;
  return ALT.test(t) || Object.values(ZEILEN).some(re => new RegExp(re.source, 'i').test(t));
}

// Liest die Angaben aus den ersten Zeilen des Horizonts (Text, nicht HTML).
export function metaAusText(text) {
  const kopf = String(text || '').split('\n').map(z => z.trim()).filter(Boolean).slice(0, 10).join('\n');
  const m = {};
  const f = kopf.match(ZEILEN.fach);     if (f) m.fach = f[1].trim();
  const j = kopf.match(ZEILEN.jahrgang); if (j) m.jahrgang = j[1];
  const n = kopf.match(ZEILEN.niveau);   if (n) m.niveau = n[1].charAt(0).toUpperCase();
  const b = kopf.match(ZEILEN.feedback); if (b) m.feedback = b[1].charAt(0).toUpperCase() + b[1].slice(1).toLowerCase();
  return m;
}

// Niveau intern als Kuerzel (G/M/E), angezeigt und gespeichert als Wort (seit 1.0.1).
export const NIVEAU_WORT = { G: 'gymnasial', M: 'mittel', E: 'einfach' };

export function metaZeilenHtml({ fach, jahrgang, niveau, feedback } = {}) {
  return (fach ? '<p>[Fach: ' + esc(fach) + ']</p>' : '')
    + (jahrgang ? '<p>[Jahrgang: ' + esc(jahrgang) + ']</p>' : '')
    + (niveau ? '<p>[Niveau: ' + esc(NIVEAU_WORT[niveau] || niveau) + ']</p>' : '')
    + (feedback ? '<p>[Feedback: ' + esc(feedback) + ']</p>' : '');
}

// Sek I bis Jahrgang 10, Sek II ab 11
export function stufeVon(jahrgang) {
  const j = parseInt(jahrgang, 10);
  return (!isNaN(j) && j >= 11) ? 'sek2' : 'sek1';
}
// wahl: 'auto' | 'du' | 'sie'
export function anredeFuer(jahrgang, wahl) {
  if (wahl === 'du') return 'du';
  if (wahl === 'sie') return 'sie';
  return stufeVon(jahrgang) === 'sek2' ? 'sie' : 'du';
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
