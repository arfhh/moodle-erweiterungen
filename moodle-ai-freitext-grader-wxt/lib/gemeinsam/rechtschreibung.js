/* Rechtschreibabzug – EINE Rechnung fuer Kurztest und Klausur (seit 1.0.0).
 *
 * Die KI zaehlt nur Fehler (schwer = doppelt). Daraus rechnet die Erweiterung den
 * Anteil vom eingestellten Hoechstabzug:
 *   - Antworten ab 40 Woertern: Fehlerquotient (Fehler je 100 Woerter), wie ihn
 *     Deutschlehrkraefte verwenden – bis 1 kein Abzug, bis 2 ein Drittel, bis 3,5
 *     zwei Drittel, darueber der volle Abzug.
 *   - kuerzere Antworten (typisch im Kurztest): Bei 20 Woertern macht ein einziger
 *     Fehler schon einen Quotienten von 5 – das waere sofort voller Abzug. Deshalb
 *     zaehlt dort die absolute Zahl: 1 Fehler ein Drittel, 2 die Haelfte, 3 zwei
 *     Drittel, 4 fuenf Sechstel, ab 5 voll.
 * Der Hoechstabzug bezieht sich immer auf die Punkte, um die es geht: im Kurztest die
 * der Aufgabe, in der Klausur die Gesamtpunktzahl.
 */
export const RS_LEITER = [[1.0, 0], [2.0, 1 / 3], [3.5, 2 / 3], [Infinity, 1]];
export const RS_ABSOLUT = [0, 1 / 3, 1 / 2, 2 / 3, 5 / 6, 1]; // 0,1,2,3,4,5+ Fehler
export const MINDESTWOERTER = 40;

export function woerter(text) {
  return (String(text || '').trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

// Schwere Fehler zaehlen doppelt – welche schwer sind, sagt die KI.
export function fehlerGewicht(liste) {
  return (liste || []).reduce((s, f) => s + (f && f.schwer ? 2 : 1), 0);
}

// Anteil (0…1) vom Hoechstabzug.
export function rsAnteil(fehlerGewichtet, wortzahl) {
  if (wortzahl < MINDESTWOERTER) {
    const i = Math.min(Math.max(0, Math.round(fehlerGewichtet)), RS_ABSOLUT.length - 1);
    return RS_ABSOLUT[i];
  }
  const dichte = wortzahl > 0 ? (fehlerGewichtet * 100) / wortzahl : 0;
  for (const [grenze, anteil] of RS_LEITER) if (dichte <= grenze) return anteil;
  return 1;
}

// Ein Satz fuer die Oberflaeche, gleich in beiden Wegen.
export function rsErklaerung(prozent, bezug) {
  const p = Number(prozent) || 0;
  if (!p) return 'Sprache kostet keine Punkte. Eine Rückmeldung zur Sprache gibt es trotzdem.';
  return 'Höchstens ' + String(p).replace('.', ',') + ' % ' + (bezug || 'der Punkte') + '. '
    + 'Kurze Antworten (unter 40 Wörtern): 1 Fehler kostet ein Drittel davon, ab 5 Fehlern alles. '
    + 'Längere Antworten nach Fehlerquotient: bis 1 Fehler je 100 Wörter nichts, ab 3,5 alles. '
    + 'Schwere Fehler zählen doppelt.';
}

// Derselbe Text fuer die Prompts: was mit der Zaehlung geschieht.
export function rsPromptSatz(prozent, bezug) {
  return `Zur Einordnung, was mit deiner Zählung geschieht: Der Höchstabzug ist gerade auf
${String(Number(prozent) || 0).replace('.', ',')} % ${bezug || 'der Punkte'} eingestellt. Bei Antworten unter 40 Wörtern kostet
1 Fehler ein Drittel davon, 2 die Hälfte, 3 zwei Drittel, 4 fünf Sechstel, ab 5 den vollen
Abzug. Bei längeren Antworten zählt der Fehlerquotient (Fehler je 100 Wörter): bis 1 kein
Abzug, bis 2 ein Drittel, bis 3,5 zwei Drittel, darüber der volle Abzug.`;
}
