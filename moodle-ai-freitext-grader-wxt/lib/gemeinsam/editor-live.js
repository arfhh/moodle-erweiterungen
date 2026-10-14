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
export function schreibeEditorfeldLive(name, html) {
  const ta = document.querySelector('[name="' + CSS.escape(name) + '"]');
  if (!ta) throw new Error('Feld „' + name + '" nicht im Formular');
  ta.value = html;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  const id = ta.id || '';
  const ifr = id && document.getElementById(id + '_ifr');
  if (ifr && ifr.contentDocument && ifr.contentDocument.body) {
    ifr.contentDocument.body.innerHTML = html;
    ifr.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
    return 'TinyMCE';
  }
  const atto = id && document.getElementById(id + 'editable');
  if (atto) {
    atto.innerHTML = html;
    atto.dispatchEvent(new Event('input', { bubbles: true }));
    return 'Atto';
  }
  return 'Textfeld';
}
