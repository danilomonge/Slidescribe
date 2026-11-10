// ── DOM helpers ──────────────────────────────────────────────────
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key in node && !key.includes('-')) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function setStatus(message, { busy = true } = {}) {
  statusEl.replaceChildren(
    ...(busy ? [el('span', { className: 'spin', 'aria-hidden': 'true' })] : []),
    el('span', { text: message })
  );
}

function showError(message) {
  errMsg.textContent = message;
  errBanner.classList.remove('hidden');
}

function hideError() {
  errBanner.classList.add('hidden');
}

// ── Log feed ─────────────────────────────────────────────────────
const logRows = new Map();

function logPage(pg, message, type) {
  let row = logRows.get(pg);
  if (!row) {
    row = el('div', { className: 'log-row' }, [el('span', { className: 'log-n', text: String(pg) }), el('span', { className: 'log-t' })]);
    logRows.set(pg, row);
    logFeed.append(row);
  }
  row.className = `log-row ${type}`;
  row.querySelector('.log-t').textContent = message;
  if (type === 'active' && row !== logFeed.lastElementChild) logFeed.append(row);
  logFeed.scrollTop = logFeed.scrollHeight;
  if (currentRun) {
    currentRun.logs = (currentRun.logs || []).filter(item => item.pg !== pg);
    currentRun.logs.push({ pg, message, type });
  }
}

function clearLogs() {
  logRows.clear();
  logFeed.replaceChildren();
}

function restoreLogs(logs) {
  clearLogs();
  for (const item of logs || []) {
    // A page that was in progress when the tab closed is waiting again.
    const type = item.type === 'active' ? 'waiting' : item.type;
    const message = item.type === 'active' ? 'Waiting to resume' : item.message;
    logPage(item.pg ?? item.id, message, type);
  }
}

// ── Timing ───────────────────────────────────────────────────────
// Resolves true after ms, or false as soon as any of the signals aborts.
function sleep(ms, signals = []) {
  return new Promise(resolve => {
    const active = signals.filter(Boolean);
    if (active.some(signal => signal.aborted)) { resolve(false); return; }
    const done = completed => {
      clearTimeout(timer);
      active.forEach(signal => signal.removeEventListener('abort', onAbort));
      resolve(completed);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(true), ms);
    active.forEach(signal => signal.addEventListener('abort', onAbort, { once: true }));
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read a page image.'));
    img.src = src;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Settings ─────────────────────────────────────────────────────
// Prompt, language, model and quality persist between visits; the API key
// only lives in this tab's session storage.
const SETTINGS_KEY = 'slidescribe-settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      prompt: promptTxt.value,
      language: languageSel.value,
      model: modelSel.value,
      scale: scaleSel.value
    }));
  } catch { /* storage unavailable: settings simply are not remembered */ }
}

function readSessionKey() {
  try { return sessionStorage.getItem(API_KEY_SESSION) || ''; } catch { return ''; }
}

function writeSessionKey(value) {
  try {
    if (value) sessionStorage.setItem(API_KEY_SESSION, value);
    else sessionStorage.removeItem(API_KEY_SESSION);
  } catch { /* storage unavailable */ }
}
