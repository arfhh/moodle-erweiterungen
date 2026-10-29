/* Moodle AI Reviewer — Bewertung ueber "KI direkt" (ab 2.0.0)
 *
 * Kurzer, modellneutraler Prompt (gemessen 26.10.2026 mit Qwen: 38/41 exakt wie die
 * Lehrkraft, mit Ankern). Funde nacheinander in Paketen, keine parallelen Anfragen.
 * Ergebnis im selben Format wie das JSON aus dem Chat — beide Wege muenden in die Vorschau.
 */
import { kiNachricht, kiFehlerText, jsonAusAntwort } from './ki-direkt/client.js';
import { KATEGORIEN, sacWert } from './regeln.js';

const systemBewertung = () => `Du bewertest Schülerantworten in Lücken eines Kurztests gegen die hinterlegten richtigen Antworten. Vergib je Lücke genau einen Prozentwert:
100 = richtig oder gleichwertiges Synonym, andere gültige Wortform
Nur Groß-/Kleinschreibung falsch: bei Typ SAC genau ${sacWert()}, bei Typ SA 100
75 = ein einzelner klarer Tippfehler, Wort eindeutig erkennbar
50 = mehrere Tippfehler, Wort noch mit Mühe erkennbar
25 = nur Wortstamm/Wortanfang erkennbar
0 = falsches Wort oder anderer Gegenstand (auch wenn fachlich existent), Rateversuch, sinnlos, aus dem Satz abgeschrieben
Regeln: Vergleiche mit ALLEN richtigen Antworten. Beurteile das Wort für DIESE Lücke im Satz, nicht ob der Satz fachlich stimmt (Verneinungen!). Sind bekannte Varianten angegeben, verankere dich daran: eine ähnlich fehlerhafte Antwort bekommt denselben Wert. Nie 0,01.
Antworte NUR mit JSON: {"bewertungen":[{"id":1,"prozent":75,"grund":"höchstens 12 Wörter","kategorie":"Tippfehler"}]} – für jede id genau ein Eintrag. kategorie aus: ${KATEGORIEN.join(', ')}. In Texten keine doppelten Anführungszeichen.`;

const SYSTEM_FEEDBACK = `Du schreibst kurze Rückmeldungen an Schülerinnen und Schüler zu einem Chemie-Kurztest. Je Versuch EIN Text:
- Nenne das gesuchte Lösungswort (ausdrücklich erwünscht), bei mehreren Lücken getrennt: Lücke 1: … · Lücke 2: …
- Jede leere Lücke mit ihrer Nummer nennen.
- Bei Verwechslungsgefahr ein erklärender Satz, sonst nichts weiter. Direkt ansprechen (du), sachlich, ohne Floskeln.
Antworte NUR mit JSON: {"kommentare":[{"id":1,"text":"…"}]} – für jede id genau ein Eintrag. Im Text keine doppelten Anführungszeichen, nimm 'einfache'.`;

const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, "'") + '"';

function pakete(liste, n) {
  const g = Math.max(1, Number(n) || 20), out = [];
  for (let i = 0; i < liste.length; i += g) out.push(liste.slice(i, i + g));
  return out;
}

async function paketFragen(cfg, system, text, maxTokens) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: text }];
  let r = await kiNachricht('anfrage', { cfg, messages, maxTokens });
  // Ein Netz- oder JSON-Aussetzer kommt vor — einmal wiederholen, dann aufgeben.
  for (let versuch = 0; versuch < 2; versuch++) {
    if (r.ok) {
      try { return { ok: true, json: jsonAusAntwort(r.text), usage: r.usage }; }
      catch (e) { if (versuch === 1) return { ok: false, meldung: 'Antwort war kein gültiges JSON.' }; }
    } else if (['berechtigung', 'adresse', 'zusatz', 'kontext'].includes(r.fehler) || (r.status === 401 || r.status === 403)) {
      return { ok: false, meldung: kiFehlerText(r, cfg), abbruch: true };
    } else if (versuch === 1) return { ok: false, meldung: kiFehlerText(r, cfg) };
    r = await kiNachricht('anfrage', { cfg, messages, maxTokens });
  }
  return { ok: false, meldung: 'unbekannt' };
}

const tokensAddieren = (s, u) => {
  if (!u) return;
  s.ein += Number(u.prompt_tokens || u.input_tokens || 0);
  s.aus += Number(u.completion_tokens || u.output_tokens || 0);
};

/**
 * daten: Ausgabe von datenFuerKi (ohne Regel-Faelle). Liefert
 * { bewertungen, kommentare, fehler: [..], tokens: { ein, aus }, sekunden }.
 */
export async function kiDirektBewerten(daten, cfg, onFortschritt) {
  const t0 = Date.now();
  const tokens = { ein: 0, aus: 0 };
  const fehler = [];
  const fragen = daten.fragen || {};

  // 1. Luecken bewerten
  const items = [];
  (daten.funde || []).forEach((f) => (f.luecken || []).forEach((l) => {
    const loes = ((fragen[f.frage] || {}).loesungen || []).find((x) => x.nr === l.nr) || {};
    items.push({ id: items.length + 1, f, l, loes });
  }));
  const ergebnis = new Map();
  const pk = pakete(items, cfg.paket);
  for (let i = 0; i < pk.length; i++) {
    onFortschritt(`Bewerte Paket ${i + 1} von ${pk.length} (${items.length} Lücken) …`, i / (pk.length + 1));
    const text = pk[i].map((it) => {
      const bek = Object.entries(it.loes.bekannte_varianten || {}).slice(0, 8)
        .map(([t, p]) => `${q(t)}=${p}`).join(', ');
      return `id ${it.id}: Typ ${it.loes.typ || '?'} | Satz: ${q(it.l.kontext || '')} | Lücke ${it.l.nr}`
        + ` | richtig: ${(it.loes.richtig || []).map(q).join(' / ') || '(unbekannt)'}`
        + ` | Schülerantwort: ${q(it.l.antwort)}` + (bek ? ` | bekannte Varianten: ${bek}` : '');
    }).join('\n');
    const r = await paketFragen(cfg, systemBewertung(), text, 60 * pk[i].length + 200);
    if (!r.ok) {
      fehler.push(`Paket ${i + 1}: ${r.meldung}`);
      if (r.abbruch) break;
      continue;
    }
    tokensAddieren(tokens, r.usage);
    (r.json.bewertungen || []).forEach((b) => ergebnis.set(Number(b.id), b));
  }
  const nachFund = new Map();
  items.forEach((it) => {
    const b = ergebnis.get(it.id);
    if (!b) return;
    const k = it.f.qubaid + '|' + it.f.slot;
    if (!nachFund.has(k)) nachFund.set(k, { nr: it.f.nr, frage: it.f.frage, qubaid: it.f.qubaid, slot: it.f.slot, luecken: [] });
    nachFund.get(k).luecken.push({ nr: it.l.nr, prozent: b.prozent, grund: b.grund || '', kategorie: b.kategorie || '' });
  });

  // 2. Feedback fuer schwache Antworten (nur wenn beim Auslesen gesammelt)
  const kommentare = [];
  const fb = daten.feedback || [];
  if (fb.length && !fehler.some((f) => /Zugang|Berechtigung|neu laden/.test(f))) {
    const fp = pakete(fb.map((f, i) => ({ id: i + 1, f })), Math.max(5, Math.round((cfg.paket || 20) / 2)));
    for (let i = 0; i < fp.length; i++) {
      onFortschritt(`Schreibe Feedback, Paket ${i + 1} von ${fp.length} …`, (pk.length + i / fp.length) / (pk.length + 1));
      const text = fp[i].map(({ id, f }) => {
        const loes = (fragen[f.frage] || {}).loesungen || [];
        const teile = (f.luecken || []).map((l) => {
          const r = (loes.find((x) => x.nr === l.nr) || {}).richtig || [];
          return `Lücke ${l.nr}: Antwort ${String(l.antwort || '').trim() ? q(l.antwort) : '(leer)'}, gesucht ${r.slice(0, 3).map(q).join(' / ') || '?'}, Satz ${q(l.kontext || '')}`;
        }).join(' ; ');
        return `id ${id}: ${teile}`;
      }).join('\n');
      const r = await paketFragen(cfg, SYSTEM_FEEDBACK, text, 120 * fp[i].length + 200);
      if (!r.ok) { fehler.push(`Feedback-Paket ${i + 1}: ${r.meldung}`); if (r.abbruch) break; continue; }
      tokensAddieren(tokens, r.usage);
      const map = new Map((r.json.kommentare || []).map((k) => [Number(k.id), k.text]));
      fp[i].forEach(({ id, f }) => {
        const t = map.get(id);
        if (t) kommentare.push({ frage: f.frage, qubaid: f.qubaid, slot: f.slot, text: String(t) });
      });
    }
  }
  onFortschritt('Fertig.', 1);
  return { bewertungen: [...nachFund.values()], kommentare, fehler, tokens,
           sekunden: Math.round((Date.now() - t0) / 1000) };
}
