// ── Claude API ───────────────────────────────────────────────────
// One request per page: the page as a JPEG image plus the user's prompt.

// Error kinds:
//   retryable  rate_limit, overloaded, server, network
//   page       invalid_request (this page cannot succeed as sent; others may)
//   fatal      auth, billing, permission, model (no page can succeed)
class ClaudeError extends Error {
  constructor(kind, message, { status = 0, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'ClaudeError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
  get retryable() { return ['rate_limit', 'overloaded', 'server', 'network'].includes(this.kind); }
  get fatal() { return ['auth', 'billing', 'permission', 'model'].includes(this.kind); }
}

async function explainPage({ apiKey, model, prompt, image, signal }) {
  const serverFallback = MODELS[model]?.serverFallback === true;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  if (serverFallback) headers['anthropic-beta'] = FALLBACK_BETA;

  const body = {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.b64 } },
        { type: 'text', text: prompt }
      ]
    }]
  };
  if (serverFallback) body.fallbacks = 'default';

  // Browsers never time out a fetch on their own, so a stalled connection
  // would otherwise hold its page forever.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: anySignal([signal, timeout]) });
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) throw new ClaudeError('network', 'The request to Anthropic timed out.');
    if (error?.name === 'AbortError') throw error;
    throw new ClaudeError('network', 'Could not reach the Anthropic API. Check your internet connection.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw classifyApiError(response.status, payload, response.headers);
  }

  const data = await response.json();
  return {
    text: extractText(data),
    stopReason: data.stop_reason || null,
    refusalCategory: data.stop_details?.category || null,
    servedBy: data.model || model,
    usage: {
      input: Number(data.usage?.input_tokens) || 0,
      output: Number(data.usage?.output_tokens) || 0
    }
  };
}

function anySignal(signals) {
  const active = signals.filter(Boolean);
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) { controller.abort(signal.reason); break; }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// A response can start with thinking blocks (and, after a fallback, carry a
// fallback block), so read every text block rather than content[0].
function extractText(data) {
  return (Array.isArray(data?.content) ? data.content : [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n\n')
    .trim();
}

function classifyApiError(status, payload, headers) {
  const apiType = payload?.error?.type || '';
  const apiMessage = payload?.error?.message || '';
  const raw = `${apiType} ${apiMessage}`.toLowerCase();
  const options = { status, retryAfterMs: parseRetryAfter(headers) };

  if (status === 401 || apiType === 'authentication_error') {
    return new ClaudeError('auth', 'Anthropic rejected the API key. Check that it is correct and still active.', options);
  }
  if (status === 402 || apiType === 'billing_error' || raw.includes('credit balance') || raw.includes('billing')) {
    return new ClaudeError('billing', 'The Anthropic account has no available credit. Add credit in the Anthropic Console, then click Resume.', options);
  }
  if (status === 403 || apiType === 'permission_error') {
    return new ClaudeError('permission', 'This API key is not allowed to use the selected model. Choose another model or check the key in the Anthropic Console.', options);
  }
  if (status === 404 || apiType === 'not_found_error') {
    return new ClaudeError('model', 'The selected model is not available to this account. Choose another model.', options);
  }
  if (status === 429 || apiType === 'rate_limit_error') {
    return new ClaudeError('rate_limit', 'Anthropic rate limit reached.', options);
  }
  if (status === 529 || apiType === 'overloaded_error') {
    return new ClaudeError('overloaded', 'Anthropic is temporarily overloaded.', options);
  }
  if (status >= 500) {
    return new ClaudeError('server', 'Anthropic had a temporary server error.', options);
  }
  if (status === 413) {
    return new ClaudeError('invalid_request', 'This page is too large to send. Try a lower render quality.', options);
  }
  return new ClaudeError('invalid_request', apiMessage ? `Anthropic could not process this page: ${apiMessage}` : `Anthropic returned an unexpected error (HTTP ${status}).`, options);
}

function parseRetryAfter(headers) {
  const value = headers?.get?.('retry-after');
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function retryDelayMs(error, attempt) {
  if (error?.retryAfterMs != null) return Math.min(error.retryAfterMs, RETRY_MAX_MS);
  const exponential = RETRY_BASE_MS * 2 ** (attempt - 1);
  const jitter = Math.random() * 0.25 * exponential;
  return Math.min(exponential + jitter, RETRY_MAX_MS);
}

// ── Cost ─────────────────────────────────────────────────────────
function costUsd(model, usage) {
  const price = MODELS[model];
  if (!price || !usage) return 0;
  return (usage.input * price.input + usage.output * price.output) / 1e6;
}

function imageTokens(width, height) {
  return Math.min(Math.ceil((width * height) / 750), MAX_IMAGE_TOKENS);
}

function estimateRunCost(model, pageCount, width, height) {
  const perPage = {
    input: imageTokens(width, height) + EST_TEXT_TOKENS,
    output: EST_OUTPUT_TOKENS
  };
  return costUsd(model, { input: perPage.input * pageCount, output: perPage.output * pageCount });
}

function formatUsd(value) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00';
  if (value < 0.01) return '< $0.01';
  return '$' + value.toFixed(2);
}
