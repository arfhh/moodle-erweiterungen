/* Moodle AI Freitext Grader — Editorfeld im OFFENEN Fragenformular fuellen.
 *
 * Fuer eine neue Frage (noch ohne id) gibt es keine gespeicherte Fassung, in die man
 * per Formular-Absenden schreiben koennte. Deshalb wird der Inhalt direkt in das
 * sichtbare Formular gesetzt; Moodle speichert ihn mit „Änderungen speichern".
 * Abgedeckt: TinyMCE (iframe <id>_ifr), Atto (div <id>editable), reines Textfeld.
 * Kein Zugriff auf Seiten-JavaScript noetig — nur DOM.
 *
 * © 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
 */
// HTML sicher in einen Editor-Koerper setzen (seit 1.1.4): ueber DOMParser statt innerHTML,
// Skripte, eingebettete Objekte und on…-Handler werden vorher entfernt. Mozillas Pruefung
// (web-ext lint, UNSAFE_VAR_ASSIGNMENT) verlangt das; inhaltlich aendert sich nichts.
function setzeHtmlSicher(ziel, html) {
  const dok = new DOMParser().parseFromString(String(html || ''), 'text/html');
  dok.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove());
  dok.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
  });
  const zielDok = ziel.ownerDocument || document;
  ziel.replaceChildren(...[...dok.body.childNodes].map((n) => zielDok.importNode(n, true)));
}

export function schreibeEditorfeldLive(name, html) {
  const ta = document.querySelector('[name="' + CSS.escape(name) + '"]');
  if (!ta) throw new Error('Feld „' + name + '" nicht im Formular');
  ta.value = html;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  const id = ta.id || '';
  const ifr = id && document.getElementById(id + '_ifr');
  if (ifr && ifr.contentDocument && ifr.contentDocument.body) {
    setzeHtmlSicher(ifr.contentDocument.body, html);
    ifr.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
    return 'TinyMCE';
  }
  const atto = id && document.getElementById(id + 'editable');
  if (atto) {
    setzeHtmlSicher(atto, html);
    atto.dispatchEvent(new Event('input', { bubbles: true }));
    return 'Atto';
  }
  return 'Textfeld';
}

// Gegenstueck: aktuellen Inhalt aus dem offenen Editor lesen (nicht nur aus der
// Textarea — TinyMCE/Atto gleichen sie erst beim Speichern ab).
export function leseEditorfeldLive(name) {
  const ta = document.querySelector('[name="' + CSS.escape(name) + '"]');
  if (!ta) return '';
  const id = ta.id || '';
  const ifr = id && document.getElementById(id + '_ifr');
  if (ifr && ifr.contentDocument && ifr.contentDocument.body) return ifr.contentDocument.body.innerHTML;
  const atto = id && document.getElementById(id + 'editable');
  if (atto) return atto.innerHTML;
  return ta.value || '';
}
