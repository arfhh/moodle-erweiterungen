# ChatGPT-Prompt für „LMS Nutzer“

Zweck: ChatGPT macht aus einer Anfrage-Mail (1) das JSON für die Erweiterung und (2) die Antwortmail.

**So wird er benutzt:** Den Prompt unten komplett in einen neuen Chat kopieren, ganz unten bei „Anfrage“ die Mail einfügen (Mailtext inklusive Absender, An- und Cc-Zeile, wenn möglich) und senden. Das JSON im Codeblock kopieren und im Panel der Erweiterung einlesen. Die Antwortmail kopieren und im Mailprogramm unter „Allen antworten“ einfügen.

**Stand:** Prompt 1.0, passend zur Erweiterung ab Version 0.4.2.

---

```
Du hilfst mir, Nutzerkonten im LMS Hamburg (lms.lernen.hamburg) anzulegen. Aus der Anfrage-Mail unten erstellst du zwei Dinge, jeweils in einem eigenen Codeblock und ohne weitere Erklärung:

1. ein JSON-Array für die Browser-Erweiterung "LMS Nutzer"
2. die Antwortmail

Die Erweiterung prüft selbst, ob es die Personen schon gibt. Prüfe oder behaupte darüber nichts.

== 1. JSON ==
Eine Person pro Zeile, mit diesen Feldern:

{"vorname":"","nachname":"","email":"","email2":"","schulnr":"","schule":"","privat":false,"persona":"Lehrer/in","stadt":"Hamburg","info":"","bemerkung":""}

Regeln:
- vorname und nachname ohne Titel (Dr., Prof.) und ohne Anrede. Mehrere Vornamen gehören ins Feld vorname.
- email: die dienstliche Adresse. Stehen zwei Adressen da und eine ist privat (web.de, gmail, t-online, gmx …), nimm die dienstliche. Weitere Adressen kommen in email2.
- Soll ein Zugang über das Landesinstitut eingerichtet werden (Adresse @li.hamburg.de), nimm die LI-Adresse aus der Mail. Steht keine da, schreibe sie nicht selbst, sondern lass email leer und sag es in bemerkung.
- schulnr und schule: Nummer und Name der Schule laut Schulenverzeichnis Hamburg. Weißt du die Nummer nicht sicher, lass schulnr leer und schreibe nur den Schulnamen so, wie er in der Mail steht. Rate keine Nummer.
- Mitarbeitende des Landesinstituts (E-Mail @li.hamburg.de) und Personen ohne Schule: schulnr "1111", schule "Landesinstitut".
- Private Schulen: schulnr "1111", schule = Name der Schule, privat true.
- persona: genau einer der Werte Lehrer/in, Schüler/in, Projektteam, Sorgeberechtigte/r, Pädagogisch-Therapeutisches Fachpersonal (PTF), Sonstige. Im Zweifel Lehrer/in.
- info: Funktion oder Rolle aus der Anfrage (z. B. "Informatik-Koordinator, LIF 12"), sonst leer. Der Text landet in der Beschreibung des Kontos.
- bemerkung: Hinweise für mich (z. B. "Konto gesperrt" laut Mail, "Schule unklar"), sonst leer.
- Erfinde nichts. Fehlt eine Angabe, bleibt das Feld leer.
- Nimm nur die Personen auf, für die ich etwas tun soll. Wer laut Mail schon eingeschrieben oder versorgt ist, bleibt draußen.

== 2. Antwortmail ==
- Ich antworte mit „Allen antworten“. Sprich daher alle Empfänger an: den Absender und die Personen, für die die Konten sind (Namen stehen in der An- oder Cc-Zeile).
- Ohne Betreff, ohne Signaturblock. Beginne mit „Hallo …“ und ende mit „Viele Grüße“ und dem Namen aus meiner Signatur unten.
- Du-Form, wenn die Anfrage von einer Person des Landesinstituts kommt, sonst Sie-Form. Im Zweifel Du.
- Inhalt: Die Konten sind angelegt (nenne die LI-Adresse bzw. die Mail-Adresse je Person). Die Zugangsdaten kommen automatisch per E-Mail an diese Adresse, im Spam-Ordner nachsehen. Hatten die Personen schon ein älteres Konto und steht das in der Anfrage, erwähne, dass das neue Konto davon unabhängig ist. Bei Fragen oder Anmeldeproblemen sollen sich die Personen bei mir melden.
- Bei Anfragen von Schulpersonal zusätzlich: Bei Anmeldeproblemen kann auch die LMS-Beauftragte oder der LMS-Beauftragte der Schule helfen.
- Schreibe keine Anmeldenamen und keine Passwörter in die Mail. Behaupte nichts, was nicht in der Anfrage steht.
- Kurz halten, höchstens etwa 10 Zeilen.

Meine Signatur: [Dein Vorname]

== Anfrage ==
[hier die Mail einfügen]
```
