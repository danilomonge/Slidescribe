function setupUndoRedo() {
  const editables = Array.from(document.querySelectorAll('input:not([type=file]), textarea'));
  for (const el of editables) {
    primeFieldHistory(el);
    el.addEventListener('focus', () => primeFieldHistory(el));
    el.addEventListener('input', () => pushFieldSnapshot(el));
  }

  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    if (!(e.metaKey || e.ctrlKey)) return;
    if (isTextEditable(active)) {
      if (e.altKey) return;
      if (e.key.toLowerCase() !== 'z') return;

      e.preventDefault();
      if (e.shiftKey) redoField(active);
      else undoField(active);
      return;
    }
    if (e.key.toLowerCase() !== 'z') return;

    e.preventDefault();
    if (e.altKey || e.shiftKey) redoPageSelection();
    else undoPageSelection();
  });
}

function isTextEditable(el) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function primeFieldHistory(el) {
  if (!fieldHistory.has(el)) {
    fieldHistory.set(el, {
      stack: [captureFieldSnapshot(el)],
      index: 0,
      applying: false
    });
  }
}

function captureFieldSnapshot(el) {
  return {
    value: el.value,
    start: typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length,
    end: typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length
  };
}

function pushFieldSnapshot(el) {
  primeFieldHistory(el);
  const state = fieldHistory.get(el);
  if (state.applying) return;
  const snap = captureFieldSnapshot(el);
  const current = state.stack[state.index];
  if (current && current.value === snap.value && current.start === snap.start && current.end === snap.end) return;
  state.stack = state.stack.slice(0, state.index + 1);
  state.stack.push(snap);
  if (state.stack.length > 150) state.stack.shift();
  state.index = state.stack.length - 1;
}

function applyFieldSnapshot(el, snap) {
  const state = fieldHistory.get(el);
  if (state) state.applying = true;
  el.value = snap.value;
  if (typeof el.setSelectionRange === 'function') {
    const end = snap.value.length;
    el.setSelectionRange(end, end);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (state) state.applying = false;
}

function undoField(el) {
  primeFieldHistory(el);
  const state = fieldHistory.get(el);
  if (state.index <= 0) return;
  state.index -= 1;
  applyFieldSnapshot(el, state.stack[state.index]);
}

function redoField(el) {
  primeFieldHistory(el);
  const state = fieldHistory.get(el);
  if (state.index >= state.stack.length - 1) return;
  state.index += 1;
  applyFieldSnapshot(el, state.stack[state.index]);
}

function setFieldValue(el, value) {
  primeFieldHistory(el);
  el.value = value;
  if (typeof el.setSelectionRange === 'function') el.setSelectionRange(value.length, value.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
