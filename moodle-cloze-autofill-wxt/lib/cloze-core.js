/* Moodle Cloze Autofill v2.0.4
 *
 * Sitzt auf der Kategorieansicht der Fragensammlung (question/edit.php).
 *
 * Knopf 1 "Liste erzeugen" (nur lesend): holt zu jeder Cloze-Frage der Ansicht
 *   den Quelltext aus dem Bearbeiten-Formular, zerlegt ihn in seine Luecken und
 *   baut daraus einen Prompt. Der Prompt enthaelt NUR die Luecken und ihre
 *   bereits hinterlegten Varianten — kein HTML, kein Kartendesign.
 *
 * Knopf 2 "Cloze einfuegen" (schreibend): nimmt das JSON der KI, setzt die neuen
 *   Varianten chirurgisch in die betroffene Luecke ein und speichert die Frage
 *   ueber genau das Formular, das du sonst von Hand ausfuellst. Moodle legt dabei
 *   eine neue Fragen-Version an; die alte bleibt erhalten.
 *
 * Bewusst NICHT enthalten: ein Modus, der alle Fragen ohne Liste durchgeht.
 * Angefasst wird nur, was in der Ansicht steht UND im JSON benannt ist.
 */
import { browser } from 'wxt/browser';

export function starteClozeAutofill() {
  'use strict';

  const PARAMS = new URLSearchParams(location.search);
  const CMID = PARAMS.get('cmid');
  if (!CMID) return;                      // ohne cmid ist es nicht die Fragensammlung

  // Wurzel der Moodle-Installation aus der eigenen Adresse ableiten.
  // Nicht jedes Moodle liegt auf der Domainwurzel: https://schule.de/moodle/... ist
  // genauso gueltig wie https://lms.example/... . location.origin allein zeigte in
  // solchen Installationen auf /question/... statt auf /moodle/question/... .
  const MOODLE_ROOT = (() => {
    const p = location.pathname;
    for (const m of ['/mod/', '/question/', '/grade/', '/course/', '/admin/', '/report/', '/user/']) {
      const i = p.indexOf(m);
      if (i > -1) return location.origin + p.slice(0, i);
    }
    return location.origin;
  })();

  const FORM_URL = MOODLE_ROOT + '/question/bank/editquestion/question.php';

  // Aus dem geladenen Manifest, nicht fest eingetragen: so zeigt das Panel immer
  // die Fassung an, die Chrome tatsaechlich ausfuehrt.
  const VERSION = (() => {
    try { return browser.runtime.getManifest().version; } catch (e) { return '?'; }
  })();

  /* ================= Helfer ================= */

  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  const escapeHtml = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Setzt HTML-Inhalt, ohne .innerHTML zuzuweisen: der (bereits per escapeHtml
  // entschaerfte) String wird per DOMParser geparst - darin enthaltene <script>-
  // Elemente sind lt. HTML-Spezifikation inert und werden nie ausgefuehrt - und die
  // entstandenen Knoten werden dann per replaceChildren() eingehaengt. Das ist kein
  // Sink, den AMOs "Unsafe assignment to innerHTML"-Pruefung beobachtet.
  const setzeHtml = (ziel, html) => {
    ziel.replaceChildren(...new DOMParser().parseFromString(String(html || ''), 'text/html').body.childNodes);
  };

  /* ==PRUEFBAR-ANFANG== (Testfaelle schneiden genau diesen Block heraus) */
  // Prozentwerte im Cloze-Code IMMER mit Punkt: %0.01%, nie %0,01%.
  const prozentCode = (v) => String(Number(v));

  // Fuer die Anzeige im Panel darf das deutsche Komma stehen.
  const prozentText = (v) => String(Number(v)).replace('.', ',');

  async function fetchDoc(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  // Trennt an einem Zeichen, das nicht mit \ maskiert ist.
  function trenneUnmaskiert(s, zeichen) {
    const raus = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { cur += s[i] + (s[i + 1] || ''); i++; continue; }
      if (s[i] === zeichen) { raus.push(cur); cur = ''; continue; }
      cur += s[i];
    }
    raus.push(cur);
    return raus;
  }

  const entmaskieren = (t) => t.replace(/\\([{}~=#\\])/g, '$1');

  // Umgekehrter Weg: ein Begriff, der in den Cloze-Code geschrieben wird.
  const maskieren = (t) => String(t).replace(/([\\{}~#])/g, '\\$1');

  // Begriffe, die am Anfang % oder = tragen, wuerden die Lueckensyntax kippen.
  // Dafuer gibt es keine saubere Maskierung — deshalb werden sie abgelehnt
  // statt irgendwie verbogen.
  const begriffUnzulaessig = (t) => /^[%=]/.test(String(t).trim());

  /* ================= Cloze lesen ================= */

  // Findet die Luecken im ROHEN Quelltext samt Position. Wichtig: nicht auf dem
  // von HTML befreiten Text arbeiten — sonst stimmen die Positionen beim
  // Zurueckschreiben nicht mehr.
  function lueckenRoh(q) {
    const raus = [];
    let tiefe = 0, start = -1;
    for (let i = 0; i < q.length; i++) {
      if (q[i] === '\\') { i++; continue; }
      if (q[i] === '{') { if (tiefe === 0) start = i; tiefe++; }
      else if (q[i] === '}') {
        tiefe--;
        if (tiefe === 0 && start >= 0) {
          raus.push({ nr: raus.length + 1, start, ende: i, inhalt: q.slice(start + 1, i) });
          start = -1;
        }
      }
    }
    return raus;
  }

  const KOPF = /^(\s*\d*\s*:\s*([A-Za-z_]+)\s*:\s*)/;

  // Zerlegt den Inhalt einer Luecke in Kopf (z. B. "1:SAC:") und Varianten.
  function zerlegeLuecke(inhalt) {
    const m = inhalt.match(KOPF);
    if (!m) return null;
    const teile = trenneUnmaskiert(inhalt.slice(m[1].length), '~');
    const varianten = teile.map((roh) => {
      let rest = roh, prozent = 0;
      const p = rest.match(/^%(-?[\d.]+)%/);
      if (p) { prozent = parseFloat(p[1]); rest = rest.slice(p[0].length); }
      else if (rest.startsWith('=')) { prozent = 100; rest = rest.slice(1); }
      const text = entmaskieren(trenneUnmaskiert(rest, '#')[0] || '').trim();
      return { prozent, text, roh };
    });
    return { kopf: m[1], typ: m[2].toUpperCase(), teile, varianten };
  }

  // Alle Luecken einer Frage, aufbereitet fuer Anzeige und Prompt.
  function leseLuecken(quelltext) {
    return lueckenRoh(quelltext).map((l) => {
      const z = zerlegeLuecke(l.inhalt);
      if (!z) return { nr: l.nr, typ: '?', varianten: [] };
      return { nr: l.nr, typ: z.typ, varianten: z.varianten.filter((v) => v.text !== '') };
    });
  }

  /* ================= Cloze schreiben ================= */

  // Setzt eine neue Variante in Luecke <nr>. Gibt den vollstaendigen neuen
  // Quelltext zurueck — alles ausserhalb der einen Luecke bleibt Byte fuer Byte
  // unveraendert, insbesondere das AFB-Kartendesign und die Bild-URLs.
  function ergaenzeVariante(quelltext, nr, begriff, prozent) {
    const luecken = lueckenRoh(quelltext);
    const l = luecken[nr - 1];
    if (!l) throw new Error('Lücke ' + nr + ' gibt es nicht (Frage hat ' + luecken.length + ').');

    const z = zerlegeLuecke(l.inhalt);
    if (!z) throw new Error('Lücke ' + nr + ' ist nicht lesbar.');

    const neu = '%' + prozentCode(prozent) + '%' + maskieren(String(begriff).trim());

    // Einsortieren nach fallendem Prozentwert — so, wie die Listen in der XML
    // gepflegt sind. Fuer die Bewertung ist die Reihenfolge egal, fuers Lesen nicht.
    const werte = z.varianten.map((v) => v.prozent);
    let pos = z.teile.length;
    for (let i = 0; i < werte.length; i++) {
      if (werte[i] < prozent) { pos = i; break; }
    }
    const teile = z.teile.slice();
    teile.splice(pos, 0, neu);

    const inhalt = z.kopf + teile.join('~');
    return quelltext.slice(0, l.start + 1) + inhalt + quelltext.slice(l.ende);
  }

  // Prueft nach dem Einsetzen, ob der Begriff mit dem richtigen Prozentwert
  // wirklich in genau dieser Luecke steht und die Frage gleich viele Luecken hat.
  function selbstpruefung(vorher, nachher, nr, begriff, prozent) {
    const a = lueckenRoh(vorher), b = lueckenRoh(nachher);
    if (a.length !== b.length) {
      return 'Zahl der Lücken hat sich geändert (' + a.length + ' → ' + b.length + ').';
    }
    const z = zerlegeLuecke(b[nr - 1].inhalt);
    if (!z) return 'Lücke ' + nr + ' ist nach dem Einsetzen nicht mehr lesbar.';
    const treffer = z.varianten.find((v) => v.text === String(begriff).trim() && v.prozent === Number(prozent));
    if (!treffer) return 'Begriff steht nach dem Einsetzen nicht wie erwartet in Lücke ' + nr + '.';
    for (let i = 0; i < a.length; i++) {
      if (i === nr - 1) continue;
      if (a[i].inhalt !== b[i].inhalt) return 'Lücke ' + (i + 1) + ' wurde ungewollt verändert.';
    }
    return null;
  }

  // Ändert den Prozentwert einer VORHANDENEN Variante. Anders als das Ergänzen
  // fasst das bestehende Inhalte an — deshalb muss der bisherige Wert (`von`)
  // genau stimmen, sonst wird nichts gemacht. So kann eine veraltete Liste keine
  // Bewertung überschreiben, die inzwischen jemand anders gesetzt hat.
  function aendereVariante(quelltext, nr, begriff, von, nach) {
    const luecken = lueckenRoh(quelltext);
    const l = luecken[nr - 1];
    if (!l) throw new Error('Lücke ' + nr + ' gibt es nicht (Frage hat ' + luecken.length + ').');
    const z = zerlegeLuecke(l.inhalt);
    if (!z) throw new Error('Lücke ' + nr + ' ist nicht lesbar.');

    const sac = z.typ === 'SAC' || z.typ === 'MCS' || z.typ === 'MRS';
    const gleich = (x, y) => sac ? x === y : x.toLowerCase() === y.toLowerCase();
    const ziel = String(begriff).trim();

    let idx = -1;
    for (let i = 0; i < z.varianten.length; i++) {
      if (gleich(z.varianten[i].text, ziel)) {
        if (Number(z.varianten[i].prozent) !== Number(von)) {
          throw new Error('steht in Lücke ' + nr + ' mit ' + prozentText(z.varianten[i].prozent) +
                          ' %, erwartet waren ' + prozentText(von) + ' %');
        }
        idx = i; break;
      }
    }
    if (idx < 0) throw new Error('steht nicht in Lücke ' + nr);

    // Rohtext der Variante ohne ihren bisherigen Wertmarker.
    const rohOhneWert = z.teile[idx].replace(/^%(-?[\d.]+)%/, '').replace(/^=/, '');
    const teile = z.teile.slice();
    teile.splice(idx, 1);

    // Nach dem neuen Wert wieder einsortieren, damit die Liste absteigend bleibt.
    const werte = teile.map((t) => {
      const m = t.match(/^%(-?[\d.]+)%/);
      if (m) return parseFloat(m[1]);
      return t.startsWith('=') ? 100 : 0;
    });
    let pos = teile.length;
    for (let i = 0; i < werte.length; i++) { if (werte[i] < nach) { pos = i; break; } }
    teile.splice(pos, 0, '%' + prozentCode(nach) + '%' + rohOhneWert);

    return quelltext.slice(0, l.start + 1) + z.kopf + teile.join('~') + quelltext.slice(l.ende);
  }

  // Selbstprüfung für eine Änderung: gleiche Lückenzahl, gleiche Anzahl Varianten,
  // der Begriff trägt den neuen Wert, alle anderen Lücken unangetastet.
  function selbstpruefungAenderung(vorher, nachher, nr, begriff, nach) {
    const a = lueckenRoh(vorher), b = lueckenRoh(nachher);
    if (a.length !== b.length) {
      return 'Zahl der Lücken hat sich geändert (' + a.length + ' → ' + b.length + ').';
    }
    const za = zerlegeLuecke(a[nr - 1].inhalt), zb = zerlegeLuecke(b[nr - 1].inhalt);
    if (!zb) return 'Lücke ' + nr + ' ist nach der Änderung nicht mehr lesbar.';
    if (za.varianten.length !== zb.varianten.length) {
      return 'Zahl der Varianten hat sich geändert (' + za.varianten.length + ' → ' + zb.varianten.length + ').';
    }
    const sac = zb.typ === 'SAC' || zb.typ === 'MCS' || zb.typ === 'MRS';
    const gleich = (x, y) => sac ? x === y : x.toLowerCase() === y.toLowerCase();
    const t = zb.varianten.find((v) => gleich(v.text, String(begriff).trim()));
    if (!t) return 'Begriff steht nach der Änderung nicht mehr in Lücke ' + nr + '.';
    if (Number(t.prozent) !== Number(nach)) {
      return 'Begriff trägt ' + prozentText(t.prozent) + ' % statt ' + prozentText(nach) + ' %.';
    }
    for (let i = 0; i < a.length; i++) {
      if (i === nr - 1) continue;
      if (a[i].inhalt !== b[i].inhalt) return 'Lücke ' + (i + 1) + ' wurde ungewollt verändert.';
    }
    return null;
  }

  // Entfernt EINE vorhandene Variante. Das ist der einzige Weg, eine Dublette
  // loszuwerden — Ergänzen und Ändern können das nicht.
  //
  // Gefunden wird über Begriff UND Prozentwert; stimmt der Wert nicht, passiert
  // nichts. Steht der Begriff mehrfach mit demselben Wert (genau der Dubletten-Fall),
  // fällt der LETZTE weg und der erste bleibt stehen.
  //
  // Zwei Dinge sind gesperrt, weil sie die Frage kaputtmachen würden:
  //   - die mit `=` markierte Hauptantwort,
  //   - der letzte verbliebene 100-%-Eintrag (eine Lücke ohne richtige Antwort
  //     nimmt Moodle nicht an).
  function entferneVariante(quelltext, nr, begriff, wert) {
    const luecken = lueckenRoh(quelltext);
    const l = luecken[nr - 1];
    if (!l) throw new Error('Lücke ' + nr + ' gibt es nicht (Frage hat ' + luecken.length + ').');
    const z = zerlegeLuecke(l.inhalt);
    if (!z) throw new Error('Lücke ' + nr + ' ist nicht lesbar.');

    const sac = z.typ === 'SAC' || z.typ === 'MCS' || z.typ === 'MRS';
    const gleich = (x, y) => sac ? x === y : x.toLowerCase() === y.toLowerCase();
    const ziel = String(begriff).trim();

    const treffer = [];
    z.varianten.forEach((v, i) => {
      if (gleich(v.text, ziel) && Number(v.prozent) === Number(wert)) treffer.push(i);
    });
    if (!treffer.length) {
      const da = z.varianten.filter((v) => gleich(v.text, ziel));
      throw new Error(da.length
        ? 'steht in Lücke ' + nr + ' mit ' + da.map((v) => prozentText(v.prozent)).join('/') +
          ' %, nicht mit ' + prozentText(wert) + ' %'
        : 'steht nicht in Lücke ' + nr);
    }

    const idx = treffer[treffer.length - 1];
    if (/^\s*=/.test(z.teile[idx])) {
      throw new Error('ist die mit „=" markierte Hauptantwort und lässt sich nicht entfernen');
    }
    const hundert = z.varianten.filter((v, i) => i !== idx && Number(v.prozent) === 100).length;
    if (Number(wert) === 100 && hundert === 0) {
      throw new Error('wäre die letzte 100-%-Antwort der Lücke — nicht entfernbar');
    }

    const teile = z.teile.slice();
    teile.splice(idx, 1);
    return {
      text: quelltext.slice(0, l.start + 1) + z.kopf + teile.join('~') + quelltext.slice(l.ende),
      warenEs: treffer.length,
      bleiben: treffer.length - 1
    };
  }

  // Selbstprüfung für eine Entfernung: eine Variante weniger, der Begriff kommt
  // nur noch so oft vor wie erwartet, alle anderen Lücken unangetastet.
  function selbstpruefungEntfernung(vorher, nachher, nr, begriff, wert, bleiben) {
    const a = lueckenRoh(vorher), b = lueckenRoh(nachher);
    if (a.length !== b.length) {
      return 'Zahl der Lücken hat sich geändert (' + a.length + ' → ' + b.length + ').';
    }
    const za = zerlegeLuecke(a[nr - 1].inhalt), zb = zerlegeLuecke(b[nr - 1].inhalt);
    if (!zb) return 'Lücke ' + nr + ' ist nach dem Entfernen nicht mehr lesbar.';
    if (zb.varianten.length !== za.varianten.length - 1) {
      return 'Es sollte genau eine Variante wegfallen (' + za.varianten.length +
             ' → ' + zb.varianten.length + ').';
    }
    const sac = zb.typ === 'SAC' || zb.typ === 'MCS' || zb.typ === 'MRS';
    const gleich = (x, y) => sac ? x === y : x.toLowerCase() === y.toLowerCase();
    const rest = zb.varianten.filter((v) => gleich(v.text, String(begriff).trim()) &&
                                            Number(v.prozent) === Number(wert)).length;
    if (rest !== bleiben) {
      return 'Nach dem Entfernen stehen noch ' + rest + ' statt ' + bleiben + ' davon in der Lücke.';
    }
    if (!zb.varianten.some((v) => Number(v.prozent) === 100)) {
      return 'Die Lücke hätte danach keine richtige Antwort mehr.';
    }
    for (let i = 0; i < a.length; i++) {
      if (i === nr - 1) continue;
      if (a[i].inhalt !== b[i].inhalt) return 'Lücke ' + (i + 1) + ' wurde ungewollt verändert.';
    }
    return null;
  }

  /* ==PRUEFBAR-ENDE== */

  /* ================= Fragen der Ansicht ================= */

  // Fragenname und ID stehen im inplace-editable der Namensspalte — stabiler als
  // der Zelltext, der auch das Bearbeiten-Menue enthaelt.
  function fragenDerAnsicht() {
    const raus = [];
    document.querySelectorAll('#categoryquestions tbody tr').forEach((tr) => {
      const nameEl = tr.querySelector('[data-itemtype="questionname"]');
      if (!nameEl) return;
      const qid = nameEl.getAttribute('data-itemid');
      const name = nameEl.getAttribute('data-value');
      if (!qid || !name) return;
      const iconEl = tr.querySelector('td.qtype img');
      const typ = iconEl ? (iconEl.getAttribute('title') || '') : '';
      const box = tr.querySelector('input[type="checkbox"][name^="q"]');
      raus.push({ qid, name, typ, cloze: /cloze|lückentext|luckentext/i.test(typ), angehakt: !!(box && box.checked) });
    });
    return raus;
  }

  async function ladeFrageFormular(qid) {
    const doc = await fetchDoc(FORM_URL + '?id=' + encodeURIComponent(qid) + '&cmid=' + encodeURIComponent(CMID));
    // Fehlt das Recht, Fragen zu bearbeiten, leitet Moodle mit Status 200 um.
    // Deshalb auf den Inhalt pruefen, nicht auf den Status.
    return doc.querySelector('textarea[name="questiontext[text]"]') ? doc : null;
  }

  const quelltextAus = (doc) => {
    const ta = doc && doc.querySelector('textarea[name="questiontext[text]"]');
    return ta ? (ta.value || ta.textContent || '') : '';
  };

  /* ================= Prompt ================= */

  const PLATZHALTER = '[CLOZE_AUTOFILL_DATEN]';
  const OPT_KEY = 'clozeAutofillOptionen';

  function standardPrompt() {
    return [
      'Hallo! Du hilfst mir, neue Antwortvarianten in meine Moodle-Lückentexte (Cloze) einzupflegen.',
      'Die Erweiterung "Moodle Cloze Autofill" steht unter CC BY-SA 4.0.',
      '',
      '## Ausgangslage',
      '',
      'Unten stehen alle Lücken der Fragen, die gerade in meiner Fragensammlung angezeigt werden —',
      'direkt aus Moodle ausgelesen, also der WIRKLICHE Stand, nicht der meiner lokalen XML-Dateien.',
      'Je Lücke siehst du alle bereits hinterlegten Antworten mit ihrem Prozentwert.',
      '',
      'Getrennt davon führe ich eine Datei `Fehlersammlung.xlsx`. Dort sammle ich nach jedem Test die',
      'Schülerantworten, die Moodle nicht erkannt hat, mit einer schon festgelegten Bewertung in Prozent.',
      'Alle Zeilen mit Status "offen" sind noch nicht eingepflegt.',
      '',
      '## Deine Aufgabe',
      '',
      'Gleiche die offenen Einträge der Fehlersammlung mit den unten stehenden Lücken ab und sage mir,',
      'welche Begriffe wirklich noch fehlen.',
      '',
      'Dabei gilt:',
      '',
      '1. **Schon vorhanden = weglassen.** Steht der Begriff bereits in der Lücke, gehört er nicht ins Ergebnis.',
      '   Bei einer SAC-Lücke zählt Groß-/Kleinschreibung mit: "Verstaut" und "verstaut" sind zwei Einträge.',
      '   Bei einer SA-Lücke ist die Schreibweise egal — dort ist eine reine Groß-/Kleinschreibungs-Variante',
      '   überflüssig und gehört nicht ins Ergebnis.',
      '2. **Widersprüche melden, nicht überschreiben.** Steht der Begriff schon drin, aber mit einem anderen',
      '   Prozentwert als in der Fehlersammlung, nimm ihn NICHT auf. Nenne ihn stattdessen in Schritt 1',
      '   ausdrücklich als Konflikt — ich entscheide das dann selbst.',
      '3. **Prozentwerte kommen aus der Fehlersammlung**, nicht aus eigener Einschätzung. Nur wenn dort',
      '   nichts steht, stufst du nach der Skala unten ein und markierst es als "geschätzt".',
      '4. **Sieh vorher in die lokale XML-Datei der Kategorie.** Meine Entscheidungen stehen dort oft',
      '   schon drin, auch wenn Moodle noch den alten Stand zeigt — die lokale Datei ist häufig',
      '   VORAUS, nicht hinterher. Rate nie einen Wert, der in einer meiner Dateien nachlesbar ist.',
      '   Weicht die lokale Datei vom Live-Stand unten ab, ist das ein Befund für mich: melde ihn',
      '   ausdrücklich und schlage die Angleichung als Änderung vor (siehe unten).',
      '5. **Kein HTML, keine Fragetexte.** Du lieferst ausschließlich Begriffe und Zahlen. Das Einsetzen',
      '   in den Cloze-Code macht die Erweiterung.',
      '',
      '## Bewertungsskala',
      '',
      '- **100** — korrekt geschrieben, echtes Synonym oder akzeptierte Alternative (z. B. "Stößel" für "Pistill")',
      '- **90** — nur Groß-/Kleinschreibung falsch. Gibt es NUR bei SAC-Lücken (z. B. "Oben" statt "oben")',
      '- **75** — ein einzelner klarer Tippfehler, das Wort bleibt eindeutig (z. B. "Mistill", "Scbhutzbrille")',
      '- **50** — mehrere Tippfehler oder stärkere Verschreibung, noch mit Mühe erkennbar (z. B. "Reingekipt")',
      '- **25** — nur Wortstamm oder Anfang getroffen, starke Verkürzung (z. B. "Müll" statt "Glasmülleimer")',
      '- **0.01** — falsches Wort ohne Bezug. Bewusst nicht 0, damit der Fehler als bekannte Variante zählt',
      '',
      'Prozentwerte immer mit **Punkt** schreiben: `0.01`, nie `0,01`.',
      '',
      '## Schritt 1 — erst zeigen, dann anhalten',
      '',
      'Gib mir zuerst eine Tabelle mit den Begriffen, die du aufnehmen willst, eine zweite mit den',
      'Werten, die du ändern willst, und eine dritte mit den Einträgen, die weg sollen:',
      'Frage · Lücke · Begriff · Prozent · Begründung. Darunter eine kurze Liste der Fälle, die du',
      'weggelassen hast, und der Konflikte aus Regel 2.',
      '',
      '**Dann hör auf und frage mich, ob du das JSON erzeugen sollst.** Gib das JSON nicht ungefragt aus.',
      '',
      '## Schritt 2 — erst nach meiner Bestätigung',
      '',
      'Dann und nur dann das JSON, genau in dieser Form:',
      '',
      '```json',
      '{',
      '  "erweiterung": "moodle-cloze-autofill",',
      '  "eintraege": [',
      '    {',
      '      "frage": "1.1.1-Riechen",',
      '      "qid": "115405757",',
      '      "luecke": 2,',
      '      "begriff": "fächeln",',
      '      "prozent": 75,',
      '      "grund": "Auslassung der Vorsilbe"',
      '    }',
      '  ]',
      '}',
      '```',
      '',
      '`frage` und `qid` genau so übernehmen, wie sie unten stehen — die Erweiterung prüft, dass beide',
      'zusammenpassen, und bricht sonst ab. `luecke` ist die Nummer aus der Liste unten.',
      '',
      'Soll ein **vorhandener** Wert geändert werden — etwa weil die lokale Datei einen anderen hat,',
      'oder weil ein Wert außerhalb der Skala liegt (10, 20, 5 gibt es nicht) —, gehört er NICHT in',
      '`eintraege`, sondern in eine zweite Liste `aenderungen` im selben JSON:',
      '',
      '```json',
      '{',
      '  "erweiterung": "moodle-cloze-autofill",',
      '  "eintraege": [],',
      '  "aenderungen": [',
      '    {',
      '      "frage": "1.1.4-Tiegelzange",',
      '      "qid": "115318871",',
      '      "luecke": 1,',
      '      "begriff": "Gibelzange",',
      '      "von": 10,',
      '      "nach": 25,',
      '      "grund": "10 gibt es in der Skala nicht; lokale Datei sagt 25"',
      '    }',
      '  ]',
      '}',
      '```',
      '',
      '`von` muss dem Wert entsprechen, der unten im Live-Stand steht — sonst überspringt die',
      'Erweiterung die Änderung, statt etwas zu überschreiben.',
      '',
      'Steht ein Begriff in einer Lücke **mehrfach**, ist der niedrigere Eintrag wirkungslos',
      '(Moodle nimmt den besten Treffer). Solche Dubletten gehören in eine dritte Liste',
      '`entfernen`, mit dem Wert des Eintrags, der wegfallen soll:',
      '',
      '```json',
      '{ "entfernen": [',
      '    { "frage": "1.1.4-Pipette", "qid": "115318793", "luecke": 1,',
      '      "begriff": "Pipete", "wert": 75, "grund": "steht doppelt" } ] }',
      '```',
      '',
      'Steht der Begriff mehrfach mit demselben Wert, fällt genau einer weg und der erste bleibt.',
      'Die mit `=` markierte Hauptantwort und die letzte 100-%-Antwort einer Lücke lassen sich',
      'nicht entfernen. Reihenfolge im Lauf: erst Änderungen, dann Entfernungen, dann Ergänzungen.',
      '',
      '## Die Lücken',
      '',
      PLATZHALTER
    ].join('\n');
  }

  // Die reinen Daten — fuer einen Chat, der die Regeln schon ueber ein Skill kennt.
  function baueDaten(fragen, kategorie) {
    const zeilen = [];
    if (kategorie) zeilen.push('Kategorie: ' + kategorie, '');
    fragen.forEach((f) => {
      zeilen.push('### ' + f.name + '  (qid ' + f.qid + ')');
      if (!f.luecken.length) {
        zeilen.push('_keine Lücken lesbar_');
      } else {
        f.luecken.forEach((l) => {
          const v = l.varianten
            .map((x) => x.text + ' (' + prozentCode(x.prozent) + ')')
            .join(' · ');
          zeilen.push('Lücke ' + l.nr + ' [' + l.typ + ']: ' + (v || '—'));
        });
      }
      zeilen.push('');
    });
    return zeilen.join('\n').trim();
  }

  function bauePrompt(daten, eigener) {
    const vorlage = (eigener && eigener.trim()) ? eigener : standardPrompt();
    return vorlage.includes(PLATZHALTER)
      ? vorlage.replace(PLATZHALTER, daten)
      : vorlage + '\n\n' + daten;
  }

  function optionenLaden() {
    return new Promise((resolve) => {
      try {
        browser.storage.local.get([OPT_KEY], (r) => resolve((r && r[OPT_KEY]) || {}));
      } catch (e) { resolve({}); }
    });
  }

  function optionenSpeichern(neu) {
    return new Promise((resolve) => {
      try {
        browser.storage.local.set({ [OPT_KEY]: neu }, () => resolve());
      } catch (e) { resolve(); }
    });
  }

  /* ================= JSON lesen ================= */

  function leseJson(text) {
    let roh = String(text || '').trim();
    if (!roh) throw new Error('Das Feld ist leer.');
    // Codeblock-Zaeune wegnehmen, falls mitkopiert.
    roh = roh.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let obj;
    try { obj = JSON.parse(roh); }
    catch (e) { throw new Error('Das ist kein gültiges JSON: ' + e.message); }

    const liste = Array.isArray(obj) ? obj : ((obj && obj.eintraege) || []);
    const aend = (obj && obj.aenderungen) || [];
    const entf = (obj && obj.entfernen) || [];
    const leer = (x) => !Array.isArray(x) || !x.length;
    if (leer(liste) && leer(aend) && leer(entf)) {
      throw new Error('Weder "eintraege" noch "aenderungen" noch "entfernen" mit Inhalt gefunden.');
    }

    const eintraege = liste.map((e, i) => {
      const wo = 'Eintrag ' + (i + 1);
      if (!e || typeof e !== 'object') throw new Error(wo + ' ist kein Objekt.');
      const frage = String(e.frage || '').trim();
      const begriff = String(e.begriff == null ? '' : e.begriff).trim();
      const luecke = parseInt(e.luecke, 10);
      const prozent = typeof e.prozent === 'string'
        ? parseFloat(e.prozent.replace(',', '.'))
        : Number(e.prozent);
      if (!frage) throw new Error(wo + ': "frage" fehlt.');
      if (!begriff) throw new Error(wo + ' (' + frage + '): "begriff" fehlt.');
      if (!(luecke >= 1)) throw new Error(wo + ' (' + frage + '): "luecke" muss eine Zahl ab 1 sein.');
      if (!isFinite(prozent) || prozent < 0 || prozent > 100) {
        throw new Error(wo + ' (' + frage + '): "prozent" muss zwischen 0 und 100 liegen.');
      }
      if (begriffUnzulaessig(begriff)) {
        throw new Error(wo + ' (' + frage + '): Begriffe dürfen nicht mit % oder = beginnen.');
      }
      return {
        frage,
        qid: e.qid == null ? null : String(e.qid).trim(),
        luecke, begriff, prozent,
        grund: String(e.grund || '').trim()
      };
    });

    const wert = (v, wo, feld) => {
      const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
      if (!isFinite(n) || n < 0 || n > 100) {
        throw new Error(wo + ': "' + feld + '" muss zwischen 0 und 100 liegen.');
      }
      return n;
    };

    const aenderungen = aend.map((e, i) => {
      const wo = 'Änderung ' + (i + 1);
      if (!e || typeof e !== 'object') throw new Error(wo + ' ist kein Objekt.');
      const frage = String(e.frage || '').trim();
      const begriff = String(e.begriff == null ? '' : e.begriff).trim();
      const luecke = parseInt(e.luecke, 10);
      if (!frage) throw new Error(wo + ': "frage" fehlt.');
      if (!begriff) throw new Error(wo + ' (' + frage + '): "begriff" fehlt.');
      if (!(luecke >= 1)) throw new Error(wo + ' (' + frage + '): "luecke" muss eine Zahl ab 1 sein.');
      const von = wert(e.von, wo + ' (' + frage + ')', 'von');
      const nach = wert(e.nach, wo + ' (' + frage + ')', 'nach');
      if (von === nach) throw new Error(wo + ' (' + frage + '): "von" und "nach" sind gleich.');
      return {
        frage,
        qid: e.qid == null ? null : String(e.qid).trim(),
        luecke, begriff, von, nach,
        grund: String(e.grund || '').trim()
      };
    });

    const entfernen = entf.map((e, i) => {
      const wo = 'Entfernung ' + (i + 1);
      if (!e || typeof e !== 'object') throw new Error(wo + ' ist kein Objekt.');
      const frage = String(e.frage || '').trim();
      const begriff = String(e.begriff == null ? '' : e.begriff).trim();
      const luecke = parseInt(e.luecke, 10);
      if (!frage) throw new Error(wo + ': "frage" fehlt.');
      if (!begriff) throw new Error(wo + ' (' + frage + '): "begriff" fehlt.');
      if (!(luecke >= 1)) throw new Error(wo + ' (' + frage + '): "luecke" muss eine Zahl ab 1 sein.');
      return {
        frage,
        qid: e.qid == null ? null : String(e.qid).trim(),
        luecke, begriff,
        wert: wert(e.wert, wo + ' (' + frage + ')', 'wert'),
        grund: String(e.grund || '').trim()
      };
    });

    return { eintraege, aenderungen, entfernen };
  }

  /* ================= Planen ================= */

  // Baut aus den JSON-Eintraegen einen Plan je Frage: welcher Begriff kommt neu
  // dazu, was wird uebersprungen, wo hakt es. Rein lesend.
  async function planen(daten, onProgress) {
    const eintraege = daten.eintraege || [];
    const aenderungen = daten.aenderungen || [];
    const entfernungen = daten.entfernen || [];
    const inAnsicht = fragenDerAnsicht();
    const nachName = {};
    inAnsicht.forEach((f) => { nachName[f.name] = f; });

    const gruppen = new Map();
    const probleme = [];

    const einsortieren = (e, art) => {
      const treffer = nachName[e.frage];
      if (!treffer) {
        probleme.push('„' + e.frage + '" steht nicht in dieser Ansicht — übersprungen.');
        return;
      }
      if (e.qid && e.qid !== treffer.qid) {
        probleme.push('„' + e.frage + '": qid im JSON (' + e.qid + ') passt nicht zur Ansicht (' +
                      treffer.qid + ') — übersprungen.');
        return;
      }
      if (!treffer.cloze) {
        probleme.push('„' + e.frage + '" ist kein Lückentext — übersprungen.');
        return;
      }
      if (!gruppen.has(treffer.qid)) {
        gruppen.set(treffer.qid, { qid: treffer.qid, name: treffer.name, eintraege: [], aenderungen: [], entfernen: [] });
      }
      gruppen.get(treffer.qid)[art].push(e);
    };
    eintraege.forEach((e) => einsortieren(e, 'eintraege'));
    aenderungen.forEach((e) => einsortieren(e, 'aenderungen'));
    entfernungen.forEach((e) => einsortieren(e, 'entfernen'));

    const plan = [];
    const alle = [...gruppen.values()];
    let fertig = 0;

    for (const g of alle) {
      const eintrag = { qid: g.qid, name: g.name, neu: [], aend: [], entf: [], uebersprungen: [], fehler: [], quelltext: null };
      try {
        const doc = await ladeFrageFormular(g.qid);
        if (!doc) throw new Error('Bearbeiten-Formular nicht erreichbar (fehlt das Recht, Fragen zu bearbeiten?)');
        let text = quelltextAus(doc);
        eintrag.quelltext = text;
        const luecken = leseLuecken(text);

        for (const e of g.aenderungen) {
          const l = luecken[e.luecke - 1];
          if (!l) {
            eintrag.fehler.push('Lücke ' + e.luecke + ' gibt es nicht — Änderung „' + e.begriff + '"');
            continue;
          }
          const vorher = text;
          try {
            const nachher = aendereVariante(text, e.luecke, e.begriff, e.von, e.nach);
            const mangel = selbstpruefungAenderung(vorher, nachher, e.luecke, e.begriff, e.nach);
            if (mangel) { eintrag.fehler.push('Änderung „' + e.begriff + '": ' + mangel); continue; }
            text = nachher;
            eintrag.aend.push(e);
          } catch (err) {
            eintrag.fehler.push('Änderung „' + e.begriff + '": ' + err.message);
          }
        }

        for (const e of g.entfernen) {
          const vorher = text;
          try {
            const r = entferneVariante(text, e.luecke, e.begriff, e.wert);
            const mangel = selbstpruefungEntfernung(vorher, r.text, e.luecke, e.begriff, e.wert, r.bleiben);
            if (mangel) { eintrag.fehler.push('Entfernung „' + e.begriff + '": ' + mangel); continue; }
            text = r.text;
            eintrag.entf.push(Object.assign({}, e, { warenEs: r.warenEs, bleiben: r.bleiben }));
          } catch (err) {
            eintrag.fehler.push('Entfernung „' + e.begriff + '": ' + err.message);
          }
        }

        for (const e of g.eintraege) {
          const aktuell = leseLuecken(text);
          const l = aktuell[e.luecke - 1];
          if (!l) {
            eintrag.fehler.push('Lücke ' + e.luecke + ' gibt es nicht (Frage hat ' + aktuell.length + ') — „' + e.begriff + '"');
            continue;
          }
          // Schon vorhanden? Bei SAC zaehlt die Schreibweise, bei SA nicht.
          const sac = l.typ === 'SAC' || l.typ === 'MCS' || l.typ === 'MRS';
          const gleich = (a, b) => sac ? a === b : a.toLowerCase() === b.toLowerCase();
          const da = l.varianten.find((v) => gleich(v.text, e.begriff));
          if (da) {
            if (Number(da.prozent) === Number(e.prozent)) {
              eintrag.uebersprungen.push('„' + e.begriff + "\" steht schon mit " + prozentText(da.prozent) + ' % in Lücke ' + e.luecke);
            } else {
              eintrag.fehler.push('Konflikt: „' + e.begriff + '" steht in Lücke ' + e.luecke + ' schon mit ' +
                prozentText(da.prozent) + ' %, das JSON will ' + prozentText(e.prozent) + ' % — nichts geändert.');
            }
            continue;
          }
          const vorher = text;
          try {
            const nachher = ergaenzeVariante(text, e.luecke, e.begriff, e.prozent);
            const mangel = selbstpruefung(vorher, nachher, e.luecke, e.begriff, e.prozent);
            if (mangel) { eintrag.fehler.push('„' + e.begriff + '": ' + mangel); continue; }
            text = nachher;
            eintrag.neu.push(e);
          } catch (err) {
            eintrag.fehler.push('„' + e.begriff + '": ' + err.message);
          }
        }
      } catch (err) {
        eintrag.fehler.push(err.message);
      }
      plan.push(eintrag);
      fertig++;
      if (onProgress) onProgress(fertig, alle.length);
    }

    return { plan, probleme };
  }

  /* ================= Schreiben ================= */

  // Alle Felder eines geparsten Formulars einsammeln — so, wie der Browser sie
  // abschicken wuerde. Submit-Knoepfe bleiben draussen und werden gezielt gesetzt.
  function formularFelder(form) {
    const p = new URLSearchParams();
    [...form.elements].forEach((f) => {
      if (!f.name || f.disabled) return;
      if (f.type === 'file' || f.type === 'submit' || f.type === 'button') return;
      if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) return;
      if (f.tagName === 'SELECT') {
        const gewaehlt = [...f.querySelectorAll('option[selected]')];
        const opts = gewaehlt.length ? gewaehlt
          : (f.multiple ? [] : [f.querySelector('option')].filter(Boolean));
        opts.forEach((o) => p.append(f.name, o.value));
      } else {
        p.append(f.name, f.value);
      }
    });
    return p;
  }

  // Schickt das Bearbeiten-Formular ab.
  //   modus 'pruefen'  -> Moodles eigener Knopf "Fragetext entschlüsseln und prüfen".
  //                       Der speichert NICHT, er zeigt das Formular nur neu an.
  //   modus 'speichern'-> "Änderungen speichern". Moodle legt eine neue Version an.
  //
  // Uebergeben werden die EINSETZUNGEN, nicht der fertige Text. Der Grund ist der
  // Draft-Dateibereich: Moodle legt bei jedem Aufruf des Formulars einen neuen an
  // (`questiontext[itemid]`) und schreibt dessen Nummer in die draftfile.php-URLs
  // der Bilder im Fragetext. Ein anderswo vorbereiteter Text traegt die Nummer
  // eines ALTEN Bereichs; beim Speichern sucht Moodle die Bilder dann im falschen
  // Ordner und bricht mit HTTP 404 "File does not exist" ab. Deshalb wird der Text
  // hier aus dem frisch geladenen Formular gebaut — jedes Mal neu.
  async function sendeFormular(qid, einsetzungen, aenderungen, entfernungen, modus) {
    const doc = await ladeFrageFormular(qid);
    if (!doc) throw new Error('Bearbeiten-Formular nicht erreichbar');
    const ta = doc.querySelector('textarea[name="questiontext[text]"]');
    const form = ta.closest('form');
    if (!form) throw new Error('Formular um die Fragetext-Textarea nicht gefunden');

    let text = quelltextAus(doc);
    const angewandt = [], angewandtAend = [], angewandtEntf = [], uebergangen = [];

    // Änderungen zuerst: sie setzen vorhandene Werte um. Stimmt der bisherige Wert
    // nicht mehr, wird übersprungen statt überschrieben.
    for (const e of (aenderungen || [])) {
      const vorher = text;
      let nachher;
      try { nachher = aendereVariante(text, e.luecke, e.begriff, e.von, e.nach); }
      catch (err) { uebergangen.push('Änderung „' + e.begriff + '": ' + err.message); continue; }
      const mangel = selbstpruefungAenderung(vorher, nachher, e.luecke, e.begriff, e.nach);
      if (mangel) { uebergangen.push('Änderung „' + e.begriff + '": ' + mangel); continue; }
      text = nachher;
      angewandtAend.push(e);
    }

    // Entfernen nach dem Ändern, vor dem Ergänzen: so wirkt eine Umstufung noch
    // auf den Eintrag, der danach wegfallen soll.
    for (const e of (entfernungen || [])) {
      const vorher = text;
      let r;
      try { r = entferneVariante(text, e.luecke, e.begriff, e.wert); }
      catch (err) { uebergangen.push('Entfernung „' + e.begriff + '": ' + err.message); continue; }
      const mangel = selbstpruefungEntfernung(vorher, r.text, e.luecke, e.begriff, e.wert, r.bleiben);
      if (mangel) { uebergangen.push('Entfernung „' + e.begriff + '": ' + mangel); continue; }
      text = r.text;
      angewandtEntf.push(Object.assign({}, e, { bleiben: r.bleiben }));
    }

    for (const e of einsetzungen) {
      const luecken = leseLuecken(text);
      const l = luecken[e.luecke - 1];
      if (!l) { uebergangen.push('„' + e.begriff + '": Lücke ' + e.luecke + ' gibt es nicht mehr'); continue; }
      const sac = l.typ === 'SAC' || l.typ === 'MCS' || l.typ === 'MRS';
      const gleich = (x, y) => sac ? x === y : x.toLowerCase() === y.toLowerCase();
      if (l.varianten.some((v) => gleich(v.text, e.begriff))) {
        uebergangen.push('„' + e.begriff + '": steht inzwischen schon drin');
        continue;
      }
      const vorher = text;
      let nachher;
      try { nachher = ergaenzeVariante(text, e.luecke, e.begriff, e.prozent); }
      catch (err) { uebergangen.push('„' + e.begriff + '": ' + err.message); continue; }
      const mangel = selbstpruefung(vorher, nachher, e.luecke, e.begriff, e.prozent);
      if (mangel) { uebergangen.push('„' + e.begriff + '": ' + mangel); continue; }
      text = nachher;
      angewandt.push(e);
    }
    if (!angewandt.length && !angewandtAend.length && !angewandtEntf.length) {
      return { nichtsZuTun: true, angewandt, angewandtAend, angewandtEntf, uebergangen };
    }

    ta.value = text;
    const felder = formularFelder(form);
    felder.set('questiontext[text]', text);
    if (modus === 'pruefen') {
      felder.append('analyzequestion', 'Fragetext entschlüsseln und prüfen');
    } else {
      felder.append('submitbutton', 'Änderungen speichern');
    }

    const r = await fetch(FORM_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: felder.toString()
    });
    const antwort = new DOMParser().parseFromString(await r.text(), 'text/html');
    return {
      doc: antwort,
      url: r.url,
      status: r.status,
      ok: r.ok,
      angewandt,
      angewandtAend,
      angewandtEntf,
      uebergangen,
      hatFormular: !!antwort.querySelector('textarea[name="questiontext[text]"]')
    };
  }

  // Kurzbeschreibung einer Antwortseite fuers Protokoll. Ohne sie steht bei einem
  // Fehlschlag nur "ging nicht" da, und man sucht im Dunkeln.
  function antwortInfo(a) {
    const t = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const titel = t(a.doc.querySelector('title') && a.doc.querySelector('title').textContent).slice(0, 70);
    const kopf = t(a.doc.querySelector('#region-main h1, #region-main h2, h1') &&
                   a.doc.querySelector('#region-main h1, #region-main h2, h1').textContent).slice(0, 70);
    const hinweis = t(a.doc.querySelector('.alert, .notifyproblem, .errorbox') &&
                      a.doc.querySelector('.alert, .notifyproblem, .errorbox').textContent).slice(0, 140);
    return ['HTTP ' + a.status,
            'Formular zurück: ' + (a.hatFormular ? 'ja' : 'nein'),
            titel || '(ohne Titel)',
            (kopf && kopf !== titel) ? kopf : null,
            hinweis || null,
            String(a.url).replace(location.origin, '').slice(0, 110)
           ].filter(Boolean).join(' · ');
  }

  // Sucht in einer Antwortseite nach Fehlermeldungen des Formulars.
  function fehlerText(doc) {
    const treffer = [];
    doc.querySelectorAll('.alert-danger, .errorbox, [id^="id_error_"], .form-control-feedback, .invalid-feedback')
      .forEach((e) => {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) treffer.push(t);
      });
    return treffer.length ? treffer.join(' · ').slice(0, 300) : null;
  }

  // Trockenlauf: schickt jede geaenderte Frage durch Moodles eigenen Cloze-Pruefer.
  // Es wird nichts gespeichert.
  async function trockenlauf(plan, onLog, onProgress) {
    const zuTun = plan.filter((p) => p.neu.length || p.aend.length || p.entf.length);
    let fertig = 0, sauber = 0;
    for (const p of zuTun) {
      try {
        const a = await sendeFormular(p.qid, p.neu, p.aend, p.entf, 'pruefen');
        if (a.nichtsZuTun) {
          p.pruefung = 'leer';
          onLog('· ' + p.name + ': nichts mehr einzusetzen — ' + a.uebergangen.join(' · '));
          fertig++; if (onProgress) onProgress(fertig, zuTun.length);
          continue;
        }
        const doc = a.doc;
        onLog('   ↳ Prüf-Antwort: ' + antwortInfo(a));
        if (!a.ok) {
          p.pruefung = 'fehler';
          onLog('✖ ' + p.name + ': Moodle antwortet mit HTTP ' + a.status + '.');
          fertig++; if (onProgress) onProgress(fertig, zuTun.length);
          continue;
        }
        const meldung = fehlerText(doc);
        const ta = doc.querySelector('textarea[name="questiontext[text]"]');
        if (meldung) {
          p.pruefung = 'fehler';
          onLog('✖ ' + p.name + ': Moodle meldet — ' + meldung);
        } else if (!ta) {
          p.pruefung = 'unklar';
          onLog('? ' + p.name + ': Moodle hat das Formular nicht zurückgegeben — Syntax nicht bestätigt.');
        } else {
          p.pruefung = 'ok';
          sauber++;
          onLog('✔ ' + p.name + ': Syntax von Moodle bestätigt.');
        }
      } catch (e) {
        p.pruefung = 'fehler';
        onLog('✖ ' + p.name + ': ' + e.message);
      }
      fertig++;
      if (onProgress) onProgress(fertig, zuTun.length);
    }
    return { geprueft: zuTun.length, sauber };
  }

  // Eintragen: speichert die Frage und liest sie danach neu ein, um zu belegen,
  // dass die Begriffe wirklich drinstehen.
  async function eintragen(plan, onLog, onProgress, auchUnklar) {
    const zuTun = plan.filter((p) => (p.neu.length || p.aend.length || p.entf.length) &&
      (p.pruefung === 'ok' || (auchUnklar && p.pruefung === 'unklar')));
    let fertig = 0, gespeichert = 0;
    for (const p of zuTun) {
      try {
        const a = await sendeFormular(p.qid, p.neu, p.aend, p.entf, 'speichern');
        if (a.nichtsZuTun) {
          onLog('· ' + p.name + ': nichts mehr einzusetzen — ' + a.uebergangen.join(' · '));
          fertig++; if (onProgress) onProgress(fertig, zuTun.length);
          continue;
        }
        const doc = a.doc;
        onLog('   ↳ Speicher-Antwort: ' + antwortInfo(a));
        // Ein Fehlerstatus ist ein Fehlschlag — nicht als Erfolg durchwinken.
        if (!a.ok) {
          onLog('✖ ' + p.name + ': nicht gespeichert — Moodle antwortet mit HTTP ' + a.status + '.');
          fertig++; if (onProgress) onProgress(fertig, zuTun.length);
          continue;
        }
        if (a.uebergangen.length) {
          onLog('   ↳ übergangen: ' + a.uebergangen.join(' · '));
        }
        // Kommt das Bearbeiten-Formular zurueck, wurde NICHT gespeichert.
        if (a.hatFormular) {
          const meldung = fehlerText(doc) || 'Formular kam unverändert zurück.';
          onLog('✖ ' + p.name + ': nicht gespeichert — ' + meldung);
          fertig++; if (onProgress) onProgress(fertig, zuTun.length);
          continue;
        }
        // Moodle legt beim Speichern eine NEUE Fragen-Version mit NEUER id an; die
        // alte id zeigt weiter auf den alten Stand. Die Gegenprobe muss deshalb die
        // neue id nehmen, sonst meldet sie einen Fehlschlag, obwohl alles geklappt hat.
        // Die neue id steht im `lastchanged` der Weiterleitung; als Rückfall wird sie
        // über den Fragenamen aus der zurückgelieferten Fragensammlung geholt.
        let neueQid = null;
        try { neueQid = new URL(a.url, location.href).searchParams.get('lastchanged'); }
        catch (e) { neueQid = null; }
        if (!neueQid) {
          const treffer = [...a.doc.querySelectorAll('[data-itemtype="questionname"]')]
            .find((x) => x.getAttribute('data-value') === p.name);
          if (treffer) neueQid = treffer.getAttribute('data-itemid');
        }
        if (neueQid && neueQid !== p.qid) {
          onLog('   ↳ neue Fragen-Version: ' + p.qid + ' → ' + neueQid);
          p.neueQid = neueQid;
        }

        // Gegenprobe am frisch geladenen Stand.
        const kontrolle = await ladeFrageFormular(neueQid || p.qid);
        const luecken = kontrolle ? leseLuecken(quelltextAus(kontrolle)) : [];
        const fehlend = a.angewandt.filter((e) => {
          const l = luecken[e.luecke - 1];
          return !l || !l.varianten.some((v) => v.text === e.begriff && Number(v.prozent) === Number(e.prozent));
        }).concat(a.angewandtAend.filter((e) => {
          const l = luecken[e.luecke - 1];
          return !l || !l.varianten.some((v) => v.text === e.begriff && Number(v.prozent) === Number(e.nach));
        })).concat(a.angewandtEntf.filter((e) => {
          const l = luecken[e.luecke - 1];
          if (!l) return true;
          const n = l.varianten.filter((v) => v.text === e.begriff &&
                                              Number(v.prozent) === Number(e.wert)).length;
          return n !== e.bleiben;
        }));
        if (!kontrolle) {
          onLog('? ' + p.name + ': gespeichert, aber die neue Version ließ sich nicht ' +
                'nachladen — bitte in der Fragensammlung nachsehen.');
        } else if (fehlend.length) {
          onLog('✖ ' + p.name + ': gespeichert, aber ' + fehlend.length +
                ' Begriff(e) stehen nicht wie erwartet drin — bitte von Hand ansehen.');
        } else {
          gespeichert++;
          const teile = [];
          if (a.angewandt.length) teile.push(a.angewandt.length + ' ergänzt');
          if (a.angewandtAend.length) teile.push(a.angewandtAend.length + ' geändert');
          if (a.angewandtEntf.length) teile.push(a.angewandtEntf.length + ' entfernt');
          onLog('✔ ' + p.name + ': ' + teile.join(', ') + ' und nachgeprüft.');
        }
      } catch (e) {
        onLog('✖ ' + p.name + ': ' + e.message);
      }
      fertig++;
      if (onProgress) onProgress(fertig, zuTun.length);
    }
    return { versucht: zuTun.length, gespeichert };
  }

  /* ================= Oberflaeche ================= */

  function kategorieName() {
    const e = document.querySelector('.qbank-category-name, .categoryinfo .categoryname');
    if (e) return e.textContent.trim();
    const b = [...document.querySelectorAll('[data-action="toggle"], .filter-value, .badge')]
      .map((x) => x.textContent.trim()).find((t) => /^\d+\.\d/.test(t));
    return b || '';
  }

  // Echtes Logo aus dem icons-Ordner statt des Zeichens „🧩". Faellt auf das
  // Zeichen zurueck, wenn das Bild nicht geladen werden kann (z. B. wenn der Eintrag
  // web_accessible_resources im Manifest fehlt).
  const fab = el('button', 'ca-fab');
  fab.title = 'Moodle Cloze Autofill';
  try {
    const bild = document.createElement('img');
    bild.src = browser.runtime.getURL('icon/128.png');
    bild.alt = 'Cloze Autofill';
    bild.className = 'ca-fab-icon';
    bild.addEventListener('error', () => { bild.remove(); fab.textContent = '🧩'; });
    fab.appendChild(bild);
  } catch (e) { fab.textContent = '🧩'; }
  document.body.appendChild(fab);

  const panel = el('div', 'ca-panel ca-hidden');
  panel.innerHTML = `
    <div class="ca-head">
      <div class="ca-titelblock">
        <span class="ca-title">🧩 Cloze Autofill <span class="ca-ver"></span></span>
        <span class="ca-untertitel">Antwortvarianten in Cloze-Fragen eintragen</span>
      </div>
      <button class="ca-close" title="Schließen">✕</button>
    </div>
    <div class="ca-tabs">
      <button class="ca-tab ca-aktiv" data-tab="liste">1 · Liste erzeugen</button>
      <button class="ca-tab" data-tab="einfuegen">2 · Cloze einfügen</button>
      <button class="ca-tab" data-tab="opt">⚙</button>
    </div>

    <div class="ca-body" data-panel="liste">
      <p class="ca-meta"></p>
      <p class="ca-hinweis">Liest die Lücken der angezeigten Lückentext-Fragen aus Moodle aus
      und baut daraus einen Prompt. Rein lesend — es wird nichts gespeichert.</p>
      <label class="ca-check"><input type="checkbox" class="ca-nurhaken" checked>
        Nur die angehakten Fragen <span class="ca-leise">(Haken weg = alle in der Ansicht)</span></label>
      <button class="ca-go">Liste erzeugen</button>
      <div class="ca-progress ca-hidden"><div class="ca-bar"></div></div>
      <p class="ca-ptext"></p>
      <div class="ca-result ca-hidden">
        <p class="ca-summary"></p>
        <button class="ca-copy">📋 Prompt + Daten kopieren</button>
        <button class="ca-copy2 ca-zweit">📋 nur die Daten</button>
        <p class="ca-groesse"></p>
      </div>
      <p class="ca-error ca-hidden"></p>
    </div>

    <div class="ca-body ca-hidden" data-panel="einfuegen">
      <p class="ca-hinweis">Hier das JSON von Claude einfügen. Geprüft wird zuerst — eingetragen
      wird erst danach, und nur was die Prüfung überstanden hat.</p>
      <textarea class="ca-json" rows="7" placeholder='{ "eintraege": [ … ] }'></textarea>
      <button class="ca-pruef">🔍 Prüfen</button>
      <div class="ca-progress2 ca-hidden"><div class="ca-bar2"></div></div>
      <p class="ca-ptext2"></p>
      <div class="ca-plan"></div>
      <div class="ca-log ca-hidden"></div>
      <button class="ca-logcopy ca-zweit ca-hidden">📋 Protokoll kopieren</button>
      <label class="ca-check ca-trotzdemzeile ca-hidden"><input type="checkbox" class="ca-trotzdem">
        Auch die Fragen eintragen, deren Syntaxprüfung unklar blieb</label>
      <button class="ca-schreiben ca-hidden">Jetzt eintragen</button>
      <button class="ca-neuladen ca-hidden">↻ Seite jetzt neu laden</button>
      <button class="ca-nichtladen ca-zweit ca-hidden">Moment — noch nicht laden</button>
      <p class="ca-jerror ca-hidden"></p>
    </div>

    <div class="ca-body ca-hidden" data-panel="opt">
      <label class="ca-label">Eigener Prompt (leer = Standard)
        <textarea class="ca-prompt" rows="10" placeholder="Leer lassen, um den mitgelieferten Prompt zu verwenden."></textarea>
      </label>
      <p class="ca-hinweis">Der Platzhalter <code>[CLOZE_AUTOFILL_DATEN]</code> wird durch die
      ausgelesenen Lücken ersetzt. Fehlt er, werden die Daten hinten angehängt.</p>
      <button class="ca-optsave">Speichern</button>
      <button class="ca-optvorlage ca-zweit">Standard einfügen</button>
      <button class="ca-optreset ca-zweit">Zurücksetzen</button>
      <p class="ca-optinfo ca-hidden"></p>
    </div>`;
  document.body.appendChild(panel);

  const $ = (s) => panel.querySelector(s);
  $('.ca-ver').textContent = 'v' + VERSION;

  fab.addEventListener('click', () => panel.classList.toggle('ca-hidden'));
  $('.ca-close').addEventListener('click', () => panel.classList.add('ca-hidden'));

  panel.querySelectorAll('.ca-tab').forEach((t) => {
    t.addEventListener('click', (ev) => {
      if (ev.isTrusted && weiterUhr) {
        clearInterval(weiterUhr); weiterUhr = null;
        $('.ca-copy').textContent = '📋 Prompt + Daten kopieren';
        $('.ca-copy2').textContent = '📋 nur die Daten';
      }
      panel.querySelectorAll('.ca-tab').forEach((x) => x.classList.remove('ca-aktiv'));
      t.classList.add('ca-aktiv');
      panel.querySelectorAll('.ca-body').forEach((b) => {
        b.classList.toggle('ca-hidden', b.dataset.panel !== t.dataset.tab);
      });
    });
  });

  const alleFragen = fragenDerAnsicht();
  const clozeFragen = alleFragen.filter((f) => f.cloze);
  $('.ca-meta').textContent = [kategorieName(), clozeFragen.length + ' Lückentext-Fragen in der Ansicht']
    .filter(Boolean).join(' · ');

  /* ---- Tab 1 ---- */

  let letzterPrompt = '', letzteDaten = '';

  async function inZwischenablage(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const t = el('textarea'); t.value = text;
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
      return ok;
    }
  }

  // Einheitlicher Ablauf aller Erweiterungen (24.09.2026): Kopieren quittiert,
  // zaehlt 3 s herunter und wechselt dann selbst in Reiter 2, Cursor im Feld.
  let weiterUhr = null;
  function quittung(knopf, urText) {
    const b = $(knopf);
    clearInterval(weiterUhr);
    let rest = 3;
    b.textContent = `✓ Kopiert — weiter in ${rest} s`;
    weiterUhr = setInterval(() => {
      rest--;
      if (rest > 0) { b.textContent = `✓ Kopiert — weiter in ${rest} s`; return; }
      clearInterval(weiterUhr); weiterUhr = null;
      b.textContent = urText;
      const t = panel.querySelector('.ca-tab[data-tab="einfuegen"]');
      if (t) t.click();
      $('.ca-json').focus();
    }, 1000);
  }
  // Eingefuegt wird fast immer die fertige KI-Antwort: gleich pruefen.
  $('.ca-json').addEventListener('paste', () => setTimeout(() => $('.ca-pruef').click(), 0));

  $('.ca-go').addEventListener('click', async () => {
    const fehler = $('.ca-error');
    fehler.classList.add('ca-hidden');
    $('.ca-result').classList.add('ca-hidden');

    // Frisch einlesen: die Haken koennen nach dem Seitenaufbau gesetzt worden sein.
    let liste = fragenDerAnsicht().filter((f) => f.cloze);
    if ($('.ca-nurhaken').checked) liste = liste.filter((f) => f.angehakt);
    if (!liste.length) {
      fehler.textContent = $('.ca-nurhaken').checked
        ? 'Keine Lückentext-Frage angehakt.'
        : 'In dieser Ansicht steht keine Lückentext-Frage.';
      fehler.classList.remove('ca-hidden');
      return;
    }

    const go = $('.ca-go');
    go.disabled = true;
    $('.ca-progress').classList.remove('ca-hidden');

    const fertig = [];
    const ohneZugriff = [];
    let n = 0;
    for (const f of liste) {
      try {
        const doc = await ladeFrageFormular(f.qid);
        if (!doc) { ohneZugriff.push(f.name); }
        else fertig.push({ name: f.name, qid: f.qid, luecken: leseLuecken(quelltextAus(doc)) });
      } catch (e) { ohneZugriff.push(f.name); }
      n++;
      $('.ca-bar').style.width = Math.round((n / liste.length) * 100) + '%';
      $('.ca-ptext').textContent = n + ' von ' + liste.length + ' gelesen';
    }

    go.disabled = false;
    $('.ca-progress').classList.add('ca-hidden');

    if (!fertig.length) {
      fehler.textContent = 'Keine Frage lesbar. Fehlt das Recht, Fragen zu bearbeiten?';
      fehler.classList.remove('ca-hidden');
      return;
    }

    const opt = await optionenLaden();
    letzteDaten = baueDaten(fertig, kategorieName());
    letzterPrompt = bauePrompt(letzteDaten, opt.prompt);

    const luecken = fertig.reduce((s, f) => s + f.luecken.length, 0);
    const varianten = fertig.reduce((s, f) => s + f.luecken.reduce((t, l) => t + l.varianten.length, 0), 0);
    $('.ca-summary').textContent = fertig.length + ' Fragen · ' + luecken + ' Lücken · ' +
      varianten + ' hinterlegte Varianten' +
      (ohneZugriff.length ? ' · ' + ohneZugriff.length + ' nicht lesbar' : '');
    $('.ca-groesse').textContent = 'Prompt: ' + letzterPrompt.length.toLocaleString('de-DE') +
      ' Zeichen · nur Daten: ' + letzteDaten.length.toLocaleString('de-DE') + ' Zeichen' +
      (letzterPrompt.length > 60000 ? ' — das ist viel für einen Chat, ggf. Kategorie enger filtern.' : '');
    $('.ca-result').classList.remove('ca-hidden');
  });

  $('.ca-copy').addEventListener('click', async () => {
    if (await inZwischenablage(letzterPrompt)) quittung('.ca-copy', '📋 Prompt + Daten kopieren');
  });
  $('.ca-copy2').addEventListener('click', async () => {
    if (await inZwischenablage(letzteDaten)) quittung('.ca-copy2', '📋 nur die Daten');
  });

  /* ---- Tab 2 ---- */

  let aktuellerPlan = null;

  // Das Protokoll muss den Neuladen der Seite überleben — sonst tauscht man die
  // eine Falle (veraltete Seite) gegen eine andere (Beleg weg).
  const PROTOKOLL_KEY = 'clozeAutofillLetztesProtokoll';

  function protokollSichern() {
    try {
      const zeilen = [...$('.ca-log').children].map((d) => d.textContent);
      if (!zeilen.length) return;
      localStorage.setItem(PROTOKOLL_KEY, JSON.stringify({ t: Date.now(), zeilen }));
    } catch (e) { /* ohne Protokoll weitermachen ist besser als abbrechen */ }
  }

  function protokollWiederherstellen() {
    let o = null;
    try {
      const roh = localStorage.getItem(PROTOKOLL_KEY);
      if (!roh) return;
      o = JSON.parse(roh);
      localStorage.removeItem(PROTOKOLL_KEY);
    } catch (e) { return; }
    if (!o || !Array.isArray(o.zeilen) || Date.now() - o.t > 30 * 60 * 1000) return;
    const log = $('.ca-log');
    log.classList.remove('ca-hidden');
    log.appendChild(el('div', 'ca-protokollkopf', '— Protokoll des letzten Laufs —'));
    o.zeilen.forEach((z) => log.appendChild(el('div', null, z)));
    $('.ca-logcopy').classList.remove('ca-hidden');
    // Sichtbar machen: sonst sucht man das Ergebnis im falschen Tab.
    panel.classList.remove('ca-hidden');
    panel.querySelectorAll('.ca-tab').forEach((t) => t.classList.toggle('ca-aktiv', t.dataset.tab === 'einfuegen'));
    panel.querySelectorAll('.ca-body').forEach((b) => b.classList.toggle('ca-hidden', b.dataset.panel !== 'einfuegen'));
  }

  function logZeile(text) {
    const log = $('.ca-log');
    log.classList.remove('ca-hidden');
    log.appendChild(el('div', null, text));
    log.scrollTop = log.scrollHeight;
    $('.ca-logcopy').classList.remove('ca-hidden');
  }

  // Das Protokoll ist der einzige Beleg dafür, was wirklich durchgegangen ist —
  // deshalb mit einem Klick kopierbar, statt es im schmalen Kasten zu markieren.
  function protokollText() {
    const kopf = ['Moodle Cloze Autofill v' + VERSION,
                  kategorieName(),
                  new Date().toLocaleString('de-DE')].filter(Boolean).join(' · ');
    const zeilen = [...$('.ca-log').children].map((d) => d.textContent);
    return kopf + '\n' + '-'.repeat(kopf.length) + '\n' + zeilen.join('\n');
  }

  function zeigePlan(plan, probleme) {
    const ziel = $('.ca-plan');
    ziel.innerHTML = '';
    probleme.forEach((p) => {
      const d = el('div', 'ca-frage');
      setzeHtml(d, '<span class="ca-warn">⚠ ' + escapeHtml(p) + '</span>');
      ziel.appendChild(d);
    });
    plan.forEach((p) => {
      const d = el('div', 'ca-frage');
      const zeilen = [];
      zeilen.push('<h4>' + escapeHtml(p.name) + '</h4>');
      p.aend.forEach((e) => {
        zeilen.push('<div class="ca-diff ca-aend">~ Lücke ' + e.luecke + ': ' +
          escapeHtml(e.begriff) + ' — ' + escapeHtml(prozentText(e.von)) + ' % → ' +
          escapeHtml(prozentText(e.nach)) + ' %</div>');
      });
      p.entf.forEach((e) => {
        zeilen.push('<div class="ca-diff ca-entf">− Lücke ' + e.luecke + ': ' +
          escapeHtml(e.begriff) + ' (' + escapeHtml(prozentText(e.wert)) + ' %)' +
          (e.warenEs > 1 ? ' — steht ' + e.warenEs + '×, einer bleibt' : '') + '</div>');
      });
      p.neu.forEach((e) => {
        zeilen.push('<div class="ca-diff ca-plus">+ Lücke ' + e.luecke + ': ~%' +
          escapeHtml(prozentCode(e.prozent)) + '%' + escapeHtml(e.begriff) + '</div>');
      });
      p.uebersprungen.forEach((t) => {
        zeilen.push('<div class="ca-diff ca-skip">· ' + escapeHtml(t) + '</div>');
      });
      p.fehler.forEach((t) => {
        zeilen.push('<div class="ca-diff ca-warn">⚠ ' + escapeHtml(t) + '</div>');
      });
      if (!p.neu.length && !p.aend.length && !p.entf.length && !p.uebersprungen.length && !p.fehler.length) {
        zeilen.push('<div class="ca-diff ca-skip">nichts zu tun</div>');
      }
      setzeHtml(d, zeilen.join(''));
      ziel.appendChild(d);
    });
  }

  $('.ca-pruef').addEventListener('click', async () => {
    const jerror = $('.ca-jerror');
    jerror.classList.add('ca-hidden');
    $('.ca-plan').innerHTML = '';
    $('.ca-log').innerHTML = '';
    $('.ca-log').classList.add('ca-hidden');
    $('.ca-schreiben').classList.add('ca-hidden');
    aktuellerPlan = null;

    let daten;
    try { daten = leseJson($('.ca-json').value); }
    catch (e) {
      jerror.textContent = e.message;
      jerror.classList.remove('ca-hidden');
      return;
    }

    const knopf = $('.ca-pruef');
    knopf.disabled = true;
    $('.ca-progress2').classList.remove('ca-hidden');
    $('.ca-ptext2').textContent = 'Fragen werden gelesen …';

    try {
      const { plan, probleme } = await planen(daten, (f, g) => {
        $('.ca-bar2').style.width = Math.round((f / g) * 50) + '%';
        $('.ca-ptext2').textContent = 'Frage ' + f + ' von ' + g + ' gelesen';
      });
      zeigePlan(plan, probleme);

      const zuTun = plan.filter((p) => p.neu.length || p.aend.length || p.entf.length);
      if (!zuTun.length) {
        $('.ca-ptext2').textContent = 'Nichts einzutragen — alles schon vorhanden oder übersprungen.';
        $('.ca-progress2').classList.add('ca-hidden');
        knopf.disabled = false;
        return;
      }

      $('.ca-ptext2').textContent = 'Moodle prüft die Syntax …';
      const res = await trockenlauf(plan, logZeile, (f, g) => {
        $('.ca-bar2').style.width = (50 + Math.round((f / g) * 50)) + '%';
      });

      const summe = plan.reduce((s, p) => s + p.neu.length + p.aend.length + p.entf.length, 0);
      $('.ca-ptext2').textContent = res.sauber + ' von ' + res.geprueft +
        ' Fragen sauber · ' + summe + ' Begriffe würden eingetragen';
      aktuellerPlan = plan;

      const unklar = plan.filter((p) => (p.neu.length || p.aend.length || p.entf.length) && p.pruefung === 'unklar').length;
      if (res.sauber || unklar) {
        const schreib = $('.ca-schreiben');
        schreib.textContent = res.sauber
          ? 'Jetzt eintragen (' + res.sauber + ' Fragen)'
          : 'Jetzt eintragen';
        schreib.classList.remove('ca-hidden');
      }
      if (unklar) {
        $('.ca-trotzdemzeile').classList.remove('ca-hidden');
        logZeile('Hinweis: bei ' + unklar + ' Frage(n) blieb die Syntaxprüfung unklar. ' +
                 'Die Gegenprobe nach dem Speichern läuft trotzdem — sie sagt dir, ob es geklappt hat.');
      }
    } catch (e) {
      jerror.textContent = e.message;
      jerror.classList.remove('ca-hidden');
    } finally {
      knopf.disabled = false;
      $('.ca-progress2').classList.add('ca-hidden');
    }
  });

  $('.ca-logcopy').addEventListener('click', async () => {
    if (await inZwischenablage(protokollText())) quittung('.ca-logcopy', '📋 Protokoll kopieren');
  });

  $('.ca-schreiben').addEventListener('click', async () => {
    if (!aktuellerPlan) return;
    const knopf = $('.ca-schreiben');
    knopf.disabled = true;
    $('.ca-progress2').classList.remove('ca-hidden');
    $('.ca-bar2').style.width = '0%';
    logZeile('— Eintragen gestartet —');

    try {
      const res = await eintragen(aktuellerPlan, logZeile, (f, g) => {
        $('.ca-bar2').style.width = Math.round((f / g) * 100) + '%';
        $('.ca-ptext2').textContent = 'Frage ' + f + ' von ' + g;
      }, $('.ca-trotzdem').checked);
      $('.ca-ptext2').textContent = res.gespeichert + ' von ' + res.versucht + ' Fragen gespeichert.';
      logZeile('— fertig. Die Fragensammlung neu laden, um die neue Versionsnummer zu sehen. —');
      // Nach dem Speichern tragen die Fragen NEUE ids. Ein zweiter Lauf mit
      // demselben JSON würde an der qid-Prüfung scheitern — deshalb hier Schluss.
      knopf.classList.add('ca-hidden');
      $('.ca-trotzdemzeile').classList.add('ca-hidden');
      aktuellerPlan = null;
      logZeile('⚠ Diese Seite ist jetzt veraltet: Ihre Links zeigen noch auf die ALTEN ' +
               'Fragen-Versionen. Wer von hier aus eine Frage öffnet und speichert, macht ' +
               'die Änderung rückgängig. Also erst neu laden — dann ist auch die Liste in ' +
               'Tab 1 wieder gültig.');
      const nl = $('.ca-neuladen');
      nl.classList.remove('ca-hidden');
      protokollSichern();
      // Von selbst neu laden, aber mit Bedenkzeit und Ausstieg.
      let rest = 3;
      const abbruch = $('.ca-nichtladen');
      abbruch.classList.remove('ca-hidden');
      const ticken = setInterval(() => {
        rest--;
        nl.textContent = '↻ Seite wird in ' + rest + ' s neu geladen';
        if (rest <= 0) { clearInterval(ticken); panel.classList.add('ca-hidden'); location.reload(); }
      }, 1000);
      nl.textContent = '↻ Seite wird in ' + rest + ' s neu geladen';
      nl.onclick = () => { clearInterval(ticken); location.reload(); };
      abbruch.onclick = () => {
        clearInterval(ticken);
        nl.textContent = '↻ Seite jetzt neu laden';
        abbruch.classList.add('ca-hidden');
      };
    } catch (e) {
      logZeile('✖ Abbruch: ' + e.message);
    } finally {
      $('.ca-progress2').classList.add('ca-hidden');
      knopf.disabled = false;
    }
  });

  /* ---- Tab 3: Einstellungen ---- */

  optionenLaden().then((o) => { $('.ca-prompt').value = o.prompt || ''; });

  protokollWiederherstellen();

  function optInfo(text) {
    const p = $('.ca-optinfo');
    p.textContent = text;
    p.classList.remove('ca-hidden');
    setTimeout(() => p.classList.add('ca-hidden'), 2500);
  }

  $('.ca-optsave').addEventListener('click', async () => {
    await optionenSpeichern({ prompt: $('.ca-prompt').value.trim() });
    optInfo('Gespeichert.');
  });
  $('.ca-optvorlage').addEventListener('click', () => {
    $('.ca-prompt').value = standardPrompt();
    optInfo('Standard eingefügt — noch nicht gespeichert.');
  });
  $('.ca-optreset').addEventListener('click', async () => {
    $('.ca-prompt').value = '';
    await optionenSpeichern({ prompt: '' });
    optInfo('Zurückgesetzt.');
  });
}
