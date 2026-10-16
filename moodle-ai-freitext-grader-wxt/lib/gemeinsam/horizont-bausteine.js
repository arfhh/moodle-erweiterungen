/* Moodle AI Freitext Grader — gemeinsame Bausteine der Horizont-Prompts.
 * Zwei Grundprompts (Kurztest, Klausur) + je Feedbacklaenge ein Stufenblock.
 * Wichtig: Die Feedbacklaenge aendert nur das Material fuer die Rueckmeldung,
 * nie die Schaerfe der Bewertungsstufen.
 * A. Spielhoff · CC BY-SA 4.0
 */

const STUFE_KURZTEST = {
  Kurz: `FEEDBACKLÄNGE: KURZ (ein bis zwei Sätze an die Schülerin / den Schüler)
Die Bewertungsstufen bleiben genauso scharf wie sonst – die Feedbacklänge ändert nichts
an der Punktvergabe. Kürzer werden nur die Teile, aus denen die Rückmeldung entsteht:
• „Reicht nicht" und „Häufiger Fehler" je höchstens ein Eintrag in einem Satz.
• Füge nach „Häufiger Fehler" diesen Abschnitt an:

Wichtigster Hinweis:
<der eine Satz, den jemand mit unvollständiger Antwort am dringendsten braucht>`,

  Mittel: `FEEDBACKLÄNGE: MITTEL (drei bis fünf Sätze an die Schülerin / den Schüler)
„Reicht nicht" und „Häufiger Fehler" liefern den Stoff für die Rückmeldung. Schreibe zu
jedem Eintrag einen Halbsatz, warum es nicht reicht bzw. was stattdessen richtig ist.`
};

const STUFE_KLAUSUR = {
  Mittel: `FEEDBACKLÄNGE: MITTEL (drei bis vier Sätze je Teilaufgabe)
Die Abschnitte oben genügen. „Reicht nicht" und „Häufiger Fehler" je ein bis zwei Einträge.`,

  Ausführlich: `FEEDBACKLÄNGE: AUSFÜHRLICH (ein Absatz je Teilaufgabe mit Bezug auf die Antwort)
Ergänze je Aufgabe nach „Häufiger Fehler" diesen Abschnitt:
<p><strong>Begründung je Stufe:</strong> für jede Stufe unter 100 % ein sachlicher Satz,
was gegenüber der vollen Leistung fehlt – so formuliert, dass die Bewertung ihn als
Begründung aufgreifen kann.</p>`,

  Umfangreich: `FEEDBACKLÄNGE: UMFANGREICH (ausführlicher Absatz je Teilaufgabe, dazu ein eigener
Abschnitt „Operatorerfüllung" im Feedback)
Ergänze je Aufgabe nach „Häufiger Fehler" diese beiden Abschnitte:
<p><strong>Begründung je Stufe:</strong> für jede Stufe unter 100 % ein sachlicher Satz,
was gegenüber der vollen Leistung fehlt.</p>
<p><strong>Operatorerfüllung:</strong> was der Operator in DIESER Aufgabe konkret verlangt
(z. B. „Erläutere": Ursache nennen, Wirkung nennen, beides mit „weil/dadurch" verknüpfen)
und woran man eine Verfehlung erkennt (z. B. nur beschrieben, nicht verknüpft).</p>`
};

export function stufenBlock(modus, stufe) {
  const tab = modus === 'kurztest' ? STUFE_KURZTEST : STUFE_KLAUSUR;
  const std = modus === 'kurztest' ? 'Mittel' : 'Ausführlich';
  return tab[stufe] || tab[std];
}

// Uebersicht: Aufgaben mit verschiedenen Feedbacklaengen in einem Prompt.
export function stufenBlockGemischt() {
  return `FEEDBACKLÄNGE JE AUFGABE
Bei jeder Aufgabe steht „feedback". Es gilt der passende Block:

[Kurz]
${STUFE_KURZTEST.Kurz}

[Mittel]
${STUFE_KURZTEST.Mittel}`;
}

/* --- Material: nur wenn die Aufgabe darauf verweist --- */
const VERWEIS_RE = /\bM\s?\d{1,2}\b|\bMaterial|\bAbb(?:ildung|\.)|\bTabelle|\bDiagramm|\bGrafik|\bTextauszug|\bQuelle\b/i;

export function materialVerweis(texte, dateien) {
  return (dateien && dateien.length > 0) || (texte || []).some(t => VERWEIS_RE.test(String(t || '')));
}

export function materialBlock(texte, dateien) {
  if (!materialVerweis(texte, dateien)) return '';
  const d = dateien || [];
  return `MATERIAL
Die Aufgabe verweist auf Material (M1, Abbildung, Tabelle …).
• Liegt das Material hier im Chat nicht vollständig vor, FRAGE ZUERST danach und schreibe
  den Horizont erst, wenn es da ist. Rate keine Werte.
• Werte das Material JETZT aus. Beim späteren Bewerten liegt es NICHT mehr vor. Schreibe alle
  Werte und Aussagen, die eine Antwort braucht, mit Quelle direkt in die Erwartungen
  (z. B. „M2, Tabelle: Siedetemperatur 78 °C"), nicht nur „siehe M2".
• Wörtliche Übernahmen aus dem Material ohne eigene Erklärung sind ein „Reicht nicht"-Fall,
  wo die Aufgabe eine Erklärung verlangt.` + (d.length
    ? '\n\nIn der Aufgabe stehen Bilder/Dateien, die hier nur als Name ankommen:\n- ' + d.join('\n- ')
      + '\nDie Lehrkraft lädt sie zusätzlich in den Chat hoch.'
    : '');
}

/* --- Gemeinsame Regeln fuer jeden Horizont: machen die Grundregeln der
 *     Bewertung pro Aufgabe konkret. --- */
export function horizontRegeln(jahrgang) {
  const wer = jahrgang ? 'Lernende der Jahrgangsstufe ' + jahrgang : 'Lernende dieser Jahrgangsstufe';
  return `• Nur die Stufen 100 / 75 / 50 / 25 / 0 Prozent. Lass Stufen weg, die die Aufgabe nicht
  hergibt (bei einer Aufzählung von drei Dingen etwa 100 / 75 / 50 / 0).
• JEDE STUFE HÄNGT AN ZÄHLBAREN BEDINGUNGEN („beide Teilaspekte", „Name ohne Funktion"),
  nie an Wörtern wie „überwiegend", „im Wesentlichen" oder „deutliche Lücken". Solche
  Wörter führen dazu, dass dieselbe Antwort verschieden eingestuft wird. Prüfe zum
  Schluss: Jede denkbare Antwort gehört zu genau EINER Stufe – keine Lücke, keine
  Überschneidung.
• „AUCH RICHTIG" ist der wichtigste Abschnitt. Gemeint sind nicht ausformulierte
  Musterantworten, sondern die rauen, verkürzten Fassungen, mit denen ${wer}
  dasselbe sagen – auch umgangssprachlich, auch ohne Fachbegriff. Mindestens vier,
  dazu Wörter, die dasselbe meinen (etwa Ring, Bahn oder Ebene statt Schale).
• Der OPERATOR zählt: Schreibe in die 100-%-Bedingung, was er hier verlangt. Bei „Nenne"
  reicht die Nennung, bei „Beschreibe" der Sachverhalt, bei „Erkläre/Erläutere" muss ein
  Zusammenhang (weil, dadurch) dastehen, bei „Vergleiche" beide Seiten, bei
  „Beurteile/Bewerte" ein begründetes Urteil.
• STICHPUNKTE gelten als vollständige Antwort, solange sie den Inhalt tragen. Verlangt der
  Operator einen Zusammenhang, den Stichpunkte nicht zeigen, lege in den Stufen fest,
  wo sie landen.
• ZUSATZWISSEN: Fachlich richtige Zusätze, die nicht verlangt sind, heben keine Stufe.
  Lege keine Stufe an, die für Zusatzwissen mehr gibt.
• „REICHT NICHT" enthält nur Antworten, die sachlich RICHTIG, aber zu wenig sind.
  Sachlich Falsches gehört zu 0 % und unter „Häufiger Fehler" – sonst liest die
  Bewertung es als fast richtig.
• NICHT in den Horizont: Sprachregeln, Rechtschreibabzug, Feedback-Stil, Rolle,
  Punktzahlen, allgemeine Bewertungsregeln. Das steht im Bewertungsprompt der
  Erweiterung. Im Horizont steht nur, was für DIESE Aufgabe gilt.`;
}

export const HORIZONT_ZWECK = `WOZU DER HORIZONT DIENT
Mit diesem Horizont bewertet später eine KI die Antworten einer ganzen Lerngruppe.
Gleiche Antworten sollen immer dieselbe Stufe bekommen – egal welches Modell bewertet
und wie oft. Das gelingt nur, wenn der Horizont keinen Ermessensspielraum lässt.`;
