/* Einstellungen unter ⚙, die fuer BEIDE Wege gelten (seit 1.0.0).
 * Sie liegen gemeinsam in magSettings, damit Kurztest-Uebersicht und Bewertungsseite
 * dasselbe zeigen und dasselbe tun.
 */
export const KI_HINWEIS_STANDARD =
  'Dieses Feedback wurde von der Lehrkraft mithilfe von KI-Unterstützung erstellt und geprüft.';

export const GEMEINSAME_OPTIONEN = ['kiHinweis', 'kiHinweisText', 'entferneQuellen', 'kompaktPrompt'];

export const GEMEINSAM_STANDARD = {
  kiHinweis: true,
  kiHinweisText: KI_HINWEIS_STANDARD,
  entferneQuellen: true,
  kompaktPrompt: false
};

// Quellenmarken, wie manche KI-Chats sie anhaengen: [1], [cite:3], 【4†source】.
export function ohneQuellen(text) {
  return String(text == null ? '' : text)
    .replace(/\[\w+:\d+\]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\[\d{1,2}\](?!\()/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}

// Wendet ohneQuellen auf alle Texte in einem Objekt/Array an.
export function ohneQuellenTief(x) {
  if (typeof x === 'string') return ohneQuellen(x);
  if (Array.isArray(x)) return x.map(ohneQuellenTief);
  if (x && typeof x === 'object') {
    const o = {}; Object.keys(x).forEach((k) => { o[k] = ohneQuellenTief(x[k]); }); return o;
  }
  return x;
}

// Kompakter Bewertungsblock fuer die Klausur (Gegenstueck zum kompakten Kurztest-Prompt).
export const KLAUSUR_KOMPAKT = `BEWERTUNGSLOGIK (KOMPAKT)
Falls du Zugriff auf die Skills „2-didaktik-bewertung" und „3-moodle-erweiterungen"
von A. Spielhoff hast: Wende deren Klausur-Bewertungslogik an — Erfüllungsgrad je Aufgabe
nur in den Stufen 100, 75, 50, 25, 0, jede Stufe an einer Formulierung des Horizonts
verankert, Operator geprüft; Sprachfehler einzeln zählen (Wort, Korrektur, Kategorie:
satzbau · kasus · zeitform · grossschreibung · fachbegriff · rechtschreibung ·
zeichensetzung · umgangssprache; schwer = doppelt); jede Aufgabe bekommt eine Begründung,
auch eine vollständig richtige. Du vergibst KEINE Punkte und schreibst keine Zahlen in
die Begründungen — das rechnet die Erweiterung.

Hast du diese Skills NICHT: Bitte um den ausführlichen Prompt (⚙ → Häkchen
„Kompakter Prompt" ausschalten) statt zu raten.`;
