// ── Exports and preview ──────────────────────────────────────────
// Results: { pg, b64, width, height, expl, status: 'ok' | 'truncated' | 'declined' | 'failed', note }

const ACCENT = '4f6fff';
const HEADING_COLORS = ['1e3a8a', '1e40af', '334155'];

function documentTitle(fileName) {
  return String(fileName || 'Document').replace(/\.pdf$/i, '');
}

function resultNote(result) {
  if (result.status === 'declined') return 'Claude declined to explain this page.';
  if (result.status === 'failed') return `This page could not be explained. ${result.note || ''}`.trim();
  if (result.status === 'truncated') return 'This explanation was cut short because it reached the length limit.';
  return '';
}

async function ensureImageSize(result) {
  if (result.width && result.height) return result;
  const img = await loadImage(`data:image/jpeg;base64,${result.b64}`);
  return { ...result, width: img.naturalWidth, height: img.naturalHeight };
}

function fitBox(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Word ─────────────────────────────────────────────────────────
async function buildDocx(rawResults, fileName) {
  const {
    Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
    LevelFormat, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType
  } = docx;
  const results = await Promise.all(rawResults.map(ensureImageSize));
  const title = documentTitle(fileName);
  const font = 'Georgia';
  const headingLevels = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  let listInstance = 0;

  const runs = (inline, extra = {}) => (inline || []).map(segment => new TextRun({
    text: segment.text,
    bold: segment.bold || extra.bold,
    italics: segment.italic || extra.italics,
    font: segment.code ? 'Consolas' : font,
    color: extra.color,
    size: extra.size
  }));

  const tableBlock = block => {
    const columns = Math.max(block.header.length, ...block.rows.map(row => row.length), 1);
    const border = { style: BorderStyle.SINGLE, color: 'c7cfe0', size: 4 };
    const cell = (inline, header) => new TableCell({
      width: { size: Math.floor(100 / columns), type: WidthType.PERCENTAGE },
      shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'eef2fd' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: runs(inline, header ? { bold: true, color: HEADING_COLORS[0] } : {}) })]
    });
    const pad = row => Array.from({ length: columns }, (_, idx) => row[idx] || []);
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [
        new TableRow({ tableHeader: true, children: pad(block.header).map(inline => cell(inline, true)) }),
        ...block.rows.map(row => new TableRow({ children: pad(row).map(inline => cell(inline, false)) }))
      ]
    });
  };

  const explanationBlocks = text => {
    const out = [];
    for (const block of parseMarkdown(text)) {
      if (block.type === 'heading') {
        out.push(new Paragraph({ heading: headingLevels[block.level - 1], children: runs(block.inline) }));
      } else if (block.type === 'paragraph') {
        out.push(new Paragraph({ spacing: { after: 120 }, children: runs(block.inline) }));
      } else if (block.type === 'list') {
        const instance = ++listInstance;
        for (const item of block.items) {
          out.push(new Paragraph({
            numbering: { reference: block.ordered ? 'numbers' : 'bullets', level: item.level, instance },
            spacing: { after: 60 },
            children: runs(item.inline)
          }));
        }
      } else if (block.type === 'table') {
        out.push(tableBlock(block), new Paragraph({ spacing: { after: 120 }, children: [] }));
      } else if (block.type === 'quote') {
        out.push(new Paragraph({
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, color: 'c7cfe0', size: 12, space: 8 } },
          spacing: { after: 120 },
          children: runs(block.inline, { italics: true })
        }));
      } else if (block.type === 'code') {
        out.push(new Paragraph({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'f3f4f6' },
          spacing: { after: 120 },
          children: block.text.split('\n').flatMap((line, idx) => [
            ...(idx ? [new TextRun({ break: 1 })] : []),
            new TextRun({ text: line, font: 'Consolas', size: 20 })
          ])
        }));
      }
    }
    return out;
  };

  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title })] }),
    new Paragraph({
      spacing: { after: 480 },
      children: [new TextRun({ text: `${results.length} ${results.length === 1 ? 'page' : 'pages'} explained by Claude`, color: '6b7280' })]
    })
  ];

  results.forEach((result, index) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: index > 0, children: [new TextRun({ text: `Page ${result.pg}` })] }));
    const box = fitBox(result.width, result.height, 620, 440);
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 240 },
      children: [new ImageRun({ data: base64ToBytes(result.b64), transformation: box, type: 'jpg' })]
    }));
    const note = resultNote(result);
    if (note) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: note, italics: true, color: '6b7280' })] }));
    if (result.expl) children.push(...explanationBlocks(result.expl));
  });

  const bulletLevels = ['•', '◦', '▪'].map((symbol, level) => ({
    level, format: LevelFormat.BULLET, text: symbol, alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } }
  }));
  const numberLevels = ['%1.', '%2.', '%3.'].map((text, level) => ({
    level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level], text,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360 + level * 360, hanging: 300 } } }
  }));

  const doc = new Document({
    creator: 'SlideScribe',
    title: `${title}, explained`,
    description: 'Page by page explanations generated by Claude',
    numbering: { config: [{ reference: 'bullets', levels: bulletLevels }, { reference: 'numbers', levels: numberLevels }] },
    styles: {
      default: { document: { run: { font, size: 22 }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font, size: 48, bold: true, color: ACCENT }, paragraph: { spacing: { after: 120 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font, size: 30, bold: true, color: ACCENT }, paragraph: { spacing: { before: 0, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font, size: 28, bold: true, color: HEADING_COLORS[0] }, paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font, size: 24, bold: true, color: HEADING_COLORS[1] }, paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font, size: 22, bold: true, color: HEADING_COLORS[2] }, paragraph: { spacing: { before: 160, after: 40 }, outlineLevel: 3 } }
      ]
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      children
    }]
  });
  return Packer.toBlob(doc);
}

// ── PDF ──────────────────────────────────────────────────────────
const PDF_FONT = 'DejaVuSerif';
const PDF_FONT_FILES = {
  normal: 'assets/fonts/DejaVuSerif.ttf',
  bold: 'assets/fonts/DejaVuSerif-Bold.ttf',
  italic: 'assets/fonts/DejaVuSerif-Italic.ttf',
  bolditalic: 'assets/fonts/DejaVuSerif-BoldItalic.ttf'
};
let pdfFontCache = null;

async function loadPdfFonts() {
  if (pdfFontCache) return pdfFontCache;
  if (location.protocol === 'file:') {
    throw new Error('PDF export needs the page to be served over http. Run "python3 -m http.server" in the project folder and open http://localhost:8000.');
  }
  const entries = await Promise.all(Object.entries(PDF_FONT_FILES).map(async ([style, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the PDF font (${url}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return [style, btoa(binary)];
  }));
  pdfFontCache = Object.fromEntries(entries);
  return pdfFontCache;
}

const PDF_REPLACEMENTS = { '✓': '+', '✔': '+', '☑': '+', '✗': '×', '✘': '×', '☐': '[ ]', ' ': ' ', '\t': '    ' };

function pdfSafeText(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (PDF_REPLACEMENTS[ch] !== undefined) { out += PDF_REPLACEMENTS[ch]; continue; }
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d || /\p{Extended_Pictographic}/u.test(ch)) continue;
    out += fontCovers(cp) ? ch : '?';
  }
  return out;
}

function fontCovers(cp) {
  const ranges = PDF_FONT_COVERAGE;
  let lo = 0, hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]) hi = mid - 1;
    else if (cp > ranges[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

async function buildPdf(rawResults, fileName) {
  const { jsPDF } = window.jspdf;
  const results = await Promise.all(rawResults.map(ensureImageSize));
  const fonts = await loadPdfFonts();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  for (const [style, data] of Object.entries(fonts)) {
    const file = `${PDF_FONT}-${style}.ttf`;
    pdf.addFileToVFS(file, data);
    pdf.addFont(file, PDF_FONT, style);
  }
  const title = documentTitle(fileName);
  pdf.setProperties({ title: `${title}, explained`, creator: 'SlideScribe', subject: 'Page by page explanations generated by Claude' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin - 14;
  const ink = [31, 41, 55];
  const muted = [107, 114, 128];
  const accent = [79, 111, 255];
  const headingColors = [[30, 58, 138], [30, 64, 175], [51, 65, 85]];
  let y = margin;

  const styleName = segment => (segment.bold ? (segment.italic ? 'bolditalic' : 'bold') : (segment.italic ? 'italic' : 'normal'));
  const setFont = (style, size) => { pdf.setFont(PDF_FONT, style); pdf.setFontSize(size); };
  const ensure = needed => { if (y + needed > bottom) { pdf.addPage(); y = margin; } };

  // Wraps styled segments into lines of tokens, measuring each word in its own style.
  const layout = (segments, width, size, force = {}) => {
    const lines = [];
    let line = [];
    let lineWidth = 0;
    const newLine = () => {
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) lineWidth -= line.pop().width;
      lines.push(line); line = []; lineWidth = 0;
    };
    for (const segment of segments) {
      const style = styleName({ bold: segment.bold || force.bold, italic: segment.italic || force.italic });
      const color = segment.code ? [55, 65, 81] : null;
      for (const part of pdfSafeText(segment.text).split(/(\s+)/)) {
        if (!part) continue;
        setFont(style, size);
        if (/^\s+$/.test(part)) {
          if (!line.length) continue;
          const w = pdf.getTextWidth(' ');
          line.push({ text: ' ', style, width: w, color }); lineWidth += w;
          continue;
        }
        let word = part;
        let w = pdf.getTextWidth(word);
        if (lineWidth + w > width && line.length) newLine();
        while (w > width) {
          let cut = word.length - 1;
          while (cut > 1 && pdf.getTextWidth(word.slice(0, cut)) > width) cut -= 1;
          line.push({ text: word.slice(0, cut), style, width: pdf.getTextWidth(word.slice(0, cut)), color });
          newLine();
          word = word.slice(cut);
          w = pdf.getTextWidth(word);
        }
        line.push({ text: word, style, width: w, color }); lineWidth += w;
      }
    }
    if (line.length) newLine();
    return lines;
  };

  const drawLines = (lines, x, size, lineHeight, color) => {
    for (const tokens of lines) {
      ensure(lineHeight);
      let cx = x;
      for (const token of tokens) {
        setFont(token.style, size);
        pdf.setTextColor(...(token.color || color));
        pdf.text(token.text, cx, y + size);
        cx += token.width;
      }
      y += lineHeight;
    }
  };

  const paragraph = (segments, { x = margin, width = contentWidth, size = 11, lineHeight = 16, color = ink, after = 8, force } = {}) => {
    drawLines(layout(segments, width, size, force), x, size, lineHeight, color);
    y += after;
  };

  const table = block => {
    const columns = Math.max(block.header.length, ...block.rows.map(row => row.length), 1);
    const colWidth = contentWidth / columns;
    const pad = 6;
    const drawRow = (cells, header) => {
      const size = 10;
      setFont(header ? 'bold' : 'normal', size);
      const wrapped = Array.from({ length: columns }, (_, idx) => pdf.splitTextToSize(pdfSafeText(inlineToPlainText(cells[idx] || [])) || ' ', colWidth - pad * 2));
      const height = Math.max(...wrapped.map(lines => lines.length)) * 13 + pad * 2;
      ensure(height);
      if (header) { pdf.setFillColor(238, 242, 253); pdf.rect(margin, y, contentWidth, height, 'F'); }
      pdf.setDrawColor(199, 207, 224);
      pdf.setLineWidth(0.6);
      wrapped.forEach((lines, idx) => {
        const x = margin + idx * colWidth;
        pdf.rect(x, y, colWidth, height);
        pdf.setTextColor(...(header ? headingColors[0] : ink));
        pdf.text(lines, x + pad, y + pad + 10, { lineHeightFactor: 1.3 });
      });
      y += height;
    };
    drawRow(block.header, true);
    block.rows.forEach(row => drawRow(row, false));
    y += 10;
  };

  const explanation = text => {
    for (const block of parseMarkdown(text)) {
      if (block.type === 'heading') {
        const size = [15, 13, 12][block.level - 1];
        ensure(size * 3);
        y += block.level === 1 ? 6 : 4;
        paragraph(block.inline, { size, lineHeight: size * 1.35, color: headingColors[block.level - 1], after: 4, force: { bold: true } });
      } else if (block.type === 'paragraph') {
        paragraph(block.inline);
      } else if (block.type === 'list') {
        block.items.forEach((item, idx) => {
          const indent = 14 + item.level * 16;
          const marker = block.ordered ? `${block.start + idx}.` : ['•', '◦', '▪'][item.level];
          const lines = layout(item.inline, contentWidth - indent - 14, 11);
          ensure(16);
          setFont('normal', 11);
          pdf.setTextColor(...muted);
          pdf.text(marker, margin + indent - 2, y + 11, { align: 'right' });
          drawLines(lines, margin + indent + 4, 11, 16, ink);
          y += 3;
        });
        y += 6;
      } else if (block.type === 'table') {
        table(block);
      } else if (block.type === 'quote') {
        const start = y;
        paragraph(block.inline, { x: margin + 14, width: contentWidth - 14, color: [55, 65, 81], force: { italic: true }, after: 0 });
        pdf.setDrawColor(199, 207, 224);
        pdf.setLineWidth(2);
        pdf.line(margin + 3, start + 2, margin + 3, y - 2);
        y += 8;
      } else if (block.type === 'code') {
        const lines = block.text.split('\n').flatMap(line => layout([{ text: line, bold: false, italic: false, code: true }], contentWidth - 16, 9.5));
        const height = Math.max(lines.length, 1) * 13 + 12;
        ensure(Math.min(height, bottom - margin));
        pdf.setFillColor(243, 244, 246);
        pdf.rect(margin, y, contentWidth, Math.min(height, bottom - y), 'F');
        y += 6;
        drawLines(lines, margin + 8, 9.5, 13, [55, 65, 81]);
        y += 12;
      }
    }
  };

  // Cover
  setFont('bold', 24);
  pdf.setTextColor(...accent);
  drawLines(layout([{ text: title, bold: true, italic: false, code: false }], contentWidth, 24), margin, 24, 30, accent);
  y += 4;
  paragraph([{ text: `${results.length} ${results.length === 1 ? 'page' : 'pages'} explained by Claude`, bold: false, italic: false, code: false }], { color: muted, after: 18 });

  results.forEach((result, index) => {
    if (index > 0) { pdf.addPage(); y = margin; }
    pdf.setDrawColor(...accent);
    pdf.setLineWidth(1.5);
    pdf.line(margin, y, margin + contentWidth, y);
    y += 10;
    paragraph([{ text: `Page ${result.pg}`, bold: true, italic: false, code: false }], { size: 17, lineHeight: 22, color: accent, after: 10 });

    const box = fitBox(result.width, result.height, contentWidth, pageHeight * 0.42);
    ensure(box.height + 16);
    pdf.addImage(`data:image/jpeg;base64,${result.b64}`, 'JPEG', margin + (contentWidth - box.width) / 2, y, box.width, box.height, undefined, 'FAST');
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.5);
    pdf.rect(margin + (contentWidth - box.width) / 2, y, box.width, box.height);
    y += box.height + 18;

    const note = resultNote(result);
    if (note) paragraph([{ text: note, bold: false, italic: true, code: false }], { color: muted, after: 10 });
    if (result.expl) explanation(result.expl);
  });

  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    setFont('normal', 8.5);
    pdf.setTextColor(...muted);
    pdf.text(`${page} / ${total}`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
  }
  return pdf.output('blob');
}

// ── On-screen preview ────────────────────────────────────────────
function renderGeneratedPreview(results) {
  removeGeneratedPreview();
  const card = el('section', { className: 'preview-doc', id: 'generatedPreview', 'aria-label': 'Preview of the explained document' });
  const head = el('div', { className: 'preview-doc-head' });
  head.append(el('h3', { text: 'Preview' }), el('div', { className: 'preview-doc-meta', text: `${results.length} ${results.length === 1 ? 'page' : 'pages'}` }));
  const pages = el('div', { className: 'doc-preview-pages' });
  for (const result of results) {
    const page = el('article', { className: 'doc-preview-page' });
    page.append(el('h4', { text: `Page ${result.pg}` }));
    const img = el('img', { className: 'doc-preview-shot', src: `data:image/jpeg;base64,${result.b64}`, alt: `Page ${result.pg}`, tabIndex: 0 });
    img.addEventListener('click', () => openImageModal(img.src, `Page ${result.pg}`));
    img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openImageModal(img.src, `Page ${result.pg}`); } });
    page.append(img);
    const note = resultNote(result);
    if (note) page.append(el('p', { className: 'doc-preview-note', text: note }));
    if (result.expl) page.append(renderMarkdown(result.expl));
    pages.append(page);
  }
  card.append(head, pages);
  doneWrap.append(card);
}

function removeGeneratedPreview() {
  $('generatedPreview')?.remove();
}

function renderMarkdown(text) {
  const root = el('div', { className: 'doc-preview-text' });
  for (const block of parseMarkdown(text)) {
    if (block.type === 'heading') {
      root.append(appendInline(el(block.level === 1 ? 'h5' : 'h6', { className: `md-h${block.level}` }), block.inline));
    } else if (block.type === 'paragraph') {
      root.append(appendInline(el('p'), block.inline));
    } else if (block.type === 'list') {
      const list = el(block.ordered ? 'ol' : 'ul');
      if (block.ordered && block.start !== 1) list.start = block.start;
      for (const item of block.items) list.append(appendInline(el('li', { className: item.level ? `md-level-${item.level}` : '' }), item.inline));
      root.append(list);
    } else if (block.type === 'table') {
      const table = el('table');
      const headRow = el('tr');
      block.header.forEach(inline => headRow.append(appendInline(el('th'), inline)));
      table.append(el('thead'));
      table.tHead.append(headRow);
      const body = el('tbody');
      block.rows.forEach(row => {
        const tr = el('tr');
        row.forEach(inline => tr.append(appendInline(el('td'), inline)));
        body.append(tr);
      });
      table.append(body);
      root.append(el('div', { className: 'md-table' }, [table]));
    } else if (block.type === 'quote') {
      root.append(appendInline(el('blockquote'), block.inline));
    } else if (block.type === 'code') {
      root.append(el('pre', {}, [el('code', { text: block.text })]));
    }
  }
  return root;
}

function appendInline(parent, inline) {
  for (const segment of inline || []) {
    let node = document.createTextNode(segment.text);
    if (segment.code) node = el('code', {}, [node]);
    if (segment.italic) node = el('em', {}, [node]);
    if (segment.bold) node = el('strong', {}, [node]);
    parent.append(node);
  }
  return parent;
}
