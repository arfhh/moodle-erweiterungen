/* Baustein "KI direkt" — Aufrufe aus Content Script oder Optionsseite.
 * © 2026 A. Spielhoff, CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';

export async function kiNachricht(typ, daten) {
  try {
    const r = await browser.runtime.sendMessage({ kanal: 'ki-direkt', typ, ...daten });
    return r || { ok: false, fehler: 'intern', meldung: 'keine Antwort vom Hintergrund' };
  } catch (e) {
    return { ok: false, fehler: 'kontext', meldung: String((e && e.message) || e) };
  }
}

/** Klartext fuer jede Fehlerart — nie ein roher Stacktrace. */
export function kiFehlerText(r, cfg) {
  const wo = (cfg && cfg.basis) || 'die eingestellte Adresse';
  switch (r && r.fehler) {
    case 'netz': return `Keine Verbindung zu ${wo}. Läuft der KI-Server (z. B. Bionic, LM Studio, Ollama)?`;
    case 'zeit': return 'Die KI hat nicht rechtzeitig geantwortet. Wartezeit unter „Erweitert" erhöhen oder kleinere Pakete wählen.';
    case 'berechtigung': return `Die Erweiterung darf ${wo} noch nicht ansprechen. In den KI-Einstellungen „Verbindung testen" klicken und die Berechtigung erlauben.`;
    case 'adresse': return 'Keine Adresse eingestellt.';
    case 'zusatz': return 'Die Zusatzparameter sind kein gültiges JSON.';
    case 'kontext': return 'Die Erweiterung wurde neu geladen – bitte diese Seite neu laden.';
    case 'http':
      if (r.status === 401 || r.status === 403) return 'Zugang abgelehnt – API-Schlüssel prüfen.';
      if (r.status === 404) return 'Adresse oder Modell nicht gefunden (404). Endet die Adresse auf /v1?';
      if (r.status === 429) return 'Zu viele Anfragen oder Guthaben aufgebraucht (429).';
      return `Der Server meldet Fehler ${r.status}: ${r.meldung || ''}`;
    default: return 'Unbekannter Fehler: ' + ((r && r.meldung) || '');
  }
}

/** JSON aus einer Modellantwort: Denkblock und Codezaun entfernen, ersten {…}-Block nehmen. */
export function jsonAusAntwort(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (e) { /* weiter */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('Antwort enthielt kein JSON.');
}
