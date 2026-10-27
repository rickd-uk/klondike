// Browser tests: E2E=1 node --test tests/e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './cdp.mjs';

const skip = process.env.E2E !== '1' && 'set E2E=1 to run browser tests';

async function center(page, selector) {
  const r = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 12) }; })()`);
  assert.ok(r, `no element ${selector}`);
  return r;
}
async function click(page, selector) {
  const { x, y } = await center(page, selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}
const visible = (page, selector) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
  return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0; })()`);

test('renders deal', { skip }, async () => {
  const page = await launch();
  try {
    assert.equal(await page.eval(`document.querySelectorAll('#table .card[data-pile="tableau"]').length`), 28);
    assert.equal(await page.eval(`document.querySelectorAll('#table .card.face-up').length`), 7);
    assert.equal(await page.eval(`document.querySelectorAll('#table .slot[data-pile="foundation"]').length`), 4);
    assert.deepEqual(page.exceptions, []);
  } finally { await page.close(); }
});

test('phone layout', { skip }, async () => {
  const page = await launch({ width: 844, height: 390, mobile: true, touch: true });
  try {
    assert.equal(await visible(page, '#rotatePrompt'), false);
    const fx = await page.eval(`document.querySelector('.slot[data-pile="foundation"][data-index="0"]').getBoundingClientRect().left`);
    const tx = await page.eval(`document.querySelector('.slot[data-pile="tableau"][data-index="6"]').getBoundingClientRect().left`);
    assert.ok(fx > tx, 'foundations right of tableau');
    assert.equal(await visible(page, '#hintBtn'), true);
  } finally { await page.close(); }
});

test('rotate prompt', { skip }, async () => {
  const page = await launch({ width: 390, height: 844, mobile: true, touch: true });
  try {
    assert.equal(await visible(page, '#rotatePrompt'), true);
    assert.equal(await visible(page, '#table'), false);
    const before = await page.eval('JSON.stringify(game)');
    await page.resize(844, 390);
    await page.sleep(150);
    assert.equal(await visible(page, '#rotatePrompt'), false);
    assert.equal(await page.eval('JSON.stringify(game)'), before);
  } finally { await page.close(); }
});

test('settings persist', { skip }, async () => {
  const page = await launch();
  try {
    await click(page, '#settingsBtn');
    await click(page, '#settingsModal [data-back="purple"]');
    await click(page, '#settingsModal [data-draw="1"]');
    await click(page, '#settingsDone');
    assert.equal(await page.eval('game.drawCount'), 3, 'current game keeps its draw mode');
    assert.ok(await page.eval(`document.querySelector('.card[data-pile="stock"]').innerHTML.includes('#3e1a5c')`));
    await page.reload();
    assert.deepEqual(await page.eval('settings'), { back: 'purple', drawCount: 1, showHint: true });
    assert.equal(await page.eval('game.drawCount'), 1, 'new game uses the saved draw mode');
  } finally { await page.close(); }
});

test('storage throwing falls back to defaults', { skip }, async () => {
  const preload = `Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('blocked'); };`;
  const page = await launch({ preload });
  try {
    assert.deepEqual(await page.eval('settings'), { back: 'red', drawCount: 3, showHint: true });
    await page.eval(`document.getElementById('playerName').value = 'Pat'`);
    await click(page, '#startGame');
    await click(page, '#newGameBtn');
    assert.equal(await page.eval('game.tableau.length'), 7);
    assert.deepEqual(page.exceptions, []);
  } finally { await page.close(); }
});

test('hint toggle', { skip }, async () => {
  const page = await launch();
  try {
    assert.equal(await visible(page, '#hintBtn'), true);
    await click(page, '#settingsBtn');
    await click(page, '#showHint');
    await click(page, '#settingsDone');
    assert.equal(await visible(page, '#hintBtn'), false);
  } finally { await page.close(); }
});

// ---- input (Task 6) ----

// Replaces the game's piles. Codes like 'Ah', '10s'; prefix '-' for face-down.
async function setPiles(page, { tableau = [], stock = [], waste = [], foundations = [], drawCount = 1 }) {
  const spec = JSON.stringify({ tableau, stock, waste, foundations, drawCount });
  await page.eval(`(() => {
    const s = ${spec};
    const SU = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
    const card = (code, up) => { const down = code[0] === '-'; const c = down ? code.slice(1) : code;
      return { suit: SU[c.slice(-1)], rank: c.slice(0, -1), faceUp: up === undefined ? !down : up }; };
    game = Klondike.newGame({ drawCount: s.drawCount });
    game.tableau = [0,1,2,3,4,5,6].map((i) => (s.tableau[i] || []).map((c) => card(c)));
    game.stock = s.stock.map((c) => card(c, false));
    game.waste = s.waste.map((c) => card(c, true));
    game.foundations = [0,1,2,3].map((i) => (s.foundations[i] || []).map((c) => card(c, true)));
    render();
  })()`);
}
const pileCodes = (page, expr) => page.eval(`${expr}.map((c) => (c.faceUp ? '' : '-') + c.rank + c.suit[0])`);
const cardSel = (id) => `#table .card[data-card="${id}"]`;
const rectOf = (page, sel) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);

async function mouseDrag(page, from, to, beforeRelease) {
  const a = await center(page, from), b = await center(page, to);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 3; i++) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 3, y: a.y + (b.y - a.y) * i / 3, button: 'left', buttons: 1 });
  }
  if (beforeRelease) await beforeRelease();
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await page.sleep(250);
}
async function touchDrag(page, from, to, end = 'touchEnd') {
  const a = await center(page, from), b = await center(page, to);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 3; i++) {
    await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 3, y: a.y + (b.y - a.y) * i / 3 }] });
  }
  await page.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
  await page.sleep(300);
}

test('mouse drag waste to tableau', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['9s']], waste: ['8h'] });
    await mouseDrag(page, cardSel('8H'), cardSel('9S'));
    assert.deepEqual(await pileCodes(page, 'game.tableau[0]'), ['9s', '8h']);
    assert.equal(await page.eval('game.moveScore'), 5);
  } finally { await page.close(); }
});

test('touch drag run', { skip }, async () => {
  const page = await launch({ width: 844, height: 390, mobile: true, touch: true });
  try {
    await setPiles(page, { tableau: [['9d', '8s'], ['10c']] });
    await touchDrag(page, cardSel('9D'), cardSel('10C'));
    assert.deepEqual(await pileCodes(page, 'game.tableau[1]'), ['10c', '9d', '8s']);
    assert.equal(await page.eval('game.tableau[0].length'), 0);
  } finally { await page.close(); }
});

test('tap to foundation', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['-5c', 'Ah']] });
    await click(page, cardSel('AH'));
    await page.sleep(250);
    assert.deepEqual(await pileCodes(page, 'game.foundations[0]'), ['Ah']);
    assert.equal(await page.eval('game.moveScore'), 15);
  } finally { await page.close(); }
});

test('tap illegal shakes', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['5c'], ['9h']] });
    const before = await page.eval('JSON.stringify(game)');
    await click(page, cardSel('5C'));
    assert.ok(await page.eval(`document.querySelector('${cardSel('5C')}').classList.contains('shake')`));
    assert.equal(await page.eval('JSON.stringify(game)'), before);
  } finally { await page.close(); }
});

test('stock tap and recycle', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { stock: ['2c', '3c', '4c'], tableau: [['Kh']] });
    for (let i = 0; i < 3; i++) await click(page, '#table [data-pile="stock"]');
    assert.equal(await page.eval('game.waste.length'), 3);
    await click(page, '#table [data-pile="stock"]');
    assert.equal(await page.eval('game.stock.length'), 3);
    assert.equal(await page.eval('game.waste.length'), 0);
  } finally { await page.close(); }
});

test('undo button and ctrl+z', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { stock: ['2c', '3c'], tableau: [['Kh']] });
    assert.equal(await page.eval(`document.getElementById('undoBtn').disabled`), true);
    await click(page, '#table [data-pile="stock"]');
    await click(page, '#table [data-pile="stock"]');
    await click(page, '#undoBtn');
    assert.equal(await page.eval('game.waste.length'), 1);
    for (const type of ['keyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', { type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    }
    assert.equal(await page.eval('game.waste.length'), 0);
    assert.equal(await page.eval(`document.getElementById('undoBtn').disabled`), true);
  } finally { await page.close(); }
});

test('hint glows', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { waste: ['Ah'], tableau: [['9h'], ['Ks']], stock: ['2c'] });
    assert.deepEqual(await page.eval('JSON.parse(JSON.stringify(Klondike.hint(game)))'), { from: { pile: 'waste' }, to: { pile: 'foundation', index: 0 } });
    await click(page, '#hintBtn');
    assert.ok(await page.eval(`document.querySelector('${cardSel('AH')}').classList.contains('hint-glow')`));
    assert.ok(await page.eval(`document.querySelector('.slot[data-pile="foundation"][data-index="0"]').classList.contains('hint-glow')`));
    await page.sleep(1600);
    assert.equal(await page.eval(`document.querySelectorAll('.hint-glow').length`), 0);
  } finally { await page.close(); }
});

test('no moves left toast', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['Kh'], ['9s']] });
    await click(page, '#hintBtn');
    assert.equal(await page.eval(`document.getElementById('toast').textContent`), 'No moves left');
    assert.ok(await page.eval(`document.getElementById('toast').classList.contains('show')`));
  } finally { await page.close(); }
});

test('touch cancel mid-drag returns cards', { skip }, async () => {
  const page = await launch({ width: 844, height: 390, mobile: true, touch: true });
  try {
    await setPiles(page, { tableau: [['9d'], ['10c']] });
    const before = await page.eval('JSON.stringify(game)');
    const r0 = await rectOf(page, cardSel('9D'));
    await touchDrag(page, cardSel('9D'), cardSel('10C'), 'touchCancel');
    assert.equal(await page.eval('JSON.stringify(game)'), before);
    const r1 = await rectOf(page, cardSel('9D'));
    assert.ok(Math.abs(r1.x - r0.x) <= 1 && Math.abs(r1.y - r0.y) <= 1, JSON.stringify({ r0, r1 }));
  } finally { await page.close(); }
});

test('resize mid-drag cancels', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['9d'], ['10c']] });
    const before = await page.eval('JSON.stringify(game)');
    await mouseDrag(page, cardSel('9D'), cardSel('10C'), async () => { await page.resize(1200, 800); await page.sleep(100); });
    assert.equal(await page.eval('JSON.stringify(game)'), before);
    assert.equal(await page.eval(`document.querySelectorAll('.card.lift').length`), 0);
  } finally { await page.close(); }
});

test('rapid taps apply in order', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['-2c', 'Ah'], ['-3c', 'As'], ['-4c', 'Ad']] });
    const points = [];
    for (const id of ['AH', 'AS', 'AD']) points.push(await center(page, cardSel(id)));
    for (const { x, y } of points) {
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      await page.sleep(30);
    }
    await page.sleep(400);
    assert.deepEqual(await page.eval('game.foundations.map((f) => f.map((c) => c.rank + c.suit[0]))'), [['Ah'], ['As'], ['Ad'], []]);
    assert.equal(await page.eval('game.history.length'), 3);
    for (const id of ['AH', 'AS', 'AD']) assert.equal(await page.eval(`document.querySelector('${cardSel(id)}').dataset.pile`), 'foundation');
  } finally { await page.close(); }
});

test('win modal', { skip }, async () => {
  const page = await launch();
  try {
    const suit = (s, n = 13) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].slice(0, n).map((r) => r + s);
    await setPiles(page, { waste: ['Kh'], foundations: [suit('c'), suit('d'), suit('h', 12), suit('s')] });
    await click(page, cardSel('KH'));
    await page.sleep(250);
    assert.equal(await visible(page, '#winModal'), true);
    assert.match(await page.eval(`document.getElementById('winMessage').textContent`), /Final Score: \d+/);
  } finally { await page.close(); }
});

// ---- review fixes ----

test('dragged card stays on top of other cards', { skip }, async () => {
  const page = await launch();
  try {
    await setPiles(page, { tableau: [['9d'], [], [], [], [], [], ['4c']] });
    const a = await center(page, cardSel('9D')), b = await center(page, cardSel('4C'));
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1 });
    await page.sleep(50);
    assert.equal(await page.eval(`document.elementFromPoint(${b.x}, ${b.y}).closest('.card').dataset.card`), '9D');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  } finally { await page.close(); }
});

test('phone buttons stay on screen', { skip }, async () => {
  for (const [w, h] of [[915, 360], [640, 300]]) {
    const page = await launch({ width: w, height: h, mobile: true, touch: true });
    try {
      for (const sel of ['#buttons', '#stats']) {
        const bottom = await page.eval(`document.querySelector('${sel}').getBoundingClientRect().bottom`);
        assert.ok(bottom <= h, `${sel} ends at ${bottom} on ${w}x${h}`);
      }
    } finally { await page.close(); }
  }
});

test('no browser zoom gestures outside dialogs', { skip }, async () => {
  const page = await launch({ width: 844, height: 390, mobile: true, touch: true });
  try {
    assert.equal(await page.eval(`getComputedStyle(document.getElementById('app')).touchAction`), 'none');
    assert.equal(await page.eval(`getComputedStyle(document.getElementById('settingsModal')).touchAction`), 'manipulation');
  } finally { await page.close(); }
});

test('wobbly finger tap still taps', { skip }, async () => {
  const page = await launch({ width: 844, height: 390, mobile: true, touch: true });
  try {
    await setPiles(page, { tableau: [['-5c', 'Ah']] });
    const { x, y } = await center(page, cardSel('AH'));
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 6, y: y + 5 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.sleep(250);
    assert.deepEqual(await pileCodes(page, 'game.foundations[0]'), ['Ah']);
  } finally { await page.close(); }
});
