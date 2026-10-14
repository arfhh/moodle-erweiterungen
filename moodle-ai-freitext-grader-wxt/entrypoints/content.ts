// Moodle AI Freitext Grader — Content Script.
// Duenn wie bei allen WXT-Erweiterungen dieses Repos: es meldet nur matches und
// startet die beiden Bewertungswege. Jeder Weg prueft selbst, ob die Seite ihm gehoert:
//   Kurztest-Weg (frueher Coach):  Uebersicht der manuellen Bewertung ohne slot=
//   Klausur-Weg  (frueher Grader): Einzelfrageseite (slot=) und Frageneditor
// Beide schliessen sich ueber die Seitenart aus, es erscheint nie mehr als ein Panel.
import '../lib/grader-style.css';
import '../lib/coach-style.css';
import { starteGrader } from '../lib/mag-core.js';
import { starteCoach } from '../lib/coach-core.js';

export default defineContentScript({
  matches: [
    '*://*/*mod/quiz/report.php*',
    '*://*/*question/bank/editquestion/question.php*',
  ],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  main() {
    starteGrader();
    if (location.pathname.includes('/mod/quiz/report.php')) starteCoach();
  },
});
