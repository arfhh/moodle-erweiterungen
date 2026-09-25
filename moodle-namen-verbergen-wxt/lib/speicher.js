/* Moodle Namen verbergen — gemeinsamer Zugriff auf den Speicher.
 * storage.sync (geraeteuebergreifend, wenn der Browser-Account synchronisiert),
 * sonst storage.local. Einstellung als ein Objekt unter einem Schluessel.
 *
 * A. Spielhoff · CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';

export const SCHLUESSEL = 'namenVerbergen';
export const STANDARD = { aktiv: false, staerke: 7, avatare: true, eigene: '' };

function bereiche() {
  return [browser.storage.sync, browser.storage.local].filter(Boolean);
}

export async function ladeEinstellung() {
  for (const b of bereiche()) {
    try {
      const r = await b.get(SCHLUESSEL);
      if (r && r[SCHLUESSEL]) return { ...STANDARD, ...r[SCHLUESSEL] };
    } catch (e) { /* naechster Bereich */ }
  }
  return { ...STANDARD };
}

export async function speichereEinstellung(e) {
  for (const b of bereiche()) {
    try {
      await b.set({ [SCHLUESSEL]: e });
      return true;
    } catch (err) { /* naechster Bereich */ }
  }
  return false;
}
