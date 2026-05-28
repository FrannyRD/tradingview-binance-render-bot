import { executeSignal } from './executor.js';
import { normalizeSignal } from './risk.js';

function secretMatches(req, payload, config) {
  const headerSecret = req.headers['x-webhook-secret'];
  const provided = headerSecret || payload.secret;
  return Boolean(config.webhookSecret && provided && provided === config.webhookSecret);
}

export async function handleTradingViewWebhook({ req, payload, config, store }) {
  const signal = normalizeSignal(payload);

  if (!secretMatches(req, payload, config)) {
    await store.recordRejectedSignal(signal, 'Secret invalido');
    return { statusCode: 401, body: { ok: false, error: 'Secret invalido' } };
  }

  return executeSignal({ signal, config, store, source: 'tradingview' });
}
