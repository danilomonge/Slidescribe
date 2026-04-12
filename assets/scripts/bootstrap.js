// ── upload ──────────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('over'); load(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => load(fileInput.files[0]));

apiKey.value = sessionStorage.getItem(API_KEY_SESSION) || '';
apiKey.addEventListener('input', () => {
  sessionStorage.setItem(API_KEY_SESSION, apiKey.value);
  checkReady();
});
promptClear.addEventListener('click', () => {
  setFieldValue(promptTxt, '');
  promptTxt.focus();
  if (typeof promptTxt.setSelectionRange === 'function') promptTxt.setSelectionRange(0, 0);
});
pgToReset.addEventListener('click', () => {
  setFieldValue(pgTo, '');
  pgTo.blur();
  syncPageInputs('to');
});
pgFrom.addEventListener('input', () => syncPageInputs('from'));
pgTo.addEventListener('input', () => syncPageInputs('to'));
runBtn.addEventListener('click', () => startProcessing());
pauseBtn.addEventListener('click', () => {
  if (isRunning) requestPause();
  else if (currentRun?.status === 'paused') startProcessing({ resume: true });
});
cancelBtn.addEventListener('click', async () => { await cancelCurrentRun(); });
resetBtn.addEventListener('click', async () => { await resetCurrentRun(); });
keyEye.addEventListener('click', () => {
  const show = apiKey.type === 'password';
  apiKey.type = show ? 'text' : 'password';
  keyEye.textContent = show ? '🙈' : '👁';
});
pageModal.addEventListener('click', e => {
  if (e.target === pageModal) closePageModal();
});
pageModalClose.addEventListener('click', closePageModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !pageModal.classList.contains('hidden')) closePageModal();
});
setupUndoRedo();
initPaperPlanes();

restoreSavedRun();
