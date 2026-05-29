import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmaPullbackSignal, ema } from '../src/strategy.js';

test('ema mantiene null hasta tener suficientes velas', () => {
  assert.deepEqual(ema([1, 2, 3], 3), [null, null, 2]);
});

test('detecta una senal pullback en tendencia alcista', () => {
  const candles = Array.from({ length: 230 }, (_, index) => {
    const close = 100 + index;
    return {
      openTime: index * 60_000,
      open: close - 1,
      high: close + 2,
      low: close - 3,
      close,
      volume: 100,
      closeTime: index * 60_000 + 59_999
    };
  });

  const last = candles[candles.length - 1];
  last.open = last.close - 8;
  last.low = last.close - 35;
  last.high = last.close + 2;

  const signal = buildEmaPullbackSignal(candles, {
    symbol: 'BTCUSDT',
    interval: '1h',
    riskReward: 2,
    maxStopPct: 20
  });

  assert.equal(signal.action, 'BUY');
  assert.equal(signal.symbol, 'BTCUSDT');
  assert.ok(signal.stopLoss < signal.price);
  assert.ok(signal.takeProfit > signal.price);
});

test('detecta una senal short en tendencia bajista', () => {
  const candles = Array.from({ length: 230 }, (_, index) => {
    const close = 400 - index;
    return {
      openTime: index * 60_000,
      open: close + 1,
      high: close + 3,
      low: close - 2,
      close,
      volume: 100,
      closeTime: index * 60_000 + 59_999
    };
  });

  const last = candles[candles.length - 1];
  last.open = last.close + 8;
  last.high = last.close + 35;
  last.low = last.close - 2;

  const signal = buildEmaPullbackSignal(candles, {
    symbol: 'BTCUSDT',
    interval: '15m',
    riskReward: 2,
    maxStopPct: 20
  });

  assert.equal(signal.action, 'SELL');
  assert.equal(signal.symbol, 'BTCUSDT');
  assert.ok(signal.stopLoss > signal.price);
  assert.ok(signal.takeProfit < signal.price);
});

test('rechaza mercado lateral sin separacion entre EMAs', () => {
  const candles = Array.from({ length: 230 }, (_, index) => {
    const close = 100 + Math.sin(index / 3) * 0.5;
    return {
      openTime: index * 60_000,
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 100,
      closeTime: index * 60_000 + 59_999
    };
  });

  assert.equal(buildEmaPullbackSignal(candles, {
    symbol: 'BTCUSDT',
    interval: '1h',
    riskReward: 2
  }), null);
});
