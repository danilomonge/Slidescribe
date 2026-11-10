// ── Loading a PDF ────────────────────────────────────────────────
async function loadFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) { showError('Please choose a PDF file.'); return; }
  if (isRunning) { showError('Pause or cancel the current run before loading another PDF.'); return; }
  hideError();
  await loadPdfSource(await file.arrayBuffer(), { name: file.name, size: file.size }, { fresh: true });
}

async function loadPdfSource(bytes, meta, { fresh = false, selection = null } = {}) {
  closePageModal();
  try {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
    pdf = doc;
  } catch (error) {
    showError(`This PDF could not be opened. ${error?.message || ''}`.trim());
    return false;
  }
  pdfBuffer = bytes;
  pdfFileMeta = { name: meta.name, size: meta.size };
  fileName.textContent = meta.name;
  fileSize.textContent = `${formatBytes(meta.size)}, ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}`;
  fileBadge.classList.remove('hidden');

  if (fresh) {
    await discardRun();
    pgFrom.value = '';
    pgTo.value = '';
  }
  initializePageSelection(pdf.numPages, selection);
  syncPageInputs();
  const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const ratio = first.width / first.height;
  thumbGrid.style.setProperty('--thumb-ratio', ratio.toFixed(4));
  thumbGrid.classList.toggle('landscape', ratio > 1.1);
  renderPreview();
  refreshUI();
  return true;
}

// ── Page selection ───────────────────────────────────────────────
// Pages are always referred to by their number in the original PDF.
function sanitizePages(totalPages, pages) {
  const unique = Array.from(new Set((Array.isArray(pages) ? pages : [])
    .map(value => parseInt(value, 10))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= totalPages)))
    .sort((a, b) => a - b);
  return unique.length ? unique : Array.from({ length: totalPages }, (_, idx) => idx + 1);
}

function initializePageSelection(totalPages, pages = null) {
  selectedPages = sanitizePages(totalPages, pages);
  pageSelectionHistory = { stack: [selectedPages.slice()], index: 0 };
}

// Once pages have been explained, the selection is locked so a stray click
// cannot discard them; Start over unlocks it.
function canEditPageSelection() {
  return !!pdf && !isRunning && !(currentRun && pageResults.size);
}

function setSelectedPages(pages, { pushHistory = false } = {}) {
  if (!pdf) return;
  const next = sanitizePages(pdf.numPages, pages);
  if (next.join(',') === selectedPages.join(',')) return;
  invalidateFinishedRun();
  selectedPages = next;
  if (pushHistory) {
    pageSelectionHistory.stack = pageSelectionHistory.stack.slice(0, pageSelectionHistory.index + 1);
    pageSelectionHistory.stack.push(next.slice());
    if (pageSelectionHistory.stack.length > 150) pageSelectionHistory.stack.shift();
    pageSelectionHistory.index = pageSelectionHistory.stack.length - 1;
  }
  renderPreview();
  refreshUI();
}

function removePageFromSelection(pg) {
  if (!canEditPageSelection() || !selectedPages.includes(pg)) return;
  if (selectedPages.length === 1) { showError('At least one page has to stay selected.'); return; }
  setSelectedPages(selectedPages.filter(page => page !== pg), { pushHistory: true });
}

function undoPageSelection() {
  if (!canEditPageSelection() || pageSelectionHistory.index <= 0) return;
  pageSelectionHistory.index -= 1;
  setSelectedPages(pageSelectionHistory.stack[pageSelectionHistory.index]);
}

function redoPageSelection() {
  if (!canEditPageSelection() || pageSelectionHistory.index >= pageSelectionHistory.stack.length - 1) return;
  pageSelectionHistory.index += 1;
  setSelectedPages(pageSelectionHistory.stack[pageSelectionHistory.index]);
}

function pageRange() {
  const total = pdf?.numPages || 1;
  const from = Math.min(Math.max(parseInt(pgFrom.value, 10) || 1, 1), total);
  const to = Math.min(Math.max(parseInt(pgTo.value, 10) || total, from), total);
  return { from, to };
}

function pagesToProcess() {
  const { from, to } = pageRange();
  return selectedPages.filter(pg => pg >= from && pg <= to);
}

function syncPageInputs() {
  if (!pdf) return;
  const total = pdf.numPages;
  pgFrom.max = String(total);
  pgTo.max = String(total);
  for (const input of [pgFrom, pgTo]) {
    const value = parseInt(input.value, 10);
    if (!Number.isNaN(value)) input.value = String(Math.min(Math.max(value, 1), total));
  }
  const from = parseInt(pgFrom.value, 10);
  const to = parseInt(pgTo.value, 10);
  if (!Number.isNaN(from) && !Number.isNaN(to) && to < from) pgTo.value = String(from);
}

// ── Thumbnails (rendered when they scroll into view) ─────────────
let thumbObserver = null;

function renderPreview() {
  if (!pdf) { previewWrap.classList.add('hidden'); return; }
  const token = ++previewRenderToken;
  thumbObserver?.disconnect();
  thumbObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbObserver.unobserve(entry.target);
      drawThumbnail(entry.target, Number(entry.target.dataset.page), token);
    }
  }, { root: thumbGrid, rootMargin: '200px' });

  const editable = canEditPageSelection();
  previewHint.textContent = editable
    ? 'Click a page to view it. Use the bin to leave it out; Ctrl or Cmd + Z undoes.'
    : 'Click a page to view it. To change which pages are explained, click Start over.';
  const total = pdf.numPages;
  previewTitle.textContent = selectedPages.length === total
    ? `All ${total} ${total === 1 ? 'page' : 'pages'}`
    : `${selectedPages.length} of ${total} pages selected`;
  previewWrap.classList.remove('hidden');
  thumbGrid.replaceChildren(...selectedPages.map(pg => {
    const thumb = el('div', { className: 'thumb', role: 'button', tabIndex: 0, 'aria-label': `Show page ${pg}` });
    thumb.dataset.page = String(pg);
    if (editable) {
      const remove = el('button', { type: 'button', className: 'thumb-del', title: `Leave out page ${pg}`, 'aria-label': `Leave out page ${pg}` });
      remove.append(icon('trash'));
      remove.addEventListener('click', event => { event.stopPropagation(); removePageFromSelection(pg); });
      thumb.append(remove);
    }
    thumb.append(el('canvas', { 'aria-hidden': 'true' }), el('span', { className: 'pg', text: String(pg) }));
    thumb.addEventListener('click', () => openPageModal(pg));
    thumb.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPageModal(pg); }
    });
    thumbObserver.observe(thumb);
    return thumb;
  }));
}

async function drawThumbnail(thumb, pg, token) {
  try {
    const page = await pdf.getPage(pg);
    if (token !== previewRenderToken) return;
    const viewport = page.getViewport({ scale: 0.3 });
    const canvas = thumb.querySelector('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (error) {
    console.warn(`Could not draw page ${pg}`, error);
  }
}

// ── Page viewer ──────────────────────────────────────────────────
let modalReturnFocus = null;

function showModal(title) {
  modalReturnFocus = document.activeElement;
  pageModalTitle.textContent = title;
  pageModal.classList.remove('hidden');
  pageModal.setAttribute('aria-hidden', 'false');
  pageModalClose.focus();
}

async function openPageModal(pg) {
  if (!pdf) return;
  showModal(`Page ${pg}`);
  const page = await pdf.getPage(pg);
  const base = page.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const width = Math.min(window.innerWidth - 64, 900);
  const viewport = page.getViewport({ scale: (width / base.width) * ratio });
  pageModalCanvas.width = Math.round(viewport.width);
  pageModalCanvas.height = Math.round(viewport.height);
  const ctx = pageModalCanvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pageModalCanvas.width, pageModalCanvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function openImageModal(src, title) {
  showModal(title);
  const img = await loadImage(src);
  pageModalCanvas.width = img.naturalWidth;
  pageModalCanvas.height = img.naturalHeight;
  pageModalCanvas.getContext('2d').drawImage(img, 0, 0);
}

function closePageModal() {
  if (pageModal.classList.contains('hidden')) return;
  pageModal.classList.add('hidden');
  pageModal.setAttribute('aria-hidden', 'true');
  modalReturnFocus?.focus?.();
  modalReturnFocus = null;
}

// ── Readiness and cost estimate ──────────────────────────────────
function hasValidKey() {
  return /^sk-ant-/.test(apiKey.value.trim());
}

function refreshUI() {
  const pages = pdf ? pagesToProcess() : [];
  const status = currentRun?.status;
  runBtn.disabled = isRunning || !pdf || !hasValidKey() || !pages.length;

  const resumable = !isRunning && (status === 'paused' || status === 'error');
  pauseBtn.disabled = !(isRunning || resumable) || cancelRequested || pauseRequested;
  setButtonLabel(pauseBtn, resumable ? 'Resume' : (pauseRequested ? 'Pausing' : 'Pause'), resumable ? 'play' : 'pause');
  cancelBtn.disabled = !(isRunning || status === 'paused' || status === 'error') || cancelRequested;
  resetBtn.disabled = !pdf && !currentRun;

  for (const control of [languageSel, promptTxt, modelSel, scaleSel, pgFrom, pgTo]) control.disabled = isRunning;
  fileInput.disabled = isRunning;
  dropZone.classList.toggle('disabled', isRunning);
  updateEstimate(pages);
}

function setButtonLabel(button, label, iconName) {
  button.replaceChildren(icon(iconName), el('span', { text: label }));
}

async function updateEstimate(pages = pdf ? pagesToProcess() : []) {
  if (!pdf || !pages.length) { estimateEl.textContent = ''; return; }
  try {
    const page = await pdf.getPage(pages[0]);
    const size = renderSize(page, parseFloat(scaleSel.value));
    const model = MODELS[modelSel.value];
    const cost = estimateRunCost(modelSel.value, pages.length, size.width, size.height);
    estimateEl.textContent = `About ${formatUsd(cost)} for ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} with ${model.name}. You only pay Anthropic for what you use.`;
  } catch {
    estimateEl.textContent = '';
  }
}

// ── Rendering a page for Claude ──────────────────────────────────
function renderSize(page, scale) {
  const base = page.getViewport({ scale });
  const longest = Math.max(base.width, base.height);
  const factor = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;
  return { scale: scale * factor, width: Math.round(base.width * factor), height: Math.round(base.height * factor) };
}

async function renderPageImage(pg, scale) {
  const page = await pdf.getPage(pg);
  const size = renderSize(page, scale);
  const viewport = page.getViewport({ scale: size.scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const b64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
  const image = { b64, width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  return image;
}

// ── Running ──────────────────────────────────────────────────────
function createRun() {
  const pages = pagesToProcess();
  if (!pages.length) { showError('No pages are selected in this range.'); return null; }
  const { from, to } = pageRange();
  return {
    version: 2,
    fileName: pdfFileMeta.name,
    fileSize: pdfFileMeta.size,
    numPages: pdf.numPages,
    prompt: promptTxt.value.trim() || DEFAULT_PROMPT,
    language: languageSel.value,
    model: modelSel.value,
    scale: parseFloat(scaleSel.value),
    selection: selectedPages.slice(),
    pages,
    from,
    to,
    status: 'running',
    usage: { input: 0, output: 0 },
    logs: [],
    updatedAt: Date.now()
  };
}

async function startProcessing({ resume = false } = {}) {
  if (isRunning || !pdf) return;
  if (!hasValidKey()) { showError('Add your Anthropic API key first.'); apiKey.focus(); return; }
  hideError();

  if (!resume || !currentRun) {
    if (currentRun && pageResults.size) {
      const message = currentRun.status === 'done'
        ? 'Generate again? The current explanations will be replaced.'
        : `Start a new run? The ${pageResults.size} ${pageResults.size === 1 ? 'page' : 'pages'} explained so far will be discarded. Use Resume to continue instead.`;
      if (!window.confirm(message)) return;
    }
    const run = createRun();
    if (!run) return;
    await discardRun();
    currentRun = run;
    try { await idbSet(PDF_KEY, pdfBuffer.slice(0)); } catch (error) { console.warn('Could not save the PDF', error); }
  }

  pauseRequested = false;
  cancelRequested = false;
  isRunning = true;
  let finish;
  runFinished = new Promise(resolve => { finish = resolve; });
  runAbort = new AbortController();
  pauseAbort = new AbortController();
  currentRun.status = 'running';
  await saveRunMeta();
  showResults(false);
  progCard.classList.remove('hidden');
  renderPreview();
  refreshUI();
  updateProgress();

  try {
    await processRun();
  } catch (error) {
    console.error(error);
    currentRun.status = 'error';
    await saveRunMeta();
    showError(`Something went wrong: ${error?.message || error}. Your progress is saved; click Resume to continue.`);
    setStatus('Stopped because of an unexpected error.', { busy: false });
  } finally {
    isRunning = false;
    pauseRequested = false;
    cancelRequested = false;
    runAbort = null;
    pauseAbort = null;
    finish();
    renderPreview();
    refreshUI();
    if (currentRun && currentRun.status !== 'done' && pageResults.size) showResults(true);
  }
}

async function processRun() {
  const key = apiKey.value.trim();
  // Pages that failed for a reason specific to them get another chance on resume.
  const queue = currentRun.pages.filter(pg => !pageResults.has(pg) || pageResults.get(pg).status === 'failed');
  let fatal = null;
  let exhausted = null;
  let unexpected = null;
  const stopping = () => cancelRequested || pauseRequested || fatal || exhausted || unexpected;

  const worker = async () => {
    while (!stopping()) {
      const pg = queue.shift();
      if (pg === undefined) return;
      try {
        const result = await explainOnePage(pg, key);
        if (!result) { queue.unshift(pg); return; }
        pageResults.set(pg, result);
        await savePageResult(result);
        await saveRunMeta();
        updateProgress();
      } catch (error) {
        queue.unshift(pg);
        if (error instanceof ClaudeError && error.fatal) { fatal = error; runAbort?.abort(); return; }
        if (error instanceof ClaudeError && error.exhausted) { exhausted = error; pauseAbort?.abort(); return; }
        unexpected = error;
        runAbort?.abort();
        return;
      }
    }
  };

  setStatus(`Explaining ${queue.length} ${queue.length === 1 ? 'page' : 'pages'}…`);
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, queue.length)) }, worker));
  if (unexpected) throw unexpected;

  if (cancelRequested) {
    currentRun.status = 'cancelled';
    await saveRunMeta();
    setStatus(`Cancelled. ${describeDone()}`, { busy: false });
    return;
  }
  if (fatal) {
    currentRun.status = 'error';
    await saveRunMeta();
    showError(fatal.message);
    setStatus(`Stopped. ${describeDone()}`, { busy: false });
    return;
  }
  if (exhausted || pauseRequested) {
    currentRun.status = 'paused';
    await saveRunMeta();
    if (exhausted) showError(`${exhausted.message} The run is paused after several attempts; click Resume to try again.`);
    setStatus(`Paused. ${describeDone()}`, { busy: false });
    return;
  }

  currentRun.status = 'done';
  await saveRunMeta();
  updateProgress();
  setStatus(`Done. ${describeDone()}`, { busy: false });
  showResults(true);
}

async function explainOnePage(pg, key) {
  logPage(pg, 'Rendering the page', 'active');
  const image = await renderPageImage(pg, currentRun.scale);
  const prompt = `${currentRun.prompt}\n\n${languageInstruction(currentRun.language)}`;

  for (let attempt = 1; ; attempt++) {
    if (cancelRequested) return null;
    logPage(pg, attempt === 1 ? 'Explaining' : `Explaining, attempt ${attempt} of ${MAX_ATTEMPTS}`, 'active');
    try {
      const answer = await explainPage({ apiKey: key, model: currentRun.model, prompt, image, signal: runAbort.signal });
      addUsage(answer.usage);
      if (answer.stopReason === 'refusal') {
        logPage(pg, 'Claude declined to explain this page', 'warn');
        return { pg, ...image, expl: '', status: 'declined', note: answer.refusalCategory || '' };
      }
      if (!answer.text) {
        logPage(pg, 'Claude returned an empty answer', 'error');
        return { pg, ...image, expl: '', status: 'failed', note: 'Claude returned an empty answer.' };
      }
      const truncated = answer.stopReason === 'max_tokens';
      logPage(pg, truncated ? `${summaryLine(answer.text)} (cut short)` : summaryLine(answer.text), truncated ? 'warn' : 'done');
      return { pg, ...image, expl: answer.text, status: truncated ? 'truncated' : 'ok' };
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      if (!(error instanceof ClaudeError)) throw error;
      if (error.fatal) { logPage(pg, error.message, 'error'); throw error; }
      if (!error.retryable) {
        logPage(pg, error.message, 'error');
        return { pg, ...image, expl: '', status: 'failed', note: error.message };
      }
      if (attempt >= MAX_ATTEMPTS) {
        error.exhausted = true;
        logPage(pg, `${error.message} Paused after ${MAX_ATTEMPTS} attempts.`, 'error');
        throw error;
      }
      const delay = retryDelayMs(error, attempt);
      logPage(pg, `${error.message} Trying again in ${Math.ceil(delay / 1000)} s.`, 'waiting');
      if (!(await sleep(delay, [runAbort?.signal, pauseAbort?.signal]))) return null;
    }
  }
}

function summaryLine(text) {
  const first = text.split('\n').map(line => line.replace(/^[#>\-*\d.\s]+/, '').replace(/\*\*|__|`/g, '').trim()).find(Boolean) || 'Explained';
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

function addUsage(usage) {
  currentRun.usage.input += usage.input;
  currentRun.usage.output += usage.output;
  updateProgress();
}

function explainedCount() {
  return [...pageResults.values()].filter(result => result.status === 'ok' || result.status === 'truncated').length;
}

function describeDone() {
  const total = currentRun?.pages?.length || 0;
  const unexplained = pageResults.size - explainedCount();
  return `${explainedCount()} of ${total} ${total === 1 ? 'page' : 'pages'} explained`
    + (unexplained ? `, ${unexplained} without an explanation.` : '.');
}

function updateProgress() {
  if (!currentRun) return;
  const total = currentRun.pages.length;
  const done = currentRun.pages.filter(pg => pageResults.has(pg)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  barFill.style.width = `${pct}%`;
  pctEl.textContent = `${pct}%`;
  progBar.setAttribute('aria-valuenow', String(pct));
  progBar.setAttribute('aria-valuetext', `${done} of ${total} pages`);
  const cost = costUsd(currentRun.model, currentRun.usage);
  const costLabel = currentRun.status === 'done' ? 'Total cost' : 'Cost so far';
  costEl.textContent = cost > 0 ? `${costLabel}: about ${formatUsd(cost)}` : '';
  if (isRunning && !pauseRequested && !cancelRequested) setStatus(`Explaining pages: ${done} of ${total} done`);
}

function requestPause() {
  if (!isRunning || pauseRequested) return;
  pauseRequested = true;
  pauseAbort?.abort();
  setStatus('Pausing after the pages in progress…');
  refreshUI();
}

async function cancelRun() {
  if (isRunning) {
    cancelRequested = true;
    runAbort?.abort();
    setStatus('Cancelling…');
    refreshUI();
    return;
  }
  if (!currentRun) return;
  currentRun.status = 'cancelled';
  await saveRunMeta();
  setStatus(`Cancelled. ${describeDone()}`, { busy: false });
  refreshUI();
}

// Forget the run (progress and saved data) but keep the loaded PDF.
async function discardRun() {
  currentRun = null;
  pageResults = new Map();
  activeBlob = null;
  activePdfBlob = null;
  clearLogs();
  showResults(false);
  progCard.classList.add('hidden');
  barFill.style.width = '0%';
  pctEl.textContent = '0%';
  costEl.textContent = '';
  try { await idbClear(); } catch (error) { console.warn('Could not clear saved progress', error); }
}

// Editing the selection after a finished or stopped run starts a new one.
function invalidateFinishedRun() {
  if (currentRun && !isRunning) void discardRun();
}

async function startOver() {
  if (isRunning) {
    cancelRequested = true;
    runAbort?.abort();
    await runFinished;
  }
  await discardRun();
  pdf = null;
  pdfBuffer = null;
  pdfFileMeta = null;
  selectedPages = [];
  fileInput.value = '';
  fileBadge.classList.add('hidden');
  previewWrap.classList.add('hidden');
  thumbGrid.replaceChildren();
  pgFrom.value = '';
  pgTo.value = '';
  hideError();
  closePageModal();
  refreshUI();
  dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Results ──────────────────────────────────────────────────────
function orderedResults() {
  return (currentRun?.pages || []).filter(pg => pageResults.has(pg)).map(pg => pageResults.get(pg));
}

function showResults(visible) {
  removeGeneratedPreview();
  doneWrap.classList.toggle('hidden', !visible);
  if (!visible) return;
  const results = orderedResults();
  if (!results.length) { doneWrap.classList.add('hidden'); return; }
  activeBlob = null;
  activePdfBlob = null;
  const total = currentRun.pages.length;
  const explained = explainedCount();
  const missing = results.length - explained;
  const marked = missing ? ` ${missing} ${missing === 1 ? 'page has' : 'pages have'} no explanation and ${missing === 1 ? 'is' : 'are'} marked in the document.` : '';
  doneMsg.textContent = currentRun.status === 'done'
    ? (missing ? `Your document is ready: ${explained} of ${total} pages explained.${marked}` : `Your document is ready: all ${total} ${total === 1 ? 'page' : 'pages'} explained.`)
    : `${results.length} of ${total} pages are done so far. You can download them now or resume later.${marked}`;
  renderGeneratedPreview(results);
}

async function downloadExport(kind) {
  const button = kind === 'docx' ? dlBtn : pdfBtn;
  const results = orderedResults();
  if (!results.length) return;
  const base = documentTitle(currentRun.fileName);
  const label = button.querySelector('span:last-child');
  const original = label.textContent;
  button.disabled = true;
  label.textContent = 'Preparing…';
  try {
    if (kind === 'docx') {
      activeBlob = activeBlob || await buildDocx(results, currentRun.fileName);
      downloadBlob(activeBlob, `${base} explained.docx`);
    } else {
      activePdfBlob = activePdfBlob || await buildPdf(results, currentRun.fileName);
      downloadBlob(activePdfBlob, `${base} explained.pdf`);
    }
  } catch (error) {
    console.error(error);
    showError(`The ${kind === 'docx' ? 'Word' : 'PDF'} file could not be created: ${error?.message || error}`);
  } finally {
    button.disabled = false;
    label.textContent = original;
  }
}

// ── Restoring saved progress ─────────────────────────────────────
async function restoreSavedRun() {
  const saved = await loadSavedRun();
  if (!saved) { refreshUI(); return; }
  const { run, bytes, results } = saved;

  promptTxt.value = run.prompt || DEFAULT_PROMPT;
  if (LANGUAGES.some(([value]) => value === run.language)) languageSel.value = run.language;
  if (MODELS[run.model]) modelSel.value = run.model;
  scaleSel.value = String(run.scale || 2);
  pgFrom.value = run.from > 1 ? String(run.from) : '';
  pgTo.value = run.to && run.to < run.numPages ? String(run.to) : '';

  const loaded = await loadPdfSource(bytes, { name: run.fileName, size: run.fileSize }, { selection: run.selection });
  if (!loaded) return;
  currentRun = run;
  pageResults = results;
  if (currentRun.status === 'running') currentRun.status = 'paused';
  restoreLogs(run.logs);
  progCard.classList.remove('hidden');
  updateProgress();

  if (currentRun.status === 'done') {
    setStatus(`Done. ${describeDone()}`, { busy: false });
    showResults(true);
  } else {
    const verb = currentRun.status === 'cancelled' ? 'Cancelled' : 'Paused';
    const next = currentRun.status === 'cancelled' ? 'Start over to explain another PDF.' : (hasValidKey() ? 'Click Resume to continue.' : 'Add your API key, then click Resume.');
    setStatus(`${verb}. ${describeDone()} ${next}`, { busy: false });
    if (pageResults.size) showResults(true);
  }
  refreshUI();
}
