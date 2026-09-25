import '../lib/style.css';
import { starteNamenVerbergen } from '../lib/namen-core.js';

// matches bewusst auf typische Moodle-Pfade begrenzt statt auf alle Seiten; ob die Seite
// wirklich Moodle ist, prueft der Kern zusaetzlich (body-Klasse "pagelayout-*").
// '*user/*' trifft auch Unterverzeichnis-Installationen (wie bei den anderen Erweiterungen).
const PFADE = [
  'user', 'grade', 'mod', 'course', 'enrol', 'group', 'report', 'message',
  'my', 'badges', 'question', 'calendar', 'blocks', 'admin', 'cohort', 'rating', 'comment',
];

export default defineContentScript({
  matches: PFADE.map((p) => `*://*/*${p}/*`),
  runAt: 'document_start',
  cssInjectionMode: 'manifest',
  main() {
    starteNamenVerbergen();
  },
});
