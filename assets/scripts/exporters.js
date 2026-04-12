// ── Build docx ───────────────────────────────────────────────────
async function buildDocx(results, srcName) {
  const {Document,Packer,Paragraph,TextRun,ImageRun,AlignmentType,HeadingLevel,BorderStyle,PageBreak} = docx;
  const title = srcName.replace(/\.pdf$/i,'');
  const pageOrder = currentRun?.selectedPages?.length ? currentRun.selectedPages : results.map(item => item.pg);
  const ch = [
    new Paragraph({spacing:{before:0,after:320},children:[new TextRun({text:title+' — Explained',bold:true,size:40,color:'6c8fff',font:'Georgia'})]}),
    new Paragraph({spacing:{after:640},children:[new TextRun({text:`${results.length} pages · AI-generated explanations`,size:20,color:'888888',font:'Georgia'})]})
  ];
  for (let i=0;i<results.length;i++) {
    const {pg,b64,expl}=results[i];
    ch.push(new Paragraph({spacing:{before:i?160:0,after:140},border:{bottom:{style:BorderStyle.THICK,size:8,color:'6c8fff',space:5}},children:[new TextRun({text:`Page ${getDisplayPageNumber(pg, pageOrder)}`,bold:true,size:26,color:'6c8fff',font:'Georgia'})]}));
    try {
      const bin=atob(b64),arr=new Uint8Array(bin.length);
      for(let j=0;j<bin.length;j++) arr[j]=bin.charCodeAt(j);
      ch.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:100,after:235},children:[new ImageRun({data:arr,transformation:{width:640,height:460},type:'jpg'})]}));
    } catch(_) {}
    ch.push(
      new Paragraph({spacing:{before:110,after:230},border:{bottom:{style:BorderStyle.SINGLE,size:2,color:'dddddd',space:2}},children:[new TextRun({text:'Explanation',size:16,color:'888888',font:'Georgia',italics:true})]}),
      ...parseText(expl)
    );
    if (i<results.length-1) ch.push(new Paragraph({spacing:{before:280},children:[new PageBreak()]}));
  }
  const doc = new Document({
    styles:{
      default:{document:{run:{font:'Georgia',size:22}}},
      paragraphStyles:[
        {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:30,bold:true,font:'Georgia',color:'1e3a8a'},paragraph:{spacing:{before:110,after:28},outlineLevel:0}},
        {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:24,bold:true,font:'Georgia',color:'1e40af'},paragraph:{spacing:{before:40,after:0},outlineLevel:1}},
        {id:'Heading3',name:'Heading 3',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:22,bold:true,font:'Georgia'},paragraph:{spacing:{before:40,after:0},outlineLevel:2}}
      ]
    },
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,right:1134,bottom:1134,left:1134}}},children:ch}]
  });
  return await Packer.toBlob(doc);
}

async function buildPdf(results, srcName) {
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdfDoc.internal.pageSize.getWidth();
  const pageHeight = pdfDoc.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const title = srcName.replace(/\.pdf$/i, '') + ' — Explained';
  const bottomLimit = pageHeight - margin;
  const pageOrder = currentRun?.selectedPages?.length ? currentRun.selectedPages : results.map(item => item.pg);

  const addNewPdfPage = () => {
    pdfDoc.addPage();
    return margin;
  };

  const ensureSpace = (y, needed) => {
    if (y + needed <= bottomLimit) return y;
    return addNewPdfPage();
  };

  const drawWrappedText = (text, x, y, options = {}) => {
    const {
      size = 12,
      style = 'normal',
      color = [30, 41, 59],
      lineHeight = 16,
      width = contentWidth
    } = options;

    pdfDoc.setFont('times', style);
    pdfDoc.setFontSize(size);
    pdfDoc.setTextColor(...color);
    const wrapped = pdfDoc.splitTextToSize(text || ' ', width);
    y = ensureSpace(y, wrapped.length * lineHeight);
    pdfDoc.text(wrapped, x, y);
    return y + wrapped.length * lineHeight;
  };

  const drawPdfTable = (tableLines, startY) => {
    const rows = tableLines.map(splitMarkdownRow);
    const header = rows[0];
    const body = rows.slice(2);
    const colCount = Math.max(header.length, 1);
    const colWidth = contentWidth / colCount;
    const padX = 8;
    const padY = 7;
    let yPos = startY;

    const drawRow = (cells, options = {}) => {
      const { headerRow = false } = options;
      const cellData = Array.from({ length: colCount }, (_, idx) => cells[idx] || '');
      const lineHeight = headerRow ? 15 : 14;
      const fontSize = headerRow ? 11.5 : 11;
      const cellLines = cellData.map(cell => pdfDoc.splitTextToSize(cell || ' ', colWidth - padX * 2));
      const rowHeight = Math.max(...cellLines.map(lines => lines.length * lineHeight), lineHeight) + padY * 2;
      yPos = ensureSpace(yPos, rowHeight + 2);

      if (headerRow) {
        pdfDoc.setFillColor(232, 238, 252);
        pdfDoc.rect(margin, yPos, contentWidth, rowHeight, 'F');
      }

      for (let c = 0; c < colCount; c++) {
        const x = margin + c * colWidth;
        pdfDoc.setDrawColor(180, 191, 214);
        pdfDoc.setLineWidth(0.8);
        pdfDoc.rect(x, yPos, colWidth, rowHeight);
        pdfDoc.setFont('times', headerRow ? 'bold' : 'normal');
        pdfDoc.setFontSize(fontSize);
        pdfDoc.setTextColor(...(headerRow ? [30, 58, 138] : [45, 55, 72]));
        pdfDoc.text(cellLines[c], x + padX, yPos + padY + lineHeight - 2);
      }

      yPos += rowHeight;
    };

    drawRow(header, { headerRow: true });
    for (const row of body) drawRow(row);
    return yPos + 10;
  };

  let y = margin + 4;
  y = drawWrappedText(title, margin, y, { size: 24, style: 'bold', color: [108, 143, 255], lineHeight: 28 });
  y = drawWrappedText(`${results.length} pages · AI-generated explanations`, margin, y + 6, { size: 11, color: [136, 136, 136], lineHeight: 14 });

  for (let i = 0; i < results.length; i++) {
    const { pg, b64, expl } = results[i];
    y = ensureSpace(y + 26, 24);
    if (i > 0) y += 10;

    pdfDoc.setDrawColor(108, 143, 255);
    pdfDoc.setLineWidth(2);
    pdfDoc.line(margin, y, margin + contentWidth, y);
    y += 24;

    y = drawWrappedText(`Page ${getDisplayPageNumber(pg, pageOrder)}`, margin, y, { size: 18, style: 'bold', color: [108, 143, 255], lineHeight: 22 });
    y += 10;

    try {
      const src = `data:image/jpeg;base64,${b64}`;
      const props = pdfDoc.getImageProperties(src);
      const imgMaxWidth = contentWidth;
      const imgMaxHeight = 370;
      const scale = Math.min(imgMaxWidth / props.width, imgMaxHeight / props.height);
      const imgWidth = props.width * scale;
      const imgHeight = props.height * scale;
      y = ensureSpace(y, imgHeight + 20);
      const imgX = margin + (contentWidth - imgWidth) / 2;
      pdfDoc.addImage(src, 'JPEG', imgX, y, imgWidth, imgHeight, undefined, 'FAST');
      y += imgHeight + 62;
    } catch (_) {}

    y = drawWrappedText('Explanation', margin, y, { size: 12, style: 'italic', color: [136, 136, 136], lineHeight: 16 });
    pdfDoc.setDrawColor(221, 221, 221);
    pdfDoc.setLineWidth(1);
    pdfDoc.line(margin, y + 4, margin + contentWidth, y + 4);
    y += 78;

    const lines = normalizeExplanationLines(expl);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const trimmed = lines[lineIndex].trim();
      if (!trimmed) {
        y += 1;
        continue;
      }

      if (isMarkdownTableStart(lines, lineIndex)) {
        const tableLines = [lines[lineIndex], lines[lineIndex + 1]];
        let j = lineIndex + 2;
        while (j < lines.length && isMarkdownTableRow(lines[j])) {
          tableLines.push(lines[j]);
          j += 1;
        }
        y = drawPdfTable(tableLines, y);
        lineIndex = j - 1;
        continue;
      }

      if (/^# /.test(trimmed)) {
        y = drawWrappedText(trimmed.replace(/^# /, ''), margin, y, { size: 20, style: 'bold', color: [30, 58, 138], lineHeight: 24 });
        y += 6;
        continue;
      }
      if (/^## /.test(trimmed)) {
        y = drawWrappedText(trimmed.replace(/^## /, ''), margin, y, { size: 16, style: 'bold', color: [30, 64, 175], lineHeight: 20 });
        y += 0;
        continue;
      }
      if (/^### /.test(trimmed)) {
        y = drawWrappedText(trimmed.replace(/^### /, ''), margin, y, { size: 14, style: 'bold', color: [51, 65, 85], lineHeight: 18 });
        y += 0;
        continue;
      }

      const plain = stripBoldMarkers(trimmed);
      y = drawWrappedText(plain, margin, y, { size: 12, style: 'normal', color: [45, 55, 72], lineHeight: 15 });
      y += /^[•*-]\s/.test(trimmed) ? 1 : 2;
    }

    if (i < results.length - 1) {
      pdfDoc.addPage();
      y = margin;
    }
  }

  return pdfDoc.output('blob');
}

function parseText(text) {
  const {Paragraph,TextRun,HeadingLevel}=docx;
  const lines = normalizeExplanationLines(text);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) {
      out.push(new Paragraph({spacing:{after:18},children:[new TextRun('')]}));
      continue;
    }

    if (isMarkdownTableStart(lines, i)) {
      const tableLines = [lines[i], lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && isMarkdownTableRow(lines[j])) {
        tableLines.push(lines[j]);
        j += 1;
      }
      out.push(buildDocxTable(tableLines));
      i = j - 1;
      continue;
    }

    const h1=t.match(/^# (.+)/),h2=t.match(/^## (.+)/),h3=t.match(/^### (.+)/);
    if (h1) {
      out.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:stripBoldMarkers(h1[1]),bold:true,size:30,color:'1e3a8a',font:'Georgia'})]}));
      continue;
    }
    if (h2) {
      out.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:stripBoldMarkers(h2[1]),bold:true,size:24,color:'1e40af',font:'Georgia'})]}));
      continue;
    }
    if (h3) {
      out.push(new Paragraph({heading:HeadingLevel.HEADING_3,children:[new TextRun({text:stripBoldMarkers(h3[1]),bold:true,size:22,font:'Georgia'})]}));
      continue;
    }
    out.push(new Paragraph({spacing:{after:/^[•*-]\s/.test(t)?54:34},children:runs(t)}));
  }

  return out;
}
function runs(t) {
  const {TextRun}=docx;
  return inlineMarkdownSegments(t).map(seg => new TextRun({
    text: seg.text,
    bold: !!seg.bold,
    font: 'Georgia',
    size: 22
  }));
}

function isMarkdownTableStart(lines, index) {
  return isMarkdownTableRow(lines[index]) && isMarkdownTableDivider(lines[index + 1] || '');
}

function isMarkdownTableRow(line) {
  const trimmed = (line || '').trim();
  return trimmed.includes('|') && /^(\|?.+\|.+\|?.*)$/.test(trimmed);
}

function isMarkdownTableDivider(line) {
  const cells = splitMarkdownRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitMarkdownRow(line) {
  return (line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => stripBoldMarkers(cell.trim()));
}

function buildDocxTable(lines) {
  const {Table,TableRow,TableCell,Paragraph,TextRun,WidthType,BorderStyle,ShadingType,VerticalAlign} = docx;
  const rows = lines.map(splitMarkdownRow);
  const header = rows[0];
  const body = rows.slice(2);
  const colCount = header.length;
  const widthPct = Math.floor(100 / Math.max(colCount, 1));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, color: '3b4252', size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: '3b4252', size: 1 },
      left: { style: BorderStyle.SINGLE, color: '3b4252', size: 1 },
      right: { style: BorderStyle.SINGLE, color: '3b4252', size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, color: '3b4252', size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, color: '3b4252', size: 1 }
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map(cell => new TableCell({
          width: { size: widthPct, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'e8eefc' },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [new TextRun({ text: cell, bold: true, font: 'Georgia', size: 22, color: '1e3a8a' })]
            })
          ]
        }))
      }),
      ...body.map(row => new TableRow({
        children: Array.from({ length: colCount }, (_, idx) => new TableCell({
          width: { size: widthPct, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              spacing: { before: 50, after: 50 },
              children: runs(row[idx] || '')
            })
          ]
        }))
      }))
    ]
  });
}

function renderGeneratedPreview(results, srcName) {
  removeGeneratedPreview();
  const card = document.createElement('div');
  card.className = 'preview-doc';
  card.id = 'generatedPreview';
  const title = srcName.replace(/\.pdf$/i, '');
  const pageOrder = currentRun?.selectedPages?.length ? currentRun.selectedPages : results.map(item => item.pg);
  card.innerHTML = `
    <div class="preview-doc-head">
      <h3>Generated Preview</h3>
      <div class="preview-doc-meta">${results.length} page${results.length===1?'':'s'} ready</div>
    </div>
    <div class="doc-preview-pages"></div>
  `;
  const pagesWrap = card.querySelector('.doc-preview-pages');
  for (const item of results) {
    const displayPage = getDisplayPageNumber(item.pg, pageOrder);
    const page = document.createElement('div');
    page.className = 'doc-preview-page';
    page.innerHTML = `
      <h4>${esc(title)} · Page ${displayPage}</h4>
      <img class="doc-preview-shot" src="data:image/jpeg;base64,${item.b64}" alt="Page ${displayPage}">
      <div class="doc-preview-text">${formatPreviewText(item.expl)}</div>
    `;
    const img = page.querySelector('.doc-preview-shot');
    img.addEventListener('click', () => openImageModal(img.src, `Generated Preview · Page ${displayPage}`));
    pagesWrap.appendChild(page);
  }
  doneWrap.appendChild(card);
}

function removeGeneratedPreview() {
  const existing = $('generatedPreview');
  if (existing) existing.remove();
}

function formatPreviewText(text) {
  return normalizeExplanationLines(text)
    .map(line => {
      const raw = line.trim();
      const t = esc(raw);
      if (!t) return '<div class="doc-preview-gap"></div>';
      if (/^# /.test(raw)) return `<h1>${esc(stripBoldMarkers(raw.replace(/^# /, '')))}</h1>`;
      if (/^## /.test(raw)) return `<h2>${esc(stripBoldMarkers(raw.replace(/^## /, '')))}</h2>`;
      if (/^### /.test(raw)) return `<h3>${esc(stripBoldMarkers(raw.replace(/^### /, '')))}</h3>`;
      return `<p>${inlineMarkdownToHtml(raw)}</p>`;
    })
    .join('');
}

function normalizeExplanationLines(text) {
  return text
    .split('\n')
    .map(line => normalizeExplanationLine(line))
    .filter(line => line !== null);
}

function normalizeExplanationLine(line) {
  let trimmed = line.trim();
  if (!trimmed) return '';
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return null;

  trimmed = trimmed
    .replace(/^(#{1,3})\s+\*\*\s*(.+?)\s*\*\*$/, '$1 $2')
    .replace(/^(#{1,3})\s+\*\*(.+)$/, '$1 $2')
    .replace(/^(#{1,3})\s+(.+?)\*\*$/, '$1 $2')
    .replace(/^\*\*\s*(.+?)\s*\*\*$/, '$1')
    .replace(/^\*\*(.+)$/, '$1')
    .replace(/^(.+)\*\*$/, '$1');

  return trimmed;
}

function stripBoldMarkers(text) {
  return text.replace(/\*\*/g, '').trim();
}

function inlineMarkdownSegments(text) {
  const parts = String(text).split('**');
  return parts
    .map((part, idx) => ({
      text: part,
      bold: idx % 2 === 1 && idx < parts.length - 1
    }))
    .filter(seg => seg.text);
}

function inlineMarkdownToHtml(text) {
  return inlineMarkdownSegments(text)
    .map(seg => seg.bold ? `<strong>${esc(seg.text)}</strong>` : esc(seg.text))
    .join('');
}
