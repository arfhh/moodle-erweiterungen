/* Punkteverteilung als Diagramm (aus Reviewer 2.1.0 uebernommen, Freitext Grader ab 1.2.0) — wiederverwendbar, ohne DOM-Abhaengigkeit
 * ausser dem erzeugten SVG-Text. Waagerecht die Punkte (0 links, Maximum rechts), senkrecht
 * die Anzahl. Balken = echte Anzahl, darueber die Gauss-Kurve aus Mittelwert und Streuung.
 * Farbe nach Anteil an der Hoechstpunktzahl (Arne, 26.10.2026):
 *   < 35 % rot · 35–45 % rot→gelb · 45–55 % gelb · 55–65 % gelb→gruen · ab 65 % gruen
 * © 2026 A. Spielhoff, CC BY-SA 4.0
 */
const ROT = '#dc2626', GELB = '#eab308', GRUEN = '#16a34a';
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) =>
  Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t)
    .toString(16).padStart(2, '0')).join('');
export const farbe = (p) => (p < 35 ? ROT : p < 45 ? mix(ROT, GELB, (p - 35) / 10) : p <= 55 ? GELB
  : p < 65 ? mix(GELB, GRUEN, (p - 55) / 10) : GRUEN);

const komma = (v, n = 1) => Number(v).toFixed(n).replace('.', ',');
const zahlText = (v) => String(Math.round(v * 100) / 100).replace('.', ',');

/** Schrittweite: die groebste Stufe bis 1, in der alle Werte aufgehen (ganze Punkte -> 1,
 *  halbe -> 0,5); bei sehr hoher Hoechstpunktzahl groebere Klassen, hoechstens ~22 Balken. */
function schrittWahl(werte, max) {
  const passt = (s) => werte.every((w) => Math.abs(w / s - Math.round(w / s)) < 1e-6);
  for (const s of [1, 0.5, 0.25]) if (passt(s) && max / s <= 22) return s;
  for (const s of [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50]) if (max / s <= 22) return s;
  return Math.ceil(max / 20);
}

/**
 * werte: Punkte je Person; max: Hoechstpunktzahl; opt: { schritt, einheit, wort, breite, hoehe }. Liefert { svg, mittel, streuung, n }.
 * Jeder Wert faellt in den Balken der naechstgelegenen Stufe; die Beschriftung steht
 * genau unter der Balkenmitte.
 */
export function verteilungSvg(werte, max, opt = {}) {
  const w = werte.filter((x) => Number.isFinite(x));
  const n = w.length;
  if (!n || !(max > 0)) return { svg: '', n: 0 };
  const schritt = opt.schritt || schrittWahl(w, max);
  const stufen = [];
  for (let x = 0; x <= max + 1e-9; x += schritt) stufen.push(Math.round(x * 1000) / 1000);
  if (stufen[stufen.length - 1] < max - 1e-9) stufen.push(max);
  const anz = stufen.map(() => 0);
  w.forEach((x) => {
    let bi = 0;
    stufen.forEach((s, i) => { if (Math.abs(s - x) < Math.abs(stufen[bi] - x)) bi = i; });
    anz[bi]++;
  });
  const mittel = w.reduce((a, b) => a + b, 0) / n;
  const streuung = Math.sqrt(w.reduce((a, b) => a + (b - mittel) ** 2, 0) / n);

  const W = opt.breite || 400, H = opt.hoehe || 210, L = 30, R = 10, T = 12, B = 40;
  const bw = (W - L - R) / stufen.length;
  // Hoehe auch fuer die Spitze der Gauss-Kurve, sonst wird sie oben abgeschnitten.
  const spitze = streuung > 0 ? n * schritt / (streuung * Math.sqrt(2 * Math.PI)) : 0;
  const hmax = Math.max(2, ...anz, Math.ceil(spitze));
  const x = (i) => L + bw * i + bw / 2;
  const y = (c) => T + (H - T - B) * (1 - c / hmax);
  const tick = hmax <= 6 ? 1 : hmax <= 12 ? 2 : 5;
  const jedes = stufen.length > 12 ? 2 : 1;   // bei vielen Balken nur jede zweite Zahl

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" `
    + `aria-label="Punkteverteilung" font-family="system-ui, sans-serif" font-size="11">`;
  for (let c = 0; c <= hmax; c += tick) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(c)}" y2="${y(c)}" stroke="#e2e8f0"/>`
      + `<text x="${L - 5}" y="${y(c) + 4}" text-anchor="end" fill="#64748b">${c}</text>`;
  }
  stufen.forEach((st, i) => {
    const bb = Math.min(bw * 0.5, 26);
    if (anz[i]) {
      s += `<rect x="${x(i) - bb / 2}" y="${y(anz[i])}" width="${bb}" height="${y(0) - y(anz[i])}" rx="2" `
        + `fill="${farbe(st / max * 100)}"><title>${zahlText(st)} P: ${anz[i]}</title></rect>`;
    }
    if (i % jedes === 0 || i === stufen.length - 1) {
      s += `<text x="${x(i)}" y="${H - B + 14}" text-anchor="middle" fill="#334155">${zahlText(st)}</text>`;
    }
  });
  if (streuung > 0) {
    let d = '';
    for (let k = 0; k <= 120; k++) {
      const v = -schritt / 2 + (max + schritt) * k / 120;
      const g = n * schritt / (streuung * Math.sqrt(2 * Math.PI)) * Math.exp(-((v - mittel) ** 2) / (2 * streuung ** 2));
      const px = L + bw * (v / schritt) + bw / 2;
      d += (k ? 'L' : 'M') + px.toFixed(1) + ',' + y(g).toFixed(1);
    }
    s += `<path d="${d}" fill="none" stroke="#1e293b" stroke-width="1.6"/>`;
  }
  s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8"/>`;
  const einheit = opt.einheit || 'Punkte', wort = opt.wort || 'Versuche';
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" fill="#64748b">${einheit} (max ${zahlText(max)}) · `
    + `Ø ${komma(mittel)} · Streuung ${komma(streuung)} · ${n} ${wort}</text></svg>`;
  return { svg: s, mittel, streuung, n, schritt };
}
