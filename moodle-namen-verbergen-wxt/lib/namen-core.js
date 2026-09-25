/* Moodle Namen verbergen — Kern.
 *
 * Verwischt Namen, E-Mail-Adressen und (optional) Profilbilder auf Moodle-Seiten per CSS-Filter.
 * Ideengeber: Andreas Schenkel (github.com/andreasschenkel/moodle-textblock-blurmode_controller).
 * Original-Vermerk dort: "Andreas Schenkel based on code and ideas from Matthias Giger
 * (github.com/mattgig) and Florian Dagner (github.com/fdagner)". Dies ist eine eigene Umsetzung als
 * Browser-Erweiterung — es ist kein Code aus jenem Repo uebernommen (das Repo traegt keine Lizenz).
 *
 * Arbeitsweise: Ein <style>-Element mit Regeln, die nur greifen, wenn <html> die Klasse
 * "mnv-aktiv" traegt. Umschalten heisst nur, diese Klasse zu setzen — nachgeladene Inhalte
 * (Moodle laedt viel per Ajax) sind damit automatisch mit erfasst.
 *
 * A. Spielhoff · CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';
import { ladeEinstellung, speichereEinstellung, SCHLUESSEL, STANDARD } from './speicher.js';

// Namen und Kontaktdaten. Verweise auf Nutzerprofile decken Teilnehmerliste, Bewertungsuebersicht,
// Testauswertung, Foren und Aufgaben-Bewerten in einem Zug ab — unabhaengig vom Theme.
const SEL_NAMEN = [
  'a[href*="/user/view.php"]',
  'a[href*="/user/profile.php"]',
  'a[href^="mailto:"]',
  '.fullname',
  '.userfullname',
  '.username',
  '.useremail',
  '.usersummary',
  '#participants tbody td.cell.c1',
  '[data-region="user-info"]',
  '[data-region="grade-panel"] .user-name',
  '#page-user-profile .page-header-headings h1',
  '#page-user-profile .userprofile .contact-details',
  // Von markiereTabellen() gesetzt: E-Mail-/Benutzername-Spalten und Zellen, die nur eine Adresse enthalten.
  '[data-mnv-blur]',
];
const SEL_AVATARE = [
  'img.userpicture',
  'img.userpix',
  '.userpicture',
  '.userinitials',
  '.profilepic',
  '.avatar:not(.icon)',
];
// Nicht verwischen: die eigene Menueleiste (eigener Name), sowie die Bedienung dieser Erweiterung.
const AUSNAHMEN = ':not(.navbar *):not(.usermenu *):not(#mnv-wurzel *)';

const KLASSE = 'mnv-aktiv';
const CSS_ID = 'mnv-css';

let einst = { ...STANDARD };

function istGueltig(sel) {
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch (e) {
    return false;
  }
}

function eigeneSelektoren(text) {
  return String(text || '')
    .split('\n')
    .map((z) => z.trim())
    .filter((z) => z && istGueltig(z));
}

export function baueCss(e) {
  const liste = [...SEL_NAMEN];
  if (e.avatare) liste.push(...SEL_AVATARE);
  liste.push(...eigeneSelektoren(e.eigene));
  const staerke = Math.min(20, Math.max(2, Number(e.staerke) || STANDARD.staerke));
  const regeln = liste.map((s) => `html.${KLASSE} ${s}${AUSNAHMEN}`).join(',\n');
  return `${regeln} {
  filter: blur(${staerke}px) !important;
  user-select: none !important;
}`;
}

// E-Mail-Adressen und Benutzernamen stehen in Moodle-Tabellen (Teilnehmerliste, Testauswertung,
// Bewertungsuebersicht) als reiner Text ohne eigene Klasse. Deshalb per Spaltenkopf erkennen und die
// Zellen der Spalte markieren; zusaetzlich jedes Blatt-Element, das nur aus einer Adresse besteht.
// Namensspalten werden hier bewusst NICHT markiert: dort steht neben dem Namen oft ein Knopf
// ("Versuch ueberpruefen"), der lesbar bleiben soll — den Namen selbst erfassen die Profil-Links.
const KOPF_SPALTE = /e-?mail|benutzername|username|id-?nummer|idnumber|matrikel/i;
const NUR_ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MARKE = 'data-mnv-blur';

function markiereTabellen() {
  // Beim fruehen Anwenden (document_start) gibt es <body> noch nicht. Ein Fehler hier darf
  // ausserdem NIE den Aufbau der Oberflaeche verhindern (Fehler 1.0.2: Knopf fehlte).
  if (!einst.aktiv || !document.body) return;
  try {
    markiereTabellenUnsicher();
  } catch (e) { /* Markierung ist Zugabe; Blur per CSS wirkt trotzdem */ }
}

function markiereTabellenUnsicher() {
  for (const tab of document.querySelectorAll('table')) {
    const koepfe = tab.querySelectorAll('thead th');
    const kopfzellen = koepfe.length ? koepfe : (tab.rows[0] ? tab.rows[0].querySelectorAll('th') : []);
    const spalten = [];
    for (const th of kopfzellen) {
      if (KOPF_SPALTE.test(th.textContent || '')) spalten.push(th.cellIndex);
    }
    if (!spalten.length) continue;
    for (const tr of tab.querySelectorAll('tbody tr')) {
      for (const i of spalten) {
        const z = tr.cells[i];
        if (z && z.tagName === 'TD' && !z.hasAttribute(MARKE)) z.setAttribute(MARKE, '');
      }
    }
  }
  for (const el of document.body.querySelectorAll('td, dd, li, span, p, div, a')) {
    if (el.childElementCount || el.hasAttribute(MARKE)) continue;
    const s = (el.textContent || '').trim();
    if (s.length < 200 && NUR_ADRESSE.test(s)) el.setAttribute(MARKE, '');
  }
}

let markTimer = null;
function planeMarkierung() {
  clearTimeout(markTimer);
  markTimer = setTimeout(markiereTabellen, 250);
}
let beobachter = null;
function beobachte() {
  if (beobachter || !document.body) return;
  // Moodle laedt Tabellen und Blockinhalte nach; neue Knoten muessen auch markiert werden.
  beobachter = new MutationObserver(() => { if (einst.aktiv) planeMarkierung(); });
  beobachter.observe(document.body, { childList: true, subtree: true });
}

function setzeCss() {
  let el = document.getElementById(CSS_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = CSS_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = baueCss(einst);
}

function istMoodle() {
  const b = document.body;
  return !!b && /(^|\s)pagelayout-/.test(b.className || '');
}

function anwenden() {
  setzeCss();
  document.documentElement.classList.toggle(KLASSE, !!einst.aktiv);
  if (einst.aktiv) { markiereTabellen(); beobachte(); }
  aktualisiereUi();
}

// ---------- Oberflaeche ----------
const AUGE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const AUGE_AUS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a19.8 19.8 0 0 1 5.1-5.9M9.9 5.1A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a19.9 19.9 0 0 1-3.2 4.2M1 1l22 22"/></svg>';
const ZAHNRAD = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

let ui = null;

function baueUi() {
  const w = document.createElement('div');
  w.id = 'mnv-wurzel';
  w.innerHTML = `
    <div id="mnv-panel" hidden>
      <label class="mnv-zeile">Stärke: <output id="mnv-staerke-wert"></output> px
        <input type="range" id="mnv-staerke" min="2" max="20" step="1"></label>
      <label class="mnv-zeile mnv-check"><input type="checkbox" id="mnv-avatare"> Profilbilder auch verwischen</label>
      <label class="mnv-zeile">Weitere CSS-Selektoren (einer pro Zeile)
        <textarea id="mnv-eigene" rows="3" spellcheck="false" placeholder=".meine-klasse"></textarea></label>
      <p class="mnv-hinweis">Idee: <a href="https://github.com/andreasschenkel/moodle-textblock-blurmode_controller" target="_blank" rel="noopener noreferrer">Andreas Schenkel</a>,
      nach Code und Ideen von <a href="https://github.com/mattgig" target="_blank" rel="noopener noreferrer">Matthias Giger</a>
      und <a href="https://github.com/fdagner" target="_blank" rel="noopener noreferrer">Florian Dagner</a>.
      Umsetzung: A. Spielhoff · CC BY-SA 4.0. Die Einstellung wird im Browser gemerkt.</p>
    </div>
    <div id="mnv-leiste">
      <button type="button" id="mnv-toggle"></button>
      <button type="button" id="mnv-zahn" title="Einstellungen" aria-label="Einstellungen für Namen verbergen">${ZAHNRAD}</button>
    </div>`;
  document.body.appendChild(w);
  const $ = (id) => w.querySelector('#' + id);
  ui = {
    w,
    panel: $('mnv-panel'),
    toggle: $('mnv-toggle'),
    staerke: $('mnv-staerke'),
    wert: $('mnv-staerke-wert'),
    avatare: $('mnv-avatare'),
    eigene: $('mnv-eigene'),
  };
  ui.toggle.addEventListener('click', () => setze({ aktiv: !einst.aktiv }));
  $('mnv-zahn').addEventListener('click', () => { ui.panel.hidden = !ui.panel.hidden; });
  ui.staerke.addEventListener('input', () => setze({ staerke: Number(ui.staerke.value) }));
  ui.avatare.addEventListener('change', () => setze({ avatare: ui.avatare.checked }));
  let timer = null;
  ui.eigene.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => setze({ eigene: ui.eigene.value }), 400);
  });
  aktualisiereUi();
}

function aktualisiereUi() {
  if (!ui) return;
  ui.toggle.innerHTML = einst.aktiv ? AUGE_AUS : AUGE;
  ui.toggle.title = einst.aktiv ? 'Namen sind verborgen — klicken zum Anzeigen' : 'Namen verbergen';
  ui.toggle.setAttribute('aria-pressed', String(!!einst.aktiv));
  ui.toggle.setAttribute('aria-label', ui.toggle.title);
  ui.toggle.classList.toggle('mnv-an', !!einst.aktiv);
  ui.wert.textContent = String(einst.staerke);
  if (document.activeElement !== ui.staerke) ui.staerke.value = String(einst.staerke);
  ui.avatare.checked = !!einst.avatare;
  if (document.activeElement !== ui.eigene) ui.eigene.value = einst.eigene || '';
}

async function setze(teil) {
  einst = { ...einst, ...teil };
  anwenden();
  await speichereEinstellung(einst);
}

export function starteNamenVerbergen() {
  // Frueh anwenden, damit beim Laden keine Namen aufblitzen; die Moodle-Pruefung folgt,
  // sobald <body> da ist. Auf einer fremden Seite wird alles wieder zurueckgenommen.
  ladeEinstellung().then((e) => {
    einst = e;
    if (einst.aktiv) anwenden();
    const weiter = () => {
      if (!istMoodle()) {
        document.documentElement.classList.remove(KLASSE);
        document.getElementById(CSS_ID)?.remove();
        return;
      }
      anwenden();
      if (!document.getElementById('mnv-wurzel')) baueUi();
      try {
        browser.storage.onChanged.addListener((aenderung) => {
          if (aenderung[SCHLUESSEL] && aenderung[SCHLUESSEL].newValue) {
            einst = { ...STANDARD, ...aenderung[SCHLUESSEL].newValue };
            anwenden();
          }
        });
      } catch (err) { /* Erweiterungskontext ungueltig: Seite neu laden */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', weiter, { once: true });
    else weiter();
  });
}
