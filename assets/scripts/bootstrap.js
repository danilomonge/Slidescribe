// ── Start ────────────────────────────────────────────────────────
renderStaticIcons();

languageSel.replaceChildren(...LANGUAGES.map(([value, label]) => el('option', { value, text: label })));
modelSel.replaceChildren(...Object.entries(MODELS).map(([id, model]) => el('option', { value: id, text: `${model.name}, ${model.description}` })));

const settings = loadSettings();
promptTxt.value = typeof settings.prompt === 'string' && settings.prompt.trim() ? settings.prompt : DEFAULT_PROMPT;
languageSel.value = LANGUAGES.some(([value]) => value === settings.language) ? settings.language : DEFAULT_LANGUAGE;
modelSel.value = MODELS[settings.model] ? settings.model : DEFAULT_MODEL;
if (['1.5', '2', '2.5'].includes(settings.scale)) scaleSel.value = settings.scale;
apiKey.value = readSessionKey();

// ── Upload ───────────────────────────────────────────────────────
dropZone.addEventListener('dragover', event => {
  event.preventDefault();
  if (!isRunning) dropZone.classList.add('over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('over');
  if (!isRunning) loadFile(event.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

// ── Settings ─────────────────────────────────────────────────────
apiKey.addEventListener('input', () => {
  writeSessionKey(apiKey.value.trim());
  refreshUI();
});
keyEye.addEventListener('click', () => {
  const show = apiKey.type === 'password';
  apiKey.type = show ? 'text' : 'password';
  keyEye.setAttribute('aria-pressed', String(show));
  keyEye.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
  keyEye.replaceChildren(icon(show ? 'eye-off' : 'eye'));
});
promptReset.addEventListener('click', () => {
  setFieldValue(promptTxt, DEFAULT_PROMPT);
  promptTxt.focus();
});
for (const control of [promptTxt, languageSel, modelSel, scaleSel]) {
  control.addEventListener(control === promptTxt ? 'input' : 'change', () => {
    saveSettings();
    refreshUI();
  });
}
pgFrom.addEventListener('input', () => { syncPageInputs(); refreshUI(); });
pgTo.addEventListener('input', () => { syncPageInputs(); refreshUI(); });
pgToReset.addEventListener('click', () => {
  setFieldValue(pgFrom, '');
  setFieldValue(pgTo, '');
  refreshUI();
});

// ── Run controls ─────────────────────────────────────────────────
runBtn.addEventListener('click', () => startProcessing());
pauseBtn.addEventListener('click', () => {
  if (isRunning) requestPause();
  else startProcessing({ resume: true });
});
cancelBtn.addEventListener('click', () => cancelRun());
resetBtn.addEventListener('click', () => startOver());
dlBtn.addEventListener('click', () => downloadExport('docx'));
pdfBtn.addEventListener('click', () => downloadExport('pdf'));

// ── Page viewer ──────────────────────────────────────────────────
pageModal.addEventListener('click', event => { if (event.target === pageModal) closePageModal(); });
pageModalClose.addEventListener('click', closePageModal);
document.addEventListener('keydown', event => {
  if (pageModal.classList.contains('hidden')) return;
  if (event.key === 'Escape') closePageModal();
  if (event.key === 'Tab') { event.preventDefault(); pageModalClose.focus(); }
});

// Leaving while pages are being explained loses the requests in flight.
window.addEventListener('beforeunload', event => {
  if (!isRunning) return;
  event.preventDefault();
  event.returnValue = '';
});

setupUndoRedo();
initPaperPlanes();
restoreSavedRun();
