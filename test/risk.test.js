import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTradePlan, normalizeSignal, validateSignal } from '../src/risk.js';

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
