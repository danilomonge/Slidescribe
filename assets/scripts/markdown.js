// ── Markdown ─────────────────────────────────────────────────────
// A small parser for the Markdown Claude writes in explanations. The Word,
// PDF and on-screen previews all render the same block list, so the three
// outputs always agree.
//
// Blocks:
//   { type: 'heading', level: 1..3, inline }
//   { type: 'paragraph', inline }
//   { type: 'list', ordered, start, items: [{ inline, level }] }
//   { type: 'table', header: [inline], rows: [[inline]] }
//   { type: 'quote', inline }
//   { type: 'code', text }
// Inline: [{ text, bold, italic, code }]

function parseMarkdown(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flushParagraph(); continue; }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i += 1; }
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushParagraph(); continue; }

    const heading = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: Math.min(heading[1].length, 3), inline: parseInline(stripWrappingBold(heading[2])) });
      continue;
    }

    if (isTableRow(trimmed) && isTableDivider(lines[i + 1] || '')) {
      flushParagraph();
      const header = splitTableRow(trimmed).map(parseInline);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(splitTableRow(lines[i].trim()).map(parseInline));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const listItem = matchListItem(line);
    if (listItem) {
      flushParagraph();
      const list = { type: 'list', ordered: listItem.ordered, start: listItem.number || 1, items: [] };
      const baseIndent = listItem.indent;
      while (i < lines.length) {
        const item = matchListItem(lines[i]);
        if (!item) {
          // A wrapped continuation line belongs to the previous item.
          const next = lines[i].trim();
          if (next && list.items.length && /^\s{2,}/.test(lines[i]) && !/^#{1,6}\s/.test(next)) {
            list.items[list.items.length - 1].raw += ' ' + next;
            i += 1;
            continue;
          }
          break;
        }
        if (item.indent <= baseIndent && item.ordered !== list.ordered) break;
        const level = Math.max(0, Math.min(2, Math.round((item.indent - baseIndent) / 2)));
        list.items.push({ raw: item.text, level });
        i += 1;
      }
      i -= 1;
      list.items = list.items.map(item => ({ inline: parseInline(item.raw), level: item.level }));
      blocks.push(list);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { quote.push(lines[i].trim().replace(/^>\s?/, '')); i += 1; }
      i -= 1;
      blocks.push({ type: 'quote', inline: parseInline(quote.join(' ')) });
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

function matchListItem(line) {
  const match = String(line).match(/^(\s*)(?:([-*+•])|(\d{1,3})[.)])\s+(.*)$/);
  if (!match) return null;
  const indent = match[1].replace(/\t/g, '    ').length;
  return { indent, ordered: !!match[3], number: match[3] ? parseInt(match[3], 10) : null, text: match[4].trim() };
}

function stripWrappingBold(text) {
  const match = text.match(/^\*\*(.+)\*\*$/) || text.match(/^__(.+)__$/);
  return match ? match[1] : text;
}

function isTableRow(line) {
  return line.includes('|') && /\|.*\|/.test(line.startsWith('|') ? line : '|' + line);
}

function isTableDivider(line) {
  const cells = splitTableRow(line.trim());
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

// Inline formatting: **bold**, __bold__, *italic*, _italic_, `code`.
// Underscores inside words (snake_case) and lone asterisks stay literal.
function parseInline(text) {
  const source = String(text || '').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1');
  const segments = [];
  let bold = false;
  let italic = false;
  let buffer = '';

  const push = (value, style = {}) => {
    if (!value) return;
    const segment = { text: value, bold: style.code ? false : bold, italic: style.code ? false : italic, code: !!style.code };
    const last = segments[segments.length - 1];
    if (last && last.bold === segment.bold && last.italic === segment.italic && last.code === segment.code) last.text += value;
    else segments.push(segment);
  };
  const flush = () => { push(buffer); buffer = ''; };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    const prev = source[i - 1];

    if (ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i) { flush(); push(source.slice(i + 1, end), { code: true }); i = end; continue; }
    }

    if ((ch === '*' || ch === '_') && next === ch) {
      const underscore = ch === '_';
      const closes = bold && !/\s/.test(prev || ' ') && (!underscore || !isWordChar(source[i + 2]));
      const opens = !bold && (!underscore || !isWordChar(prev)) && !/\s/.test(source[i + 2] || ' ')
        && source.indexOf(ch + ch, i + 3) > i + 2;
      if (closes || opens) { flush(); bold = !bold; i += 1; continue; }
      buffer += ch + ch;
      i += 1;
      continue;
    }

    if (ch === '*' || ch === '_') {
      const underscore = ch === '_';
      const closes = italic && !/\s/.test(prev || ' ') && (!underscore || !isWordChar(next));
      const opens = !italic && (!underscore || !isWordChar(prev)) && next && !/\s/.test(next)
        && hasClosingMarker(source, ch, i + 1);
      if (closes || opens) { flush(); italic = !italic; continue; }
    }

    buffer += ch;
  }
  flush();
  return segments.length ? segments : [{ text: '', bold: false, italic: false, code: false }];
}

function hasClosingMarker(source, marker, from) {
  for (let j = from; j < source.length; j++) {
    if (source[j] !== marker) continue;
    if (source[j + 1] === marker) { j += 1; continue; }
    if (!/\s/.test(source[j - 1]) && (marker === '*' || !isWordChar(source[j + 1]))) return true;
  }
  return false;
}

function isWordChar(ch) {
  return !!ch && /[\p{L}\p{N}]/u.test(ch);
}

function inlineToPlainText(inline) {
  return (inline || []).map(segment => segment.text).join('');
}
