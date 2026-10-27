import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const NAMES = ['J', 'Q', 'K'].flatMap((r) => ['C', 'D', 'H', 'S'].map((s) => r + s));
const path = (n) => new URL(`../cards/${n}.svg`, import.meta.url);

function hueSat(hex) {
  const x = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { hue: 0, sat: 0 };
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat };
}

test('12 court SVGs exist', () => {
  NAMES.forEach((n) => assert.ok(existsSync(path(n)), n));
});

test('court SVGs are small enough for phones', () => {
  const all = NAMES.map((n) => readFileSync(path(n)));
  all.forEach((buf, i) => assert.ok(buf.length <= 480_000, `${NAMES[i]} is ${buf.length} bytes`));
  const gz = gzipSync(Buffer.concat(all)).length;
  assert.ok(gz <= 1_300_000, `total gzip ${gz}`);
});

test('court SVGs carry no scripts or remote links', () => {
  NAMES.forEach((n) => {
    const s = readFileSync(path(n), 'utf8');
    assert.doesNotMatch(s, /<script/i, n);
    assert.doesNotMatch(s, /\son[a-z]+=/i, n);
    assert.doesNotMatch(s, /href="http/i, n);
  });
});

test('court SVGs have no blue or green left', () => {
  NAMES.forEach((n) => {
    const s = readFileSync(path(n), 'utf8');
    for (const [hex] of s.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      const { hue, sat } = hueSat(hex);
      assert.ok(!(hue >= 90 && hue <= 260 && sat > 0.25), `${n} uses ${hex}`);
    }
  });
});
