// SOLO STAGING: candidato revisable; no desplegado por esta tarea.
/*
 * NOA AI Bridge v2 — integración Groq/Cloudflare basada en worker.js original.
 * PRE-DESPLIEGUE: requiere NOA_BRIDGE_TOKEN y GROQ_API_KEY en el MISMO Worker.
 * No contiene claves; no incorpora OpenAI de pago ni Ollama Bridge.
 * NOA debe actualizar su selector para enviar provider="groq" o "cloudflare".
 */

const CLOUDFLARE_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const CLOUDFLARE_EXTERNAL_MODEL = '@cf/google/gemma-4-26b-a4b-it-external';
const GROQ_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
]);
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_REQUEST_CHARACTERS = 120000;
const MAX_MESSAGES = 24;
const MAX_OUTPUT_TOKENS = 3000;

const json = (body, status, headers, extraHeaders = {}) => new Response(
  JSON.stringify(body),
  { status, headers: { ...headers, ...extraHeaders } }
);

function responseHeaders(origin, allowedOrigins) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Max-Age'] = '600';
    headers['Access-Control-Expose-Headers'] = 'Retry-After';
  }
  return headers;
}

function originAllowlist(env) {
  // Cambiar únicamente si el frontend se publica en otro origen.
  const result = new Set(['https://josuepa936-hue.github.io']);
  for (const candidate of String(env.NOA_ALLOWED_ORIGINS || '').split(',')) {
    const origin = candidate.trim();
    if (!origin) continue;
    try {
      const parsed = new URL(origin);
      if (parsed.origin === origin && ['https:', 'http:'].includes(parsed.protocol)) {
        result.add(origin);
      }
    } catch { /* ignorar configuración inválida */ }
  }
  return result;
}

async function tokensMatch(expected, supplied) {
  // Comparación por digests de tamaño fijo, sin registrar ninguno de los tokens.
  const enc = new TextEncoder();
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
    crypto.subtle.digest('SHA-256', enc.encode(supplied))
  ]);
  const a = new Uint8Array(expectedHash);
  const b = new Uint8Array(suppliedHash);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}

async function authorize(request, env, headers) {
  if (typeof env.NOA_BRIDGE_TOKEN !== 'string' || env.NOA_BRIDGE_TOKEN.length < 16) {
    return json({ error: 'Bridge no configurado: falta NOA_BRIDGE_TOKEN seguro' }, 503, headers);
  }
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  const supplied = match?.[1] || '';
  if (!supplied || !(await tokensMatch(env.NOA_BRIDGE_TOKEN, supplied))) {
    return json({ error: 'Token del Bridge incorrecto o ausente' }, 401, headers);
  }
  return null;
}

function validateMessages(body) {
  if (!Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    return null;
  }
  const roles = new Set(['system', 'developer', 'user', 'assistant']);
  if (!body.messages.every(item =>
    item && typeof item === 'object' &&
    roles.has(item.role) &&
    typeof item.content === 'string' && item.content.trim().length > 0
  )) return null;
  // Esta fase es solo texto; las imágenes requerirán el endpoint Vision posterior.
  return body.messages.map(({ role, content }) => ({ role, content }));
}

function extractText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.output_text === 'string') return result.output_text;
  const content = result?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

function cleanUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const clean = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    if (Number.isSafeInteger(usage[key]) && usage[key] >= 0) clean[key] = usage[key];
  }
  return Object.keys(clean).length ? clean : null;
}

// STAGING CANDIDATE ONLY. Never return upstream messages, org IDs or credentials.
function safeRetryAfter(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  let seconds;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) seconds = Number(trimmed);
  else {
    const time = Date.parse(trimmed);
    if (!Number.isFinite(time) || new Date(time).toUTCString() !== trimmed) return null;
    seconds = Math.max(0, (time - Date.now()) / 1000);
  }
  return Number.isFinite(seconds) && seconds >= 0 && Date.now() + Math.ceil(seconds) * 1000 <= 8640000000000000 ? Math.ceil(seconds) : null;
}
async function safeRateLimit(upstream) {
  let data = null;
  try { const text = await upstream.text(); if (text.length <= 8192) data = JSON.parse(text); } catch {}
  const description = typeof data?.error?.message === 'string' ? data.error.message : '';
  const declared = data?.error?.limit_type;
  const daily = declared === 'daily' || /\b(?:tokens|requests) per day\b|\b(?:TPD|RPD)\b/i.test(description);
  const temporary = declared === 'temporary' || /\b(?:tokens|requests) per (?:minute|second)\b|\b(?:TPM|RPM)\b/i.test(description);
  return { type: ['daily','temporary'].includes(declared) ? declared : daily && !temporary ? 'daily' : temporary && !daily ? 'temporary' : 'unknown', retryAfterSeconds: safeRetryAfter(upstream.headers.get('retry-after')) };
}

async function answerWithGroq(env, messages, model, temperature, headers) {
  if (!GROQ_MODELS.has(model)) return json({ error: 'Modelo Groq no permitido' }, 400, headers);
  if (typeof env.GROQ_API_KEY !== 'string' || !env.GROQ_API_KEY.trim()) {
    return json({ error: 'GROQ_API_KEY no está disponible en este Worker' }, 503, headers);
  }
  const payload = { model, messages, temperature, stream: false, max_completion_tokens: MAX_OUTPUT_TOKENS };
  // Model-specific options. Never combine include_reasoning with reasoning_format.
  if (model === 'openai/gpt-oss-120b' || model === 'openai/gpt-oss-20b') {
    payload.include_reasoning = false;
  } else if (model === 'qwen/qwen3.8-27b') {
    // Official Groq SDK: this model supports reasoning_effort none (its default).
    payload.reasoning_effort = 'none';
  }
  let upstream;
  try {
    upstream = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });
  } catch {
    return json({ error: 'No se pudo contactar con Groq' }, 502, headers);
  }
  if (!upstream.ok) {
    const status = upstream.status === 429 ? 429 : upstream.status === 401 || upstream.status === 403 ? 502 : 502;
    if (status === 429) {
      const rateLimit = await safeRateLimit(upstream);
      const extra = rateLimit.retryAfterSeconds === null ? {} : { 'Retry-After': String(rateLimit.retryAfterSeconds) };
      return json({ error: 'Límite de uso de Groq alcanzado', code: 'quota_exceeded',
        provider: 'groq', requestedModel: model, upstreamStatus: 429, rateLimit }, 429, headers, extra);
    }
    return json({ error: 'Groq rechazó la solicitud', upstreamStatus: upstream.status }, status, headers);
  }
  let data;
  try { data = await upstream.json(); } catch {
    return json({ error: 'Respuesta de Groq ilegible' }, 502, headers);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return json({ error: 'Groq no devolvió texto utilizable' }, 502, headers);
  }
  const reported = typeof data.model === 'string' ? data.model : null;
  // Una discrepancia explícita no se presenta como un éxito.
  if (reported && reported !== model) {
    return json({ error: 'Groq reportó un modelo distinto del solicitado' }, 502, headers);
  }
  return json({
    text: content,
    provider: 'groq',
    requestedModel: model,
    model: reported,
    verified: reported === model,
    verificationStatus: reported === model ? 'matched' : 'not_reported',
    id: typeof data.id === 'string' ? data.id.slice(0, 128) : null,
    usage: cleanUsage(data.usage)
  }, 200, headers);
}

async function answerWithCloudflare(env, messages, model, temperature, headers) {
  if (model !== CLOUDFLARE_MODEL) {
    return json({ error: 'Modelo Cloudflare no permitido' }, 400, headers);
  }
  if (!env.AI?.run) return json({ error: 'Binding de Workers AI no disponible' }, 503, headers);
  let result;
  try {
    // Se conserva la configuración de Gemma del Worker original.
    result = await env.AI.run(CLOUDFLARE_MODEL, {
      messages,
      temperature,
      chat_template_kwargs: { enable_thinking: false },
      max_completion_tokens: 5000
    });
  } catch {
    return json({ error: 'Cloudflare Workers AI no pudo procesar la solicitud' }, 502, headers);
  }
  const text = extractText(result);
  if (!text.trim()) return json({ error: 'Cloudflare AI no devolvió texto' }, 502, headers);
  const reported = typeof result?.model === 'string' ? result.model : null;
  const external = reported === CLOUDFLARE_EXTERNAL_MODEL;
  if (reported && reported !== model && !external) {
    return json({ error: 'Cloudflare AI reportó un modelo distinto del solicitado' }, 502, headers);
  }
  return json({
    text,
    provider: 'cloudflare',
    requestedModel: model,
    model: external ? null : reported,
    ...(external ? { reportedModel: reported } : {}),
    verified: reported === model,
    verificationStatus: external ? 'external_unverified' : reported === model ? 'matched' : 'not_reported',
    id: typeof result?.id === 'string' ? result.id.slice(0, 128) : null,
    usage: cleanUsage(result?.usage)
  }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigins = originAllowlist(env);
    const headers = responseHeaders(origin, allowedOrigins);

    // CORS no reemplaza a la autenticación. Orígenes desconocidos se rechazan.
    if (origin && !allowedOrigins.has(origin)) {
      return json({ error: 'Origen no permitido' }, 403, headers);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'NOA AI Bridge v2',
        availableProviders: ['cloudflare', 'groq'],
        defaultCloudflareModel: CLOUDFLARE_MODEL
      }, 200, headers);
    }
    if (request.method === 'GET' && url.pathname === '/test-ai') {
      const unauthorized = await authorize(request, env, headers);
      if (unauthorized) return unauthorized;
      const result = await answerWithCloudflare(env,
        [{ role: 'user', content: 'Responde únicamente: NOA OK' }],
        CLOUDFLARE_MODEL, 0.35, headers);
      if (!result.ok) return result;
      const payload = await result.json();
      return json({ ok: true, ...payload }, 200, headers);
    }
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      const unauthorized = await authorize(request, env, headers);
      if (unauthorized) return unauthorized;
      let raw;
      try { raw = await request.text(); } catch {
        return json({ error: 'No se pudo leer la solicitud' }, 400, headers);
      }
      if (raw.length > MAX_REQUEST_CHARACTERS) {
        return json({ error: 'Solicitud demasiado grande' }, 413, headers);
      }
      let body;
      try { body = JSON.parse(raw); } catch {
        return json({ error: 'JSON de solicitud inválido' }, 400, headers);
      }
      const messages = validateMessages(body);
      if (!messages) return json({ error: 'Mensajes inválidos o no admitidos' }, 400, headers);
      const temperature = typeof body.temperature === 'number' &&
        Number.isFinite(body.temperature) && body.temperature >= 0 && body.temperature <= 2
        ? body.temperature : 0.35;
      if (body.provider === 'groq') {
        const model = body.model || 'openai/gpt-oss-120b';
        return answerWithGroq(env, messages, model, temperature, headers);
      }
      if (body.provider === 'cloudflare') {
        const model = body.model || CLOUDFLARE_MODEL;
        return answerWithCloudflare(env, messages, model, temperature, headers);
      }
      if (body.provider === 'openai') {
        return json({ error: 'OpenAI no está habilitado en este Bridge. Selecciona Groq o Cloudflare.' }, 503, headers);
      }
      if (body.provider === 'ollama') {
        return json({ error: 'Este Worker no tiene backend de Ollama. Utiliza Ollama directo.' }, 503, headers);
      }
      return json({ error: 'Proveedor no reconocido o ausente' }, 400, headers);
    }
    return json({ error: 'Ruta no encontrada' }, 404, headers);
  }
};
