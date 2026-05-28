import { safeNumber } from './utils.js';

export function ema(values, length) {
  if (values.length < length) return [];
  const multiplier = 2 / (length + 1);
  const result = [];
  let previous = values.slice(0, length).reduce((sum, value) => sum + value, 0) / length;

  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      result.push(null);
    } else if (i === length - 1) {
      result.push(previous);
    } else {
      previous = (values[i] - previous) * multiplier + previous;
      result.push(previous);
    }
  }

  return result;
}

export function atr(candles, length) {
  if (candles.length < length + 1) return [];
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const result = [];
  let previous = trueRanges.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  for (let i = 0; i < trueRanges.length; i += 1) {
    if (i < length - 1) {
      result.push(null);
    } else if (i === length - 1) {
      result.push(previous);
    } else {
      previous = (previous * (length - 1) + trueRanges[i]) / length;
      result.push(previous);
    }
  }
  return result;
}

export function parseKline(kline) {
  return {
    openTime: Number(kline[0]),
    open: safeNumber(kline[1]),
    high: safeNumber(kline[2]),
    low: safeNumber(kline[3]),
    close: safeNumber(kline[4]),
    volume: safeNumber(kline[5]),
    closeTime: Number(kline[6])
  };
}

export function buildEmaPullbackSignal(candles, options) {
  const {
    symbol,
    interval,
    riskReward = 2,
    atrLength = 14,
    atrStopMult = 1.5,
    minRiskReward = 1.5
  } = options;

  if (candles.length < 220) return null;

  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const atrValues = atr(candles, atrLength);
  const i = candles.length - 1;
  const candle = candles[i];

  if (!ema20[i] || !ema50[i] || !ema200[i] || !atrValues[i]) return null;

  const trendUp = candle.close > ema200[i] && ema20[i] > ema50[i] && ema50[i] > ema200[i];
  const pullbackZone = candle.low <= ema20[i] || candle.low <= ema50[i];
  const bullishRejection = candle.close > candle.open && candle.close > ema20[i] && (candle.close - candle.low) > (candle.high - candle.close);

  if (!trendUp || !pullbackZone || !bullishRejection) return null;

  const stopLoss = candle.close - atrValues[i] * atrStopMult;
  const takeProfit = candle.close + (candle.close - stopLoss) * riskReward;
  const rewardRisk = (takeProfit - candle.close) / (candle.close - stopLoss);

  if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit) || rewardRisk < minRiskReward) {
    return null;
  }

  return {
    strategy: 'EMA_20_50_200_PULLBACK_SCANNER',
    action: 'BUY',
    symbol,
    timeframe: interval,
    price: candle.close,
    stopLoss,
    takeProfit,
    note: `scanner candle ${new Date(candle.closeTime).toISOString()}`,
    signalKey: `${symbol}:${interval}:${candle.closeTime}`
  };
}
