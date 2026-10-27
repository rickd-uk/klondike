// Minimal headless-Chrome driver over the DevTools protocol (no npm deps).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGE = 'file://' + fileURLToPath(new URL('../index.html', import.meta.url));
export const DEFAULT_PRELOAD = `try { localStorage.setItem('playerName', 'Test'); } catch (e) {}`;

export async function launch({ width = 1440, height = 900, mobile = false, touch = false, preload = DEFAULT_PRELOAD, url = PAGE } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'klondike-e2e-'));
  const chrome = spawn('google-chrome-stable', [
    '--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('chrome did not start')), 15000);
    chrome.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  const exceptions = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data || ''}`)) : resolve(msg.result);
    } else if (msg.method) {
      if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails);
      // The game's "Are you sure?" leave prompt would otherwise block reloads.
      if (msg.method === 'Page.javascriptDialogOpening') {
        ws.send(JSON.stringify({ id: nextId++, method: 'Page.handleJavaScriptDialog', params: { accept: true }, sessionId: msg.sessionId }));
      }
      listeners.slice().forEach((l) => l(msg));
    }
  };
  const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const waitFor = (method) => new Promise((resolve) => {
    const l = (msg) => { if (msg.method === method) { listeners.splice(listeners.indexOf(l), 1); resolve(msg.params); } };
    listeners.push(l);
  });

  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => raw(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  const resize = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await resize(width, height);
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: preload });

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  async function navigate(to = url) {
    const loaded = waitFor('Page.loadEventFired');
    await send('Page.navigate', { url: to });
    await loaded;
  }
  async function reload() {
    const loaded = waitFor('Page.loadEventFired');
    await send('Page.reload', {});
    await loaded;
  }
  await navigate();

  return {
    send, eval: evaluate, resize, reload, exceptions,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async close() {
      const exited = new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r)));
      try { await raw('Browser.close'); } catch {}
      ws.close();
      chrome.kill();
      await exited;
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
