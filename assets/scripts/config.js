// ── Configuration ────────────────────────────────────────────────
// Everything that may need tuning lives here: models and prices, API limits,
// retry policy and the default prompt.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';

// Server-side fallback: when a model's safety classifiers decline a request,
// the API retries it on a recommended fallback model inside the same call.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Prices in USD per million tokens (input, output), from Anthropic's price list.
const MODELS = {
  'claude-haiku-5-5': {
    name: 'Claude Haiku 5.5',
    description: 'fastest, lowest cost',
    input: 0.10,
    output: 0.50,
    serverFallback: false
  },
  'claude-sonnet-5-5': {
    name: 'Claude Sonnet 5.5',
    description: 'recommended',
    input: 2,
    output: 10,
    serverFallback: true
  },
  'claude-opus-5-5': {
    name: 'Claude Opus 5.5',
    description: 'highest quality',
    input: 4,
    output: 20,
    serverFallback: true
  }
};
const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Request settings. Thinking tokens count towards max_tokens, so the limit is
// generous; an explanation itself is usually well under 2,000 tokens.
const MAX_TOKENS = 16000;
const EFFORT = 'medium';

// Processing.
const CONCURRENCY = 3;            // pages explained in parallel
const MAX_ATTEMPTS = 6;           // per page, for temporary errors
const RETRY_BASE_MS = 2000;       // first retry delay, doubled on each attempt
const RETRY_MAX_MS = 60000;
const REQUEST_TIMEOUT_MS = 300000;  // a stalled connection is retried after 5 minutes
const MAX_IMAGE_EDGE = 2576;      // longest image side the models read at full detail
const JPEG_QUALITY = 0.9;

// Cost estimate before a run (the live figure during a run comes from the API).
const EST_TEXT_TOKENS = 450;      // system prompt, user prompt and overhead
const EST_OUTPUT_TOKENS = 1300;   // explanation plus thinking at medium effort
const MAX_IMAGE_TOKENS = 4784;

const LANGUAGES = [
  ['auto', 'Same as the slides'],
  ['English', 'English'],
  ['Spanish', 'Español'],
  ['German', 'Deutsch'],
  ['French', 'Français'],
  ['Portuguese', 'Português'],
  ['Italian', 'Italiano'],
  ['Dutch', 'Nederlands'],
  ['Polish', 'Polski'],
  ['Turkish', 'Türkçe'],
  ['Chinese', '中文'],
  ['Japanese', '日本語']
];
const DEFAULT_LANGUAGE = 'auto';

const SYSTEM_PROMPT = [
  'You explain pages of lecture material (slides, readings, handouts) to students.',
  'Answer only with the explanation, without a preamble or closing remarks.',
  'Format it in Markdown: # and ## for headings, **bold** for key terms, - for bullet lists,',
  '1. for numbered steps, and a Markdown table only when the page itself contains a table.'
].join(' ');

const DEFAULT_PROMPT = [
  'Explain this page in plain language for a student preparing for an exam.',
  'Cover everything on the page without drifting into unrelated topics, and keep it concise.',
  'Start with a short title and use subtitles where they help.',
  'The first time a technical term, scientific name or abbreviation appears,',
  'follow it with a brief definition in parentheses that reads naturally within the sentence.'
].join(' ');

function languageInstruction(language) {
  return language && language !== 'auto'
    ? `Write the explanation in ${language}.`
    : 'Write the explanation in the same language as the page.';
}
