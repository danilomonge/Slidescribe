// End-to-end test: drives the real page in headless Chrome over the DevTools
// protocol, with the Anthropic API replaced by scripted responses, so it costs
// nothing and needs no API key.
//
//   node tests/e2e/run.mjs            (CHROME_PATH overrides the browser)
//
// Requires Node 22+, Chrome or Chromium, `unzip` and `pdftotext` (poppler).
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = join(root, 'tests/e2e/output');
const downloads = join(outDir, 'downloads');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = message => console.log(`  ${message}`);

// ── Static server ────────────────────────────────────────────────
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// ── Chrome ───────────────────────────────────────────────────────
const chromePath = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(existsSync);
assert.ok(chromePath, 'Chrome not found; set CHROME_PATH');
const port = 9500 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `slidescribe-e2e-${port}`);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  // Linux CI runners restrict the user namespaces Chrome's sandbox needs.
  ...(process.env.CI ? ['--no-sandbox'] : []),
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'
], { stdio: 'ignore' });

let pageWs, browserWs;
for (let i = 0; i < 100 && !pageWs; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const page = targets.find(t => t.type === 'page');
    if (page) { pageWs = page.webSocketDebuggerUrl; browserWs = version.webSocketDebuggerUrl; }
  } catch { /* not up yet */ }
  if (!pageWs) await sleep(100);
}
assert.ok(pageWs, 'Could not connect to Chrome');

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data || ''}`)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  });
  return {
    ready: new Promise(resolve => ws.addEventListener('open', resolve, { once: true })),
    send: (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]),
    close: () => ws.close()
  };
}

const cdp = connect(pageWs);
const browser = connect(browserWs);
await Promise.all([cdp.ready, browser.ready]);

// ── Console and CSP problems fail the test ──────────────────────
const problems = [];
cdp.on('Runtime.exceptionThrown', p => problems.push(`exception: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`));
cdp.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') problems.push(`console.error: ${p.args.map(a => a.value ?? a.description).join(' ')}`); });
cdp.on('Log.entryAdded', p => { if (p.entry.level === 'error' && !/api\.anthropic\.com/.test(p.entry.url || '')) problems.push(`log: ${p.entry.text}`); });
cdp.on('Page.javascriptDialogOpening', () => cdp.send('Page.handleJavaScriptDialog', { accept: true }));

// ── Scripted Anthropic API ───────────────────────────────────────
const RICH = [
  '# Hypothesis testing',
  'A **null hypothesis** (H₀) states that μ₁ = μ₂; the *alternative* H₁ says μ₁ ≠ μ₂.',
  '',
  '## Decision rule',
  '- Reject H₀ when p ≤ α',
  '- Keep H₀ when p > α → no evidence of a difference',
  '  - α is usually 0.05',
  '',
  '1. Choose α',
  '2. Compute the statistic `t`',
  '',
  '| Term | Meaning |',
  '| --- | --- |',
  '| Sensitivity | TP / (TP + FN) |',
  '| ∆ | change ✓ |',
  '',
  '> Greek letters: α β γ δ, arrows ⇒ ←, sums ∑ ∫ √ ∞ 😀'
].join('\n');

const requests = [];
let mockDelayMs = 0;
let scenario = [];
const apiResponse = (body, status = 200, extraHeaders = []) => ({
  responseCode: status,
  responsePhrase: { 200: 'OK', 529: 'Overloaded' }[status] || 'Error',
  responseHeaders: [
    { name: 'content-type', value: 'application/json' },
    { name: 'access-control-allow-origin', value: '*' },
    { name: 'access-control-expose-headers', value: 'retry-after' },
    ...extraHeaders
  ],
  body: Buffer.from(JSON.stringify(body)).toString('base64')
});
const message = (text, stop = 'end_turn') => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: stop, stop_details: null,
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text }],
  usage: { input_tokens: 2100, output_tokens: 900 }
});

cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
  if (request.method === 'OPTIONS') {
    await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: [
      { name: 'access-control-allow-origin', value: '*' },
      { name: 'access-control-allow-methods', value: 'POST, OPTIONS' },
      { name: 'access-control-allow-headers', value: '*' }
    ] });
    return;
  }
  let raw = request.postData;
  if (!raw && request.postDataEntries) raw = request.postDataEntries.map(e => Buffer.from(e.bytes, 'base64').toString()).join('');
  const body = JSON.parse(raw || '{}');
  const headers = Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const index = requests.push({ headers, body }) - 1;
  if (mockDelayMs) await sleep(mockDelayMs);
  const step = scenario[index] || 'ok';
  let response;
  if (step === 'overloaded') response = apiResponse({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529, [{ name: 'retry-after', value: '0' }]);
  else if (step === 'refusal') response = apiResponse({ ...message(''), stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio' }, content: [] });
  else if (step === 'truncated') response = apiResponse(message('# Partial\nThis explanation stops mid', 'max_tokens'));
  else response = apiResponse(message(RICH));
  // A request the page aborted (cancel) can no longer be answered; that is expected.
  await cdp.send('Fetch.fulfillRequest', { requestId, ...response }).catch(error => {
    if (!/Invalid InterceptionId/.test(error.message)) problems.push(`mock: ${error.message}`);
  });
});

await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');
await cdp.send('DOM.enable');
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.anthropic.com/*', requestStage: 'Request' }] });
await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });

const evaluate = async expression => {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression, label, timeout = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const screenshot = async name => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
};
const load = async () => {
  await cdp.send('Page.navigate', { url: `${origin}/index.html` });
  await waitFor(`document.readyState === 'complete' && typeof restoreSavedRun === 'function'`, 'page load');
  await sleep(300);
};
const chooseFile = async () => {
  const { root: doc } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#fileInput' });
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [join(root, 'tests/fixtures/sample-slides.pdf')] });
  await waitFor(`document.querySelectorAll('#thumbGrid .thumb').length === 4`, 'thumbnails');
};
const setValue = (selector, value, event = 'input') => evaluate(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); n.value = ${JSON.stringify(value)}; n.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
const waitForDownload = async extension => {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const file = readdirSync(downloads).find(name => name.endsWith(extension));
    if (file) { await sleep(300); return join(downloads, file); }
    await sleep(200);
  }
  throw new Error(`No ${extension} download`);
};

let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); }
  catch (error) { failures += 1; console.log(`not ok - ${name}\n    ${error.stack || error}`); await screenshot(`failure-${name.replace(/\W+/g, '-')}`).catch(() => {}); }
};

// ── Scenarios ────────────────────────────────────────────────────
await step('page loads cleanly with defaults', async () => {
  await load();
  assert.equal(await evaluate('modelSel.value'), 'claude-sonnet-5-5');
  assert.equal(await evaluate('languageSel.value'), 'auto');
  assert.equal(await evaluate('promptTxt.value === DEFAULT_PROMPT'), true);
  assert.equal(await evaluate('runBtn.disabled'), true);
  assert.equal(await evaluate('pauseBtn.textContent'), 'Pause');
  assert.equal(await evaluate('document.querySelectorAll(".paper-plane svg").length'), 13);
  await screenshot('1-start');
});

await step('a PDF loads with thumbnails, page numbers and a cost estimate', async () => {
  await setValue('#apiKey', 'sk-ant-test-key');
  await chooseFile();
  await waitFor(`estimateEl.textContent.includes('$')`, 'estimate');
  assert.equal(await evaluate('runBtn.disabled'), false);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#thumbGrid .pg')].map(n => n.textContent)`), ['1', '2', '3', '4']);
  log(await evaluate('estimateEl.textContent'));
});

await step('a run explains every page, retrying, declining and truncating as the API says', async () => {
  scenario = ['overloaded', 'refusal', 'truncated'];
  await evaluate('runBtn.click()');
  await waitFor(`currentRun && currentRun.status === 'done'`, 'run to finish', 60000);
  assert.equal(requests.length, 5);
  const statuses = await evaluate(`[...pageResults.values()].map(r => r.status).sort()`);
  assert.deepEqual(statuses, ['declined', 'ok', 'ok', 'truncated']);
  assert.match(await evaluate('costEl.textContent'), /\$/);
  assert.equal(await evaluate(`document.querySelectorAll('#generatedPreview .doc-preview-page').length`), 4);
  assert.equal(await evaluate(`document.querySelectorAll('#generatedPreview .doc-preview-note').length`), 2);
  assert.equal(await evaluate(`document.querySelectorAll('#generatedPreview table').length`) >= 1, true);
  assert.equal(await evaluate(`doneWrap.classList.contains('hidden')`), false);
  assert.equal(await evaluate(`document.querySelectorAll('#thumbGrid .thumb-del').length`), 0, 'selection locked after a run');
  assert.match(await evaluate('doneMsg.textContent'), /2 of 4 pages explained|3 of 4 pages explained/);
  await sleep(700);
  const bar = await evaluate(`[barFill.getBoundingClientRect().width, progBar.getBoundingClientRect().width]`);
  assert.ok(Math.abs(bar[0] - bar[1]) < 1, `progress bar ${bar[0]} of ${bar[1]}`);
  assert.equal(await evaluate(`pauseBtn.textContent`), 'Pause');
  await screenshot('2-done');
});

await step('requests use the current API version, model, limits and fallback', async () => {
  const { headers, body } = requests[requests.length - 1];
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(headers['x-api-key'], 'sk-ant-test-key');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.max_tokens, 16000);
  assert.deepEqual(body.output_config, { effort: 'medium' });
  assert.equal(body.fallbacks, 'default');
  assert.equal(typeof body.system, 'string');
  const [image, text] = body.messages[0].content;
  assert.equal(image.type, 'image');
  assert.equal(image.source.media_type, 'image/jpeg');
  assert.ok(image.source.data.length > 10000);
  assert.match(text.text, /same language as the page/);
  assert.equal('temperature' in body, false);
});

await step('the Word file keeps the image ratio and the explanation text', async () => {
  await evaluate('dlBtn.click()');
  const file = await waitForDownload('.docx');
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString();
  for (const text of ['Page 1', 'Page 4', 'Hypothesis testing', 'μ₁ ≠ μ₂', 'p ≤ α', 'Claude declined to explain this page.']) {
    assert.ok(xml.includes(text), `docx is missing "${text}"`);
  }
  const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map(m => Number(m[1]) / Number(m[2]));
  assert.equal(extents.length, 4);
  for (const ratio of extents) assert.ok(Math.abs(ratio - 16 / 9) < 0.02, `image ratio ${ratio}`);
  assert.ok(xml.includes('w:numPr'), 'lists use Word numbering');
});

await step('the PDF renders Unicode text with the embedded font', async () => {
  await evaluate('pdfBtn.click()');
  const file = await waitForDownload('.pdf');
  const quiet = { stdio: ['ignore', 'pipe', 'ignore'] };
  const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], quiet).toString();
  for (const fragment of ['Page 1', 'Hypothesis testing', 'μ₁ ≠ μ₂', 'p ≤ α', '⇒', '∑', 'Sensitivity', 'Claude declined to explain this page.']) {
    assert.ok(text.includes(fragment), `pdf is missing "${fragment}"`);
  }
  assert.ok(!text.includes('😀'), 'emoji are removed');
  const fonts = execFileSync('pdffonts', [file], quiet).toString();
  assert.match(fonts, /DejaVuSerif/);
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], quiet).toString())[1]);
  assert.ok(pages >= 4, `pdf has ${pages} pages`);
  execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '2', file, join(outDir, '3-pdf')], quiet);
});

await step('progress survives a reload', async () => {
  await load();
  await waitFor(`currentRun && currentRun.status === 'done' && pageResults.size === 4`, 'restored run');
  assert.equal(await evaluate(`document.querySelectorAll('#generatedPreview .doc-preview-page').length`), 4);
  assert.equal(await evaluate('apiKey.value'), 'sk-ant-test-key');
});

await step('Haiku requests carry no fallback and a chosen language', async () => {
  await setValue('#model', 'claude-haiku-5-5', 'change');
  await setValue('#language', 'Spanish', 'change');
  await setValue('#pgFrom', '2');
  await setValue('#pgTo', '2');
  const before = requests.length;
  scenario = [];
  await evaluate('runBtn.click()');
  await waitFor(`currentRun && currentRun.status === 'done' && currentRun.pages.length === 1`, 'single page run');
  assert.equal(requests.length, before + 1);
  const { headers, body } = requests[requests.length - 1];
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(headers['anthropic-beta'], undefined);
  assert.equal('fallbacks' in body, false);
  assert.match(body.messages[0].content[1].text, /Write the explanation in Spanish\./);
  assert.deepEqual(await evaluate('currentRun.pages'), [2]);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('slidescribe-settings')).model`), 'claude-haiku-5-5');
});

await step('cancel stops the run without further requests', async () => {
  await setValue('#pgFrom', '');
  await setValue('#pgTo', '');
  mockDelayMs = 1500;
  const before = requests.length;
  await evaluate('runBtn.click()');
  await waitFor(`isRunning`, 'run to start');
  await sleep(400);
  await evaluate('cancelBtn.click()');
  await waitFor(`!isRunning && currentRun.status === 'cancelled'`, 'cancel');
  const afterCancel = requests.length;
  await sleep(2000);
  assert.equal(requests.length, afterCancel, 'no requests after cancel');
  assert.ok(afterCancel - before <= 3, 'at most the parallel requests were sent');
  assert.equal(await evaluate('pauseBtn.disabled'), true);
  mockDelayMs = 0;
});

await step('start over clears everything', async () => {
  await evaluate('resetBtn.click()');
  await waitFor(`pdf === null && currentRun === null`, 'reset');
  assert.equal(await evaluate(`fileBadge.classList.contains('hidden')`), true);
  assert.equal(await evaluate('runBtn.disabled'), true);
});

await step('the layout holds on a phone', async () => {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await load();
  const overflow = await evaluate('document.documentElement.scrollWidth - window.innerWidth');
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
  await screenshot('4-mobile');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});

await step('no console errors or CSP violations', async () => {
  assert.deepEqual(problems, []);
});

cdp.close();
browser.close();
await new Promise(resolve => { chrome.once('exit', resolve); chrome.kill(); });
server.close();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
