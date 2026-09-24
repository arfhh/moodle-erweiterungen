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
  // und damit leerer Speicher, also Massstab und Einstellungen weg.
  outDirTemplate: 'moodle-ai-coach-{{browser}}',
  // Firefox baut WXT sonst als MV2. Wir erzwingen ueberall MV3, damit nicht
  // zwei strukturell verschiedene Manifeste entstehen (1-browser-wxt, Abschnitt 4).
  manifestVersion: 3,
  manifest: {
    name: 'Moodle AI Coach',
    version: '1.9.0',
    description:
      'Bewertet kurze Freitextantworten (2-3 Sätze) in Moodles Manueller Bewertung: liest den Erwartungshorizont aus der Frage, baut daraus einen Bewertungs-Prompt, trägt Punkte und Sprachfeedback zurück. Fehlt der Horizont, erzeugt der Coach den Prompt zum Erstellen und schreibt ihn in die Frage.',
    permissions: ['storage'],
    action: { default_title: 'Moodle AI Coach' },
    browser_specific_settings: {
      gecko: {
        id: 'moodle-ai-coach@spielhoff.de',
        strict_min_version: '142.0',
        // Mozilla verlangt seit 2025 eine ausdrueckliche Angabe. Die Erweiterung
        // sammelt nichts: keine Telemetrie, kein Netzverkehr ausser zu Moodle
        // selbst, alles bleibt lokal in chrome.storage.local.
        data_collection_permissions: { required: ['none'] },
      },
    },
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        // ACHTUNG: In web_accessible_resources sind KEINE Platzhalter im Pfad
        // erlaubt — der Pfad muss '/*' sein. In content_scripts.matches ist
        // dasselbe Muster dagegen gueltig. (Lehre aus dem Aufgaben-Grader-Umzug.)
        matches: ['https://*/*', 'http://*/*'],
      },
    ],
  },
});
