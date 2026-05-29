import { BinanceClient, BinanceFuturesClient } from './binance.js';
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

  if (signal.action === 'SELL' && config.executionMarket !== 'futures') {
    const error = 'SELL como short requiere EXECUTION_MARKET=futures';
    await store.recordRejectedSignal(signal, error);
    return { statusCode: 400, body: { ok: false, error } };
  }

  const Client = config.executionMarket === 'futures' ? BinanceFuturesClient : BinanceClient;
  const binance = new Client({
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

  if (config.executionMarket === 'futures' && config.futuresLeverage) {
    await binance.setLeverage(signal.symbol, config.futuresLeverage);
  }

  const order = await binance.placeMarketOrder(signal, plan);
  let protection = null;
  let protectionError = null;
  if (config.protectiveOrdersEnabled) {
    try {
      protection = config.executionMarket === 'futures'
        ? await binance.placeProtection(signal, plan, filters)
        : await binance.placeOcoProtection(signal, plan, filters);
    } catch (error) {
      protectionError = error.message;
      await store.appendEvent({ type: 'order.protection_failed', signal, order, plan, error: protectionError });
    }
  }

  await store.recordOrder(signal, { ...order, protection, protectionError }, plan);
  return {
    statusCode: protectionError ? 207 : 201,
    body: {
      ok: !protectionError,
      result: {
        mode: config.mode,
        source,
        executed: true,
        order,
        protection,
        protectionError,
        plan
      }
    }
  };
}
