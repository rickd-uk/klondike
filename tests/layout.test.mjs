import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './load.mjs';

const { KlondikeLayout: L } = loadScripts('klondike-layout');
const SIZES = [[1440, 900], [1024, 768], [768, 1024], [844, 390], [667, 375], [1180, 820]];

test('mode by viewport', () => {
  assert.equal(L.mode(1440, 900), 'wide');
  assert.equal(L.mode(1024, 768), 'wide');
  assert.equal(L.mode(768, 1024), 'wide');
  assert.equal(L.mode(844, 390), 'phone');
  assert.equal(L.mode(390, 844), 'rotate');
  assert.equal(L.compute(390, 844).mode, 'rotate');
});

test('every slot fits on screen', () => {
  for (const [vw, vh] of SIZES) {
    const g = L.compute(vw, vh);
    const slots = [g.stock, g.waste, ...g.foundations, ...g.tableau];
    for (const s of slots) {
      assert.ok(s.x >= 0 && s.x + g.cardW <= vw, `${vw}x${vh} x ${s.x}`);
      assert.ok(s.y >= 0 && s.y + g.cardH <= vh, `${vw}x${vh} y ${s.y}`);
    }
    assert.ok(g.tableau[0].y + g.cardH <= g.bottom, `${vw}x${vh} tableau room`);
    assert.ok(Math.abs(g.cardH - g.cardW * 1.4) < 0.01);
    for (let i = 1; i < 7; i++) assert.ok(g.tableau[i].x >= g.tableau[i - 1].x + g.cardW, 'columns do not overlap');
  }
});

test('card sizes and index style', () => {
  const big = L.compute(1440, 900);
  assert.equal(big.cardW, 140);
  assert.equal(big.largeIndex, false);
  const phone = L.compute(844, 390);
  assert.equal(phone.largeIndex, true);
  assert.ok(phone.foundations[0].x > phone.tableau[6].x, 'foundations right of tableau');
  assert.ok(phone.stock.x < phone.tableau[0].x, 'stock left of tableau');
  assert.ok(phone.sideLeft && phone.sideRight);
  const inset = L.compute(844, 390, { l: 44, r: 44, t: 0, b: 21 });
  assert.ok(inset.stock.x >= 44 && inset.foundations[1].x + inset.cardW <= 844 - 44);
});

test('fan uses fixed steps and compresses to fit', () => {
  const card = (faceUp) => ({ faceUp });
  const short = [card(false), card(false), card(true), card(true)];
  const ys = L.fan(short, 100, 1000, false);
  assert.deepEqual([...ys], [0, 8, 16, 41]);
  assert.deepEqual([...L.fan(short, 100, 1000, true)], [0, 8, 16, 46]);

  const tall = [...Array(6)].map(() => card(false)).concat([...Array(13)].map(() => card(true)));
  const ty = L.fan(tall, 100, 300, true);
  assert.ok(ty[ty.length - 1] + 100 <= 300 + 1e-9);
  const down = ty[1] - ty[0], up = ty[7] - ty[6];
  assert.ok(Math.abs(up / down - 0.30 / 0.08) < 1e-9, 'ratio preserved');
});

test('phone gutters fit on short landscape screens', () => {
  for (const vh of [300, 320, 340, 360, 390, 430]) {
    const vw = Math.round(vh * 2.2);
    for (const insets of [undefined, { l: 44, r: 44, t: 0, b: 21 }]) {
      const g = L.compute(vw, vh, insets);
      assert.equal(g.mode, 'phone');
      assert.ok(g.sideRight.y + g.sideRight.h <= g.bottom, `${vw}x${vh} buttons end ${g.sideRight.y + g.sideRight.h} > ${g.bottom}`);
      assert.ok(g.sideLeft.y + g.sideLeft.h <= g.bottom, `${vw}x${vh} stats`);
    }
  }
});
