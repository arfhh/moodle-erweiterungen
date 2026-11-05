import { defineConfig } from 'wxt';

// LMS Nutzer – Version steht hier (Quelle der Wahrheit).
// Aufbau wie bei den anderen Erweiterungen dieses Repos (siehe moodle-namen-verbergen-wxt).
// © 2026 A. Spielhoff – MIT-Lizenz
export default defineConfig({
  outDir: 'Erweiterung',
  // Schreibweise "chrom" wie bei den anderen: Chrome leitet die ID einer entpackten
  // Erweiterung aus dem PFAD ab.
  outDirTemplate: 'lms-nutzer-{{browser}}',
  manifestVersion: 3,
  manifest: {
    name: 'LMS Nutzer',
    version: '1.0.2',
    description:
      'Prüft Nutzer im LMS Hamburg auf Vorhandensein und füllt das Anlegeformular nacheinander vor. Speichern bleibt bei der Lehrkraft.',
    permissions: [],
    browser_specific_settings: {
      gecko: {
        id: 'lms-nutzer@spielhoff.de',
        strict_min_version: '142.0',
        // Keine Telemetrie; Anfragen gehen nur an das geöffnete LMS selbst.
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
