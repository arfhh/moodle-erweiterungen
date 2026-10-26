/* Baustein "KI direkt" — Einstellungen (wiederverwendbar, ohne Bezug zum Reviewer)
 *
 * Eine KI ohne Kopieren ansprechen: lokal (Bionic, LM Studio, Ollama …) oder
 * optional ueber eine Cloud-API mit eigenem Schluessel. Alles OpenAI-kompatibel
 * (POST <basis>/chat/completions, GET <basis>/models). Standard: AUS.
 * Nichts ist fest verdrahtet: Adresse und Modell sind frei einstellbar.
 * © 2026 A. Spielhoff, CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';

export const KI_KEY = 'kiDirekt';

// Qwen & Co. denken sonst laut mit — kostet Zeit und verdirbt das JSON.
const DENKEN_AUS = '{"reasoning_effort":"none","chat_template_kwargs":{"enable_thinking":false}}';

export const VORLAGEN = {
  bionic:    { name: 'Bionic (lokal)',            basis: 'http://127.0.0.1:1235/v1',  zusatz: DENKEN_AUS },
  lmstudio:  { name: 'LM Studio (lokal)',         basis: 'http://127.0.0.1:1234/v1',  zusatz: DENKEN_AUS },
  ollama:    { name: 'Ollama (lokal)',            basis: 'http://127.0.0.1:11434/v1', zusatz: DENKEN_AUS },
  openai:    { name: 'OpenAI (Cloud, API-Schlüssel)',    basis: 'https://api.openai.com/v1',    zusatz: '{}' },
  anthropic: { name: 'Anthropic Claude (Cloud, API-Schlüssel)', basis: 'https://api.anthropic.com/v1', zusatz: '{}' },
  eigene:    { name: 'Eigene Adresse',            basis: '',                          zusatz: '{}' }
};

export const KI_STANDARD = {
  an: false, vorlage: 'bionic', basis: VORLAGEN.bionic.basis, modell: '', schluessel: '',
  wartezeit: 120, paket: 20, zusatz: DENKEN_AUS
};

export async function kiLaden() {
  try {
    const r = await browser.storage.local.get([KI_KEY]);
    return { ...KI_STANDARD, ...((r && r[KI_KEY]) || {}) };
  } catch (e) { return { ...KI_STANDARD }; }
}

export async function kiSpeichern(neu) {
  const alt = await kiLaden();
  const cfg = { ...alt, ...neu };
  try { await browser.storage.local.set({ [KI_KEY]: cfg }); } catch (e) { /* toter Kontext */ }
  return cfg;
}

export function basisNorm(basis) {
  return String(basis || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}

/** Lokal = dieser Rechner oder ein Rechner im eigenen Netz. Alles andere zaehlt als Cloud. */
export function istLokal(basis) {
  try {
    const h = new URL(basisNorm(basis)).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local')
      || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch (e) { return false; }
}

/** Berechtigungsmuster fuer die Adresse (Ports zaehlen in Mustern nicht mit). */
export function ursprungMuster(basis) {
  const u = new URL(basisNorm(basis));
  return `${u.protocol}//${u.hostname}/*`;
}
