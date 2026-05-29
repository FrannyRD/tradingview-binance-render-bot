import { BinanceClient } from './binance.js';
import { executeSignal } from './executor.js';
import { buildEmaPullbackSignal, parseKline } from './strategy.js';

export class MarketScanner {
  constructor({ config, store }) {
    this.config = config;
    this.store = store;
    this.timer = null;
    this.running = false;
    this.binance = new BinanceClient({
      apiKey: config.binanceApiKey,
      apiSecret: config.binanceApiSecret,
      mode: 'live'
    });
  }

  start() {
    if (!this.config.scannerEnabled || this.timer) return;
    this.scanOnce().catch((error) => {
      this.store.appendEvent({ type: 'scanner.error', error: error.message });
    });
    this.timer = setInterval(() => {
      this.scanOnce().catch((error) => {
        this.store.appendEvent({ type: 'scanner.error', error: error.message });
      });
    }, this.config.scannerIntervalSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async scanOnce() {
    if (this.running) {
      return { skipped: true, reason: 'scanner already running' };
    }

    this.running = true;
    const results = [];
    try {
      for (const symbol of this.config.scannerSymbols) {
        const result = await this.scanSymbol(symbol);
        results.push(result);
      }
      await this.store.appendEvent({ type: 'scanner.completed', results });
      return { skipped: false, results };
    } finally {
      this.running = false;
    }
  }

  async scanSymbol(symbol) {
    const rawKlines = await this.binance.getKlines({
      symbol,
      interval: this.config.scannerTimeframe,
      limit: this.config.scannerLookback
    });
    const candles = rawKlines.map(parseKline);
    const usableCandles = this.config.scannerUseClosedCandle ? candles.slice(0, -1) : candles;
    const lastCandle = usableCandles[usableCandles.length - 1];
    const signal = buildEmaPullbackSignal(usableCandles, {
      symbol,
      interval: this.config.scannerTimeframe,
      riskReward: this.config.scannerRiskReward,
      atrLength: this.config.scannerAtrLength,
      atrStopMult: this.config.scannerAtrStopMult,
      minRiskReward: this.config.scannerMinRiskReward,
      pullbackAtrMult: this.config.scannerPullbackAtrMult,
      minEmaSeparationAtr: this.config.scannerMinEmaSeparationAtr,
      minEma200SlopeAtr: this.config.scannerMinEma200SlopeAtr,
      maxStopPct: this.config.scannerMaxStopPct
    });

    if (!signal) {
      return {
        symbol,
        signal: false,
        price: lastCandle?.close ?? null,
        candleTime: lastCandle?.closeTime ? new Date(lastCandle.closeTime).toISOString() : null,
        note: 'Sin setup valido'
      };
    }

    const isNew = await this.store.markScannerSignalIfNew(signal.signalKey);
    if (!isNew) {
      return { symbol, signal: true, duplicate: true, signalKey: signal.signalKey };
    }

    const execution = await executeSignal({ signal, config: this.config, store: this.store, source: 'scanner' });
    return {
      symbol,
      signal: true,
      duplicate: false,
      signalKey: signal.signalKey,
      statusCode: execution.statusCode,
      result: execution.body
    };
  }
}
