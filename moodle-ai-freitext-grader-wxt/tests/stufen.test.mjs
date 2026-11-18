// Rechentest: Bewertungsstufen je Teilaufgabe (laeuft im Pre-Commit-Hook)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stufenFuer, aufStufe, STUFEN_KLEIN, STUFEN_GROSS } from '../lib/gemeinsam/stufen.js';

test('Skala nach Punkten', () => {
  assert.deepEqual(stufenFuer(2), STUFEN_KLEIN);
  assert.deepEqual(stufenFuer(5), STUFEN_KLEIN);
  assert.deepEqual(stufenFuer(6), STUFEN_GROSS);
  assert.deepEqual(stufenFuer(10), STUFEN_GROSS);
});

test('gueltige Werte bleiben, auch aus der anderen Skala', () => {
  assert.equal(aufStufe(75, 8), 75);
  assert.equal(aufStufe(80, 8), 80);
  assert.equal(aufStufe(80, 2), 80);
  assert.equal(aufStufe(0, 2), 0);
});

test('ungueltige Werte rasten ein', () => {
  assert.equal(aufStufe(90, 2), 100);
  assert.equal(aufStufe(65, 2), 75);
  assert.equal(aufStufe(70, 8), 60);   // Gleichstand 60/80 -> niedriger
  assert.equal(aufStufe(33, 8), 40);
  assert.equal(aufStufe(150, 8), 100);
  assert.equal(aufStufe(-5, 2), 0);
  assert.equal(aufStufe('abc', 2), 0);
});
