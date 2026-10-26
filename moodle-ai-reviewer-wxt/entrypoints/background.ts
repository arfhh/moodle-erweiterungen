import { kiHintergrundStarten } from '../lib/ki-direkt/hintergrund.js';

// Nur der Baustein "KI direkt": die Anfrage an die KI laeuft hier, nicht im
// Content Script (Host-Berechtigung statt CORS-Freigabe am Server).
export default defineBackground(() => {
  kiHintergrundStarten();
});
