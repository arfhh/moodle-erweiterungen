import { defineConfig } from 'wxt';

// Aufbau wie bei den anderen Erweiterungen dieses Repos (siehe notenstufen-extension-wxt).
export default defineConfig({
  outDir: 'Erweiterung',
  // Schreibweise "chrom" bleibt: Chrome leitet die ID einer entpackten Erweiterung aus dem
  // PFAD ab — anderer Ordnername heisst neue ID und damit leerer Speicher.
  outDirTemplate: 'moodle-namen-verbergen-{{browser}}',
  manifestVersion: 3,
  manifest: {
    name: 'Moodle Namen verbergen',
    version: '1.0.4',
    description:
      'Verwischt Namen, E-Mail-Adressen und Profilbilder in Moodle per Klick - z. B. für Vorführungen mit Bildschirmfreigabe. Der Zustand wird im Browser gemerkt.',
    permissions: ['storage'],
    action: { default_title: 'Namen verbergen / anzeigen' },
    browser_specific_settings: {
      gecko: {
        id: 'namen-verbergen@spielhoff.de',
        strict_min_version: '142.0',
        // Keine Telemetrie, kein Netzverkehr, alles bleibt in browser.storage.
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
