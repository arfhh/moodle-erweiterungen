# Moodle AI Freitext Grader

Bewertet alle Freitextaufgaben (Essay-Fragen) in Moodle-Tests mit KI-Unterstützung –
Kurztests mit Zufallsfragen ebenso wie Klausuren mit Teilaufgaben. Die Erweiterung
greift selbst nicht auf eine KI zu: Sie baut die Prompts, du gibst sie in die KI deiner
Wahl, fügst die Antwort ein, und die Erweiterung rechnet und trägt Punkte samt Feedback ein.

Ersetzt **Moodle AI Coach** und **Moodle AI Grader**.

## So funktioniert es

1. **Frage anlegen:** Im Frageneditor einer Freitextfrage erscheint das Panel
   „Freitext Grader". Dort wählst du den Modus (**Kurztest** oder **Klausur**), kopierst
   den Prompt für den Erwartungshorizont, fügst die Antwort der KI ein und trägst den
   Horizont in die Frage ein. Bei einer neuen Frage wird er ins Formular gesetzt und mit
   „Änderungen speichern" gespeichert.
2. **Bewerten:** In der manuellen Bewertung des Tests (Übersicht) sammelt der
   Kurztest-Weg alle Kurztest-Fragen. Klausur-Fragen werden auf ihrer Einzelseite
   bewertet – der Rundgang führt der Reihe nach dorthin und am Ende zurück zur Übersicht.
3. **Review:** Bei Klausuren musst du jede Bewertung einmal angesehen haben, sonst kommt
   vor dem Eintragen eine Warnung. Den Klick zum Eintragen machst immer du.

Der Modus steht in der ersten Zeile des Horizonts:
`[moodle-ai-freitext: kurztest]` oder `[moodle-ai-freitext: klausur]`.
Alte Marker (`[moodle-ai-coach]`, `[moodle-ai-grader]`) gelten weiter.

## Installation

ZIP entpacken, den Ordner für deinen Browser wählen und als entpackte Erweiterung laden
(Chrome/Edge: Erweiterungen → Entwicklermodus → „Entpackte Erweiterung laden").
Coach und Grader vorher deaktivieren, sonst erscheinen zwei Panels.

## Lizenz

© 2026 T. Henken & A. Spielhoff — CC BY-SA 4.0
