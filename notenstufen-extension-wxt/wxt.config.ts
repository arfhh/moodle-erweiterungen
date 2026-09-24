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
  // und damit leerer Speicher, also gespeicherte Notenskalen weg.
  outDirTemplate: 'notenstufen-autofill-{{browser}}',
  // Firefox baut WXT sonst als MV2. Wir erzwingen ueberall MV3, damit nicht
  // zwei strukturell verschiedene Manifeste entstehen (1-browser-wxt, Abschnitt 4).
  manifestVersion: 3,
  manifest: {
    name: 'Moodle Notenstufen Autofill',
    version: '2.8.0',
    description:
      'Füllt die Notenstufen-Tabelle in Moodle-Kursen automatisch aus - in jeder Moodle-Installation, auch in einem Unterverzeichnis. Werte im Panel auf der Seite individuell anpassbar.',
    permissions: ['storage'],
    action: { default_title: 'Notenstufen Autofill' },
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        // ACHTUNG: In web_accessible_resources sind KEINE Platzhalter im Pfad
        // erlaubt — der Pfad muss '/*' sein. In content_scripts.matches ist
        // dasselbe Muster dagegen gueltig. (Lehre aus dem Aufgaben-Grader-Umzug.)
        matches: ['https://*/*', 'http://*/*'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: 'notenstufen-autofill@spielhoff.de',
        strict_min_version: '142.0',
        // Sammelt nichts: keine Telemetrie, kein Netzverkehr, alles bleibt lokal
        // in browser.storage.local.
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
