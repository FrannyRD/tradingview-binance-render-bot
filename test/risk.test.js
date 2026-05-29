import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTradePlan, checkCircuitBreakers, checkSymbolCooldown, normalizeSignal, validateSignal } from '../src/risk.js';

const config = {
  allowedSymbols: ['BTCUSDT'],
  longOnly: true,
  requireProtectiveOrders: true,
  riskPerTradePct: 1
};

test('normaliza senal de TradingView', () => {
  const signal = normalizeSignal({
    action: 'buy',
    symbol: 'btc/usdt',
    price: '100',
    stop_loss: '95',
    take_profit: '110'
  });

  assert.equal(signal.action, 'BUY');
  assert.equal(signal.symbol, 'BTCUSDT');
  assert.equal(signal.stopLoss, 95);
});

test('valida BUY con stop y take profit correctos', () => {
  const signal = normalizeSignal({
    action: 'BUY',
    symbol: 'BTCUSDT',
    price: 100,
    stopLoss: 95,
    takeProfit: 110
  });

  assert.equal(validateSignal(signal, config), null);
});

test('calcula cantidad por riesgo de 1%', () => {
  const signal = normalizeSignal({
    action: 'BUY',
    symbol: 'BTCUSDT',
    price: 100,
    stopLoss: 95,
    takeProfit: 110
  });

  const plan = calculateTradePlan({
    signal,
    equityUsdt: 1000,
    config,
    filters: { stepSize: '0.001', minQty: '0', minNotional: '0' }
  });

  assert.equal(plan.maxRiskUsdt, 10);
  assert.equal(plan.quantity, 2);
  assert.equal(plan.riskReward, 2);
});

test('bloquea cuando alcanza el maximo diario de trades', () => {
  const state = {
    equityUsdt: 1000,
    openTrades: [],
    daily: {
      [new Date().toISOString().slice(0, 10)]: {
        realizedPnlUsdt: 0,
        orders: 6
      }
    }
  };

  assert.match(
    checkCircuitBreakers({ state, config: { ...config, maxOpenTrades: 3, maxDailyTrades: 6, maxDailyLossPct: 3 } }),
    /Maximo de operaciones diarias/
  );
});

test('bloquea si el simbolo esta en cooldown', () => {
  const state = {
    lastTradeAtBySymbol: {
      BTCUSDT: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    }
  };

  assert.match(
    checkSymbolCooldown({ state, config: { tradeCooldownMinutes: 120 }, symbol: 'BTCUSDT' }),
    /Cooldown activo/
  );
});
