import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, plain } from './load.mjs';

const { Klondike: K } = loadScripts('klondike-core');

const SU = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const c = (code, faceUp = true) => ({ suit: SU[code.slice(-1)], rank: code.slice(0, -1), faceUp });
const down = (code) => c(code, false);
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const fullSuit = (s, upTo = 13) => RANKS.slice(0, upTo).map((r) => c(r + s));

function stateWith(o = {}) {
  const t = o.tableau || [];
  const f = o.foundations || [];
  return {
    tableau: [0, 1, 2, 3, 4, 5, 6].map((i) => t[i] || []),
    stock: o.stock || [],
    waste: o.waste || [],
    foundations: [0, 1, 2, 3].map((i) => f[i] || []),
    drawCount: o.drawCount ?? 3,
    moveScore: o.moveScore ?? 0,
    recycles: o.recycles ?? 0,
    startedAt: o.startedAt ?? null,
    wonAt: null,
    history: [],
  };
}

export function orderedDeck() {
  return ['c', 'd', 'h', 's'].flatMap((s) => RANKS.map((r) => down(r + s)));
}

const T = (index, cardIndex) => ({ pile: 'tableau', index, cardIndex });
const toT = (index) => ({ pile: 'tableau', index });
const toF = (index) => ({ pile: 'foundation', index });
const W = { pile: 'waste' };
const F = (index) => ({ pile: 'foundation', index });

test('deal shape', () => {
  const s = K.newGame({ deck: orderedDeck() });
  assert.deepEqual(plain(s.tableau.map((p) => p.length)), [1, 2, 3, 4, 5, 6, 7]);
  s.tableau.forEach((p) => p.forEach((card, i) => assert.equal(card.faceUp, i === p.length - 1)));
  assert.equal(s.stock.length, 24);
  assert.ok(s.stock.every((card) => !card.faceUp));
  assert.equal(s.waste.length, 0);
  assert.equal(s.drawCount, 3);
  assert.equal(s.moveScore, 0);
  assert.equal(K.newGame({ drawCount: 1 }).drawCount, 1);
});

test('tableau rules', () => {
  const s = stateWith({ tableau: [[c('8s')], [c('9h')], [c('9s')], [], [down('3c'), c('Kd')]] });
  assert.equal(K.canMove(s, T(0, 0), toT(1)), true);
  assert.equal(K.canMove(s, T(0, 0), toT(2)), false, 'same colour');
  assert.equal(K.canMove(s, T(0, 0), toT(3)), false, 'only kings to empty');
  assert.equal(K.canMove(s, T(4, 1), toT(3)), true, 'king to empty');
  assert.equal(K.canMove(s, T(4, 0), toT(3)), false, 'face-down card');
  const r = stateWith({ tableau: [[c('9d'), c('8s'), c('7h')], [c('10c')]] });
  assert.equal(K.canMove(r, T(0, 0), toT(1)), true, 'runs move');
});

test('foundation rules', () => {
  const s = stateWith({ waste: [c('Ah')], foundations: [[], [c('As')]] });
  assert.equal(K.canMove(s, W, toF(0)), true, 'ace to any empty foundation');
  assert.equal(K.canMove(s, W, toF(1)), false);
  const t = stateWith({ foundations: [[c('Ah')]], waste: [c('2d')], tableau: [[c('2h'), c('Qs')], [c('2h')]] });
  assert.equal(K.canMove(t, W, toF(0)), false, 'wrong suit');
  assert.equal(K.canMove(t, T(1, 0), toF(0)), true);
  assert.equal(K.canMove(t, T(0, 0), toF(0)), false, 'only the top card');
});

test('scores', () => {
  let s = stateWith({ waste: [c('8h')], tableau: [[c('9s')]] });
  assert.ok(K.move(s, W, toT(0), 0));
  assert.equal(s.moveScore, 5, 'waste to tableau');

  s = stateWith({ waste: [c('Ah')] });
  assert.ok(K.move(s, W, toF(0), 0));
  assert.equal(s.moveScore, 10, 'waste to foundation');

  s = stateWith({ tableau: [[down('5c'), c('As')]] });
  assert.ok(K.move(s, T(0, 1), toF(0), 0));
  assert.equal(s.moveScore, 15, 'tableau to foundation + turn over');
  assert.equal(s.tableau[0][0].faceUp, true);

  s = stateWith({ tableau: [[down('5c'), c('8s')], [c('9h')]] });
  assert.ok(K.move(s, T(0, 1), toT(1), 0));
  assert.equal(s.moveScore, 5, 'turn over');

  s = stateWith({ tableau: [[c('9d'), c('8s')], [c('9h')]] });
  assert.ok(K.move(s, T(0, 1), toT(1), 0));
  assert.equal(s.moveScore, 0, 'nothing exposed');

  s = stateWith({ foundations: [[c('Ah'), c('2h')], [c('As')]], tableau: [[c('3s')], [c('3h')], [c('2h')]] });
  assert.equal(K.canMove(s, F(0), toT(1)), false, 'foundation card only where it fits');
  assert.equal(K.canMove(s, F(1), toT(2)), false, 'aces stay');
  assert.ok(K.move(s, F(0), toT(0), 0));
  assert.equal(s.moveScore, -15, 'foundation to tableau');
  assert.equal(s.tableau[0].length, 2);

  s = stateWith({ tableau: [[c('8s')], [c('8h')]] });
  assert.equal(K.move(s, T(0, 0), toT(1), 0), false);
  assert.equal(s.moveScore, 0);
  assert.equal(s.tableau[0].length, 1, 'illegal move changes nothing');
});

test('draw 1 deals one and recycles for -100', () => {
  const s = stateWith({ drawCount: 1, stock: [down('Ac'), down('2c'), down('3c')] });
  assert.equal(K.draw(s, 0), 'dealt');
  assert.deepEqual(plain(s.waste), [c('Ac')]);
  K.draw(s, 0); K.draw(s, 0);
  assert.equal(K.draw(s, 0), 'recycled');
  assert.deepEqual(plain(s.stock), [down('Ac'), down('2c'), down('3c')]);
  assert.equal(s.waste.length, 0);
  assert.equal(s.moveScore, -100);
  K.draw(s, 0); K.draw(s, 0); K.draw(s, 0); K.draw(s, 0);
  assert.equal(s.moveScore, -200);
});

test('draw 3 deals three and charges -20 from the third recycle', () => {
  const s = stateWith({ stock: ['Ac', '2c', '3c', '4c', '5c'].map(down) });
  assert.equal(K.draw(s, 0), 'dealt');
  assert.deepEqual(plain(s.waste), [c('Ac'), c('2c'), c('3c')]);
  K.draw(s, 0);
  assert.deepEqual(plain(s.waste).map((x) => x.rank), ['A', '2', '3', '4', '5'], 'two left, last dealt on top');
  const cycle = () => { K.draw(s, 0); K.draw(s, 0); };
  assert.equal(K.draw(s, 0), 'recycled');
  assert.equal(s.recycles, 1);
  assert.equal(s.moveScore, 0);
  cycle(); K.draw(s, 0);
  assert.equal(s.recycles, 2);
  assert.equal(s.moveScore, 0);
  cycle(); K.draw(s, 0);
  assert.equal(s.moveScore, -20);
  cycle(); K.draw(s, 0);
  assert.equal(s.moveScore, -40);
});

test('draw with nothing left is empty', () => {
  const s = stateWith();
  assert.equal(K.draw(s, 0), 'empty');
  assert.equal(s.startedAt, null);
  assert.equal(s.recycles, 0);
});

test('clock: -2 per full 10 seconds, starts on first action, never below 0', () => {
  const s = stateWith({ moveScore: 100, stock: [down('Ac')] });
  assert.equal(K.elapsedSeconds(s, 50_000), 0);
  assert.equal(K.score(s, 50_000), 100);
  K.draw(s, 1000);
  assert.equal(s.startedAt, 1000);
  assert.equal(K.score(s, 1000 + 9_999), 100);
  assert.equal(K.score(s, 1000 + 19_999), 98);
  assert.equal(K.score(s, 1000 + 20_000), 96);
  s.moveScore = 0;
  assert.equal(K.score(s, 1000 + 100_000), 0);
});

function oneFromWon(startedAt) {
  return stateWith({
    startedAt,
    foundations: [fullSuit('c'), fullSuit('d'), fullSuit('h', 12), fullSuit('s')],
    waste: [c('Kh')],
  });
}

test('win bonus is 700000 / seconds after 30 seconds', () => {
  const s = oneFromWon(0);
  assert.ok(K.move(s, W, toF(2), 100_000));
  assert.equal(K.isWon(s), true);
  assert.equal(s.wonAt, 100_000);
  assert.equal(K.elapsedSeconds(s, 500_000), 100);
  assert.equal(K.score(s, 500_000), Math.max(0, 10 - 20) + Math.round(700000 / 100));

  const quick = oneFromWon(0);
  K.move(quick, W, toF(2), 20_000);
  assert.equal(K.score(quick, 20_000), 10 - 4);
});
