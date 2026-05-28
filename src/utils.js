export function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

export async function readJsonBody(req, maxBytes = 1024 * 1024) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) {
      const error = new Error('Payload demasiado grande');
      error.statusCode = 413;
      throw error;
    }
  }

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('JSON invalido');
    error.statusCode = 400;
    throw error;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundDownToStep(value, stepSize) {
  const step = Number(stepSize);
  if (!Number.isFinite(step) || step <= 0) return value;
  const precision = Math.max(0, String(step).split('.')[1]?.length || 0);
  return Number((Math.floor(Number(value) / step) * step).toFixed(precision));
}

export function formatDecimal(value) {
  return Number(value).toFixed(12).replace(/\.?0+$/, '');
}
