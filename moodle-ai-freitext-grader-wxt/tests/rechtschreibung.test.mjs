// Rechentests fuer den Rechtschreibabzug (laufen im Pre-Commit-Hook: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { woerter, fehlerGewicht, rsAnteil, MINDESTWOERTER } from '../lib/gemeinsam/rechtschreibung.js';

test('Woerter zaehlen', () => {
  assert.equal(woerter(''), 0);
  assert.equal(woerter('Das Natrium-Ion ist positiv geladen.'), 5);
  assert.equal(woerter('  H2O  und  CO2 '), 3);
});

test('schwere Fehler zaehlen doppelt', () => {
  assert.equal(fehlerGewicht([]), 0);
  assert.equal(fehlerGewicht([{}, { schwer: true }, { schwer: false }]), 4);
});

test('kurze Antworten: absolute Fehlerzahl', () => {
  const w = MINDESTWOERTER - 1;
  assert.equal(rsAnteil(0, w), 0);
  assert.equal(rsAnteil(1, w), 1 / 3);
  assert.equal(rsAnteil(2, w), 1 / 2);
  assert.equal(rsAnteil(4, w), 5 / 6);
  assert.equal(rsAnteil(9, w), 1);
});

test('lange Antworten: Fehlerquotient je 100 Woerter', () => {
  assert.equal(rsAnteil(1, 100), 0);        // Quotient 1 → kein Abzug
  assert.equal(rsAnteil(2, 100), 1 / 3);    // bis 2
  assert.equal(rsAnteil(3, 100), 2 / 3);    // bis 3,5
  assert.equal(rsAnteil(4, 100), 1);        // darueber voll
  assert.equal(rsAnteil(0, 40), 0);
});

test('Anteil bleibt immer zwischen 0 und 1', () => {
  for (const f of [0, 1, 3, 7, 50]) for (const w of [1, 20, 40, 200]) {
    const a = rsAnteil(f, w);
    assert.ok(a >= 0 && a <= 1, `f=${f} w=${w} → ${a}`);
  }
});
