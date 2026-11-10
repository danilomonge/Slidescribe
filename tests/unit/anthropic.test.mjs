import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './load-scripts.mjs';

const run = loadScripts(['assets/scripts/config.js', 'assets/scripts/anthropic.js']);
const headers = (values = {}) => ({ get: name => values[name.toLowerCase()] ?? null });
const classify = (status, payload = {}, h = {}) => {
  const fn = run('classifyApiError');
  const error = fn(status, payload, headers(h));
  return { kind: error.kind, retryable: error.retryable, fatal: error.fatal, retryAfterMs: error.retryAfterMs, message: error.message };
};

test('text is read from every text block, skipping thinking and fallback blocks', () => {
  const extract = run('extractText');
  const data = { content: [
    { type: 'thinking', thinking: '' },
    { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
    { type: 'text', text: '# Title' },
    { type: 'text', text: 'Body' }
  ] };
  assert.equal(extract(data), '# Title\n\nBody');
  assert.equal(extract({ content: [{ type: 'thinking', thinking: '' }] }), '');
  assert.equal(extract({}), '');
});

test('errors are classified as retryable, page level or fatal', () => {
  assert.deepEqual([classify(401).kind, classify(401).fatal], ['auth', true]);
  assert.equal(classify(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }).kind, 'billing');
  assert.equal(classify(403).kind, 'permission');
  assert.equal(classify(404).kind, 'model');
  assert.deepEqual([classify(429).kind, classify(429).retryable], ['rate_limit', true]);
  assert.equal(classify(529).kind, 'overloaded');
  assert.equal(classify(500).kind, 'server');
  assert.equal(classify(503).retryable, true);
  const page = classify(400, { error: { type: 'invalid_request_error', message: 'image too large' } });
  assert.deepEqual([page.kind, page.retryable, page.fatal], ['invalid_request', false, false]);
  assert.equal(classify(413).kind, 'invalid_request');
});

test('retry-after is honoured, in seconds or as a date', () => {
  assert.equal(classify(429, {}, { 'retry-after': '7' }).retryAfterMs, 7000);
  assert.equal(classify(429, {}, { 'retry-after': '0' }).retryAfterMs, 0);
  assert.equal(classify(429).retryAfterMs, null);
  const delay = run('retryDelayMs');
  assert.equal(delay({ retryAfterMs: 5000 }, 1), 5000);
  assert.equal(delay({ retryAfterMs: 600000 }, 1), 60000);
  const first = delay({ retryAfterMs: null }, 1);
  assert.ok(first >= 2000 && first <= 2500, String(first));
  assert.ok(delay({ retryAfterMs: null }, 10) <= 60000);
});

test('cost uses the price list per million tokens', () => {
  const cost = run('costUsd');
  assert.equal(cost('claude-sonnet-5-5', { input: 1e6, output: 1e6 }), 12);
  assert.equal(cost('claude-haiku-5-5', { input: 2e6, output: 0 }), 0.2);
  assert.equal(cost('unknown-model', { input: 1e6, output: 1e6 }), 0);
  const estimate = run('estimateRunCost')('claude-sonnet-5-5', 80, 1440, 1080);
  assert.ok(estimate > 1 && estimate < 2, String(estimate));
  const format = run('formatUsd');
  assert.deepEqual([format(0), format(0.004), format(1.234)], ['$0.00', '< $0.01', '$1.23']);
});

test('image tokens are capped at the high resolution limit', () => {
  const tokens = run('imageTokens');
  assert.equal(tokens(1440, 1080), 2074);
  assert.equal(tokens(2576, 2576), 4784);
});

test('only Sonnet and Opus use server side fallback', () => {
  const models = run('MODELS');
  assert.equal(models['claude-haiku-5-5'].serverFallback, false);
  assert.equal(models['claude-sonnet-5-5'].serverFallback, true);
  assert.equal(models['claude-opus-5-5'].serverFallback, true);
  assert.equal(run('DEFAULT_MODEL'), 'claude-sonnet-5-5');
  assert.equal(run('API_VERSION'), '2026-10-21');
});
