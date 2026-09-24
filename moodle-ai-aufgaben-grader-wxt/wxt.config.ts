import { defineConfig } from 'wxt';

export default defineConfig({
  // Nicht .output/: ein Punkt am Anfang macht den Ordner im Finder unsichtbar,
  // und geladen wird bei WXT der BAU-Ordner, nicht der Projektordner (Arne, 16.09.2026).
  // 'Erweiterung' statt 'build': npm run paket benennt die Browser-Unterordner darin nach
  // Veroeffentlichungsnamen um und packt sie mit README zu dist/<name>.zip (Arne, 17.09.2026).
  outDir: 'Erweiterung',
  // Gebaut wird direkt in den Ordner, der auch geladen wird. Kein chrome-mv3
  // daneben, das man versehentlich laedt oder vergisst nachzuziehen.
  // Die Schreibweise "chrom" bleibt: Chrome leitet bei einer entpackten
  // Erweiterung die ID aus dem PFAD ab — ein anderer Ordnername heisst neue ID
  // und damit leerer Speicher, also Massstab und Einstellungen weg.
  outDirTemplate: 'moodle-ai-aufgaben-grader-{{browser}}',
  // Firefox baut WXT sonst als MV2. Wir erzwingen ueberall MV3, damit nicht
  // zwei strukturell verschiedene Manifeste entstehen (1-browser-wxt, Abschnitt 4).
  manifestVersion: 3,
  manifest: {
    name: 'Moodle AI Aufgaben-Grader',
    version: '1.9.0',
    description:
      'Laedt anonymisierte Datei-Abgaben aus dem Aufgaben-Modul als ZIP herunter, erzeugt den passenden KI-Auftrags-Prompt und traegt Note und Feedback aus einer CSV-Datei automatisch in Moodle ein.',
    permissions: ['storage'],
    action: { default_title: 'Moodle AI Aufgaben-Grader' },
    browser_specific_settings: {
      gecko: {
        id: 'moodle-ai-aufgaben-grader@spielhoff.de',
        strict_min_version: '142.0',
        // Mozilla verlangt seit 2025 eine ausdrueckliche Angabe. Die Erweiterung
        // sammelt nichts: keine Telemetrie, kein Netzverkehr, alles bleibt lokal.
        data_collection_permissions: { required: ['none'] },
      },
    },
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        // ACHTUNG: In web_accessible_resources sind KEINE Platzhalter im Pfad
        // erlaubt — der Pfad muss '/*' sein. Ein Muster wie
        // '*://*/*mod/assign/view.php*' laesst Chrome das ganze Manifest
        // abweisen: "Invalid value for 'web_accessible_resources[0]'".
        // In content_scripts.matches ist dasselbe Muster dagegen gueltig.
        // (Arne, 16.09.2026 — beim Laden in Chrome aufgefallen.)
        matches: ['https://*/*', 'http://*/*'],
      },
    ],
  },
});
