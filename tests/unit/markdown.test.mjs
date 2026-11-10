import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './load-scripts.mjs';

const run = loadScripts(['assets/scripts/markdown.js']);
const parse = text => JSON.parse(JSON.stringify(run(`parseMarkdown(${JSON.stringify(text)})`)));
const inline = text => JSON.parse(JSON.stringify(run(`parseInline(${JSON.stringify(text)})`)));
const plain = segments => segments.map(s => s.text).join('');

test('headings keep their level up to 3 and drop wrapping bold', () => {
  const blocks = parse('# Title\n## **Sub**\n#### Deep');
  assert.deepEqual(blocks.map(b => [b.type, b.level, plain(b.inline)]), [
    ['heading', 1, 'Title'], ['heading', 2, 'Sub'], ['heading', 3, 'Deep']
  ]);
});

test('consecutive lines join into one paragraph, blank lines split paragraphs', () => {
  const blocks = parse('first line\nsame paragraph\n\nsecond');
  assert.equal(blocks.length, 2);
  assert.equal(plain(blocks[0].inline), 'first line same paragraph');
});

test('bullet and numbered lists, with nesting and start number', () => {
  const [bullets, numbers] = parse('- one\n- two\n  - nested\n\n3. three\n4. four');
  assert.equal(bullets.type, 'list');
  assert.equal(bullets.ordered, false);
  assert.deepEqual(bullets.items.map(i => [plain(i.inline), i.level]), [['one', 0], ['two', 0], ['nested', 1]]);
  assert.equal(numbers.ordered, true);
  assert.equal(numbers.start, 3);
  assert.equal(numbers.items.length, 2);
});

test('tables need a divider row', () => {
  const [table] = parse('| A | B |\n|---|:---:|\n| 1 | **2** |');
  assert.equal(table.type, 'table');
  assert.deepEqual(table.header.map(plain), ['A', 'B']);
  assert.equal(table.rows[0][1][0].bold, true);
  assert.equal(parse('a | b')[0].type, 'paragraph');
});

test('horizontal rules are dropped, quotes and code blocks kept', () => {
  const blocks = parse('---\n> quoted\n```\nx = 1\n```');
  assert.deepEqual(blocks.map(b => b.type), ['quote', 'code']);
  assert.equal(blocks[1].text, 'x = 1');
});

test('inline bold, italic and code', () => {
  const segs = inline('a **bold** and *italic* and __b2__ and _i2_ and `x*y`');
  assert.deepEqual(segs.filter(s => s.bold).map(s => s.text), ['bold', 'b2']);
  assert.deepEqual(segs.filter(s => s.italic).map(s => s.text), ['italic', 'i2']);
  assert.deepEqual(segs.filter(s => s.code).map(s => s.text), ['x*y']);
});

test('literal asterisks and underscores stay as text', () => {
  assert.equal(plain(inline('2 * 3 * 4 = 24')), '2 * 3 * 4 = 24');
  assert.equal(plain(inline('snake_case_name and file_name.py')), 'snake_case_name and file_name.py');
  // CommonMark reads __init__ as bold "init"; code spans keep it literal.
  assert.equal(plain(inline('`__init__`')), '__init__');
  assert.equal(plain(inline('**unclosed bold')), '**unclosed bold');
  assert.ok(inline('snake_case_name').every(s => !s.italic));
});

test('links keep their text', () => {
  assert.equal(plain(inline('see [the docs](https://example.com) now')), 'see the docs now');
});
