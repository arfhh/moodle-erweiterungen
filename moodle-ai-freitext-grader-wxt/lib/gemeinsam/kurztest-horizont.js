/* Moodle AI Freitext Grader — Horizont-Prompt fuer den Kurztest-Modus.
 * Ein Grundprompt fuer Frageneditor (eine Aufgabe) und Uebersicht (mehrere).
 * Platzhalter [MOODLE_AI_COACH_AUFGABEN] wird von den Aufrufern ersetzt.
 * opts: { einzeln: bool, jahrgang: string, stufe: 'Kurz'|'Mittel'|'gemischt' }
 * A. Spielhoff · CC BY-SA 4.0
 */
import { stufenBlock, stufenBlockGemischt, horizontRegeln, HORIZONT_ZWECK } from './horizont-bausteine.js';

export function kurztestHorizontVorlage(opts = {}) {
  const ein = !!opts.einzeln;
  const stufe = opts.stufe === 'gemischt' ? stufenBlockGemischt() : stufenBlock('kurztest', opts.stufe);
  return `═══════════════════════════════════════════════════════
MOODLE AI FREITEXT GRADER – ERWARTUNGSHORIZONT (KURZTEST)
═══════════════════════════════════════════════════════

Für ${ein ? 'die Aufgabe unten brauchst du einen Erwartungshorizont' : 'die Aufgaben unten brauchst du je einen Erwartungshorizont'}
in genau dem Format unten. Er wird in Moodle im Feld „Informationen für Bewerter/innen"
der Aufgabe gespeichert und bei jeder Bewertung benutzt.

${HORIZONT_ZWECK}

BISHERIGER HORIZONT
Steht ${ein ? 'bei der Aufgabe' : 'bei einer Aufgabe'} „horizont_bisher", ist das ein älterer Horizont. Er ist
Ausgangspunkt, keine Vorlage zum Abschreiben: Übernimm, was fachlich gut ist, und
schreibe ihn im Format unten neu. Sag der Lehrkraft ZUERST in zwei, drei Sätzen, dass
ein bisheriger Horizont vorliegt, was du übernimmst und was du änderst.${ein ? '' : ' Stehen unten Änderungswünsche der Lehrkraft, haben sie\nVorrang – auch wenn der bisherige Horizont das Gegenteil sagt.'}
Steht kein „horizont_bisher" dabei, schreibst du neu.

KERNAUSSAGE = MUSTERANTWORT
Die Kernaussage sehen die Schülerinnen und Schüler: Bei unvollständigen Antworten setzt
die Erweiterung sie als „So hättest du es schreiben können" unter die Rückmeldung.
Schreibe sie als vollständige Musterantwort in einfacher Sprache – ein bis zwei kurze
Sätze, so wie eine gute Schülerin oder ein guter Schüler sie schreiben würde.

FORMAT${ein ? '' : ' je Aufgabe'}

Erwartungshorizont

Kernaussage:
<Musterantwort, ein bis zwei kurze Sätze>

Muss enthalten:
- <Teilaspekt 1>
- <Teilaspekt 2>

Auch richtig:
<gleichwertige Formulierungen, Synonyme, umgangssprachliche Varianten>

Inhalt:
100 % – <Bedingung>
 75 % – <Bedingung>
 50 % – <Bedingung>
 25 % – <Bedingung>
  0 % – <Bedingung>

Reicht nicht:
<sachlich richtige, aber zu knappe Antwort und warum sie nicht reicht>

Häufiger Fehler:
<typischer Denkfehler und was stattdessen richtig ist>

Teile:                          (nur wenn die Aufgabe Teile a, b … hat)
a) <Teil in zwei, drei Wörtern> – <Punkte> Punkt(e)
b) <Teil in zwei, drei Wörtern> – <Punkte> Punkt(e)

REGELN
${horizontRegeln(opts.jahrgang)}
• TEILE: Hat die Aufgabe Teile (a, b …), gehört der Abschnitt „Teile:" dazu. Die Punkte
  aller Teile ergeben zusammen genau „max". Die Stufen unter „Inhalt" gelten für die
  ganze Aufgabe und nennen, welche Teile erfüllt sein müssen.
• Die Schülerantworten sind ein bis drei Sätze lang. Halte den Horizont entsprechend
  knapp – er ist kein Lehrbuchtext.

${stufe}

AUSGABE
Gib zuerst ${ein ? 'den Horizont' : 'alle Horizonte'} als lesbaren Text aus, damit die Lehrkraft prüfen kann.
Frage dann: „Passt das so? Wenn ja, antworte mit ok." Ändere, bis die Lehrkraft
zustimmt. Erst nach „ok" gibst du genau EINEN Codeblock aus:

\`\`\`json
{
  "horizonte": [
    { "qid": "115576570", "frage": "Edelgasregel",
      "text": "Erwartungshorizont\\n\\nKernaussage:\\n…" }
  ]
}
\`\`\`

„qid" übernimmst du unverändert aus den Daten unten.

═══════════════════════════════════════════════════════
${ein ? 'DIESE AUFGABE' : 'AUFGABEN'}
═══════════════════════════════════════════════════════

[MOODLE_AI_COACH_AUFGABEN]`;
}
