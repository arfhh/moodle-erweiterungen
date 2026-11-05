/* Ablauf gespeicherter Schuelerdaten (Datenschutz, ab November 2026)
 *
 * Ausgelesene Daten zu Tests oder Aufgaben (ohne Namen) bleiben nur so lange im
 * Browser, wie sie gebraucht werden: 90 Tage nach dem letzten Speichern loescht die
 * Erweiterung sie selbst. allesLoeschen() steckt hinter dem Knopf
 * "Gespeicherte ... loeschen". Einstellungen sind nicht betroffen.
 * Ein Verzeichnis (Schluessel -> Zeitpunkt) merkt sich, wann was zuletzt gespeichert
 * wurde; Daten aus aelteren Versionen ohne Eintrag bekommen beim ersten Lauf den
 * heutigen Tag, ihre Frist beginnt also jetzt.
 * (c) 2026 A. Spielhoff, MIT-Lizenz
 */
import { browser } from 'wxt/browser';

export const ABLAUF_TAGE = 90;
const INDEX = 'ablaufVerzeichnis';
const TAG_MS = 86400000;

async function verzeichnis() {
  const r = await browser.storage.local.get([INDEX]);
  return (r && r[INDEX]) || null;
}

/** Nach jedem Speichern aufrufen: Frist fuer diesen Schluessel neu beginnen. */
export async function merken(schluessel) {
  try {
    const v = (await verzeichnis()) || {};
    v[schluessel] = Date.now();
    await browser.storage.local.set({ [INDEX]: v });
  } catch (e) { /* toter Kontext — beim naechsten Mal */ }
}

/** Beim Start: alles loeschen, was laenger als ABLAUF_TAGE nicht gespeichert wurde. */
export async function aufraeumen(praefixe) {
  try {
    const jetzt = Date.now();
    let v = await verzeichnis();
    if (!v) {
      v = {};
      const alles = (await browser.storage.local.get(null)) || {};
      Object.keys(alles).forEach((k) => { if (praefixe.some((p) => k.startsWith(p))) v[k] = jetzt; });
    }
    const weg = Object.keys(v).filter((k) => jetzt - v[k] > ABLAUF_TAGE * TAG_MS);
    if (weg.length) {
      await browser.storage.local.remove(weg);
      weg.forEach((k) => delete v[k]);
    }
    await browser.storage.local.set({ [INDEX]: v });
  } catch (e) { /* egal */ }
}

/** Knopf: alle Daten mit diesen Praefixen sofort loeschen. Rueckgabe: Anzahl, -1 bei Fehler. */
export async function allesLoeschen(praefixe) {
  try {
    const alles = (await browser.storage.local.get(null)) || {};
    const weg = Object.keys(alles).filter((k) => praefixe.some((p) => k.startsWith(p)));
    if (weg.length) await browser.storage.local.remove(weg);
    await browser.storage.local.set({ [INDEX]: {} });
    return weg.length;
  } catch (e) { return -1; }
}
