import { roundDownToStep, safeNumber } from './utils.js';

export function normalizeSignal(payload) {
  const action = String(payload.action || payload.side || '').trim().toUpperCase();
  const symbol = String(payload.symbol || '').trim().toUpperCase().replace('/', '');
  const price = safeNumber(payload.price || payload.entry || payload.close, NaN);
  const stopLoss = safeNumber(payload.stopLoss || payload.stop_loss || payload.sl, NaN);
  const takeProfit = safeNumber(payload.takeProfit || payload.take_profit || payload.tp, NaN);

  return {
    secret: payload.secret,
    strategy: String(payload.strategy || 'EMA_20_50_200_PULLBACK'),
    action,
    symbol,
    timeframe: String(payload.timeframe || payload.interval || ''),
    price,
    stopLoss,
    takeProfit,
    note: payload.note ? String(payload.note) : ''
  };
}

export function validateSignal(signal, config) {
  if (!signal.symbol) return 'Falta symbol';
  if (!config.allowedSymbols.includes(signal.symbol)) return `Symbol no permitido: ${signal.symbol}`;
  if (!['BUY', 'SELL'].includes(signal.action)) return 'Action debe ser BUY o SELL';
  if (config.longOnly && signal.action !== 'BUY') return 'LONG_ONLY esta activo; solo BUY permitido';
  if (!Number.isFinite(signal.price) || signal.price <= 0) return 'Price debe ser positivo';

  if (config.requireProtectiveOrders) {
    if (!Number.isFinite(signal.stopLoss) || signal.stopLoss <= 0) return 'Falta stopLoss valido';
    if (!Number.isFinite(signal.takeProfit) || signal.takeProfit <= 0) return 'Falta takeProfit valido';
    if (signal.action === 'BUY' && signal.stopLoss >= signal.price) return 'Para BUY, stopLoss debe estar debajo del precio';
    if (signal.action === 'BUY' && signal.takeProfit <= signal.price) return 'Para BUY, takeProfit debe estar encima del precio';
    if (signal.action === 'SELL' && signal.stopLoss <= signal.price) return 'Para SELL, stopLoss debe estar encima del precio';
    if (signal.action === 'SELL' && signal.takeProfit >= signal.price) return 'Para SELL, takeProfit debe estar debajo del precio';
  }

  return null;
}

export function calculateTradePlan({ signal, equityUsdt, config, filters = {} }) {
  const riskPct = config.riskPerTradePct / 100;
  const maxRiskUsdt = equityUsdt * riskPct;
  const entryPrice = signal.price;
  const riskPerUnit = Math.abs(entryPrice - signal.stopLoss);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
    throw new Error('No se puede calcular riesgo sin stopLoss valido');
  }

  const rawQuantity = maxRiskUsdt / riskPerUnit;
  const quantity = roundDownToStep(rawQuantity, filters.stepSize || 0.000001);
  const notionalUsdt = quantity * entryPrice;
  const rewardPerUnit = Math.abs(signal.takeProfit - entryPrice);
  const riskReward = rewardPerUnit / riskPerUnit;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Cantidad calculada invalida');
  }

  const minQty = safeNumber(filters.minQty, 0);
  const minNotional = safeNumber(filters.minNotional, 0);
  if (quantity < minQty) {
    throw new Error(`Cantidad ${quantity} menor al minimo ${minQty}`);
  }
  if (notionalUsdt < minNotional) {
    throw new Error(`Notional ${notionalUsdt.toFixed(2)} menor al minimo ${minNotional}`);
  }

  return {
    entryPrice,
    equityUsdt,
    maxRiskUsdt,
    riskPerUnit,
    rewardPerUnit,
    riskReward,
    quantity,
    notionalUsdt
  };
}

export function checkCircuitBreakers({ state, config }) {
  const openCount = state.openTrades.filter((trade) => trade.status === 'open').length;
  if (openCount >= config.maxOpenTrades) {
    return `Maximo de operaciones abiertas alcanzado: ${openCount}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const daily = state.daily[today] || { realizedPnlUsdt: 0 };
  const dailyOrders = daily.orders || 0;
  if (dailyOrders >= config.maxDailyTrades) {
    return `Maximo de operaciones diarias alcanzado: ${dailyOrders}`;
  }

  const maxDailyLossUsdt = state.equityUsdt * (config.maxDailyLossPct / 100);
  if (daily.realizedPnlUsdt <= -maxDailyLossUsdt) {
    return `Limite de perdida diaria alcanzado: ${daily.realizedPnlUsdt}`;
  }

  return null;
}

export function checkSymbolCooldown({ state, config, symbol }) {
  if (!config.tradeCooldownMinutes || config.tradeCooldownMinutes <= 0) return null;
  const lastTradeAt = state.lastTradeAtBySymbol?.[symbol];
  if (!lastTradeAt) return null;

  const elapsedMs = Date.now() - new Date(lastTradeAt).getTime();
  const cooldownMs = config.tradeCooldownMinutes * 60 * 1000;
  if (elapsedMs < cooldownMs) {
    const remainingMinutes = Math.ceil((cooldownMs - elapsedMs) / 60000);
    return `Cooldown activo para ${symbol}: espera ${remainingMinutes} min`;
  }

  return null;
}
