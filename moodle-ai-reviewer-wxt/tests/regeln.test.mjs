// Rechentests fuer die festen Regeln vor der KI (laufen im Pre-Commit-Hook: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abstand, naechsteStufe, codeRegel, passenderAnker, einstufen, setzeSacWert, sacWert } from '../lib/regeln.js';

test('Editierabstand', () => {
  assert.equal(abstand('Natrium', 'Natrium'), 0);
  assert.equal(abstand('Natrium', 'Natirum'), 2);
  assert.equal(abstand('', 'abc'), 3);
});

test('naechste gueltige Stufe', () => {
  assert.equal(naechsteStufe(95), 100);
  assert.equal(naechsteStufe(80), 75);
  assert.equal(naechsteStufe(10), 0);
  assert.equal(naechsteStufe('x'), null);
});

test('Gross-/Kleinschreibung: SAC eingestellter Wert, SA 100', () => {
  setzeSacWert(90);
  assert.equal(codeRegel('natrium', { typ: 'SAC', richtig: ['Natrium'] }).prozent, 90);
  assert.equal(codeRegel('natrium', { typ: 'SA', richtig: ['Natrium'] }).prozent, 100);
  setzeSacWert(50);
  assert.equal(codeRegel('natrium', { typ: 'SAC', richtig: ['Natrium'] }).prozent, 50);
  setzeSacWert(33);                       // ungueltig → Standard 90
  assert.equal(sacWert(), 90);
});

test('bekannte Variante wird uebernommen', () => {
  const r = codeRegel('Natrum', { typ: 'SA', richtig: ['Natrium'], bekannte_varianten: { natrum: 75 } });
  assert.equal(r.prozent, 75);
  assert.equal(r.regel, 'anker');
  assert.equal(codeRegel('Kalium', { typ: 'SA', richtig: ['Natrium'] }), null);
});

test('passender Anker nur bei gleichem Wert und aehnlicher Schreibung', () => {
  const bekannt = { natrum: 75, natriun: 90 };
  assert.equal(passenderAnker('natrim', 75, bekannt).text, 'natrum');
  assert.equal(passenderAnker('kalium', 75, bekannt), null);
});

test('Code entscheidet, was unklar ist', () => {
  const regel = { prozent: 100 };
  assert.equal(einstufen('x', {}, regel, { prozent: 100 }).unklar, false);
  assert.equal(einstufen('x', {}, regel, { prozent: 50 }).unklar, true);
  assert.equal(einstufen('x', {}, null, null).unklar, true);
});
