async function load(f) {
  if (!f?.name.toLowerCase().endsWith('.pdf')) { showErr('Please select a valid .pdf file.'); return; }
  const bytes = await f.arrayBuffer();
  await loadPdfSource(bytes, { name: f.name, size: f.size }, { resetProgress: true });
}

async function loadPdfSource(bytes, meta, opts = {}) {
  const { resetProgress = false } = opts;
  closePageModal();
  pdfBuffer = bytes;
  pdfFileMeta = { name: meta.name, size: meta.size };
  fileName.textContent = meta.name;
  fileSize.textContent = (meta.size / 1024).toFixed(1) + ' KB';
  fileBadge.classList.remove('hidden');
  setStatus('Loading PDF…', true);
  progCard.classList.remove('hidden');
  try {
    pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const n = pdf.numPages;
    if (resetProgress) initializePageSelection(n);
    else if (currentRun?.selectedPages?.length) initializePageSelection(n, currentRun.selectedPages);
    else initializePageSelection(n);
    syncPageInputs();
    if (resetProgress) {
      logFeed.innerHTML = '';
      clearLogs();
      doneWrap.classList.add('hidden');
      removeGeneratedPreview();
      errBanner.classList.add('hidden');
      barFill.style.width = '0%';
      pctEl.textContent = '0%';
      activeBlob = null;
      activePdfBlob = null;
      currentRun = null;
      await deleteSavedRun();
    }
    setStatus(`Loaded — ${n} pages`, false);
    progCard.classList.add('hidden');
    await renderPreview();
    checkReady();
    refreshActionButtons();
  } catch (e) {
    showErr('Failed to load PDF: ' + e.message);
    progCard.classList.add('hidden');
  }
}

async function renderPreview() {
  if (!pdf) return;
  const renderToken = ++previewRenderToken;
  const n = pdf.numPages;
  const pages = selectedPages.slice();
  const canEditSelection = canEditPageSelection();
  thumbGrid.innerHTML = '';
  previewWrap.classList.remove('hidden');
  previewTitle.textContent = pages.length === n
    ? `Preview — ${n} page${n>1?'s':''}`
    : `Preview — ${pages.length} of ${n} page${n>1?'s':''}`;
  for (const pageNumber of pages.slice(0, 24)) {
    const displayPage = getDisplayPageNumber(pageNumber, pages);
    const w = document.createElement('div'); w.className = 'thumb';
    w.setAttribute('role', 'button');
    w.setAttribute('tabindex', '0');
    w.setAttribute('aria-label', `Open page ${displayPage} overview`);
    if (canEditSelection) {
      const del = document.createElement('button');
      del.className = 'thumb-del';
      del.type = 'button';
      del.setAttribute('aria-label', `Remove page ${displayPage}`);
      del.title = `Remove page ${displayPage}`;
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
      del.addEventListener('click', e => {
        e.stopPropagation();
        removePageFromSelection(pageNumber);
      });
      w.appendChild(del);
    }
    const cv = document.createElement('canvas'); w.appendChild(cv);
    const p = document.createElement('span'); p.className = 'pg'; p.textContent = displayPage; w.appendChild(p);
    thumbGrid.appendChild(w);
    w.addEventListener('click', () => openPageModal(pageNumber));
    w.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPageModal(pageNumber);
      }
    });
    const page = await pdf.getPage(pageNumber);
    const vp = page.getViewport({ scale: 0.26 });
    cv.width = vp.width; cv.height = vp.height;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (renderToken !== previewRenderToken) return;
  }
  if (pages.length > 24) {
    if (renderToken !== previewRenderToken) return;
    const m = document.createElement('div');
    m.className = 'thumb-more';
    m.textContent = `+${pages.length-24} more`;
    thumbGrid.appendChild(m);
  }
}

async function openPageModal(pageNumber) {
  if (!pdf) return;
  pageModalTitle.textContent = `Page ${getDisplayPageNumber(pageNumber)} Overview`;
  pageModal.classList.remove('hidden');
  pageModal.setAttribute('aria-hidden', 'false');

  const page = await pdf.getPage(pageNumber);
  const maxWidth = Math.min(window.innerWidth - 96, 860);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(1, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
  pageModalCanvas.width = viewport.width;
  pageModalCanvas.height = viewport.height;
  const ctx = pageModalCanvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pageModalCanvas.width, pageModalCanvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function openImageModal(src, title = 'Page Overview') {
  pageModalTitle.textContent = title;
  pageModal.classList.remove('hidden');
  pageModal.setAttribute('aria-hidden', 'false');

  const img = await loadImage(src);
  const maxWidth = Math.min(window.innerWidth - 96, 860);
  const scale = Math.min(1, maxWidth / img.width);
  pageModalCanvas.width = img.width * scale;
  pageModalCanvas.height = img.height * scale;
  const ctx = pageModalCanvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pageModalCanvas.width, pageModalCanvas.height);
  ctx.drawImage(img, 0, 0, pageModalCanvas.width, pageModalCanvas.height);
}

function closePageModal() {
  pageModal.classList.add('hidden');
  pageModal.setAttribute('aria-hidden', 'true');
}

function canEditPageSelection() {
  return !!pdf && !isRunning;
}

function prepareSelectionEdit() {
  if (!currentRun) return;
  currentRun = null;
  activeBlob = null;
  activePdfBlob = null;
  doneWrap.classList.add('hidden');
  removeGeneratedPreview();
  logFeed.innerHTML = '';
  clearLogs();
  errBanner.classList.add('hidden');
  barFill.style.width = '0%';
  pctEl.textContent = '0%';
  setStatus('Ready with updated page selection', false);
  void deleteSavedRun();
  refreshActionButtons();
}

function sanitizeSelectedPages(totalPages, pages) {
  const valid = Array.isArray(pages) ? pages : [];
  const uniqueSorted = Array.from(new Set(valid
    .map(value => parseInt(value, 10))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= totalPages)
  )).sort((a, b) => a - b);
  if (uniqueSorted.length) return uniqueSorted;
  return Array.from({ length: totalPages }, (_, idx) => idx + 1);
}

function initializePageSelection(totalPages, initialPages) {
  selectedPages = sanitizeSelectedPages(totalPages, initialPages);
  pageSelectionHistory = {
    stack: [selectedPages.slice()],
    index: 0
  };
}

function getDisplayPageNumber(pageNumber, pageList = null) {
  const pages = Array.isArray(pageList) && pageList.length
    ? pageList
    : (currentRun?.selectedPages?.length ? currentRun.selectedPages : selectedPages);
  const index = pages.indexOf(pageNumber);
  return index >= 0 ? index + 1 : pageNumber;
}

function getSelectablePageCount() {
  return selectedPages.length || pdf?.numPages || 1;
}

function getSelectedPagesInRange() {
  const total = getSelectablePageCount();
  const from = Math.max(1, Math.min(parseInt(pgFrom.value, 10) || 1, total));
  const to = Math.max(from, Math.min(parseInt(pgTo.value, 10) || total, total));
  return {
    from,
    to,
    pages: selectedPages.slice(from - 1, to)
  };
}

function applySelectedPages(pages, { pushHistory = false } = {}) {
  if (!pdf) return;
  const nextPages = sanitizeSelectedPages(pdf.numPages, pages);
  const sameAsCurrent = selectedPages.length === nextPages.length
    && selectedPages.every((page, idx) => page === nextPages[idx]);
  if (sameAsCurrent) return;

  selectedPages = nextPages;
  if (pushHistory) {
    const currentSnap = pageSelectionHistory.stack[pageSelectionHistory.index] || [];
    const sameAsSnap = currentSnap.length === nextPages.length
      && currentSnap.every((page, idx) => page === nextPages[idx]);
    if (!sameAsSnap) {
      pageSelectionHistory.stack = pageSelectionHistory.stack.slice(0, pageSelectionHistory.index + 1);
      pageSelectionHistory.stack.push(nextPages.slice());
      if (pageSelectionHistory.stack.length > 150) pageSelectionHistory.stack.shift();
      pageSelectionHistory.index = pageSelectionHistory.stack.length - 1;
    }
  }

  syncPageInputs();
  void renderPreview();
  checkReady();
}

function removePageFromSelection(pageNumber) {
  if (!canEditPageSelection()) return;
  if (!selectedPages.includes(pageNumber)) return;
  prepareSelectionEdit();
  applySelectedPages(selectedPages.filter(page => page !== pageNumber), { pushHistory: true });
}

function undoPageSelection() {
  if (!canEditPageSelection()) return;
  if (pageSelectionHistory.index <= 0) return;
  prepareSelectionEdit();
  pageSelectionHistory.index -= 1;
  selectedPages = pageSelectionHistory.stack[pageSelectionHistory.index].slice();
  void renderPreview();
  checkReady();
}

function redoPageSelection() {
  if (!canEditPageSelection()) return;
  if (pageSelectionHistory.index >= pageSelectionHistory.stack.length - 1) return;
  prepareSelectionEdit();
  pageSelectionHistory.index += 1;
  selectedPages = pageSelectionHistory.stack[pageSelectionHistory.index].slice();
  void renderPreview();
  checkReady();
}

function syncPageInputs(changed = '') {
  if (!pdf) return;
  const maxPages = getSelectablePageCount();
  pgFrom.max = maxPages;
  pgTo.max = maxPages;
  let fromValue = parseInt(pgFrom.value, 10);
  let toValue = parseInt(pgTo.value, 10);

  if (!Number.isNaN(fromValue)) {
    fromValue = Math.min(Math.max(fromValue, 1), maxPages);
    pgFrom.value = String(fromValue);
  }
  if (!Number.isNaN(toValue)) {
    toValue = Math.min(Math.max(toValue, 1), maxPages);
    pgTo.value = String(toValue);
  }

  fromValue = parseInt(pgFrom.value, 10);
  toValue = parseInt(pgTo.value, 10);
  if (!Number.isNaN(fromValue) && !Number.isNaN(toValue) && toValue < fromValue) {
    if (changed === 'from' || changed === 'to') pgTo.value = String(fromValue);
  }
}

function getRunConfig() {
  if (!pdf || !pdfBuffer || !pdfFileMeta) return null;
  const key = apiKey.value.trim();
  const prompt = promptTxt.value.trim();
  const model = modelSel.value;
  const scale = parseFloat(scaleSel.value);
  const { from, to, pages: pagesInRange } = getSelectedPagesInRange();
  if (!pagesInRange.length) {
    showErr('There are no selected pages in the current range. Restore a page or change From/To Page.');
    return null;
  }
  return {
    version: 1,
    fileName: pdfFileMeta.name,
    fileSize: pdfFileMeta.size,
    pdfBytes: pdfBuffer.slice(0),
    numPages: pdf.numPages,
    prompt,
    model,
    scale,
    from,
    to: Math.max(to, from),
    selectedPages: pagesInRange,
    results: [],
    logs: [],
    status: 'idle',
    currentPage: pagesInRange[0],
    updatedAt: Date.now()
  };
}

function checkReady() {
  const hasSelectedInRange = !!pdf && getSelectedPagesInRange().pages.length > 0;
  runBtn.disabled = !(pdf && apiKey.value.trim().startsWith('sk-') && hasSelectedInRange) || isRunning;
}

async function startProcessing(options = {}) {
  const { resume = false } = options;
  if (isRunning) return;
  errBanner.classList.add('hidden');
  doneWrap.classList.add('hidden');

  if (!resume || !currentRun) {
    const config = getRunConfig();
    if (!config) return;
    currentRun = config;
    currentRun.logs = [];
    currentRun.results = [];
    currentRun.currentPage = currentRun.selectedPages[0];
    logFeed.innerHTML = '';
    clearLogs();
    barFill.style.width = '0%';
    pctEl.textContent = '0%';
  } else {
    currentRun.status = 'running';
  }

  pauseRequested = false;
  cancelRequested = false;
  isRunning = true;
  currentRun.status = 'running';
  currentRun.updatedAt = Date.now();
  await saveCurrentRun();
  refreshActionButtons();
  progCard.classList.remove('hidden');
  hydrateLogsFromRun();

  try {
    await processRun();
  } catch (e) {
    currentRun.status = 'error';
    currentRun.updatedAt = Date.now();
    await saveCurrentRun();
    showErr('Unexpected error: ' + e.message);
    setStatus('Error', false);
  } finally {
    isRunning = false;
    refreshActionButtons();
    if (cancelRequested) cancelBtn.disabled = true;
    checkReady();
  }
}

async function processRun() {
  const MAX_RETRIES = 3;
  const key = apiKey.value.trim();
  const pagesToProcess = currentRun.selectedPages || [];
  updateProgressUI();

  for (let idx = 0; idx < pagesToProcess.length; idx++) {
    const pg = pagesToProcess[idx];
    const processed = new Map((currentRun.results || []).map(item => [item.pg, item]));
    if (processed.has(pg)) continue;

    currentRun.currentPage = pg;
    currentRun.updatedAt = Date.now();
    await saveCurrentRun();

    setStatus(`Processing page ${getDisplayPageNumber(pg, pagesToProcess)} (${idx + 1} of ${pagesToProcess.length})…`);
    addOrUpdateLog(pg, 'Rendering…', 'active');

    const page = await pdf.getPage(pg);
    const vp = page.getViewport({ scale: currentRun.scale });
    const cv = document.createElement('canvas');
    cv.width = vp.width;
    cv.height = vp.height;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const b64 = cv.toDataURL('image/jpeg', .92).split(',')[1];

    let result = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      addOrUpdateLog(pg, attempt > 1 ? `Explaining with Claude… (attempt ${attempt})` : 'Explaining with Claude…', 'active');
      try {
        activeClaudeController = new AbortController();
        const expl = await claude(key, currentRun.model, currentRun.prompt, b64, activeClaudeController.signal);
        result = { pg, b64, expl };
        addOrUpdateLog(pg, expl.slice(0, 100) + '…', 'done');
        break;
      } catch (e) {
        activeClaudeController = null;
        if (isAbortError(e) && cancelRequested) {
          currentRun.status = 'cancelled';
          currentRun.updatedAt = Date.now();
          await saveCurrentRun();
          setStatus('Cancelled. You can start over or try with different slides.', false);
          return;
        }
        if (attempt < MAX_RETRIES) {
          const delaySec = attempt * 5;
          addOrUpdateLog(pg, `Error – retrying in ${delaySec}s…`, 'active');
          setStatus(`Page ${getDisplayPageNumber(pg, pagesToProcess)}: error, retrying in ${delaySec}s…`);
          await wait(delaySec * 1000);
          if (cancelRequested) {
            currentRun.status = 'cancelled';
            currentRun.updatedAt = Date.now();
            await saveCurrentRun();
            setStatus('Cancelled. You can start over or try with different slides.', false);
            return;
          }
        } else {
          addOrUpdateLog(pg, `Failed after ${MAX_RETRIES} attempts – will retry later.`, 'error');
        }
      } finally {
        activeClaudeController = null;
      }
    }

    if (result) {
      currentRun.results.push(result);
      currentRun.results.sort((a, b) => a.pg - b.pg);
      currentRun.currentPage = pagesToProcess[idx + 1] || pg;
      currentRun.updatedAt = Date.now();
      await saveCurrentRun();
      updateProgressUI();
    }

    if (cancelRequested) {
      currentRun.status = 'cancelled';
      currentRun.updatedAt = Date.now();
      await saveCurrentRun();
      setStatus('Cancelled. You can start over or try with different slides.', false);
      return;
    }

    if (pauseRequested) {
      currentRun.status = 'paused';
      currentRun.updatedAt = Date.now();
      await saveCurrentRun();
      setStatus(`Paused on page ${getDisplayPageNumber(pagesToProcess[idx + 1] || pg, pagesToProcess)}.`, false);
      return;
    }

    if (idx < pagesToProcess.length - 1) await wait(280);
  }

  const remaining = pagesToProcess.filter(pg => !(currentRun.results || []).some(r => r.pg === pg));
  if (remaining.length > 0) {
    setStatus(`${remaining.length} slide(s) failed – retrying in 10s…`);
    await wait(10000);
    if (!cancelRequested) return processRun();
    currentRun.status = 'cancelled';
    currentRun.updatedAt = Date.now();
    await saveCurrentRun();
    return;
  }

  setStatus('Building Word document…');
  activeBlob = await buildDocx(currentRun.results, currentRun.fileName);
  setStatus('Building PDF preview…');
  activePdfBlob = await buildPdf(currentRun.results, currentRun.fileName);
  bindDownload(activeBlob, currentRun.fileName);
  bindPdfDownload(activePdfBlob, currentRun.fileName);
  renderGeneratedPreview(currentRun.results, currentRun.fileName);
  currentRun.status = 'done';
  currentRun.updatedAt = Date.now();
  await saveCurrentRun();
  updateProgressUI();
  setStatus('Done ✦', false);
  doneWrap.classList.remove('hidden');
}

function requestPause() {
  if (!isRunning) return;
  pauseRequested = true;
  pauseBtn.textContent = 'Pausing…';
  pauseBtn.disabled = true;
}

async function restoreSavedRun() {
  const saved = await getSavedRun();
  if (!saved) {
    refreshActionButtons();
    checkReady();
    return;
  }

  currentRun = saved;
  promptTxt.value = saved.prompt || promptTxt.value;
  modelSel.value = saved.model || modelSel.value;
  scaleSel.value = String(saved.scale || scaleSel.value);
  pgFrom.value = saved.from || 1;
  pgTo.value = saved.to === (saved.selectedPages?.length || saved.numPages) ? '' : saved.to;

  await loadPdfSource(saved.pdfBytes, { name: saved.fileName, size: saved.fileSize }, { resetProgress: false });
  hydrateLogsFromRun();
  updateProgressUI();
  refreshActionButtons();

  if (saved.status === 'done') {
    setStatus('Rebuilding Word document…');
    activeBlob = await buildDocx(saved.results || [], saved.fileName);
    setStatus('Rebuilding PDF preview…');
    activePdfBlob = await buildPdf(saved.results || [], saved.fileName);
    bindDownload(activeBlob, saved.fileName);
    bindPdfDownload(activePdfBlob, saved.fileName);
    renderGeneratedPreview(saved.results || [], saved.fileName);
    setStatus('Done ✦', false);
    doneWrap.classList.remove('hidden');
  } else if (saved.status === 'paused') {
    progCard.classList.remove('hidden');
    setStatus(`Paused on page ${getDisplayPageNumber(saved.currentPage || saved.from, saved.selectedPages)} of ${(saved.selectedPages || []).length || saved.to}`, false);
  } else if (saved.status === 'cancelled' || saved.status === 'cancelling') {
    progCard.classList.remove('hidden');
    setStatus('Cancelled. You can start over or try with different slides.', false);
  } else if (saved.status === 'error') {
    progCard.classList.remove('hidden');
    const done = (saved.results || []).length;
    const total = (saved.selectedPages || []).length;
    setStatus(`Resuming – ${done} of ${total} slides done, retrying failed ones…`);
    saved.status = 'running';
    currentRun.status = 'running';
    await saveCurrentRun();
    refreshActionButtons();
    if (!apiKey.value.trim().startsWith('sk-')) {
      saved.status = 'paused';
      currentRun.status = 'paused';
      await saveCurrentRun();
      setStatus(`Add your API key to resume (${done}/${total} slides done).`, false);
      refreshActionButtons();
      return;
    }
    await startProcessing({ resume: true });
  } else {
    if (!apiKey.value.trim().startsWith('sk-')) {
      saved.status = 'paused';
      currentRun.status = 'paused';
      await saveCurrentRun();
      progCard.classList.remove('hidden');
      setStatus(`Saved progress found. Add your API key to resume page ${getDisplayPageNumber(saved.currentPage || saved.from, saved.selectedPages)}.`, false);
      refreshActionButtons();
      return;
    }
    progCard.classList.remove('hidden');
    setStatus(`Resuming from page ${getDisplayPageNumber(saved.currentPage || saved.from, saved.selectedPages)}…`);
    await startProcessing({ resume: true });
  }
}

function hydrateLogsFromRun() {
  logFeed.innerHTML = '';
  clearLogs();
  for (const row of currentRun?.logs || []) addLog(row.id, row.msg, row.type);
}

function updateProgressUI() {
  if (!currentRun) return;
  const total = (currentRun.selectedPages || []).length;
  const done = (currentRun.results || []).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  barFill.style.width = pct + '%';
  pctEl.textContent = pct + '%';
}

function refreshActionButtons() {
  const hasRun = !!currentRun;
  pauseBtn.disabled = !hasRun || !['running', 'paused'].includes(currentRun?.status);
  pauseBtn.textContent = currentRun?.status === 'running' ? 'Pause' : 'Resume';
  cancelBtn.disabled = !hasRun || ['done', 'cancelled'].includes(currentRun?.status);
  cancelBtn.textContent = 'Cancel';
  resetBtn.disabled = !hasRun && !pdf;
  checkReady();
}

function bindDownload(blob, srcName) {
  dlBtn.onclick = () => {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u;
    a.download = srcName.replace(/\.pdf$/i, '') + '_explained.docx';
    a.click();
    URL.revokeObjectURL(u);
  };
}

function bindPdfDownload(blob, srcName) {
  pdfBtn.onclick = () => {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u;
    a.download = srcName.replace(/\.pdf$/i, '') + '_explained.pdf';
    a.click();
    URL.revokeObjectURL(u);
  };
}

async function resetCurrentRun() {
  pauseRequested = false;
  cancelRequested = false;
  activeClaudeController?.abort();
  activeClaudeController = null;
  isRunning = false;
  activeBlob = null;
  activePdfBlob = null;
  currentRun = null;
  pdf = null;
  pdfBuffer = null;
  pdfFileMeta = null;
  await deleteSavedRun();
  fileInput.value = '';
  fileBadge.classList.add('hidden');
  previewWrap.classList.add('hidden');
  closePageModal();
  logFeed.innerHTML = '';
  clearLogs();
  doneWrap.classList.add('hidden');
  removeGeneratedPreview();
  errBanner.classList.add('hidden');
  barFill.style.width = '0%';
  pctEl.textContent = '0%';
  setStatus('Ready for a new selection', false);
  refreshActionButtons();
  checkReady();
}

async function cancelCurrentRun() {
  pauseRequested = false;
  cancelRequested = true;
  if (currentRun) {
    currentRun.status = 'cancelled';
    currentRun.updatedAt = Date.now();
    await saveCurrentRun();
  }
  activeClaudeController?.abort();
  doneWrap.classList.add('hidden');
  setStatus('Cancelled. You can start over or try with different slides.', false);
  refreshActionButtons();
  cancelBtn.disabled = true;
}

async function saveCurrentRun() {
  if (!currentRun) return;
  currentRun.logs = (currentRun.logs || []).slice(-200);
  await idbSet(RUN_KEY, currentRun);
}

async function getSavedRun() { return idbGet(RUN_KEY); }
async function deleteSavedRun() { return idbDel(RUN_KEY); }

async function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbSet(key, value) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
