import { BinanceClient } from './binance.js';
import { calculateTradePlan, checkCircuitBreakers, validateSignal } from './risk.js';

export async function executeSignal({ signal, config, store, source = 'unknown' }) {
  const validationError = validateSignal(signal, config);
  if (validationError) {
    await store.recordRejectedSignal(signal, validationError);
    return { statusCode: 400, body: { ok: false, error: validationError } };
  }

  const state = await store.loadState();
  const breakerError = checkCircuitBreakers({ state, config });
  if (breakerError) {
    await store.recordRejectedSignal(signal, breakerError);
    return { statusCode: 409, body: { ok: false, error: breakerError } };
  }

  const binance = new BinanceClient({
    apiKey: config.binanceApiKey,
    apiSecret: config.binanceApiSecret,
    mode: config.mode === 'live' ? 'live' : config.mode === 'demo' ? 'demo' : 'testnet'
  });

  const filters = config.tradeEnabled && config.mode !== 'dry-run'
    ? await binance.getSymbolFilters(signal.symbol)
    : { stepSize: '0.000001', minQty: '0', minNotional: '0', tickSize: '0.01' };

  const equityUsdt = config.tradeEnabled && config.mode !== 'dry-run'
    ? await binance.getEquityUsdt(state.equityUsdt)
    : state.equityUsdt;

  const plan = calculateTradePlan({ signal, equityUsdt, config, filters });

  if (!config.tradeEnabled || config.mode === 'dry-run') {
    const result = {
      mode: config.mode,
      source,
      executed: false,
      message: 'Dry-run: senal validada, no se envio orden a Binance',
      plan
    };
    await store.recordAcceptedSignal(signal, result);
    return { statusCode: 202, body: { ok: true, result } };
  }

  const order = await binance.placeMarketOrder(signal, plan);
  let protection = null;
  if (config.protectiveOrdersEnabled) {
    protection = await binance.placeOcoProtection(signal, plan, filters);
  }

  await store.recordOrder(signal, { ...order, protection }, plan);
  return {
    statusCode: 201,
    body: {
      ok: true,
      result: {
        mode: config.mode,
        source,
        executed: true,
        order,
        protection,
        plan
      }
    }
  };
}
