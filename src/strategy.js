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
    minRiskReward = 1.5,
    pullbackAtrMult = 0.35,
    minEmaSeparationAtr = 0.12,
    minEma200SlopeAtr = 0.03,
    maxStopPct = 2
  } = options;

  if (candles.length < 220) return null;

  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const atrValues = atr(candles, atrLength);
  const i = candles.length - 1;
  const candle = candles[i];
  const slopeBars = 10;

  if (!ema20[i] || !ema50[i] || !ema200[i] || !atrValues[i]) return null;
  if (!ema200[i - slopeBars]) return null;

  const atrNow = atrValues[i];
  const nearEma20 = Math.abs(candle.close - ema20[i]) <= atrNow * pullbackAtrMult || candle.low <= ema20[i] || candle.high >= ema20[i];
  const nearEma50 = Math.abs(candle.close - ema50[i]) <= atrNow * pullbackAtrMult || candle.low <= ema50[i] || candle.high >= ema50[i];
  const ema20To50Atr = Math.abs(ema20[i] - ema50[i]) / atrNow;
  const ema50To200Atr = Math.abs(ema50[i] - ema200[i]) / atrNow;
  const emaSeparated = ema20To50Atr >= minEmaSeparationAtr && ema50To200Atr >= minEmaSeparationAtr;
  const ema200SlopeAtr = (ema200[i] - ema200[i - slopeBars]) / atrNow;

  const trendUp = candle.close > ema20[i] && ema20[i] > ema50[i] && ema50[i] > ema200[i] && emaSeparated && ema200SlopeAtr >= minEma200SlopeAtr;
  const pullbackLong = nearEma20 || nearEma50;
  const bullishRejection = candle.close > candle.open && (candle.close - candle.low) > (candle.high - candle.close);

  const trendDown = candle.close < ema20[i] && ema20[i] < ema50[i] && ema50[i] < ema200[i] && emaSeparated && ema200SlopeAtr <= -minEma200SlopeAtr;
  const pullbackShort = nearEma20 || nearEma50;
  const bearishRejection = candle.close < candle.open && (candle.high - candle.close) > (candle.close - candle.low);

  let action = null;
  let stopLoss = null;
  let takeProfit = null;
  let setup = null;

  if (trendUp && pullbackLong && bullishRejection) {
    action = 'BUY';
    stopLoss = candle.close - atrNow * atrStopMult;
    takeProfit = candle.close + (candle.close - stopLoss) * riskReward;
    setup = 'long pullback';
  } else if (trendDown && pullbackShort && bearishRejection) {
    action = 'SELL';
    stopLoss = candle.close + atrNow * atrStopMult;
    takeProfit = candle.close - (stopLoss - candle.close) * riskReward;
    setup = 'short pullback';
  }

  if (!action) return null;

  const risk = Math.abs(candle.close - stopLoss);
  const reward = Math.abs(takeProfit - candle.close);
  const rewardRisk = reward / risk;
  const stopPct = (risk / candle.close) * 100;

  if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit) || rewardRisk < minRiskReward || stopPct > maxStopPct) {
    return null;
  }

  return {
    strategy: 'EMA_20_50_200_PULLBACK_LONG_SHORT',
    action,
    symbol,
    timeframe: interval,
    price: candle.close,
    stopLoss,
    takeProfit,
    note: `${setup} scanner candle ${new Date(candle.closeTime).toISOString()}`,
    signalKey: `${symbol}:${interval}:${candle.closeTime}:${action}`
  };
}
