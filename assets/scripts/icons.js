// ── Icons ────────────────────────────────────────────────────────
// Line icons on a 24 px grid, drawn with the same stroke as the paper plane logo.
const ICONS = {
  plane: ['M3 11.5 21 3 13 21l-2.8-6.7L3 11.5Z', 'M10.2 14.3 21 3'],
  upload: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M12 18v-7', 'M9 14l3-3 3 3'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  'eye-off': ['M2 12s3.6-7 10-7c1.6 0 3 .4 4.3 1', 'M22 12s-3.6 7-10 7c-1.6 0-3-.4-4.3-1', 'M3 3l18 18'],
  sparkle: ['M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  play: ['M8 5v14l11-7z'],
  pause: ['M9 5v14', 'M15 5v14'],
  stop: ['M6 6l12 12', 'M18 6 6 18'],
  restart: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  alert: ['M12 3 2 21h20z', 'M12 10v4', 'M12 17.5v.5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v5', 'M14 11v5'],
  close: ['M6 6l12 12', 'M18 6 6 18']
};

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name] || []) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// Fills every <span data-icon="name"> placeholder in the page.
function renderStaticIcons(root = document) {
  for (const holder of root.querySelectorAll('[data-icon]')) {
    holder.replaceChildren(icon(holder.dataset.icon));
  }
}
