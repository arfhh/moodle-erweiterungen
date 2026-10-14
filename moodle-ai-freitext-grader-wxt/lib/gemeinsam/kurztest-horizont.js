/* Moodle AI Freitext Grader — Horizont-Prompt fuer den Kurztest-Modus.
 * Unveraendert aus Moodle AI Coach 1.9.1 uebernommen, damit Frageneditor
 * (Klausur-Weg-Panel) und Uebersicht (Kurztest-Weg) denselben Text benutzen.
 * Platzhalter [MOODLE_AI_COACH_AUFGABEN] wird von den Aufrufern ersetzt.
 * A. Spielhoff · CC BY-SA 4.0
 */
export function kurztestHorizontVorlage() {
  return `═══════════════════════════════════════════════════════
MOODLE AI COACH – ERWARTUNGSHORIZONT ERSTELLEN
═══════════════════════════════════════════════════════

Für die unten stehenden Aufgaben brauchst du einen Erwartungshorizont – einen je
Aufgabe, in genau dem Format unten. Er wird anschließend in das Moodle-Feld
„Bewerterinformation" der Frage geschrieben und dort dauerhaft benutzt.

Steht bei einer Aufgabe „horizont_bisher", gibt es dort schon einen. Er ist der
**Ausgangspunkt, keine Vorlage zum Abschreiben**: Er wird ersetzt, weil an ihm etwas
nicht stimmt. Übernimm, was gut ist, und weiche dort ab, wo die Änderungswünsche der
Lehrkraft es verlangen – auch dann, wenn der bisherige Horizont das Gegenteil sagt.
Steht kein „horizont_bisher" dabei, schreibst du neu.

Die Kernaussage bekommen die Schülerinnen und Schüler zu sehen: Die Erweiterung setzt
sie bei unvollständigen Antworten als „So hättest du es schreiben können" unter die
Rückmeldung. Schreib sie deshalb als vollständige Musterantwort in einfacher Sprache –
Name und Funktion, ein bis zwei kurze Sätze.

WICHTIG – was NICHT hineingehört:
Keine Sprachregeln, kein Rechtschreibabzug, kein Feedback-Stil, keine Rolle, keine
Punktzahl. Das steht global in der Erweiterung. Im Horizont steht ausschließlich,
was für DIESE eine Aufgabe gilt. Sonst entstehen so viele Kopien der Regeln, wie es
Fragen gibt, und sie laufen auseinander.

FORMAT je Aufgabe:

Erwartungshorizont

Kernaussage:
<der eine Satz, der die volle Inhaltspunktzahl trägt>

Muss enthalten:
- <Teilaspekt 1>
- <Teilaspekt 2>

Auch richtig:
<gleichwertige Formulierungen, Synonyme, umgangssprachliche Varianten>

Inhalt:
100 % – <Bedingung>
 75 % – <Bedingung>            (nur wenn die Aufgabe eine solche Stufe hergibt)
 50 % – <Bedingung>
 25 % – <Bedingung>
  0 % – <Bedingung>

Reicht nicht:
<typische halbe Antwort und warum sie nicht reicht>

Häufiger Fehler:
<typischer Denkfehler – hilft später beim Feedback>

REGELN:
• Benutze nur die Stufen 100 / 75 / 50 / 25 / 0. Kein 90 – das ist im Projekt die
  Rechtschreibstufe und hat mit Inhalt nichts zu tun.
• Lass Stufen weg, die die Aufgabe nicht hergibt. Bei einer Aufzählung von drei
  Dingen sind 100 / 75 / 50 / 0 natürlicher als fünf Stufen.
• Die Antwort soll ein bis drei Sätze lang sein. Halte den Horizont entsprechend
  knapp – er ist kein Lehrbuchtext.
• „Auch richtig" ist der wichtigste Abschnitt. Denk daran, wie Vierzehnjährige
  formulieren, und nimm diese Varianten ausdrücklich auf.
• Der Operator der Aufgabe zählt: Bei „Nenne" reicht die Nennung, bei „Erkläre"
  muss ein Zusammenhang dastehen, bei „Vergleiche" beide Seiten.

AUSGABE:
Gib zuerst alle Horizonte als lesbaren Text aus, damit die Lehrkraft sie prüfen kann.
Frage dann: „Passt das so?"
Erst nach „ok" gibst du sie als JSON aus:

\`\`\`json
{
  "horizonte": [
    { "qid": "115576570", "frage": "alkoholischen Gärung (AFB I)",
      "text": "Erwartungshorizont\\n\\nKernaussage:\\n…" }
  ]
}
\`\`\`

„qid" übernimmst du unverändert aus den Daten unten.

═══════════════════════════════════════════════════════
AUFGABEN OHNE ERWARTUNGSHORIZONT
═══════════════════════════════════════════════════════

[MOODLE_AI_COACH_AUFGABEN]`;
}
