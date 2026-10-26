/* Baustein "KI direkt" — laeuft im Hintergrund (Service Worker / Event-Page).
 *
 * Nur hier wird die KI angefragt, nie aus dem Content Script: Der Hintergrund hat
 * die Host-Berechtigung und unterliegt damit nicht der CORS-Sperre der Webseite —
 * ein lokaler Server muss CORS nicht freischalten.
 * © 2026 A. Spielhoff, CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';
import { basisNorm, ursprungMuster } from './einstellungen.js';

function kopfzeilen(cfg) {
  const h = { 'Content-Type': 'application/json' };
  const schl = String(cfg.schluessel || '').trim();
  if (schl) h.Authorization = 'Bearer ' + schl;
  if (/anthropic\.com/i.test(cfg.basis || '')) {
    if (schl) h['x-api-key'] = schl;
    h['anthropic-version'] = '2023-06-01';
    h['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return h;
}

async function holen(url, init, sekunden) {
  const ab = new AbortController();
  const uhr = setTimeout(() => ab.abort(), Math.max(3, sekunden) * 1000);
  try {
    return await fetch(url, { ...init, signal: ab.signal });
  } finally { clearTimeout(uhr); }
}

async function berechtigt(cfg) {
  try { return await browser.permissions.contains({ origins: [ursprungMuster(cfg.basis)] }); }
  catch (e) { return false; }
}

function netzFehler(e) {
  if (e && e.name === 'AbortError') return { ok: false, fehler: 'zeit' };
  return { ok: false, fehler: 'netz', meldung: String((e && e.message) || e) };
}

export async function kiModelle(cfg) {
  if (!basisNorm(cfg.basis)) return { ok: false, fehler: 'adresse' };
  if (!(await berechtigt(cfg))) return { ok: false, fehler: 'berechtigung' };
  try {
    const r = await holen(basisNorm(cfg.basis) + '/models', { headers: kopfzeilen(cfg) }, 6);
    if (!r.ok) return { ok: false, fehler: 'http', status: r.status, meldung: (await r.text()).slice(0, 300) };
    const j = await r.json();
    const liste = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
    return { ok: true, modelle: liste };
  } catch (e) { return netzFehler(e); }
}

export async function kiAnfrage(cfg, messages, maxTokens) {
  if (!(await berechtigt(cfg))) return { ok: false, fehler: 'berechtigung' };
  let zusatz = {};
  try { zusatz = JSON.parse(cfg.zusatz || '{}') || {}; } catch (e) { return { ok: false, fehler: 'zusatz' }; }
  const body = { model: cfg.modell, temperature: 0, messages, ...zusatz };
  if (maxTokens && body.max_tokens == null) body.max_tokens = maxTokens;
  const senden = async (b) => holen(basisNorm(cfg.basis) + '/chat/completions',
    { method: 'POST', headers: kopfzeilen(cfg), body: JSON.stringify(b) }, Number(cfg.wartezeit) || 120);
  try {
    const t0 = Date.now();
    let r = await senden(body);
    // Manche Cloud-Modelle lehnen temperature 0 ab — dann ohne nochmal.
    if (r.status === 400) {
      const txt = await r.text();
      if (/temperature/i.test(txt)) { const b = { ...body }; delete b.temperature; r = await senden(b); }
      else return { ok: false, fehler: 'http', status: 400, meldung: txt.slice(0, 300) };
    }
    if (!r.ok) return { ok: false, fehler: 'http', status: r.status, meldung: (await r.text()).slice(0, 300) };
    const j = await r.json();
    const text = (((j.choices || [])[0] || {}).message || {}).content || '';
    return { ok: true, text, usage: j.usage || null, ms: Date.now() - t0 };
  } catch (e) { return netzFehler(e); }
}

/** Im Hintergrund-Entrypoint einmal aufrufen. */
export function kiHintergrundStarten() {
  browser.runtime.onMessage.addListener((msg, sender, antwort) => {
    if (!msg || msg.kanal !== 'ki-direkt') return false;
    let p;
    if (msg.typ === 'modelle') p = kiModelle(msg.cfg);
    else if (msg.typ === 'anfrage') p = kiAnfrage(msg.cfg, msg.messages, msg.maxTokens);
    else if (msg.typ === 'optionen') p = Promise.resolve(browser.runtime.openOptionsPage()).then(() => ({ ok: true }));
    else return false;
    p.then(antwort, (e) => antwort({ ok: false, fehler: 'intern', meldung: String(e) }));
    return true;   // Antwort kommt asynchron (Chrome und Firefox)
  });
}
