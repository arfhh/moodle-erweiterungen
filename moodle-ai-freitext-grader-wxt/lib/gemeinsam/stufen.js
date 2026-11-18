/* Moodle AI Freitext Grader — Bewertungsstufen je Teilaufgabe (seit 1.7.0).
 * Bis 5 Punkte Viertel (100/75/50/25/0), ueber 5 Punkte Fuenftel (100/80/60/40/20/0):
 * Bei kleinen Aufgaben wuerden Fuenftel beim Runden auf 0,5 Punkte zusammenfallen.
 * Die KI beurteilt, der Code rastet ein: Werte aus beiden Skalen werden angenommen
 * (aeltere Horizonte mit Vierteln bei grossen Aufgaben bleiben gueltig), alles andere
 * rastet auf die naechste Stufe der passenden Skala ein, bei Gleichstand die niedrigere.
 * A. Spielhoff · MIT-Lizenz
 */
export const GRENZE_PUNKTE = 5;
export const STUFEN_KLEIN = [100, 75, 50, 25, 0];
export const STUFEN_GROSS = [100, 80, 60, 40, 20, 0];

export function stufenFuer(punkte) {
  return Number(punkte) > GRENZE_PUNKTE ? STUFEN_GROSS : STUFEN_KLEIN;
}

export function aufStufe(prozent, punkte) {
  const p = Math.max(0, Math.min(100, Number(prozent) || 0));
  if (STUFEN_KLEIN.includes(p) || STUFEN_GROSS.includes(p)) return p;
  let best = 0, abstand = Infinity;
  stufenFuer(punkte).forEach(s => {
    const d = Math.abs(s - p);
    if (d < abstand || (d === abstand && s < best)) { best = s; abstand = d; }
  });
  return best;
}
