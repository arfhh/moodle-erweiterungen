/* Moodle AI Freitext Grader — Zustaendigkeits-Marker (gemeinsam fuer beide Modi)
 *
 * Erste Zeile des Horizonts sagt, wie eine Frage bewertet wird:
 *   [moodle-ai-freitext: kurztest]  -> Kurztest-Weg (frueher Coach)
 *   [moodle-ai-freitext: klausur]   -> Klausur-Weg  (frueher Grader)
 * Alte Marker bleiben gueltig: [moodle-ai-coach] = Kurztest, [moodle-ai-grader] = Klausur.
 * Der Marker wird IMMER von der Erweiterung gesetzt, nie von der KI, und geht nie
 * in einen Prompt.
 *
 * © 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
 */

export const MARKER_KURZTEST = '[moodle-ai-freitext: kurztest]';
export const MARKER_KLAUSUR = '[moodle-ai-freitext: klausur]';

const KERN = String.raw`moodle[-\s]?ai[-\s]?(?:(coach|grader)|freitext(?:[-\s]?grader)?\s*[:\-–]?\s*(kurztest|klausur))`;

// Am Zeilenanfang, toleriert Klammern/keine, Gross-/Kleinschreibung, Text dahinter.
export const MARKER_RE = new RegExp(String.raw`^\s*[\[(]?\s*` + KERN + String.raw`\s*[\])]?\s*[:.–-]?\s*`, 'i');
// Ganze Zeile irgendwo im Text (fuer das Entfernen eines Markers, der nicht Zeile 1 ist).
export const MARKER_ZEILE_RE_M = new RegExp(String.raw`^\s*[\[(]?\s*` + KERN + String.raw`\s*[\])]?\s*[:.–-]?\s*$`, 'im');

// 'coach' (= Kurztest) | 'grader' (= Klausur) | null — aus einem MARKER_RE-Treffer.
export function markerWer(m) {
  if (!m) return null;
  if (m[1]) return m[1].toLowerCase();
  return /kurztest/i.test(m[2] || '') ? 'coach' : 'grader';
}

// 'kurztest' | 'klausur' | null — fuer Anzeige und Rundgang.
export function modusAus(text) {
  const erste = String(text || '').split('\n').map(z => z.trim()).find(Boolean) || '';
  const wer = markerWer(erste.match(MARKER_RE));
  return wer === 'coach' ? 'kurztest' : wer === 'grader' ? 'klausur' : null;
}
