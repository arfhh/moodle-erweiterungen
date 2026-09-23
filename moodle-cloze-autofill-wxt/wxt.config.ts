import { defineConfig } from 'wxt';

export default defineConfig({
  // Nicht .output/: ein Punkt am Anfang macht den Ordner im Finder unsichtbar,
  // und geladen wird bei WXT der BAU-Ordner, nicht der Projektordner.
  // 'Erweiterung' statt 'build': npm run paket benennt die Browser-Unterordner darin nach
  // Veroeffentlichungsnamen um und packt sie mit README zu dist/<name>.zip.
  outDir: 'Erweiterung',
  // Gebaut wird direkt in den Ordner, der auch geladen wird. Kein chrome-mv3
  // daneben, das man versehentlich laedt oder vergisst nachzuziehen.
  // Die Schreibweise "chrom" bleibt: Chrome leitet bei einer entpackten
  // Erweiterung die ID aus dem PFAD ab — ein anderer Ordnername heisst neue ID
  // und damit leere Einstellungen.
  outDirTemplate: 'moodle-cloze-autofill-{{browser}}',
  // Firefox baut WXT sonst als MV2. Wir erzwingen ueberall MV3, damit nicht
  // zwei strukturell verschiedene Manifeste entstehen (1-browser-wxt, Abschnitt 4).
  manifestVersion: 3,
  manifest: {
    name: 'Moodle Cloze Autofill',
    version: '2.0.5',
    description:
      'Trägt neue Antwortvarianten in die Cloze-Lücken der Fragensammlung ein: erzeugt einen Prompt aus den vorhandenen Lücken und setzt das von der KI gelieferte JSON chirurgisch in die Fragen ein.',
    permissions: ['storage'],
    // Im Hand-Manifest gab es kein "action" — hier ergaenzt fuer einen
    // sprechenden Titel in der Symbolleiste, wie bei den anderen Erweiterungen.
    action: { default_title: 'Moodle Cloze Autofill' },
    browser_specific_settings: {
      gecko: {
        id: 'moodle-cloze-autofill@spielhoff.de',
        strict_min_version: '142.0',
        // Mozilla verlangt seit 2025 eine ausdrueckliche Angabe. Die Erweiterung
        // sammelt nichts: keine Telemetrie, kein Netzverkehr ausser zu Moodle
        // selbst, alles bleibt lokal in browser.storage.local.
        data_collection_permissions: { required: ['none'] },
      },
    },
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        // ACHTUNG: In web_accessible_resources sind KEINE Platzhalter im Pfad
        // erlaubt — der Pfad muss '/*' sein. In content_scripts.matches ist
        // dasselbe Muster dagegen gueltig.
        matches: ['https://*/*', 'http://*/*'],
      },
    ],
  },
});
