// Rechentest: Trennlinie zwischen Hauptaufgaben in der Antwortvorlage (laeuft im Pre-Commit-Hook)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hauptnummer, trennlinieVor } from '../lib/gemeinsam/aufgaben-layout.js';

test('Hauptnummer', () => {
  assert.equal(hauptnummer('2a'), '2');
  assert.equal(hauptnummer(' 10 b'), '10');
  assert.equal(hauptnummer('3'), '3');
  assert.equal(hauptnummer('b'), '');
});

test('Linie nur beim Wechsel der Hauptnummer', () => {
  assert.equal(trennlinieVor('1a', '1b'), false);
  assert.equal(trennlinieVor('1b', '2a'), true);
  assert.equal(trennlinieVor('2b', '3'), true);
  assert.equal(trennlinieVor('3', '4'), true);
  assert.equal(trennlinieVor('a', 'b'), false);
});
