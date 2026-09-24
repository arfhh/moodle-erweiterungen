import '../lib/style.css';
import { starteNotenstufen } from '../lib/notenstufen-core.js';

// Das Content Script bleibt bewusst duenn: es meldet nur matches und Zeitpunkt
// an und ruft dann den Kern auf. Der Kern ist zeilengleich mit der bewaehrten
// content.js v2.8.0 — einzige Aenderungen beim Umzug: chrome.* -> browser.*
// und der Top-Level-Code wurde zu einer exportierten Funktion (sonst liefe er
// schon beim Erzeugen der Typen los, wo es kein `document` gibt).
export default defineContentScript({
  matches: ['*://*/*grade/edit/letter/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  main() {
    starteNotenstufen();
  },
});
