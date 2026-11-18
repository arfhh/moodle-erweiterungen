// Rechentests fuer das Finden von Namen in reinem Text (laufen im Pre-Commit-Hook: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findeStellen } from '../lib/text-stellen.js';

const teil = (t, u) => findeStellen(t, u).map(([a, b]) => t.slice(a, b));

test('Bewertungsueberschrift mit Adresse', () => {
  assert.deepEqual(teil('Versuch Nummer 1 von Hanka Jessel (hanka.jessel@gymall.hamburg.de)', true),
    ['Hanka Jessel (hanka.jessel@gymall.hamburg.de)']);
});

test('Bewertungsueberschrift ohne Adresse, auch englisch', () => {
  assert.deepEqual(teil('Versuch Nummer 3 von Max Mustermann', true), ['Max Mustermann']);
  assert.deepEqual(teil('Attempt number 2 for Jane Doe', true), ['Jane Doe']);
});

test('Ueberschriftsregel nur in Ueberschriften', () => {
  assert.deepEqual(teil('Versuch Nummer 3 von Max Mustermann', false), []);
});

test('Adresse im Fliesstext, Name davor in Klammerform', () => {
  assert.deepEqual(teil('Schreib an max@schule.de bitte.'), ['max@schule.de']);
  assert.deepEqual(teil('Abgabe von Lea Özdemir-Kahn (lea@x.de) liegt vor'), ['Lea Özdemir-Kahn (lea@x.de)']);
});

test('kein Treffer ohne Adresse', () => {
  assert.deepEqual(findeStellen('Erkläre das Teilchenmodell von Demokrit.'), []);
  assert.deepEqual(findeStellen('Preis @ 5 Euro'), []);
});
