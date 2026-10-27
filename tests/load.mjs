// Extracts inline <script id="..."> blocks from index.html and runs them in one
// vm context, so the pure parts of the game can be unit-tested under Node.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

export function loadScripts(...ids) {
  const context = vm.createContext({});
  for (const id of ids) {
    const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
    if (!m) throw new Error(`no <script id="${id}"> in index.html`);
    vm.runInContext(m[1], context, { filename: `index.html#${id}` });
  }
  return context;
}

// Values created inside the vm context have their own prototypes, so compare
// through JSON rather than assert.deepStrictEqual.
export const plain = (v) => JSON.parse(JSON.stringify(v));
