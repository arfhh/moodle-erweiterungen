/* Moodle AI Freitext Grader — Rundgang durch einen Test.
 *
 * Die Uebersicht (Kurztest-Weg) kennt nach dem Durchsuchen alle Klausur-Fragen des
 * Tests. Sie legt die Liste je Test (cmid) ab; die Einzelseite (Klausur-Weg) liest sie
 * und springt nach dem Eintragen zur naechsten Klausur-Frage, am Ende zur Uebersicht.
 *
 * © 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';

const schluessel = (cmid) => 'freitextRundgang_' + cmid;

export function rundgangSpeichern(cmid, liste) {
  try {
    return browser.storage.local.set({ [schluessel(cmid)]: { liste, stand: Date.now() } });
  } catch (e) { return Promise.resolve(); }
}

export function rundgangLaden(cmid) {
  return new Promise((fertig) => {
    try {
      browser.storage.local.get([schluessel(cmid)], (r) => fertig((r && r[schluessel(cmid)]) || null));
    } catch (e) { fertig(null); }
  });
}

export function einzelseiteUrl(cmid, e) {
  return location.origin + location.pathname + '?id=' + cmid + '&mode=grading&slot=' + e.slot
    + '&qid=' + e.qid + '&grade=needsgrading&qperpage=100';
}

export function uebersichtUrl(cmid) {
  return location.origin + location.pathname + '?id=' + cmid + '&mode=grading';
}

// Position der aktuellen Seite im Rundgang: { index, gesamt, naechste } oder null.
export function rundgangPosition(rundgang, slot, qid) {
  if (!rundgang || !rundgang.liste || !rundgang.liste.length) return null;
  const i = rundgang.liste.findIndex((e) => String(e.slot) === String(slot) && String(e.qid) === String(qid));
  if (i < 0) return null;
  return { index: i, gesamt: rundgang.liste.length, naechste: rundgang.liste[i + 1] || null };
}
