import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './load.mjs';

const { KlondikeCards: KC } = loadScripts('klondike-cards');
const card = (rank, suit) => ({ rank, suit, faceUp: true });
const pips = (svg) => (svg.match(/data-pip/g) || []).length;

test('number cards have one body pip per rank', () => {
  for (let n = 2; n <= 10; n++) {
    assert.equal(pips(KC.face(card(String(n), 'clubs'), { largeIndex: false })), n, `${n} traditional`);
    assert.equal(pips(KC.face(card(String(n), 'clubs'), { largeIndex: true })), n, `${n} large index`);
  }
  assert.equal(pips(KC.face(card('A', 'spades'), { largeIndex: false })), 1);
});

test('court cards embed the cropped court art', () => {
  const svg = KC.face(card('Q', 'spades'), { largeIndex: false });
  assert.ok(svg.includes(KC.courtUrl(card('Q', 'spades'))));
  assert.ok(svg.includes('viewBox="23.5 24 124 197.5"'));
  assert.equal(KC.courtUrl(card('Q', 'spades')), 'cards/QS.svg');
  assert.equal(KC.courtUrl(card('10', 'hearts')), null);
});

test('large-index cards drop the rotated bottom corner', () => {
  assert.ok(KC.face(card('7', 'diamonds'), { largeIndex: false }).includes('rotate(180 125 175)'));
  assert.ok(!KC.face(card('7', 'diamonds'), { largeIndex: true }).includes('rotate(180 125 175)'));
});

test('red suits are red, black suits are ink', () => {
  assert.ok(KC.face(card('3', 'hearts'), { largeIndex: false }).includes('#b3121f'));
  assert.ok(KC.face(card('3', 'diamonds'), { largeIndex: true }).includes('#b3121f'));
  assert.ok(!KC.face(card('3', 'spades'), { largeIndex: false }).includes('#b3121f'));
});

test('five backs with their own pattern ids', () => {
  assert.deepEqual([...KC.BACKS], ['red', 'blue', 'green', 'black', 'purple']);
  const ids = KC.BACKS.map((b) => KC.back(b).match(/<pattern id="([^"]+)"/)[1]);
  assert.equal(new Set(ids).size, 5);
  assert.ok(KC.back('nope').includes('<svg'), 'unknown colour falls back to red');
});
