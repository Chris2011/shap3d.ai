#!/usr/bin/env node
/**
 * Photographs one demo scene in a running headless Chrome over the DevTools protocol – used by screenshots.sh and
 * screenshots.ps1 (for the scenes it waits for).
 * Waits until the scene reports itself ready (document.body.dataset.shotReady), saves a PNG and closes the browser
 * (Browser.close – that also works in Git Bash on Windows, where the shell cannot kill Chrome itself).
 * Needs Node.js 22 for its built-in WebSocket.
 *
 *   node scripts/capture-shot.mjs <port> <url> <width> <height> <seconds> <file> <shot>
 */
import { writeFileSync } from 'node:fs';

const [port, target, width, height, seconds, file, shot] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** closes the whole browser (all its processes) through its own DevTools socket */
const closeBrowser = async () => {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      browser.onopen = resolve;
      browser.onerror = reject;
    });
    browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(500);
  } catch {
    // already gone
  }
};
const fail = async (message) => {
  console.error(message);
  await closeBrowser();
  process.exit(1);
};

// the page's DevTools socket, once Chrome has opened its port
let page;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(250);
  try {
    page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((entry) => entry.type === 'page');
  } catch {
    // not listening yet
  }
}
if (!page) {
  await fail(`Chrome did not open a DevTools port for ${shot}`);
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let nextId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message); // events have no id – skipped
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: target });
const deadline = Date.now() + Number(seconds) * 1000;
let ready = false;
while (!ready && Date.now() < deadline) {
  await sleep(500);
  const answer = await send('Runtime.evaluate', { expression: "document.body?.dataset.shotReady ?? ''", returnByValue: true });
  ready = answer.result?.result?.value === '1';
}
if (!ready) {
  console.warn(`${shot} did not report ready within ${seconds} s - taking the screenshot anyway`);
}
await sleep(500);
const shotAnswer = await send('Page.captureScreenshot', { format: 'png' });
if (!shotAnswer.result?.data) {
  await fail(`no screenshot for ${shot}`);
}
writeFileSync(file, Buffer.from(shotAnswer.result.data, 'base64'));
socket.close();
await closeBrowser();
