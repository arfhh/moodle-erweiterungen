// © 2026 A. Spielhoff – CC BY-SA 4.0
// LMS Nutzer – Content Script (nur lesend + Formular vorausfüllen; Speichern macht die Lehrkraft)
import schulenRaw from '../schulen.json';

type Schule = { nr: string; name: string; privat?: boolean };
type Row = {
  vorname: string; nachname: string; email: string;
  schule: string; persona: string; username: string;
  status: 'offen' | 'neu' | 'vorhanden' | 'gesperrt' | 'fertig' | 'entsperrt' | 'fehler';
  treffer: Treffer[]; hinweis: string; schoolno: string; schoolname: string;
  email2: string; privat: boolean; stadt: string; bemerkung: string; neu: boolean; info: string;
};
type Treffer = { id: number; username: string; email: string; vorname: string; nachname: string; gesperrt: boolean; schule: string; exakt: boolean; aehnlich: boolean };

// Firefox-tauglich: kein innerHTML-Setzen (AMO-Linter), HTML wird über DOMParser eingesetzt.
function setHtml(el: Element | ShadowRoot, html: string): void {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  el.replaceChildren(...Array.from(d.body.childNodes));
}

const SCHULEN = schulenRaw as Schule[];
const K_ROWS = 'nua_rows', K_Q = 'nua_queue', K_SUB = 'nua_submitting';
const K_KURS = 'nua_kurs', K_RET = 'nua_kurs_ret', K_KAUTO = 'nua_kurs_auto', K_KSUB = 'nua_kurs_sub';
const PERSONAS = ['Lehrer/in', 'Schüler/in', 'Projektteam', 'Sorgeberechtigte/r', 'Pädagogisch-Therapeutisches Fachpersonal (PTF)', 'Sonstige'];

// ---------- Hilfen ----------
const ss = {
  get<T>(k: string, d: T): T { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* egal */ } },
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const norm = (s: string) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const userName = (vor: string, nach: string, n = 1) => norm(nach) + norm(vor).slice(0, n);

function schuleFinden(s: string): { nr: string; name: string } {
  const t = (s || '').trim();
  if (!t || /^(ohne|keine)/i.test(t)) return { nr: '1111', name: 'Landesinstitut' };
  const hit =
    SCHULEN.find((x) => x.nr === t && x.nr !== '1111') ||
    SCHULEN.find((x) => x.name.toLowerCase() === t.toLowerCase()) ||
    SCHULEN.find((x) => x.name.toLowerCase().includes(t.toLowerCase()));
  if (hit) return { nr: hit.nr, name: hit.name };
  return { nr: '', name: t }; // unbekannt -> Hinweis
}

function ctx() {
  const html = document.documentElement.innerHTML;
  const sesskey = /sesskey=([A-Za-z0-9]+)/.exec(html)?.[1] || '';
  const userid = Number(/user\/profile\.php\?id=(\d+)/.exec(document.querySelector('#user-menu-toggle, .usermenu, nav')?.innerHTML || html)?.[1] || 0);
  return { sesskey, userid };
}

async function ajax(method: string, args: unknown): Promise<any> {
  const { sesskey } = ctx();
  const r = await fetch(`/lib/ajax/service.php?sesskey=${sesskey}&info=${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ index: 0, methodname: method, args }]),
  });
  return (await r.json())?.[0]?.data;
}
const kursId = () => { try { return Number(localStorage.getItem('nua_course') || 0); } catch { return 0; } };
async function kursInfo(): Promise<{ course: number; enrolid: number } | null> {
  const course = kursId();
  if (!course) return null; // noch keine Such-Kurs-ID eingetragen
  const c = ss.get<{ course: number; enrolid: number } | null>('nua_enrol', null);
  if (c && c.course === course) return c;
  try {
    const html = await (await fetch(`/user/index.php?id=${course}`, { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const enrolid = Number(doc.querySelector<HTMLInputElement>('form[action*="enrol/manual/manage.php"] [name="enrolid"]')?.value);
    if (enrolid) { const v = { course, enrolid }; ss.set('nua_enrol', v); return v; }
  } catch { /* weiter */ }
  return null;
}
type Fund = { id: number; fullname: string; email: string };
// Suche über den Einschreibe-Dialog eines eigenen Kurses (findet ALLE Nutzer) + Nachrichtensuche
async function suche(q: string): Promise<Fund[]> {
  const out = new Map<number, Fund>();
  const k = await kursInfo();
  if (k) {
    const d = await ajax('core_enrol_get_potential_users', { courseid: k.course, enrolid: k.enrolid, search: q, searchanywhere: true, page: 0, perpage: 100 });
    (d || []).forEach((u: any) => out.set(u.id, { id: u.id, fullname: u.fullname, email: u.email || '' }));
  }
  try {
    const d2 = await ajax('core_message_message_search_users', { userid: ctx().userid, search: q, limitfrom: 0, limitnum: 30 });
    [...(d2?.contacts || []), ...(d2?.noncontacts || [])].filter((u: any) => !u.isdeleted).forEach((u: any) => { if (!out.has(u.id)) out.set(u.id, { id: u.id, fullname: u.fullname, email: '' }); });
  } catch { /* weiter */ }
  return [...out.values()];
}

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// 'exakt' = gleiche Mail oder gleicher Name; 'aehnlich' = Nachname gleich + Vorname fast gleich oder gleicher Mail-Anfang
function bewerten(f: Fund, r: Row): 'exakt' | 'aehnlich' | '' {
  const n = norm(f.fullname), vor = norm(r.vorname), nach = norm(r.nachname);
  if (r.email && f.email && f.email.toLowerCase() === r.email.toLowerCase()) return 'exakt';
  if (n === vor + nach || n === nach + vor) return 'exakt';
  const lokal = (m: string) => norm(m.split('@')[0] || '');
  if (f.email && r.email && lokal(f.email) === lokal(r.email) && lokal(r.email).length > 5) return 'aehnlich';
  if (n.includes(nach) && nach.length > 2) {
    const rest = n.replace(nach, '');
    if (lev(rest, vor) <= 2 || rest.startsWith(vor.slice(0, 4)) || vor.startsWith(rest.slice(0, 4))) return 'aehnlich';
  }
  return '';
}

async function detail(id: number): Promise<Omit<Treffer, 'exakt' | 'aehnlich'> | null> {
  try {
    const html = await (await fetch(`/user/editadvanced.php?id=${id}`, { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const v = (n: string) => (doc.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value || '').trim();
    if (!doc.querySelector('[name="username"]')) return null;
    return {
      id, username: v('username'), email: v('email'), vorname: v('firstname'), nachname: v('lastname'),
      gesperrt: !!doc.querySelector<HTMLInputElement>('input[type="checkbox"][name="suspended"]')?.checked,
      schule: `${v('profile_field_schoolno')} ${v('profile_field_schoolname')}`.trim(),
    };
  } catch { return null; }
}

async function pruefen(r: Row) {
  const lokal = r.email.split('@')[0] || '';
  const funde = new Map<number, Fund>();
  for (const q of [...new Set([`${r.vorname} ${r.nachname}`, r.email, lokal, r.nachname].filter(Boolean))]) {
    try { (await suche(q)).forEach((f) => { if (!funde.has(f.id) || (!funde.get(f.id)!.email && f.email)) funde.set(f.id, f); }); } catch { /* weiter */ }
  }
  const kand = [...funde.values()].map((f) => ({ f, b: bewerten(f, r) })).filter((x) => x.b);
  const det = await Promise.all(kand.slice(0, 8).map(async (x) => ({ x, d: await detail(x.f.id) })));
  r.treffer = det.filter((y) => y.d).map((y) => ({ ...y.d!, exakt: y.x.b === 'exakt', aehnlich: y.x.b === 'aehnlich' }));
  // 'neu': true im JSON = bewusst zusätzliches Konto; nur gleiche E-Mail zählt als vorhanden
  const gleichnamig = r.treffer.filter((t) => t.exakt || t.aehnlich);
  const neuModus = r.neu || /@li\.hamburg\.de$/i.test(r.email); // LI-Adresse = zusätzliches LI-Konto, Schulkonten gleichen Namens zählen nicht
  const gefunden = neuModus ? gleichnamig.filter((t) => t.email.toLowerCase() === r.email.toLowerCase()) : gleichnamig;
  if (gefunden.length) {
    r.status = gefunden.every((t) => t.gesperrt) ? 'gesperrt' : 'vorhanden';
    const abw = gefunden.filter((t) => t.email.toLowerCase() !== r.email.toLowerCase() || t.aehnlich);
    r.hinweis = (gefunden.length > 1 ? `${gefunden.length} Konten gefunden. ` : '') + (abw.length ? 'Abweichung: ' + abw.map((t) => `${t.vorname} ${t.nachname} <${t.email}>`).join('; ') : '');
  } else {
    const belegt = new Set(r.treffer.map((t) => t.username.toLowerCase()));
    let n = 1; let u = userName(r.vorname, r.nachname, n);
    while (belegt.has(u) && n < norm(r.vorname).length) u = userName(r.vorname, r.nachname, ++n);
    r.username = u; r.status = 'neu'; r.hinweis = gleichnamig.length ? `Gleichnamige Konten (bleiben bestehen): ${gleichnamig.map((t) => `${t.username} <${t.email}>${t.gesperrt ? ' gesperrt' : ''}`).join('; ')}` : '';
  }
}

function aufbereiten(raw: any[]): Row[] {
  return raw.map((o) => {
    const s0 = schuleFinden(String(o.schule ?? ''));
    const nrJ = String(o.schulnr ?? '').trim();
    const s = nrJ ? { nr: nrJ, name: String(o.schule ?? '').trim() || s0.name } : s0;
    const privat = !!o.privat || (!nrJ && SCHULEN.some((x) => x.name === s.name && x.privat));
    const vorname = String(o.vorname ?? '').trim(), nachname = String(o.nachname ?? '').trim();
    return {
      vorname, nachname, email: String(o.email ?? '').trim(), schule: String(o.schule ?? ''),
      persona: PERSONAS.includes(o.persona) ? o.persona : 'Lehrer/in',
      username: userName(vorname, nachname), status: 'offen', treffer: [],
      hinweis: s.nr ? '' : 'Schule nicht im Verzeichnis – bitte prüfen', bemerkung: String(o.bemerkung ?? ''), neu: !!o.neu, info: String(o.info ?? '').trim(), schoolno: s.nr || '1111', schoolname: s.name,
      email2: String(o.email2 ?? '').trim(), privat, stadt: String(o.stadt ?? 'Hamburg'),
    } as Row;
  });
}

// ---------- Formular vorausfüllen ----------
function setVal(el: HTMLInputElement | HTMLSelectElement | null, v: string) {
  if (!el) return;
  el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  el.style.outline = '2px solid #198754';
}
function beschreibung(html: string) {
  const ta = document.querySelector<HTMLTextAreaElement>('[name="description_editor[text]"]');
  if (ta) ta.value = html;
  let n = 0;
  const t = setInterval(() => { // TinyMCE-Rahmen lädt später
    const fr = document.querySelector<HTMLIFrameElement>('iframe.tox-edit-area__iframe, iframe[id*="description_editor"]');
    const b = fr?.contentDocument?.body;
    if (b && b.isContentEditable !== false) { setHtml(b, html); b.dispatchEvent(new Event('input', { bubbles: true })); clearInterval(t); }
    else if (++n > 25) clearInterval(t);
  }, 300);
}
function banner(html: string, extra?: (b: HTMLElement) => void) {
  document.getElementById('nua-banner')?.remove();
  const b = document.createElement('div'); b.id = 'nua-banner';
  b.style.cssText = 'position:sticky;top:0;z-index:9999;background:#e7f1ff;border:1px solid #0d6efd;border-radius:6px;padding:10px 14px;margin:8px 0;font:14px system-ui;color:#052c65';
  setHtml(b, html); (document.querySelector('#region-main') || document.body).prepend(b); extra?.(b);
}
function stopQueue() { ss.del(K_Q); ss.del(K_SUB); }

function formularSeite() {
  const q = ss.get<{ aktiv: boolean; i: number } | null>(K_Q, null);
  const rows = ss.get<Row[]>(K_ROWS, []);
  const form = document.querySelector<HTMLInputElement>('[name="username"]')?.form || null;
  if (!q?.aktiv || !form) return;
  const r = rows[q.i];
  if (!r) return;
  const fehlerUser = document.querySelector('#id_error_username')?.textContent?.trim();
  const fehlerMail = document.querySelector('#id_error_email')?.textContent?.trim();
  const U = () => form.querySelector<HTMLInputElement>('[name="username"]');
  const hatFehler = !!(fehlerUser || fehlerMail || document.querySelector('.form-control-feedback:not(:empty)'));
  const nrTxt = `${q.i + 1} von ${rows.filter((x) => x.status === 'neu' || x.status === 'fertig').length}`;
  if (hatFehler && U()?.value) {
    if (fehlerUser) {
      const n = (r as any)._n ? (r as any)._n + 1 : 2; (r as any)._n = n; ss.set(K_ROWS, rows);
      r.username = userName(r.vorname, r.nachname, n); setVal(U(), r.username);
      banner(`<b>Anmeldename war vergeben</b> – neuer Vorschlag <code>${esc(r.username)}</code>. Bitte erneut auf „Nutzer/in erstellen“ klicken. ${stopBtn()}`, bindStop);
    } else {
      banner(`<b>Hinweis des LMS:</b> ${esc(fehlerMail || 'Eingabe prüfen')} (${esc(r.vorname)} ${esc(r.nachname)}). ${stopBtn()}`, bindStop);
    }
    return;
  }
  setVal(form.querySelector('[name="auth"]'), 'manual');
  setVal(U(), r.username);
  const cp = form.querySelector<HTMLInputElement>('[name="createpassword"]');
  if (cp && !cp.checked) cp.click();
  setVal(form.querySelector('[name="firstname"]'), r.vorname);
  setVal(form.querySelector('[name="lastname"]'), r.nachname);
  setVal(form.querySelector('[name="email"]'), r.email);
  setVal(form.querySelector('[name="profile_field_schoolno"]'), r.schoolno);
  setVal(form.querySelector('[name="profile_field_schoolname"]'), r.schoolname);
  setVal(form.querySelector('[name="profile_field_schoolpersona"]'), r.persona);
  setVal(form.querySelector('[name="city"]'), r.stadt || 'Hamburg');
  setVal(form.querySelector('[name="country"]'), 'DE');
  const beschr = [r.info, r.email2 ? `Zweite E-Mail: ${r.email2}` : '', r.privat ? 'Privatschule' : ''].filter(Boolean).map(esc).join('<br>');
  if (beschr) beschreibung(beschr);
  const nochmal = () => { // spät ladende Seitenskripte dürfen nichts leeren
    const f = (n: string, v: string) => { const e = form.querySelector<HTMLInputElement>(`[name="${n}"]`); if (e && e.value !== v) setVal(e, v); };
    f('profile_field_schoolno', r.schoolno); f('profile_field_schoolname', r.schoolname); f('profile_field_schoolpersona', r.persona);
    f('firstname', r.vorname); f('lastname', r.nachname); f('email', r.email);
  };
  setTimeout(nochmal, 800); setTimeout(nochmal, 2500);
  banner(`<b>Nutzer ${esc(nrTxt)}:</b> ${esc(r.vorname)} ${esc(r.nachname)} · <code>${esc(r.username)}</code> · ${esc(r.schoolno)} ${esc(r.schoolname)} · ${esc(r.persona)}<br>Alles ausgefüllt (grün). Bitte prüfen und auf <b>„Nutzer/in erstellen“</b> klicken – danach geht es automatisch weiter. ${stopBtn()}`, bindStop);
  form.addEventListener('submit', (e) => { if ((e as SubmitEvent).submitter?.getAttribute('name') === 'submitbutton') ss.set(K_SUB, true); });
}
const stopBtn = () => '<button type="button" id="nua-stop" class="btn btn-sm btn-outline-secondary ms-2">Warteschlange stoppen</button>';
function bindStop() { document.getElementById('nua-stop')?.addEventListener('click', () => { stopQueue(); document.getElementById('nua-banner')?.remove(); }); }

function weiterNachSpeichern() {
  const q = ss.get<{ aktiv: boolean; i: number } | null>(K_Q, null);
  if (!q?.aktiv || !ss.get(K_SUB, false)) return;
  ss.del(K_SUB);
  const rows = ss.get<Row[]>(K_ROWS, []);
  if (rows[q.i]) rows[q.i].status = 'fertig';
  let n = q.i + 1; while (n < rows.length && rows[n].status !== 'neu') n++;
  ss.set(K_ROWS, rows);
  if (n < rows.length) { ss.set(K_Q, { aktiv: true, i: n }); location.href = '/user/editadvanced.php?id=-1'; }
  else {
    ss.del(K_Q);
    const ret = ss.get<number | null>(K_RET, null);
    if (ret) { ss.del(K_RET); ss.set(K_KAUTO, true); location.href = `/user/index.php?id=${ret}`; }
    else setTimeout(() => oeffnen(true), 300);
  }
}

function entsperrtMerken() {
  const id = ss.get<number | null>('nua_unlock_sub', null);
  if (!id) return;
  ss.del('nua_unlock_sub');
  const rows = ss.get<Row[]>(K_ROWS, []);
  rows.forEach((r) => { if (r.treffer.some((t) => t.id === id && t.gesperrt)) r.status = 'entsperrt'; });
  ss.set(K_ROWS, rows);
}
function entsperrSeite() {
  const m = ss.get<{ id: number } | null>('nua_unlock', null);
  const id = new URLSearchParams(location.search).get('id');
  if (!m || String(m.id) !== id) return;
  const s = document.querySelector<HTMLInputElement>('input[type="checkbox"][name="suspended"]');
  if (s?.checked) s.click();
  if (s) s.parentElement!.style.outline = '2px solid #198754';
  s?.form?.addEventListener('submit', (e) => { if ((e as SubmitEvent).submitter?.getAttribute('name') === 'submitbutton') ss.set('nua_unlock_sub', m.id); });
  banner('<b>Konto entsperrt (Haken entfernt).</b> Bitte Daten prüfen und unten auf „Änderungen speichern“ klicken.');
  ss.del('nua_unlock');
}

// ---------- Panel ----------
// ---------- Panel-Rahmen (gemeinsam für beide Reiter) ----------
type Reiter = 'kurs' | 'anlegen';
const istAdmin = () => !!document.querySelector('a[href*="/admin/search.php"]');
const istKursSeite = () => location.pathname.endsWith('/user/index.php') && !!document.querySelector('form[action*="/enrol/manual/manage.php"]');
let host: HTMLElement | null = null;
function schliessen() { host?.remove(); host = null; }

const PROMPT_KURS = `Wandle die folgende Liste von Personen in ein JSON-Array um. Gib nur das JSON in einem Codeblock aus, ohne Erklärung.

Felder je Person:
{"vorname":"","nachname":"","email":"","schule":"","rolle":""}

Regeln:
- vorname und nachname ohne Titel (Dr., Prof.) und ohne Anrede. Mehrere Vornamen gehören ins Feld vorname.
- email: die dienstliche Adresse. Stehen mehrere Adressen da, nimm die dienstliche. Fehlt sie, lass das Feld leer.
- schule: Schule oder Dienststelle wie in der Liste (auch wenn sie über mehrere Zeilen umbricht), sonst leer. Hilft beim Erkennen des Dienstkontos.
- rolle: nur ausfüllen, wenn die Liste eine Rolle nennt, und dann genau einer dieser Werte: "Trainer/in", "Trainer/in ohne Bearbeitungsrecht", "Teilnehmer/in". Sonst leer lassen.
- Jede Person nur einmal. Erfinde nichts.

Liste:
[hier die Liste, Mail oder Tabelle einfügen]`;

const PROMPT_ANLEGEN = `Wandle die folgende Anfrage in ein JSON-Array für neue LMS-Konten um. Gib nur das JSON in einem Codeblock aus, ohne Erklärung.

Felder je Person (eine Person pro Zeile):
{"vorname":"","nachname":"","email":"","email2":"","schulnr":"","schule":"","privat":false,"persona":"Lehrer/in","stadt":"Hamburg","info":"","bemerkung":""}

Regeln:
- vorname und nachname ohne Titel und Anrede.
- email: dienstliche Adresse; weitere Adressen in email2. Fehlt eine LI-Adresse, die laut Mail eingerichtet werden soll, email leer lassen und in bemerkung erwähnen.
- schulnr und schule laut Schulenverzeichnis Hamburg. Nummer unsicher: schulnr leer lassen, nur den Schulnamen wie in der Mail. Keine Nummer raten.
- Landesinstitut (@li.hamburg.de) und Personen ohne Schule: schulnr "1111", schule "Landesinstitut". Private Schulen: schulnr "1111", schule = Name, privat true.
- persona: Lehrer/in, Schüler/in, Projektteam, Sorgeberechtigte/r, Pädagogisch-Therapeutisches Fachpersonal (PTF) oder Sonstige. Im Zweifel Lehrer/in.
- info: Funktion oder Rolle aus der Anfrage, sonst leer. bemerkung: Hinweise für mich, sonst leer.
- Nur Personen, für die etwas zu tun ist. Erfinde nichts.

Anfrage:
[hier die Mail oder Liste einfügen]`;

const HILFE_KURS = `<details><summary>So funktioniert's</summary><ol>
<li><b>Liste vorbereiten.</b> Für jede Person braucht es E-Mail, Vorname und Nachname. Steht die Liste in einer Mail oder einem Dokument: „KI-Prompt kopieren“, zusammen mit der Liste in ChatGPT oder Claude einfügen und das JSON aus der Antwort nehmen.</li>
<li><b>Liste einfügen.</b> JSON oder CSV einfügen oder eine Datei wählen, die Rolle auswählen und „Einlesen“ klicken.</li>
<li><b>Prüfen.</b> Die Erweiterung sucht jede Person im LMS:<br><span class="s gefunden">gefunden</span> kann eingeschrieben werden · <span class="s imkurs">schon im Kurs</span> nichts zu tun · <span class="s unklar">unklar</span> bitte das richtige Konto wählen · <span class="s fehlt">nicht im System</span> Konto fehlt.</li>
<li><b>Einschreiben.</b> Der Moodle-Dialog öffnet sich fertig ausgefüllt. Kurz prüfen und unten auf „…einschreiben“ klicken.</li>
<li><b>Fehlende Personen</b> als CSV oder JSON an einen LMS-Admin geben. Admins legen sie im Reiter „Nutzer anlegen“ an, danach geht es automatisch zurück in den Kurs.</li></ol>
<p class="m">Die Erweiterung speichert nie selbst – den letzten Klick machst immer du. Die Liste bleibt nur in diesem Browser-Tab.</p></details>`;

const HILFE_ANLEGEN = `<details><summary>So funktioniert's</summary><ol>
<li><b>Liste vorbereiten.</b> „KI-Prompt kopieren“, mit der Anfrage-Mail in ChatGPT oder Claude einfügen, das JSON aus der Antwort nehmen.</li>
<li><b>Einlesen und prüfen.</b> Die Erweiterung sucht jede Person im ganzen LMS, auch in Schulen und gesperrte Konten.<br><span class="s neu">neu</span> wird angelegt · <span class="s vorhanden">vorhanden</span> gibt es schon · <span class="s gesperrt">gesperrt</span> kann entsperrt werden.</li>
<li><b>Neue anlegen.</b> Das Formular „Nutzer/in anlegen“ öffnet sich ausgefüllt (grün). Prüfen, „Nutzer/in erstellen“ klicken – danach kommt automatisch die nächste Person.</li>
<li><b>Bericht kopieren</b> liefert die Übersicht für die Antwortmail.</li></ol>
<p class="m">Die Such-Kurs-ID ist ein Kurs, in dem du Nutzer einschreiben darfst; über dessen Suche findet die Erweiterung alle Konten.</p></details>`;

const CSS = `:host{all:initial}*{box-sizing:border-box}
.p{width:min(400px,94vw);max-height:86vh;display:flex;flex-direction:column;background:#fff;color:#1f2937;border-radius:14px;box-shadow:0 12px 40px #0003,0 0 0 1px #0001;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
header{display:flex;align-items:center;gap:8px;padding:11px 14px;background:linear-gradient(135deg,#0d6efd,#0a58ca);color:#fff}
.ttl{flex:1;font-weight:600;font-size:15px;display:flex;align-items:center;gap:8px}
.v{font-weight:400;font-size:11px;background:#ffffff2e;padding:1px 7px;border-radius:8px}
header button{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}
nav{display:flex;gap:4px;padding:8px 10px 0;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
nav button{flex:1;border:0;background:transparent;padding:8px;border-radius:9px 9px 0 0;cursor:pointer;color:#475569;font:inherit;font-weight:500}
nav button.on{background:#fff;color:#0d6efd;box-shadow:0 1px 0 #fff}
.body{overflow:auto;padding:12px 14px 14px}
details{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 11px;margin-bottom:10px}
summary{cursor:pointer;font-weight:600;color:#0d6efd}details ol{margin:8px 0 6px;padding-left:18px}details li{margin:5px 0}
section{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:10px}
h4{margin:0 0 6px;font-size:13px;display:flex;align-items:center;gap:8px}
.n{display:inline-flex;width:20px;height:20px;border-radius:50%;background:#0d6efd;color:#fff;font-size:11px;align-items:center;justify-content:center;flex:none}
p{margin:0 0 8px}textarea{width:100%;height:80px;font:12px ui-monospace,monospace;border:1px solid #cbd5e1;border-radius:8px;padding:6px;resize:vertical}
input,select{font:inherit;border:1px solid #cbd5e1;border-radius:7px;padding:4px 6px;background:#fff}
button{font:inherit;padding:5px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;color:#1f2937}
button:hover{background:#f1f5f9}button.pri{background:#0d6efd;color:#fff;border-color:#0d6efd}button.pri:hover{background:#0b5ed7}
button.lnk{border:0;background:none;color:#64748b;text-decoration:underline;padding:5px 2px}button:disabled{opacity:.5;cursor:default}
.bar{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center}.m{color:#64748b;font-size:12px}
.c{border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px;margin-top:6px}.c b{font-weight:600}
.s{padding:1px 8px;border-radius:9px;font-size:11px;color:#fff;white-space:nowrap;font-weight:500;display:inline-block}
.neu,.gefunden{background:#198754}.vorhanden,.fehler,.fehlt{background:#dc3545}.gesperrt,.unklar{background:#fd7e14}.offen{background:#94a3b8}.fertig,.entsperrt,.imkurs{background:#0d6efd}
code{background:#f1f5f9;padding:0 4px;border-radius:4px}.k{font-size:11px;padding:1px 8px}a{color:#0d6efd}
.ok{color:#198754;font-weight:600}
button.warn{background:#dc3545;color:#fff;border-color:#dc3545}button.warn:hover{background:#bb2d3b}
.next{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:7px 10px;margin-top:8px}
.done{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:8px;padding:7px 10px;margin-top:8px;font-weight:600}`;

const ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M19 8v6M16 11h6"/></svg>';

function rahmen(aktiv: Reiter) {
  schliessen();
  host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:64px;right:14px;z-index:2147483000';
  const root = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);
  const reiter: [Reiter, string][] = [];
  if (istKursSeite()) reiter.push(['kurs', 'Kurs befüllen']);
  if (istAdmin()) reiter.push(['anlegen', 'Nutzer anlegen']);
  setHtml(root, `<style>${CSS}</style><div class="p"><header><div class="ttl">${ICON} LMS Nutzer <span class="v">v${browser.runtime.getManifest().version}</span></div><button id="x" title="Schließen">×</button></header>
  ${reiter.length > 1 ? `<nav>${reiter.map(([k, t]) => `<button data-r="${k}" class="${k === aktiv ? 'on' : ''}">${t}</button>`).join('')}</nav>` : ''}<div class="body" id="body"></div></div>`);
  root.querySelector<HTMLButtonElement>('#x')!.onclick = schliessen;
  root.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => (b.onclick = () => (b.dataset.r === 'kurs' ? kursPanel() : oeffnen())));
  return { root, body: root.querySelector<HTMLElement>('#body')! };
}
async function kopieren(btn: HTMLButtonElement, text: string) {
  await navigator.clipboard.writeText(text);
  const alt = btn.textContent; btn.textContent = '✓ Kopiert'; setTimeout(() => (btn.textContent = alt), 1500);
}


function oeffnen(_zeigeEnde = false, autoPr = false) {
  const { root, body } = rahmen('anlegen');
  setHtml(body, `${HILFE_ANLEGEN}
  <section><h4><span class="n">1</span>Liste vorbereiten</h4><p class="m">Anfrage-Mail mit dem Prompt an ChatGPT oder Claude geben, das JSON aus der Antwort unten einfügen.</p><button id="pa">KI-Prompt kopieren</button></section>
  <section><h4><span class="n">2</span>Liste einfügen</h4><textarea id="t" placeholder="JSON hier einfügen"></textarea>
  <div class="bar"><button id="ok" class="${ss.get(K_ROWS, []).length ? '' : 'pri'}">Einlesen</button><button id="leer" class="lnk">Liste löschen</button></div>
  <div class="bar m">Such-Kurs-ID <input id="kurs" size="8" value="${kursId() || ''}"></div></section>
  <section id="s3"><h4><span class="n">3</span>Prüfen und anlegen</h4><div id="tab"></div></section>`);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  $<HTMLButtonElement>('#pa').onclick = (e) => kopieren(e.currentTarget as HTMLButtonElement, PROMPT_ANLEGEN);
  $<HTMLInputElement>('#kurs').onchange = (e) => { try { localStorage.setItem('nua_course', String(Number((e.target as HTMLInputElement).value) || 0)); } catch { /* egal */ } ss.del('nua_enrol'); };
  let rows = ss.get<Row[]>(K_ROWS, []);
  const save = () => ss.set(K_ROWS, rows);
  const draw = () => {
    const zaehl = (s: string) => rows.filter((r) => r.status === s).length;
    const geprueft = rows.length > 0 && rows.every((r) => r.status !== 'offen');
    $('#s3').style.display = rows.length ? '' : 'none';
    $('#s3').style.display = rows.length ? '' : 'none';
    setHtml($('#tab'), !rows.length ? '' : `<div class="bar"><button id="pr" class="${geprueft ? '' : 'pri'}">Alle prüfen</button><button id="go" class="${geprueft && zaehl('neu') ? 'pri' : ''}" ${zaehl('neu') ? '' : 'disabled'}>Neue anlegen (${zaehl('neu')}) – nacheinander</button><button id="cp">Bericht kopieren</button><button class="del">🗑 Liste löschen</button>
    <span class="m">neu ${zaehl('neu')} · vorhanden ${zaehl('vorhanden')} · gesperrt ${zaehl('gesperrt')} · fertig ${zaehl('fertig')}</span></div>
    ${rows.map((r, i) => `<div class="c" data-i="${i}"><div><b>${esc(r.vorname)} ${esc(r.nachname)}</b> <span class="s ${r.status}">${r.status}</span></div>
    <div class="m">${esc(r.email)}<br>${esc(r.schoolno)} ${esc(r.schoolname)} · ${esc(r.persona)} · <code>${esc(r.username)}</code></div>
    ${r.bemerkung ? `<div class="m">Mail: ${esc(r.bemerkung)}</div>` : ''}${r.hinweis ? `<div class="m">${esc(r.hinweis)}</div>` : ''}
    ${r.treffer.filter((t) => t.exakt || t.aehnlich).map((t) => `<div class="m">${t.aehnlich ? '<i>ähnlich:</i> ' : ''}<a href="/user/profile.php?id=${t.id}" target="_blank">${esc(t.vorname)} ${esc(t.nachname)}</a> · ${esc(t.username)} · ${esc(t.email)} · ${esc(t.schule)}${t.gesperrt ? ` · <b>gesperrt</b> <button class="ent" data-id="${t.id}">Entsperren</button>` : ''} <a href="/user/editadvanced.php?id=${t.id}" target="_blank">bearbeiten</a></div>`).join('')}</div>`).join('')}`);
    const pr = root.querySelector<HTMLButtonElement>('#pr');
    if (pr) pr.onclick = async () => {
      pr.disabled = true;
      for (let i = 0; i < rows.length; i++) { if (rows[i].status === 'fertig') continue; pr.textContent = `Prüfe ${i + 1}/${rows.length} …`; try { await pruefen(rows[i]); } catch { rows[i].status = 'fehler'; rows[i].hinweis = 'Prüfung fehlgeschlagen'; } save(); }
      draw();
    };
    const go = root.querySelector<HTMLButtonElement>('#go');
    if (go) go.onclick = () => { const i = rows.findIndex((r) => r.status === 'neu'); if (i < 0) return; ss.set(K_Q, { aktiv: true, i }); ss.del(K_SUB); location.href = '/user/editadvanced.php?id=-1'; };
    const cp = root.querySelector<HTMLButtonElement>('#cp');
    if (cp) cp.onclick = async () => { await navigator.clipboard.writeText(JSON.stringify(rows.map((r) => ({ name: `${r.vorname} ${r.nachname}`, email: r.email, status: r.status, username: r.username, treffer: r.treffer.filter((t) => t.exakt || t.aehnlich).map((t) => ({ id: t.id, username: t.username, email: t.email, schule: t.schule, gesperrt: t.gesperrt, aehnlich: t.aehnlich })), hinweis: r.hinweis, bemerkung: r.bemerkung })), null, 1)); cp.textContent = 'Kopiert'; };
    root.querySelectorAll<HTMLButtonElement>('.ent').forEach((b) => (b.onclick = () => { ss.set('nua_unlock', { id: Number(b.dataset.id) }); location.href = `/user/editadvanced.php?id=${b.dataset.id}`; }));
  };
  $('#ok').onclick = () => {
    try { const j = JSON.parse($<HTMLTextAreaElement>('#t').value); rows = aufbereiten(Array.isArray(j) ? j : [j]); save(); $('#ok').classList.remove('pri'); draw(); }
    catch { alert('Kein gültiges JSON.'); }
  };
  const leeren = () => { rows = []; save(); stopQueue(); $<HTMLTextAreaElement>('#t').value = ''; $('#ok').classList.add('pri'); draw(); };
  $('#leer').onclick = leeren;
  root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.del')) leeren(); });
  draw();
  if (autoPr) root.querySelector<HTMLButtonElement>('#pr')?.click();
}

function knopf(titel: string, klick: () => void) {
  if (document.getElementById('nua-btn')) return;
  const b = document.createElement('button');
  b.id = 'nua-btn'; b.type = 'button'; b.title = titel;
  setHtml(b, '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M19 8v6M16 11h6"/></svg>');
  b.className = 'btn btn-icon icon-size-3';
  b.style.cssText = 'color:#0d6efd;background:transparent;border:2px solid #0d6efd;border-radius:50%;width:38px;height:38px;padding:0;margin-right:6px;display:inline-flex;align-items:center;justify-content:center';
  b.onclick = klick;
  // unter der Kopfleiste, rechts unter dem Nutzermenü
  b.style.cssText += ';position:fixed;z-index:1030;background:#fff;box-shadow:0 2px 6px #0002';
  document.body.appendChild(b);
  const platz = () => {
    const leiste = document.querySelector('nav.navbar.fixed-top, nav.navbar')?.getBoundingClientRect();
    const menue = document.querySelector('.usermenu-container, #usernavigation .usermenu')?.getBoundingClientRect();
    b.style.top = `${Math.round((leiste?.bottom || 60) + 14)}px`;
    b.style.left = menue ? `${Math.round(menue.left + menue.width / 2 - 19)}px` : '';
    b.style.right = menue ? '' : '24px';
  };
  platz(); window.addEventListener('resize', platz); setTimeout(platz, 800);
}

// ---------- Kurs befüllen (user/index.php) ----------
type KStatus = 'offen' | 'gefunden' | 'imkurs' | 'unklar' | 'fehlt';
type KRow = { vorname: string; nachname: string; email: string; rolle: string; rid: number; status: KStatus; id: number; suche?: string; treffer: Fund[]; hinweis: string; gesperrt: boolean; raw: any };
type KState = { course: number; enrolid: number; rid: number; rows: KRow[] };
const K_LABEL: Record<KStatus, string> = { offen: 'offen', gefunden: 'gefunden', imkurs: 'schon im Kurs', unklar: 'unklar', fehlt: 'nicht im System' };

const kursVonSeite = () => ({
  course: Number(new URLSearchParams(location.search).get('id') || 0),
  enrolid: Number(document.querySelector<HTMLInputElement>('form[action*="/enrol/manual/manage.php"] [name="enrolid"]')?.value || 0),
});
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Rollen, die der Einschreibe-Dialog dieses Kurses anbietet
async function kursRollen(enrolid: number): Promise<{ id: number; name: string; def: boolean }[]> {
  const contextid = Number(/context-(\d+)/.exec(document.body.className)?.[1] || 0);
  const d = await ajax('core_get_fragment', { component: 'enrol_manual', callback: 'enrol_users_form', contextid, args: [{ name: 'enrolid', value: String(enrolid) }] });
  const doc = new DOMParser().parseFromString(d?.html || '', 'text/html');
  return [...doc.querySelectorAll<HTMLOptionElement>('#id_roletoassign option')].map((o) => ({ id: Number(o.value), name: o.text.trim(), def: o.selected }));
}
function rolleId(s: string, rollen: { id: number; name: string }[]): number {
  const n = norm(s || '');
  if (!n) return 0;
  const hit = rollen.find((r) => norm(r.name) === n) || rollen.find((r) => String(r.id) === s.trim());
  if (hit) return hit.id;
  const f = (t: (x: string) => boolean) => rollen.find((r) => t(norm(r.name)))?.id ?? -1;
  if (/ohne|nonediting|noneditingteacher/.test(n)) return f((x) => x.includes('ohne'));
  if (/^(trainer|teacher|lehr|editingteacher)/.test(n)) return f((x) => x === 'trainerin' || x === 'trainer');
  if (/teilnehm|student|schuel|lern/.test(n)) return f((x) => x.includes('teilnehm'));
  if (/manager/.test(n)) return f((x) => x.includes('manager'));
  return -1;
}

// JSON oder CSV (Trennzeichen ; , Tab, mit oder ohne Kopfzeile)
function listeLesen(text: string): any[] {
  const t = text.trim().replace(/^﻿/, '');
  if (!t) return [];
  if (/^[\[{]/.test(t)) { const j = JSON.parse(t); return Array.isArray(j) ? j : [j]; }
  const zeilen = t.split(/\r?\n/).filter((l) => l.trim());
  const delim = ['\t', ';', ','].map((d) => [d, zeilen[0].split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const teile = (l: string) => l.split(delim).map((x) => x.trim().replace(/^"(.*)"$/, '$1').trim());
  const kopf = teile(zeilen[0]);
  const hatKopf = !kopf.some((c) => c.includes('@'));
  let felder: string[];
  if (hatKopf) {
    let mails = 0;
    felder = kopf.map((k) => {
      const n = norm(k);
      if (n.includes('mail')) return mails++ ? 'email2' : 'email';
      if (/^(vorname|firstname|first|givenname)/.test(n)) return 'vorname';
      if (/^(nachname|lastname|last|surname|familienname|name)$/.test(n)) return 'nachname';
      if (/^(rolle|role)/.test(n)) return 'rolle';
      if (/^(schulnr|schulnummer|schoolno)/.test(n)) return 'schulnr';
      if (/^(schule|schulname|school)/.test(n)) return 'schule';
      return n;
    });
  } else {
    const iMail = kopf.findIndex((c) => c.includes('@'));
    const rest = ['vorname', 'nachname', 'rolle'];
    felder = kopf.map((_, i) => (i === iMail ? 'email' : rest.shift() || `x${i}`));
  }
  return zeilen.slice(hatKopf ? 1 : 0).map((l) => { const o: any = {}; teile(l).forEach((v, i) => (o[felder[i]] = v)); return o; });
}

// Eingeschriebene über die Moodle-Schnittstelle (unabhängig von Filtern auf der Teilnehmerseite)
async function teilnehmer(course: number) {
  const emails = new Set<string>(), namen = new Set<string>(), ids = new Set<number>(), liste: Fund[] = [];
  for (let page = 0; page < 50; page++) {
    const d = await ajax('core_enrol_search_users', { courseid: course, search: '', searchanywhere: true, page, perpage: 500 });
    if (!Array.isArray(d)) { if (page === 0) throw new Error('keine Teilnehmerliste'); break; }
    d.forEach((u: any) => {
      const m = String(u.email || '').trim().toLowerCase();
      ids.add(u.id); namen.add(norm(u.fullname || '')); if (m) emails.add(m);
      liste.push({ id: u.id, fullname: u.fullname || '', email: m });
    });
    if (d.length < 500) break;
  }
  return { emails, namen, ids, liste };
}

async function potenzielle(st: KState, q: string): Promise<Fund[]> {
  const d = await ajax('core_enrol_get_potential_users', { courseid: st.course, enrolid: st.enrolid, search: q, searchanywhere: true, page: 0, perpage: 100 });
  return (d || []).map((u: any) => ({ id: u.id, fullname: u.fullname, email: u.email || '' }));
}

const PRIVAT = /@(gmx\.(de|net|at|ch)|web\.de|gmail\.com|googlemail\.com|t-online\.de|outlook\.(de|com)|hotmail\.(de|com)|live\.(de|com)|icloud\.com|me\.com|mac\.com|yahoo\.(de|com)|posteo\.(de|net)|freenet\.de|aol\.(de|com)|arcor\.de|mailbox\.org|online\.de|email\.de|vodafone\.de|protonmail\.com|proton\.me)$/i;
const privatMail = (m: string) => PRIVAT.test(m.trim());
// Schulkürzel der Dienstadresse (z. B. altrah.hamburg.de) im Schulnamen der Liste (Grund- und Stadtteilschule Altrahlstedt)?
function domainPasst(mail: string, schule: string): boolean {
  const sch = norm(schule);
  if (!sch) return false;
  const dom = (mail.split('@')[1] || '').toLowerCase().replace(/\.?hamburg\.de$/, '');
  return dom.split(/[.\-]/).filter((t) => t.length >= 4 && !/^(schule|hamburg)$/.test(t)).some((t) => sch.includes(norm(t)));
}

async function kPruefen(r: KRow, st: KState, tn: Awaited<ReturnType<typeof teilnehmer>>, admin: boolean) {
  const vorher = r.id;
  r.treffer = []; r.hinweis = ''; r.gesperrt = false; r.id = 0;
  const em = r.email.toLowerCase(), voll = norm(r.vorname + r.nachname), voll2 = norm(r.nachname + r.vorname);
  if (r.rid === -1) r.hinweis = `Rolle „${r.rolle}“ gibt es in diesem Kurs nicht. `;
  if (vorher && tn.ids.has(vorher)) { r.status = 'imkurs'; r.id = vorher; return; } // schon zugeordnetes Konto ist eingeschrieben
  if (em && tn.emails.has(em)) { r.status = 'imkurs'; return; }
  const funde = new Map<number, Fund>();
  const vor1 = r.vorname.split(/[\s-]+/)[0] || '';
  for (const q of [...new Set([r.email, `${r.vorname} ${r.nachname}`, `${vor1} ${r.nachname}`, r.nachname])].filter((x) => x.trim())) {
    (await potenzielle(st, q)).forEach((f) => funde.set(f.id, f));
  }
  tn.liste.forEach((f) => { if (!funde.has(f.id)) funde.set(f.id, f); }); // Eingeschriebene fehlen in der Suche – gleiche Regeln auf sie anwenden
  const alle = [...funde.values()];
  const perMail = em ? alle.filter((f) => f.email.toLowerCase() === em) : [];
  const perName = alle.filter((f) => { const n = norm(f.fullname); return n === voll || n === voll2; });
  // Name weicht leicht ab (z. B. „Kea Lynn Körner“ ↔ „Kea Körner“): erster Vorname + Nachname stimmen
  const v1 = norm(vor1), nn = norm(r.nachname);
  const perVorname = perName.length ? [] : alle.filter((f) => { const n = norm(f.fullname); return v1.length > 1 && nn.length > 1 && ((n.startsWith(v1) && n.endsWith(nn)) || (n.startsWith(nn) && n.endsWith(v1))); });
  const kandidaten = perName.length ? perName : perVorname;
  const nameHinweis = perName.length ? '' : 'Vorname weicht ab. ';
  if (perMail.length === 1) { r.status = 'gefunden'; r.id = perMail[0].id; }
  else if (perMail.length > 1) { r.status = 'unklar'; r.treffer = perMail; r.hinweis += 'Mehrere Konten mit dieser E-Mail.'; }
  else if (!em && perName.length === 1) { r.status = 'gefunden'; r.id = perName[0].id; r.hinweis += 'Nur über den Namen gefunden.'; }
  else if (kandidaten.length) {
    // gleicher Name, andere Mail: Dienstkonto passend zur Schule bzw. statt privater Adresse automatisch nehmen
    const passend = kandidaten.filter((f) => domainPasst(f.email, String(r.raw?.schule ?? '')));
    const dienst = kandidaten.filter((f) => /hamburg\.de$/i.test(f.email));
    if (passend.length === 1) { r.status = 'gefunden'; r.id = passend[0].id; r.hinweis += `${nameHinweis}Dienstkonto der Schule übernommen: ${passend[0].fullname} <${passend[0].email}>`; }
    else if (kandidaten.length === 1 && dienst.length === 1 && privatMail(r.email)) { r.status = 'gefunden'; r.id = dienst[0].id; r.hinweis += `${nameHinweis}Private Adresse in der Liste, Dienstkonto übernommen: ${dienst[0].fullname} <${dienst[0].email}>`; }
    else { r.status = 'unklar'; r.treffer = kandidaten; r.hinweis += `${nameHinweis}Ähnlicher Name, andere E-Mail. Konto wählen oder als fehlend markieren.`; }
  }
  else r.status = 'fehlt';
  if (r.id) { const f = alle.find((x) => x.id === r.id); r.suche = f?.email || f?.fullname || ''; }
  if (r.id && r.status === 'gefunden' && tn.ids.has(r.id)) { r.status = 'imkurs'; return; }
  if (r.rid === -1 && r.status === 'gefunden') r.status = 'unklar';
  if (admin && r.status === 'gefunden') { const d = await detail(r.id); if (d?.gesperrt) { r.gesperrt = true; r.hinweis += ' Konto ist gesperrt.'; } }
}

// Moodle-Dialog „Nutzer/innen einschreiben“ öffnen und befüllen; Speichern klickt die Lehrkraft
async function dialogBefuellen(rows: KRow[], roleId: number, rollenName: string) {
  document.querySelector<HTMLElement>('form[action*="/enrol/manual/manage.php"] [type="submit"]')?.click();
  let sel: HTMLSelectElement | null = null;
  for (let i = 0; i < 50 && !sel; i++) { await warte(200); sel = document.querySelector<HTMLSelectElement>('.modal.show #id_userlist'); }
  if (!sel) { alert('Der Einschreibe-Dialog hat sich nicht geöffnet.'); return; }
  const modal = sel.closest<HTMLElement>('.modal')!;
  const rolle = modal.querySelector<HTMLSelectElement>('#id_roletoassign');
  if (rolle) { rolle.value = String(roleId); rolle.dispatchEvent(new Event('change', { bubbles: true })); rolle.style.outline = '2px solid #198754'; }
  // Das Suchfeld baut Moodle erst kurz nach dem Öffnen auf – darauf warten
  let inp: HTMLInputElement | null = null;
  for (let i = 0; i < 50 && !inp; i++) { inp = (sel.closest('.fitem') || modal).querySelector<HTMLInputElement>('input[id^="form_autocomplete_input"]'); if (!inp) await warte(200); }
  if (!inp) { alert('Das Suchfeld im Einschreibe-Dialog wurde nicht gefunden.'); return; }
  const liste = () => document.getElementById(`form_autocomplete_suggestions-${inp!.id.replace('form_autocomplete_input-', '')}`);
  const fehlt: string[] = [];
  const kopf = modal.querySelector('.modal-body');
  const info = document.createElement('div');
  info.style.cssText = 'background:#e7f1ff;border:1px solid #0d6efd;border-radius:6px;padding:8px 10px;margin-bottom:8px;font:13px system-ui;color:#052c65';
  kopf?.prepend(info);
  for (let i = 0; i < rows.length && inp; i++) {
    const r = rows[i];
    info.textContent = `LMS Nutzer trägt ein: ${i + 1} von ${rows.length} …`;
    inp.focus(); inp.value = r.suche || r.email || `${r.vorname} ${r.nachname}`;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    let opt: HTMLElement | null = null;
    for (let k = 0; k < 40 && !opt; k++) { await warte(200); opt = liste()?.querySelector<HTMLElement>(`[role="option"][data-value="${r.id}"]`) || null; }
    if (opt) { opt.click(); await warte(250); } else fehlt.push(`${r.vorname} ${r.nachname}`);
  }
  const n = sel.selectedOptions.length;
  setHtml(info, `<b>${n} Person(en) eingetragen</b> als <b>${esc(rollenName)}</b>.${fehlt.length ? ` Nicht übernommen: ${esc(fehlt.join(', '))}.` : ''} Bitte prüfen und unten auf <b>„…einschreiben“</b> klicken.`);
  const btn = [...modal.querySelectorAll<HTMLButtonElement>('.modal-footer button')].find((b) => /einschreiben/i.test(b.textContent || ''));
  btn?.addEventListener('click', () => {
    ss.set(K_KSUB, true);
    const t = setInterval(() => { if (!document.querySelector('.modal.show #id_userlist')) { clearInterval(t); setTimeout(() => { if (ss.get(K_KSUB, false)) { ss.del(K_KSUB); kursPanel(true); } }, 1500); } }, 400);
  });
}

function herunterladen(name: string, text: string, typ: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: typ }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

async function kursPanel(auto = false) {
  const admin = istAdmin();
  const seite = kursVonSeite();
  let st = ss.get<KState | null>(K_KURS, null);
  if (!st || st.course !== seite.course) st = { ...seite, rid: 0, rows: [] };
  st.enrolid = seite.enrolid;
  const save = () => ss.set(K_KURS, st);
  const { root, body } = rahmen('kurs');
  setHtml(body, `${HILFE_KURS}
  <section><h4><span class="n">1</span>Liste vorbereiten</h4><p class="m">Liste in einer Mail oder einem Dokument? Prompt kopieren, mit der Liste in ChatGPT oder Claude einfügen, das JSON aus der Antwort unten einfügen.</p><button id="pk">KI-Prompt kopieren</button></section>
  <section><h4><span class="n">2</span>Liste einfügen</h4>
  <div class="bar" style="margin:0 0 8px"><span class="m">Einschreiben als</span><select id="rolle"><option>lädt …</option></select></div>
  <textarea id="t" placeholder="JSON oder CSV hier einfügen&#10;z. B. email;vorname;nachname"></textarea>
  <div class="bar"><button id="ok" class="${st.rows.length ? '' : 'pri'}">Einlesen</button><input type="file" id="f" accept=".csv,.json,.txt" class="m" style="border:0;padding:0;max-width:190px"><button id="leer" class="lnk">Liste löschen</button></div></section>
  <section id="s3"><h4><span class="n">3</span>Prüfen und einschreiben</h4><div id="tab"></div></section>`);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  $<HTMLButtonElement>('#pk').onclick = (e) => kopieren(e.currentTarget as HTMLButtonElement, PROMPT_KURS);
  let rollen: { id: number; name: string; def: boolean }[] = [];
  try { rollen = await kursRollen(st.enrolid); } catch { /* unten Hinweis */ }
  if (!st.rid) st.rid = rollen.find((r) => r.def)?.id || rollen[0]?.id || 5;
  const rName = (id: number) => rollen.find((r) => r.id === id)?.name || `Rolle ${id}`;
  setHtml($('#rolle'), rollen.length ? rollen.map((r) => `<option value="${r.id}" ${r.id === st!.rid ? 'selected' : ''}>${esc(r.name)}</option>`).join('') : '<option>Rollen nicht lesbar</option>');
  $<HTMLSelectElement>('#rolle').onchange = (e) => { st!.rid = Number((e.target as HTMLSelectElement).value); save(); draw(); };
  let kursIds = new Set<number>();
  const zielRolle = (r: KRow) => (r.rid > 0 ? r.rid : st!.rid);

  const draw = () => {
    const rows = st!.rows;
    const z = (s: KStatus) => rows.filter((r) => r.status === s).length;
    const geprueft = rows.length > 0 && rows.every((r) => r.status !== 'offen');
    const gruppen = new Map<number, KRow[]>();
    rows.filter((r) => r.status === 'gefunden').forEach((r) => { const k = zielRolle(r); gruppen.set(k, [...(gruppen.get(k) || []), r]); });
    const fehlend = rows.filter((r) => r.status === 'fehlt');
    $('#s3').style.display = rows.length ? '' : 'none';
    setHtml($('#tab'), !rows.length ? '' : `<div class="bar"><button id="pr" class="${geprueft ? '' : 'pri'}">${geprueft ? 'Neu prüfen' : 'Prüfen'}</button>
      ${[...gruppen].map(([rid, g]) => `<button class="ein ${geprueft ? 'pri' : ''}" data-rid="${rid}">Einschreiben als ${esc(rName(rid))} (${g.length})</button>`).join('')}</div>
      <div class="m">gefunden ${z('gefunden')} · schon im Kurs ${z('imkurs')} · unklar ${z('unklar')} · nicht im System ${z('fehlt')}</div>
      ${geprueft && !gruppen.size && !z('unklar') && !fehlend.length ? '<div class="done">✓ Fertig – alle Personen sind im Kurs.</div>' : ''}
      ${fehlend.length ? `${geprueft && !gruppen.size ? `<div class="next"><b>Nächster Schritt:</b> ${fehlend.length} Person(en) gibt es noch nicht im LMS. ${admin ? 'Jetzt anlegen – danach geht es automatisch zurück zum Einschreiben.' : 'Liste als CSV oder JSON an einen LMS-Admin geben.'}</div>` : ''}
      <div class="bar">${admin ? `<button id="anl" class="${gruppen.size ? '' : 'warn'}">Fehlende anlegen (${fehlend.length})</button>` : ''}<button id="fj">Fehlende als JSON kopieren</button><button id="fc" class="${!admin && !gruppen.size ? 'warn' : ''}">Fehlende als CSV</button></div>
      ${admin || (geprueft && !gruppen.size) ? '' : '<div class="m">Diese Personen gibt es noch nicht im LMS. Bitte die Liste an einen LMS-Admin geben.</div>'}` : ''}
      <div class="bar"><button id="cp">Bericht kopieren</button><button class="del">🗑 Liste löschen</button></div>
      ${rows.map((r, i) => `<div class="c"><div><b>${esc(r.vorname)} ${esc(r.nachname)}</b> <span class="s ${r.status}">${K_LABEL[r.status]}</span>${r.gesperrt ? ' <span class="s fehlt">gesperrt</span>' : ''}</div>
        <div class="m">${esc(r.email)} · ${esc(r.rid > 0 ? rName(r.rid) : r.rid === -1 ? `Rolle? (${r.rolle})` : rName(st!.rid))}${r.id ? ` · <a href="/user/profile.php?id=${r.id}" target="_blank">Profil</a>` : ''}</div>
        ${r.hinweis ? `<div class="m">${esc(r.hinweis)}</div>` : ''}
        ${r.gesperrt && admin ? `<div class="m"><button class="k ent" data-id="${r.id}">Entsperren</button></div>` : ''}
        ${r.status === 'unklar' ? r.treffer.map((t) => `<div class="m"><a href="/user/profile.php?id=${t.id}" target="_blank">${esc(t.fullname)}</a> · ${esc(t.email)}${kursIds.has(t.id) ? ' · <b>im Kurs</b>' : ''} <button class="k nimm" data-i="${i}" data-id="${t.id}">dieses Konto</button></div>`).join('') + (r.rid !== -1 ? `<div class="m"><button class="k fehl" data-i="${i}">als fehlend markieren</button></div>` : '') : ''}</div>`).join('')}`);
    const pr = root.querySelector<HTMLButtonElement>('#pr');
    if (pr) pr.onclick = () => pruefeAlle(pr);
    root.querySelectorAll<HTMLButtonElement>('.ein').forEach((b) => (b.onclick = async () => {
      const rid = Number(b.dataset.rid); schliessen();
      await dialogBefuellen(gruppen.get(rid) || [], rid, rName(rid));
    }));
    root.querySelectorAll<HTMLButtonElement>('.nimm').forEach((b) => (b.onclick = () => { const r = rows[Number(b.dataset.i)]; r.id = Number(b.dataset.id); r.status = kursIds.has(r.id) ? 'imkurs' : 'gefunden'; const t = r.treffer.find((x) => x.id === r.id); r.suche = t?.email || t?.fullname || ''; r.hinweis = 'Konto von Hand gewählt.'; save(); draw(); }));
    root.querySelectorAll<HTMLButtonElement>('.fehl').forEach((b) => (b.onclick = () => { const r = rows[Number(b.dataset.i)]; r.status = 'fehlt'; r.treffer = []; save(); draw(); }));
    root.querySelectorAll<HTMLButtonElement>('.ent').forEach((b) => (b.onclick = () => { ss.set('nua_unlock', { id: Number(b.dataset.id) }); window.open(`/user/editadvanced.php?id=${b.dataset.id}`, '_blank'); }));
    const exp = () => fehlend.map((r) => ({ ...r.raw, vorname: r.vorname, nachname: r.nachname, email: r.email, kurs: st!.course, rolle: rName(zielRolle(r)) }));
    const fj = root.querySelector<HTMLButtonElement>('#fj');
    if (fj) fj.onclick = async () => { await navigator.clipboard.writeText(JSON.stringify(exp(), null, 1)); fj.textContent = 'Kopiert'; };
    const fc = root.querySelector<HTMLButtonElement>('#fc');
    if (fc) fc.onclick = () => {
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      herunterladen(`fehlende-nutzer-kurs-${st!.course}.csv`, '﻿' + ['email;vorname;nachname;schulnr;schule;kurs;rolle', ...exp().map((o) => [o.email, o.vorname, o.nachname, o.schulnr, o.schule, o.kurs, o.rolle].map(q).join(';'))].join('\r\n'), 'text/csv;charset=utf-8');
    };
    const anl = root.querySelector<HTMLButtonElement>('#anl');
    if (anl) anl.onclick = () => {
      ss.set(K_ROWS, aufbereiten(exp())); ss.del(K_Q); ss.set(K_RET, st!.course);
      oeffnen(true, true); // Anlege-Panel öffnet sich und prüft sofort
    };
    const cp = root.querySelector<HTMLButtonElement>('#cp');
    if (cp) cp.onclick = async () => { await navigator.clipboard.writeText(JSON.stringify({ kurs: st!.course, personen: rows.map((r) => ({ name: `${r.vorname} ${r.nachname}`, email: r.email, rolle: rName(zielRolle(r)), status: K_LABEL[r.status], id: r.id || undefined, gesperrt: r.gesperrt || undefined, hinweis: r.hinweis || undefined })) }, null, 1)); cp.textContent = 'Kopiert'; };
  };
  const pruefeAlle = async (pr?: HTMLButtonElement | null) => {
    if (pr) pr.disabled = true;
    let tn: Awaited<ReturnType<typeof teilnehmer>>;
    try { tn = await teilnehmer(st!.course); } catch { alert('Teilnehmerliste nicht lesbar.'); return; }
    kursIds = tn.ids;
    for (let i = 0; i < st!.rows.length; i++) {
      if (pr) pr.textContent = `Prüfe ${i + 1}/${st!.rows.length} …`;
      try { await kPruefen(st!.rows[i], st!, tn, admin); } catch { st!.rows[i].status = 'unklar'; st!.rows[i].hinweis = 'Prüfung fehlgeschlagen'; }
      save();
    }
    draw();
  };
  const einlesen = (text: string) => {
    try {
      const roh = listeLesen(text).filter((o) => o && (o.email || o.nachname));
      st!.rows = roh.map((o) => {
        const rolle = String(o.rolle ?? '').trim();
        return { vorname: String(o.vorname ?? '').trim(), nachname: String(o.nachname ?? '').trim(), email: String(o.email ?? '').trim(), rolle, rid: rolleId(rolle, rollen), status: 'offen', id: 0, treffer: [], hinweis: '', gesperrt: false, raw: o } as KRow;
      });
      save(); $('#ok').classList.remove('pri'); draw();
    } catch { alert('Liste nicht lesbar (weder JSON noch CSV).'); }
  };
  $('#ok').onclick = () => einlesen($<HTMLTextAreaElement>('#t').value);
  $<HTMLInputElement>('#f').onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) einlesen(await f.text()); };
  const leeren = () => { st!.rows = []; save(); $<HTMLTextAreaElement>('#t').value = ''; $<HTMLInputElement>('#f').value = ''; $('#ok').classList.add('pri'); draw(); };
  $('#leer').onclick = leeren;
  root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.del')) leeren(); });
  draw();
  if (auto && st.rows.length) await pruefeAlle(root.querySelector<HTMLButtonElement>('#pr'));
}

export default defineContentScript({
  matches: ['*://lms.lernen.hamburg/*'],
  main() {
    const admin = !!document.querySelector('a[href*="/admin/search.php"]');
    const p = location.pathname;
    if (p.endsWith('/user/index.php') && document.querySelector('form[action*="/enrol/manual/manage.php"]')) {
      knopf('LMS Nutzer – Kurs befüllen', () => (host ? schliessen() : kursPanel()));
      if (ss.get(K_KAUTO, false) || ss.get(K_KSUB, false)) { ss.del(K_KAUTO); ss.del(K_KSUB); setTimeout(() => kursPanel(true), 400); }
    }
    if (!admin) return; // Anlegen nur für Administratoren
    if (p.endsWith('/admin/search.php')) knopf('LMS Nutzer – anlegen / prüfen', () => (host ? schliessen() : oeffnen()));
    if (location.pathname.endsWith('/user/editadvanced.php')) { entsperrSeite(); formularSeite(); }
    else { entsperrtMerken(); weiterNachSpeichern(); }
  },
});
