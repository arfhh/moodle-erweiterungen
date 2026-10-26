import { browser } from 'wxt/browser';
import { VORLAGEN, kiLaden, kiSpeichern, istLokal, ursprungMuster, basisNorm } from '../../lib/ki-direkt/einstellungen.js';
import { kiNachricht, kiFehlerText } from '../../lib/ki-direkt/client.js';

const $ = (id) => document.getElementById(id);

function melde(id, text, ok) {
  const p = $(id);
  p.textContent = text;
  p.className = 'meldung ' + (ok ? 'ok' : 'fehler');
}

function formular() {
  return {
    an: $('an').checked, vorlage: $('vorlage').value, basis: basisNorm($('basis').value),
    schluessel: $('schluessel').value.trim(), modell: $('modell').value.trim(),
    wartezeit: Number($('wartezeit').value) || 120, paket: Number($('paket').value) || 20,
    zusatz: $('zusatz').value.trim() || '{}'
  };
}

function cloudHinweis() {
  const b = $('basis').value.trim();
  $('cloudwarnung').classList.toggle('hidden', !b || istLokal(b));
}

// Muss direkt im Klick passieren: Browser erlauben die Rueckfrage nur bei einer Nutzeraktion.
async function berechtigungHolen(basis) {
  const muster = ursprungMuster(basis);
  try {
    if (await browser.permissions.contains({ origins: [muster] })) return true;
  } catch (e) { /* weiter */ }
  try { return await browser.permissions.request({ origins: [muster] }); }
  catch (e) { return false; }
}

// Modelle, die keine Chat-Antworten geben, nicht vorauswaehlen.
const KEIN_CHAT = /embed|whisper|tts|phonon|rerank|clip|vision-only|stable-diffusion/i;

function modelleSetzen(liste, gewaehlt) {
  const s = $('modell');
  s.innerHTML = '';
  if (!liste.length) { s.add(new Option('– erst „Verbindung testen“ –', '')); return; }
  liste.forEach((m) => s.add(new Option(m + (KEIN_CHAT.test(m) ? '  (kein Chat-Modell)' : ''), m)));
  s.value = liste.includes(gewaehlt) ? gewaehlt : (liste.find((m) => !KEIN_CHAT.test(m)) || liste[0]);
}

async function start() {
  Object.entries(VORLAGEN).forEach(([k, v]) => $('vorlage').add(new Option(v.name, k)));
  const cfg = await kiLaden();
  $('an').checked = !!cfg.an; $('vorlage').value = cfg.vorlage; $('basis').value = cfg.basis;
  $('schluessel').value = cfg.schluessel;
  modelleSetzen(cfg.modell ? [cfg.modell] : [], cfg.modell);
  $('wartezeit').value = cfg.wartezeit; $('paket').value = cfg.paket; $('zusatz').value = cfg.zusatz;
  cloudHinweis();
}

$('vorlage').addEventListener('change', () => {
  const v = VORLAGEN[$('vorlage').value];
  if (!v) return;
  if (v.basis) $('basis').value = v.basis;
  $('zusatz').value = v.zusatz;
  modelleSetzen([], '');
  cloudHinweis();
  melde('testinfo', 'Vorlage übernommen – jetzt „Verbindung testen“.', true);
});
$('basis').addEventListener('input', cloudHinweis);

$('testen').addEventListener('click', async () => {
  const f = formular();
  if (!f.basis) { melde('testinfo', 'Bitte zuerst eine Adresse eintragen.', false); return; }
  let url;
  try { url = new URL(f.basis); } catch (e) { melde('testinfo', 'Das ist keine gültige Adresse.', false); return; }
  const b = $('testen'); b.disabled = true;
  melde('testinfo', 'Prüfe …', true);
  try {
    if (!(await berechtigungHolen(f.basis))) {
      melde('testinfo', `Ohne Erlaubnis für ${url.hostname} kann die Erweiterung diese Adresse nicht ansprechen.`, false);
      return;
    }
    const r = await kiNachricht('modelle', { cfg: f });
    if (!r.ok) { melde('testinfo', '✗ ' + kiFehlerText(r, f), false); return; }
    modelleSetzen(r.modelle, f.modell);
    melde('testinfo', `✓ Verbunden. ${r.modelle.length} Modell(e) gefunden – „${$('modell').value}“ ist `
      + 'unten vorausgewählt. Bei Bedarf ändern, dann Speichern und Probeanfrage.', true);
  } finally { b.disabled = false; }
});

$('speichern').addEventListener('click', async () => {
  const f = formular();
  try { JSON.parse(f.zusatz); } catch (e) { melde('info', 'Zusatzparameter sind kein gültiges JSON.', false); return; }
  if (f.an && f.basis && !(await berechtigungHolen(f.basis))) {
    melde('info', 'Gespeichert, aber ohne Erlaubnis für diese Adresse funktioniert „Direkt bewerten“ nicht.', false);
  }
  await kiSpeichern(f);
  melde('info', '✓ Gespeichert. Offene Moodle-Seiten einmal neu laden.', true);
});

$('probe').addEventListener('click', async () => {
  const f = formular();
  if (!f.modell) { melde('info', 'Bitte zuerst ein Modell wählen.', false); return; }
  const b = $('probe'); b.disabled = true;
  melde('info', 'Frage die KI …', true);
  try {
    const r = await kiNachricht('anfrage', { cfg: f, maxTokens: 50, messages: [
      { role: 'system', content: 'Antworte nur mit JSON.' },
      { role: 'user', content: 'Gib genau {"ok":true} zurück.' }] });
    if (!r.ok) { melde('info', '✗ ' + kiFehlerText(r, f), false); return; }
    melde('info', `✓ Antwort nach ${(r.ms / 1000).toFixed(1)} s: ${String(r.text).trim().slice(0, 120)}`, true);
  } finally { b.disabled = false; }
});

start();
