// ── Claude API ───────────────────────────────────────────────────
async function claude(key, model, prompt, b64, signal) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    signal,
    headers:{ 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model, max_tokens:1200, messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
      {type:'text',text:prompt}
    ]}]})
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const err = new Error(humanizeClaudeError(r.status, e));
    err.retryable = r.status === 429 || r.status >= 500;
    throw err;
  }
  return (await r.json()).content[0].text;
}

function humanizeClaudeError(status, payload) {
  const apiMessage = payload?.error?.message || '';
  const apiType = payload?.error?.type || '';
  const raw = `${apiType} ${apiMessage}`.toLowerCase();

  if (status === 401 || raw.includes('authentication') || raw.includes('invalid x-api-key') || raw.includes('api key')) {
    return 'Claude rejected the API key. Check that the key is correct, active, and from the same Anthropic account where your billing is set up.';
  }
  if (status === 402 || raw.includes('credit') || raw.includes('billing') || raw.includes('payment')) {
    return 'Anthropic says this API account has a billing or credit problem. If you just bought credits, try again in a moment or create a new API key from that same paid account.';
  }
  if (status === 403 || raw.includes('not allowed') || raw.includes('permission')) {
    return 'This Anthropic account is not allowed to use this request or model. Try another model or check the account permissions in the Anthropic console.';
  }
  if (status === 404 || raw.includes('model')) {
    return 'The selected Claude model is not available for this account. Try switching to another model in the dropdown.';
  }
  if (status === 429 || raw.includes('rate limit') || raw.includes('quota')) {
    return 'Anthropic rate-limited this request or the account quota is exhausted. Wait a bit and try again.';
  }
  if (status >= 500) {
    return 'Anthropic had a temporary server problem. Try again in a moment.';
  }
  if (apiMessage) {
    return `Anthropic returned an error: ${apiMessage}`;
  }
  return `Anthropic returned an unexpected error (HTTP ${status}).`;
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}
