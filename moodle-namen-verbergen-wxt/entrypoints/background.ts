import { ladeEinstellung, speichereEinstellung } from '../lib/speicher.js';

// Klick auf das Symbol in der Symbolleiste schaltet um. Die Seiten hoeren auf
// storage.onChanged und ziehen von selbst nach — keine Nachricht an Tabs noetig.
export default defineBackground(() => {
  browser.action.onClicked.addListener(async () => {
    const e = await ladeEinstellung();
    await speichereEinstellung({ ...e, aktiv: !e.aktiv });
  });
});
