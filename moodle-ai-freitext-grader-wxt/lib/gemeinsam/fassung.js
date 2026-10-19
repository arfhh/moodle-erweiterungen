/* Moodle AI Freitext Grader — neueste Fragenfassung finden.
 * Ein Versuch haengt an der Fassung, mit der er geschrieben wurde; Moodle zeigt auf der
 * Bewertungsseite deren Horizont. Massstab ist aber der aktuelle Horizont der Lehrkraft.
 * (Uebernommen aus dem Kurztest-Weg, dort seit Coach 1.8 im Einsatz.)
 * A. Spielhoff · CC BY-SA 4.0
 */
async function dok(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return new DOMParser().parseFromString(await r.text(), 'text/html');
}

// Abzeichen „v2 (von 3)" an einem Fragenblock
export function fassungAusAbzeichen(block) {
  if (!block) return null;
  const b = [...block.querySelectorAll('.badge, .info span')]
    .map((e) => e.textContent.trim())
    .find((t) => /^v\d+\s*\(von\s*\d+\)$/i.test(t));
  const m = b && b.match(/^v(\d+)\s*\(von\s*(\d+)\)$/i);
  return m ? { ist: +m[1], gesamt: +m[2] } : null;
}

// Liefert { qid, html } der neuesten Fassung oder null. urlFuer(id) baut die Bearbeiten-Adresse.
export async function neuesteFassungHorizont(qid, urlFuer) {
  const d = await dok(urlFuer(qid));
  const verlauf = [...d.querySelectorAll('a')].find((a) => /history\.php/.test(a.getAttribute('href') || ''));
  if (!verlauf) return null;
  const hist = await dok(new URL(verlauf.getAttribute('href'), urlFuer(qid)).href);
  let neueId = null;
  for (const tr of hist.querySelectorAll('table tbody tr')) {
    for (const a of tr.querySelectorAll('a')) {
      const m = (a.getAttribute('href') || '').match(/question\.php\?[^"']*?\bid=(\d+)/);
      if (m) { neueId = m[1]; break; }
    }
  }
  if (!neueId || String(neueId) === String(qid)) return null;
  const neu = await dok(urlFuer(neueId));
  const feld = neu.querySelector('[name="graderinfo[text]"]');
  const html = feld ? String(feld.value || '').trim() : '';
  return html ? { qid: neueId, html } : null;
}
