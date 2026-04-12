pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── refs ────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const dropZone   = $('dropZone'),   fileInput   = $('fileInput'),
      fileBadge  = $('fileBadge'),  fileName    = $('fileName'),
      fileSize   = $('fileSize'),   previewWrap = $('previewWrap'),
      previewTitle=$('previewTitle'),thumbGrid  = $('thumbGrid'),
      apiKey     = $('apiKey'),     keyEye      = $('keyEye'),
      promptTxt  = $('promptTxt'),  promptClear = $('promptClear'),
      modelSel   = $('model'),      scaleSel    = $('scale'),
      pgFrom     = $('pgFrom'),     pgTo        = $('pgTo'),
      pgToReset  = $('pgToReset'),  runBtn      = $('runBtn'),
      pauseBtn   = $('pauseBtn'),   cancelBtn   = $('cancelBtn'),
      resetBtn   = $('resetBtn'),
      progCard   = $('progCard'),   barFill     = $('barFill'),
      pctEl      = $('pctEl'),      logFeed     = $('logFeed'),
      statusEl   = $('statusEl'),   doneWrap    = $('doneWrap'),
      dlBtn      = $('dlBtn'),      pdfBtn      = $('pdfBtn'),
      pageModal  = $('pageModal'),  pageModalCard = $('pageModalCard'),
      pageModalCanvas = $('pageModalCanvas'),
      pageModalClose = $('pageModalClose'),
      pageModalTitle = $('pageModalTitle'),
      errBanner  = $('errBanner'),  errMsg      = $('errMsg');

const DB_NAME = 'slidescribe-db';
const STORE_NAME = 'state';
const RUN_KEY = 'current-run';
const API_KEY_SESSION = 'slidescribe-api-key';
let dbPromise = null;
let pdf = null, pdfBuffer = null, pdfFileMeta = null;
let currentRun = null, activeBlob = null, activePdfBlob = null;
let isRunning = false, pauseRequested = false, cancelRequested = false;
const fieldHistory = new WeakMap();
let selectedPages = [];
let pageSelectionHistory = { stack: [], index: -1 };
let previewRenderToken = 0;
let planeStates = [];
let planeAnimationFrame = 0;
let planeLastTick = 0;
let planeResizeBound = false;
