// ── PDF.js ───────────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── Element references ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropZone = $('dropZone'), fileInput = $('fileInput'),
      fileBadge = $('fileBadge'), fileName = $('fileName'), fileSize = $('fileSize'),
      previewWrap = $('previewWrap'), previewTitle = $('previewTitle'), previewHint = $('previewHint'), thumbGrid = $('thumbGrid'),
      apiKey = $('apiKey'), keyEye = $('keyEye'),
      languageSel = $('language'), promptTxt = $('promptTxt'), promptReset = $('promptReset'),
      modelSel = $('model'), scaleSel = $('scale'),
      pgFrom = $('pgFrom'), pgTo = $('pgTo'), pgToReset = $('pgToReset'),
      estimateEl = $('estimate'),
      runBtn = $('runBtn'), pauseBtn = $('pauseBtn'), cancelBtn = $('cancelBtn'), resetBtn = $('resetBtn'),
      progCard = $('progCard'), statusEl = $('statusEl'), pctEl = $('pctEl'),
      progBar = $('progBar'), barFill = $('barFill'), costEl = $('costEl'), logFeed = $('logFeed'),
      errBanner = $('errBanner'), errMsg = $('errMsg'),
      doneWrap = $('doneWrap'), doneMsg = $('doneMsg'), dlBtn = $('dlBtn'), pdfBtn = $('pdfBtn'),
      pageModal = $('pageModal'), pageModalTitle = $('pageModalTitle'),
      pageModalCanvas = $('pageModalCanvas'), pageModalClose = $('pageModalClose');

// ── State ────────────────────────────────────────────────────────
const API_KEY_SESSION = 'slidescribe-api-key';

let pdf = null, pdfBuffer = null, pdfFileMeta = null;
let selectedPages = [];
let pageSelectionHistory = { stack: [], index: -1 };
let previewRenderToken = 0;

// A run: { version, fileName, fileSize, numPages, prompt, language, model, scale,
//          selection, pages, from, to, status, usage: { input, output }, logs, updatedAt }
// status: running | paused | cancelled | error | done
let currentRun = null;
let pageResults = new Map();           // page number -> result
let activeBlob = null, activePdfBlob = null;
let isRunning = false, pauseRequested = false, cancelRequested = false;
let runAbort = null;                   // aborts requests and waits (cancel, fatal error)
let pauseAbort = null;                 // aborts retry waits only (pause)
let runFinished = Promise.resolve();   // settles when the current run has fully stopped

const fieldHistory = new WeakMap();
let planeStates = [];
let planeAnimationFrame = 0;
let planeLastTick = 0;
let planeResizeBound = false;

// ── Storage (IndexedDB) ──────────────────────────────────────────
// Keys: 'run' (run metadata), 'pdf' (the PDF bytes, written once per run)
// and 'page:<n>' (one result per page), so saving after each page writes
// only that page instead of the whole run.
const DB_NAME = 'slidescribe-db';
const STORE_NAME = 'state';
const RUN_KEY = 'run';
const PDF_KEY = 'pdf';
const LEGACY_RUN_KEY = 'current-run';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function idbRequest(mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = operation(tx.objectStore(STORE_NAME));
    let result;
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result ?? null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const idbGet = key => idbRequest('readonly', store => store.get(key));
const idbSet = (key, value) => idbRequest('readwrite', store => store.put(value, key));
const idbClear = () => idbRequest('readwrite', store => store.clear());

async function saveRunMeta() {
  if (!currentRun) return;
  currentRun.updatedAt = Date.now();
  currentRun.logs = (currentRun.logs || []).slice(-300);
  try { await idbSet(RUN_KEY, currentRun); } catch (error) { console.warn('Could not save progress', error); }
}

async function savePageResult(result) {
  try { await idbSet(`page:${result.pg}`, result); } catch (error) { console.warn('Could not save a page', error); }
}

async function loadSavedRun() {
  try {
    let run = await idbGet(RUN_KEY);
    if (!run) run = await migrateLegacyRun();
    if (!run) return null;
    const bytes = await idbGet(PDF_KEY);
    if (!bytes) return null;
    const results = new Map();
    for (const pg of run.pages || []) {
      const result = await idbGet(`page:${pg}`);
      if (result) results.set(pg, result);
    }
    return { run, bytes, results };
  } catch (error) {
    console.warn('Could not read saved progress', error);
    return null;
  }
}

// Version 1 kept the PDF and every result inside one record.
async function migrateLegacyRun() {
  const legacy = await idbGet(LEGACY_RUN_KEY);
  if (!legacy?.pdfBytes) return null;
  await idbClear();
  const run = {
    version: 2,
    fileName: legacy.fileName,
    fileSize: legacy.fileSize,
    numPages: legacy.numPages,
    prompt: legacy.prompt || DEFAULT_PROMPT,
    language: DEFAULT_LANGUAGE,
    model: MODELS[legacy.model] ? legacy.model : DEFAULT_MODEL,
    scale: legacy.scale || 2,
    selection: legacy.selectedPages || [],
    pages: legacy.selectedPages || [],
    from: 1,
    to: legacy.numPages,
    status: legacy.status === 'done' ? 'done' : 'paused',
    usage: { input: 0, output: 0 },
    logs: [],
    updatedAt: Date.now()
  };
  await idbSet(PDF_KEY, legacy.pdfBytes);
  for (const result of legacy.results || []) {
    await idbSet(`page:${result.pg}`, { pg: result.pg, b64: result.b64, expl: result.expl, status: 'ok' });
  }
  await idbSet(RUN_KEY, run);
  return run;
}
