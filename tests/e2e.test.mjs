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
