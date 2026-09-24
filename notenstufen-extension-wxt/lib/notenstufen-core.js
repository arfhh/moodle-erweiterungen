/* Moodle Notenstufen Autofill — Kern, aus content.js v2.8.0 uebernommen (WXT-Umzug 17.09.2026).
 * Aenderungen beim Umzug, wie bei Coach und Aufgaben-Grader:
 *  1. chrome.* -> browser.*        (Polyfill, Chrome UND Firefox)
 *  2. IIFE/Top-Level-Code -> export function starteNotenstufen()
 * Sonst ist die Datei zeilengleich mit der bewaehrten Fassung.
 *
 * A. Spielhoff · CC BY-SA 4.0
 */
import { browser } from 'wxt/browser';

export function starteNotenstufen() {
  'use strict';

// Gymnasium-Standardwerte (Vorgabe), falls noch keine eigenen Werte gespeichert sind
const DEFAULT_NOTEN = [
    ['1+', '98,00000'],
    ['1',  '95,00000'],
    ['1-', '90,50000'],
    ['2+', '86,00000'],
    ['2',  '81,50000'],
    ['2-', '77,00000'],
    ['3+', '72,50000'],
    ['3',  '68,00000'],
    ['3-', '63,50000'],
    ['4+', '59,00000'],
    ['4',  '54,50000'],
    ['4-', '50,00000'],
    ['5+', '40,00000'],
    ['5',  '30,00000'],
    ['5-', '20,00000'],
    ['6',  '0,00000'],
];

// Stadtteilschule-Standardwerte (zweite Vorgabe, ueber den Preset-Knopf im Panel)
const DEFAULT_NOTEN_STADTTEILSCHULE = [
    ['E1+', '97,00'],
    ['E1',  '94,00'],
    ['E1-', '91,00'],
    ['E2+', '86,00'],
    ['E2',  '81,00'],
    ['E2-', '77,00'],
    ['E3+', '73,00'],
    ['E3',  '68,00'],
    ['E3-', '64,00'],
    ['E4+', '59,00'],
    ['E4',  '55,00'],
    ['E4-', '50,00'],
    ['G2+', '46,00'],
    ['G2',  '42,00'],
    ['G2-', '38,00'],
    ['G3+', '34,00'],
    ['G3',  '30,00'],
    ['G3-', '27,00'],
    ['G4+', '24,00'],
    ['G4',  '21,00'],
    ['G4-', '19,00'],
    ['G5+', '16,00'],
    ['G5',  '13,00'],
    ['G5-', '10,00'],
    ['G6',  '0,00'],
];

// Signal, das einen Seiten-Neuladevorgang ueberlebt. localStorage statt
// sessionStorage, damit es auch dann sichtbar ist, wenn Moodle die Seite
// wider Erwarten doch einmal in einem neuen Tab oeffnet.
const PENDING_KEY = 'notenstufenAutofillPending';
const PENDING_TTL_MS = 30000;   // Signal nur 30 s gueltig, gegen veraltete Reste
const MAX_RUNDEN = 12;          // Sicherheitsnetz gegen Endlosschleifen

// ------------------------------------------------------------
//  Einstellungen — pro Kurs, mit Vorbelegung aus dem zuletzt benutzten Kurs
// ------------------------------------------------------------
// Jeder Kurs speichert seine eigene Notenskala unter seiner Kurs-ID (Wunsch
// aus der Praxis, 17.09.2026: Kollegien unterrichten oft mehrere Schulformen
// gleichzeitig). Ein neuer, noch nie eingestellter Kurs startet nicht bei
// Null, sondern mit der zuletzt in IRGENDEINEM Kurs benutzten Tabelle
// (notenstufenStandard) — wer immer dieselbe Schulform unterrichtet, muss
// so nichts wiederholt eintippen. Nur wenn es weder eine Kurs- noch eine
// Standard-Tabelle gibt, greift die Gymnasium-Vorgabe.
// Migration: die Fassung vor dieser Aenderung kannte nur den einen
// globalen Schluessel "notenstufen" fuer alle Kurse — der wird, falls noch
// vorhanden, als Standard-Tabelle uebernommen, damit eine schon angepasste
// Skala nicht verloren geht.
function holeKursId() {
    const m = location.href.match(/[?&]id=(\d+)/);
    return m ? m[1] : 'unbekannt';
}

function getNoten(kursId) {
    return new Promise((resolve) => {
        browser.storage.local.get(
            ['notenstufenProKurs', 'notenstufenStandard', 'notenstufen'],
            (result) => {
                const proKurs = result.notenstufenProKurs && typeof result.notenstufenProKurs === 'object'
                    ? result.notenstufenProKurs
                    : {};
                if (Array.isArray(proKurs[kursId]) && proKurs[kursId].length > 0) {
                    resolve(proKurs[kursId]);
                } else if (Array.isArray(result.notenstufenStandard) && result.notenstufenStandard.length > 0) {
                    resolve(result.notenstufenStandard);
                } else if (Array.isArray(result.notenstufen) && result.notenstufen.length > 0) {
                    resolve(result.notenstufen);   // Altbestand vor der Kurstrennung
                } else {
                    resolve(DEFAULT_NOTEN);
                }
            },
        );
    });
}

function speichereNurFuerKurs(kursId, noten) {
    return new Promise((resolve) => {
        browser.storage.local.get(['notenstufenProKurs'], (result) => {
            const proKurs = result.notenstufenProKurs && typeof result.notenstufenProKurs === 'object'
                ? result.notenstufenProKurs
                : {};
            proKurs[kursId] = noten;
            browser.storage.local.set({ notenstufenProKurs: proKurs }, resolve);
        });
    });
}

// "Fuer alle Kurse" heisst: diese Tabelle wird der neue Standard, UND eine
// eventuell vorhandene eigene Tabelle genau dieses Kurses wird entfernt —
// sonst wuerde die alte Kurs-eigene Tabelle den neuen Standard weiter
// verdecken, obwohl der Haken gerade extra entfernt wurde.
function speichereFuerAlleKurse(kursId, noten) {
    return new Promise((resolve) => {
        browser.storage.local.get(['notenstufenProKurs'], (result) => {
            const proKurs = result.notenstufenProKurs && typeof result.notenstufenProKurs === 'object'
                ? result.notenstufenProKurs
                : {};
            delete proKurs[kursId];
            browser.storage.local.set(
                { notenstufenProKurs: proKurs, notenstufenStandard: noten },
                resolve,
            );
        });
    });
}

// Fuer die Tabelle im Panel: welche Werte gelten hier gerade, und hat DIESER
// Kurs eine eigene Tabelle (fuer den Anfangszustand des Kaestchens)?
function ladeKursEinstellung(kursId) {
    return new Promise((resolve) => {
        browser.storage.local.get(
            ['notenstufenProKurs', 'notenstufenStandard', 'notenstufen'],
            (result) => {
                const proKurs = result.notenstufenProKurs && typeof result.notenstufenProKurs === 'object'
                    ? result.notenstufenProKurs
                    : {};
                const eigene = Array.isArray(proKurs[kursId]) && proKurs[kursId].length > 0;
                if (eigene) {
                    resolve({ noten: proKurs[kursId], kurseigen: true });
                } else if (Array.isArray(result.notenstufenStandard) && result.notenstufenStandard.length > 0) {
                    resolve({ noten: result.notenstufenStandard, kurseigen: false });
                } else if (Array.isArray(result.notenstufen) && result.notenstufen.length > 0) {
                    resolve({ noten: result.notenstufen, kurseigen: false });   // Altbestand
                } else {
                    resolve({ noten: DEFAULT_NOTEN, kurseigen: false });
                }
            },
        );
    });
}

// ------------------------------------------------------------
//  DOM-Helfer
// ------------------------------------------------------------
// Setzt einen Wert so, dass Moodle/JS-Framework die Aenderung mitbekommt
function setValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Primaer: ueber die STABILEN Moodle-Feldnamen gradeletter[N] / gradeboundary[N].
// (Bis v2.4 lief das ueber fieldset.w-100.m-0.p-0.border-0 – reine
//  Bootstrap-Utility-Klassen, die jedes Theme-Update aendern kann.)
function getRowsByName() {
    return Array.from(document.querySelectorAll('input[name^="gradeletter["]'))
        .map(el => {
            const m = el.name.match(/\[(\d+)\]/);
            if (!m) return null;
            const idx = parseInt(m[1], 10);
            const prozent = document.querySelector(`input[name="gradeboundary[${idx}]"]`);
            return prozent ? { idx, buchstabe: el, prozent } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.idx - b.idx);
}

// Rueckfallebene, falls Moodle die Feldnamen aendert: ueber die Legende "Note N".
function getRowsByLegend() {
    return Array.from(document.querySelectorAll('fieldset'))
        .map(fs => {
            const legend = fs.querySelector('legend');
            const m = legend && legend.textContent.match(/Note (\d+)/);
            if (!m) return null;
            const inputs = Array.from(fs.querySelectorAll('input[type="text"]'));
            if (inputs.length < 2) return null;
            return { idx: parseInt(m[1], 10) - 1, buchstabe: inputs[0], prozent: inputs[1] };
        })
        .filter(Boolean)
        .sort((a, b) => a.idx - b.idx);
}

function getRows() {
    const rows = getRowsByName();
    return rows.length > 0 ? rows : getRowsByLegend();
}

// Primaer ueber die aus dem Formularnamen erzeugte ID – die ist moodle-weit
// stabil und sprachunabhaengig. Der Text-Rueckfall greift nur, wenn Moodle die
// ID einmal aendert; er kennt deutsche und englische Oberflaeche.
const OVERRIDE_TEXTE = ['Voreinstellungen überschreiben', 'Override site defaults'];

function findOverrideCheckbox() {
    const direkt = document.getElementById('id_override');
    if (direkt) return direkt;
    return Array.from(document.querySelectorAll('input[type="checkbox"]')).find(cb => {
        const label = document.querySelector(`label[for="${cb.id}"]`);
        return label && OVERRIDE_TEXTE.some(t => label.textContent.includes(t));
    });
}

// "X Feld(er) zum Formular hinzufuegen" – in Moodle ein echter Submit-Button,
// der die Seite serverseitig neu aufbaut. Genau daran ist v2.4 gescheitert.
function findAddButton() {
    return document.querySelector('input[name="gradeentryadd"]');
}

// Der "Bearbeiten"-Knopf steckt in einem GET-Formular auf die Notenstufen-Adresse.
// Das Formular ist die sprachunabhaengige Kennung; der Beschriftungsvergleich ist
// nur die Feinauswahl, falls das Formular mehrere Knoepfe hat.
const BEARBEITEN_TEXTE = ['Bearbeiten', 'Edit'];

function findBearbeitenButton() {
    const buttons = Array.from(
        document.querySelectorAll('form[action*="/grade/edit/letter/"] button[type="submit"]'));
    if (!buttons.length) return null;
    const nachText = buttons.find(b => BEARBEITEN_TEXTE.includes(b.textContent.trim()));
    // Gibt es nur einen Knopf, ist es dieser – egal wie die Oberflaeche ihn nennt.
    return nachText || (buttons.length === 1 ? buttons[0] : null);
}

function isEditPage() {
    return !!findOverrideCheckbox() || getRows().length > 0;
}

function isOverviewPage() {
    return !isEditPage() && !!findBearbeitenButton();
}

// ------------------------------------------------------------
//  Statusanzeige (statt blockierendem alert())
// ------------------------------------------------------------
function zeigeStatus(text, istFehler = false) {
    let box = document.getElementById('notenstufen-autofill-status');
    if (!box) {
        box = document.createElement('div');
        box.id = 'notenstufen-autofill-status';
        box.style.cssText = [
            'position:fixed', 'top:140px', 'right:20px', 'z-index:99999',
            'max-width:320px', 'padding:10px 14px', 'border-radius:6px',
            'font-size:13px', 'line-height:1.45', 'white-space:pre-line',
            'color:#fff', 'box-shadow:0 2px 8px rgba(0,0,0,.3)'
        ].join(';');
        document.body.appendChild(box);
    }
    box.style.background = istFehler ? '#8a2020' : '#2f7a3d';
    box.textContent = text;
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.remove(), 10000);
}

// ------------------------------------------------------------
//  Pending-Signal ueber Seiten-Neuladungen hinweg
// ------------------------------------------------------------
function setPending(runde) {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ t: Date.now(), runde }));
}

function readPending() {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o.runde !== 'number' || Date.now() - o.t > PENDING_TTL_MS) {
            localStorage.removeItem(PENDING_KEY);
            return null;
        }
        return o;
    } catch (e) {
        localStorage.removeItem(PENDING_KEY);   // z. B. Altformat aus v2.4
        return null;
    }
}

function clearPending() {
    localStorage.removeItem(PENDING_KEY);
}

// ------------------------------------------------------------
//  Hauptablauf
// ------------------------------------------------------------
// Falls Moodle die Zeilen doch einmal ohne Neuladen ergaenzt (AJAX), hier merken
function waitForMoreRows(before, timeout = 3000) {
    return new Promise(resolve => {
        const start = Date.now();
        const check = () => {
            if (getRows().length > before) resolve(true);
            else if (Date.now() - start > timeout) resolve(false);
            else setTimeout(check, 100);
        };
        check();
    });
}

// Laeuft ggf. ueber mehrere Seiten-Neuladungen hinweg weiter: vor JEDEM Klick auf
// "Felder hinzufuegen" wird das Pending-Signal neu gesetzt, damit die frisch
// geladene Seite den Ablauf selbst fortsetzt.
async function run(runde = 0) {
    const noten = await getNoten(holeKursId());

    // Haken zuerst: er wird beim Neuladen als Formularwert mit uebertragen
    const cb = findOverrideCheckbox();
    if (cb && !cb.checked) cb.click();

    const vorhanden = getRows().length;

    if (vorhanden < noten.length) {
        const add = findAddButton();

        if (add && runde < MAX_RUNDEN) {
            zeigeStatus(`Zeilen: ${vorhanden} von ${noten.length} – ergänze Formularzeilen …`);
            setPending(runde + 1);
            add.click();

            // Fall A (Normalfall): die Seite laedt neu, dieser Kontext endet gleich
            //                      und init() der neuen Seite macht weiter.
            // Fall B: Moodle ergaenzt ohne Neuladen -> hier direkt fortsetzen.
            const mehr = await waitForMoreRows(vorhanden);
            if (mehr && readPending()) {
                clearPending();
                return run(runde + 1);
            }
            return;
        }

        zeigeStatus(
            `Es lassen sich nur ${vorhanden} von ${noten.length} Zeilen anlegen.\n` +
            `Ich fülle so viele wie möglich – den Rest bitte von Hand ergänzen.`, true);
    }

    fillNow(noten);
}

function fillNow(noten) {
    // kurze Pause, falls das Anhaken erst die Felder aktiviert
    setTimeout(() => {
        const rows = getRows();
        let gefuellt = 0;
        let geleert = 0;

        rows.forEach(row => {
            if (row.idx < noten.length) {
                setValue(row.buchstabe, noten[row.idx][0]);
                setValue(row.prozent, noten[row.idx][1]);
                gefuellt++;
            } else if (row.buchstabe.value.trim() !== '' || row.prozent.value.trim() !== '') {
                // Ueberzaehlige Zeile: alte Werte wuerden sonst mitgespeichert,
                // weil "Voreinstellungen ueberschreiben" gesetzt ist.
                setValue(row.buchstabe, '');
                setValue(row.prozent, '');
                geleert++;
            }
        });

        let text = `Notenstufen ausgefüllt: ${gefuellt} von ${noten.length} Zeilen.`;
        if (geleert > 0) text += `\n${geleert} überzählige Zeile(n) geleert.`;
        text += `\nBitte prüfen und auf „Änderungen speichern“ klicken.`;
        zeigeStatus(text, gefuellt < noten.length);
    }, 300);
}

// Uebersichtsseite -> Bearbeiten-Seite. Das Formular ist ein GET-Formular ohne
// target, der Wechsel passiert also im selben Tab als echter Seitenwechsel.
function gotoEditAndFill() {
    const bearbeiten = findBearbeitenButton();
    if (!bearbeiten) {
        run(0);
        return;
    }
    setPending(0);
    bearbeiten.click();

    // Sicherheitsnetz, falls wider Erwarten kein Seitenwechsel stattfindet
    setTimeout(() => {
        if (isEditPage() && readPending()) {
            clearPending();
            run(0);
        }
    }, 1500);
}

// ------------------------------------------------------------
//  Oberflaeche
// ------------------------------------------------------------
// Eingeklappt bleibt nur ein rundes Icon stehen, wie bei den anderen
// Erweiterungen (Aufgaben-Grader #abg-toggle, Coach .co-fab) — icon/*.png
// muss dafuer in web_accessible_resources stehen (wxt.config.ts), sonst
// laedt das Bild auf der Moodle-Seite nicht.
function baueTabellenzeile(tbody, index, buchstabe, prozent) {
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.className = 'not-label';
    tdLabel.textContent = `Note ${index + 1}`;

    const tdBuchstabe = document.createElement('td');
    const inputBuchstabe = document.createElement('input');
    inputBuchstabe.type = 'text';
    inputBuchstabe.dataset.idx = String(index);
    inputBuchstabe.dataset.feld = 'buchstabe';
    inputBuchstabe.value = buchstabe;
    tdBuchstabe.appendChild(inputBuchstabe);

    const tdProzent = document.createElement('td');
    const inputProzent = document.createElement('input');
    inputProzent.type = 'text';
    inputProzent.dataset.idx = String(index);
    inputProzent.dataset.feld = 'prozent';
    inputProzent.value = prozent;
    tdProzent.appendChild(inputProzent);

    // Zeile entfernen: wer eine Note nicht braucht (z. B. keine 1+), loescht
    // sie hier einfach heraus. Wirkt erst nach "Notenstufen eintragen", genau
    // wie eine getippte Aenderung an Buchstabe/Prozent.
    const tdWeg = document.createElement('td');
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'not-entfernen';
    weg.textContent = '✕';
    weg.title = 'Diese Note entfernen';
    weg.addEventListener('click', () => {
        const noten = leseTabelle(tbody);
        noten.splice(index, 1);
        renderTabelle(tbody, noten);
    });
    tdWeg.appendChild(weg);

    tr.appendChild(tdLabel);
    tr.appendChild(tdBuchstabe);
    tr.appendChild(tdProzent);
    tr.appendChild(tdWeg);
    tbody.appendChild(tr);
}

function renderTabelle(tbody, noten) {
    tbody.innerHTML = '';
    noten.forEach((paar, i) => baueTabellenzeile(tbody, i, paar[0], paar[1]));
}

function leseTabelle(tbody) {
    const anzahl = tbody.querySelectorAll('tr').length;
    const zeilen = Array.from({ length: anzahl }, () => ['', '']);
    tbody.querySelectorAll('input').forEach((input) => {
        const idx = parseInt(input.dataset.idx, 10);
        const feldIndex = input.dataset.feld === 'buchstabe' ? 0 : 1;
        zeilen[idx][feldIndex] = input.value.trim();
    });
    return zeilen;
}

function speichereNoten(noten) {
    return new Promise((resolve) => {
        browser.storage.local.set({ notenstufen: noten }, resolve);
    });
}

function baueUI() {
    if (document.getElementById('not-panel') || document.getElementById('not-toggle')) return;

    const panel = document.createElement('div');
    panel.id = 'not-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="not-head">
        <img class="not-head-icon" alt="" />
        <div class="not-titelblock">
          <span><strong>Notenstufen Autofill</strong> <span class="not-version"></span></span>
          <span class="not-untertitel">Notenstufen des Kurses ausfüllen</span>
        </div>
        <span class="not-close" title="Schließen">✕</span>
      </div>
      <div class="not-body">
        <p class="not-hinweis">Werte gelten nur für diesen Browser und bleiben, bis sie hier geändert werden.</p>
        <table>
          <thead>
            <tr><th style="width:56px;">Note</th><th>Buchstabe</th><th>Prozent ≥</th><th></th></tr>
          </thead>
          <tbody class="not-tabelle"></tbody>
        </table>
        <button type="button" class="not-hinzufuegen">+ Note hinzufügen</button>
        <div class="not-presets">
          <button type="button" class="not-preset" data-preset="gymnasium">Gymnasium-Standard</button>
          <button type="button" class="not-preset" data-preset="stadtteilschule">Stadtteilschule-Standard</button>
        </div>
        <label class="not-kurscheck">
          <input type="checkbox" class="not-nur-kurs" />
          Nur für diesen Kurs
        </label>
        <p class="not-kurshinweis">Ohne Haken gilt diese Tabelle künftig für alle Kurse ohne eigene Einstellung — auch für diesen.</p>
        <button type="button" class="not-eintragen">⚡ Notenstufen eintragen</button>
      </div>
    `;
    try { panel.querySelector('.not-version').textContent = browser.runtime.getManifest().version; }
    catch (e) { /* ohne Versionsanzeige weiter */ }
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.id = 'not-toggle';
    toggle.title = 'Notenstufen Autofill öffnen';
    toggle.setAttribute('aria-label', 'Notenstufen Autofill öffnen');
    let iconUrl = '';
    try { iconUrl = browser.runtime.getURL('icon/32.png'); } catch (e) { iconUrl = ''; }
    if (iconUrl) {
        const bild = document.createElement('img');
        bild.src = iconUrl;
        bild.alt = '';
        toggle.appendChild(bild);
        panel.querySelector('.not-head-icon').src = iconUrl;
    } else {
        toggle.textContent = 'N';
        panel.querySelector('.not-head-icon').remove();
    }
    document.body.appendChild(toggle);

    // Start geschlossen: nur das Icon ist zu sehen, wie bei den anderen
    // Erweiterungen. Das Panel oeffnet sich erst auf Klick.
    toggle.addEventListener('click', () => { panel.hidden = false; toggle.hidden = true; });
    panel.querySelector('.not-close').addEventListener('click', () => { panel.hidden = true; toggle.hidden = false; });

    const kursId = holeKursId();
    const tbody = panel.querySelector('.not-tabelle');
    const nurKursBox = panel.querySelector('.not-nur-kurs');

    ladeKursEinstellung(kursId).then(({ noten, kurseigen }) => {
        renderTabelle(tbody, noten);
        nurKursBox.checked = kurseigen;
    });

    async function speichernNachHaken(noten) {
        if (nurKursBox.checked) await speichereNurFuerKurs(kursId, noten);
        else await speichereFuerAlleKurse(kursId, noten);
    }

    panel.querySelectorAll('.not-preset').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const noten = btn.dataset.preset === 'stadtteilschule'
                ? DEFAULT_NOTEN_STADTTEILSCHULE
                : DEFAULT_NOTEN;
            renderTabelle(tbody, noten);
            await speichernNachHaken(noten);
        });
    });

    panel.querySelector('.not-hinzufuegen').addEventListener('click', () => {
        const noten = leseTabelle(tbody);
        noten.push(['', '']);
        renderTabelle(tbody, noten);
    });

    panel.querySelector('.not-eintragen').addEventListener('click', async () => {
        await speichernNachHaken(leseTabelle(tbody));
        panel.hidden = true; toggle.hidden = false;
        if (isOverviewPage()) gotoEditAndFill();
        else run(0);
    });
}

// ------------------------------------------------------------
//  Start
// ------------------------------------------------------------
// Die Adresse allein beweist noch nicht, dass wir auf einer Moodle-Notenstufenseite
// sind – der Pfad koennte auf einer beliebigen Seite so lauten. Erst wenn die Seite
// die Notenstufen-Tabelle ODER den Bearbeiten-Knopf zeigt, ist der Knopf berechtigt.
function istNotenstufenSeite() {
    return isEditPage() || isOverviewPage();
}

function init() {
    if (!istNotenstufenSeite()) return;
    baueUI();

    // Kommen wir gerade von einem Seitenwechsel, den die Erweiterung ausgeloest hat?
    const p = readPending();
    if (p && isEditPage()) {
        clearPending();
        setTimeout(() => run(p.runde), 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
}
