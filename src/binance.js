import crypto from 'node:crypto';
import { formatDecimal, roundDownToStep, safeNumber } from './utils.js';

const BASE_URLS = {
  testnet: 'https://testnet.binance.vision',
  demo: 'https://demo-api.binance.com',
  live: 'https://api.binance.com'
};

const FUTURES_BASE_URLS = {
  testnet: 'https://testnet.binancefuture.com',
  demo: 'https://demo-fapi.binance.com',
  live: 'https://fapi.binance.com'
};

export class BinanceClient {
  constructor({ apiKey, apiSecret, mode }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.mode = mode;
    this.baseUrl = BASE_URLS[mode] || BASE_URLS.testnet;
  }

  ensureReady() {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Faltan BINANCE_API_KEY o BINANCE_API_SECRET');
    }
  }

  sign(queryString) {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  async request(method, endpoint, params = {}, signed = false) {
    if (signed) this.ensureReady();
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }

    if (signed) {
      query.set('timestamp', String(Date.now()));
      query.set('recvWindow', '5000');
      const signature = this.sign(query.toString());
      query.set('signature', signature);
    }

    const qs = query.toString();
    const url = `${this.baseUrl}${endpoint}${method === 'GET' && qs ? `?${qs}` : ''}`;
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (this.apiKey) headers['X-MBX-APIKEY'] = this.apiKey;

    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : qs
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`Binance ${response.status}: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async getAccount() {
    return this.request('GET', '/api/v3/account', {}, true);
  }

  async getKlines({ symbol, interval, limit = 300 }) {
    return this.request('GET', '/api/v3/klines', { symbol, interval, limit }, false);
  }

  async getEquityUsdt(fallbackEquity) {
    const account = await this.getAccount();
    const usdt = account.balances?.find((asset) => asset.asset === 'USDT');
    const free = safeNumber(usdt?.free, NaN);
    return Number.isFinite(free) ? free : fallbackEquity;
  }

  async getSymbolFilters(symbol) {
    const data = await this.request('GET', '/api/v3/exchangeInfo', { symbol }, false);
    const info = data.symbols?.[0];
    const lot = info?.filters?.find((filter) => filter.filterType === 'LOT_SIZE');
    const minNotional = info?.filters?.find((filter) => filter.filterType === 'MIN_NOTIONAL' || filter.filterType === 'NOTIONAL');
    const priceFilter = info?.filters?.find((filter) => filter.filterType === 'PRICE_FILTER');
    return {
      stepSize: lot?.stepSize || '0.000001',
      minQty: lot?.minQty || '0',
      minNotional: minNotional?.minNotional || '0',
      tickSize: priceFilter?.tickSize || '0.01'
    };
  }

  async placeMarketOrder(signal, plan) {
    return this.request('POST', '/api/v3/order', {
      symbol: signal.symbol,
      side: signal.action,
      type: 'MARKET',
      quantity: formatDecimal(plan.quantity),
      newClientOrderId: `tv_${Date.now()}`
    }, true);
  }

  async placeOcoProtection(signal, plan, filters) {
    if (signal.action !== 'BUY') {
      throw new Error('La proteccion OCO automatica de esta plantilla solo esta preparada para entradas BUY en Spot');
    }

    const quantity = roundDownToStep(plan.quantity, filters.stepSize);
    const stopLimitPrice = roundDownToStep(signal.stopLoss * 0.999, filters.tickSize);

    return this.request('POST', '/api/v3/orderList/oco', {
      symbol: signal.symbol,
      side: 'SELL',
      quantity: formatDecimal(quantity),
      aboveType: 'LIMIT_MAKER',
      abovePrice: formatDecimal(roundDownToStep(signal.takeProfit, filters.tickSize)),
      belowType: 'STOP_LOSS_LIMIT',
      belowStopPrice: formatDecimal(roundDownToStep(signal.stopLoss, filters.tickSize)),
      belowPrice: formatDecimal(stopLimitPrice),
      belowTimeInForce: 'GTC',
      listClientOrderId: `oco_${Date.now()}`
    }, true);
  }
}

export class BinanceFuturesClient extends BinanceClient {
  constructor({ apiKey, apiSecret, mode }) {
    super({ apiKey, apiSecret, mode });
    this.baseUrl = FUTURES_BASE_URLS[mode] || FUTURES_BASE_URLS.testnet;
  }

  async getEquityUsdt(fallbackEquity) {
    const balances = await this.request('GET', '/fapi/v2/balance', {}, true);
    const usdt = balances.find((asset) => asset.asset === 'USDT');
    const available = safeNumber(usdt?.availableBalance, NaN);
    return Number.isFinite(available) ? available : fallbackEquity;
  }

  async getFuturesAccount() {
    return this.request('GET', '/fapi/v2/account', {}, true);
  }

  async getIncomeHistory(params = {}) {
    return this.request('GET', '/fapi/v1/income', {
      limit: 200,
      ...params
    }, true);
  }

  async getSymbolFilters(symbol) {
    const data = await this.request('GET', '/fapi/v1/exchangeInfo', { symbol }, false);
    const info = data.symbols?.[0];
    const lot = info?.filters?.find((filter) => filter.filterType === 'LOT_SIZE');
    const minNotional = info?.filters?.find((filter) => filter.filterType === 'MIN_NOTIONAL');
    const priceFilter = info?.filters?.find((filter) => filter.filterType === 'PRICE_FILTER');
    return {
      stepSize: lot?.stepSize || '0.001',
      minQty: lot?.minQty || '0',
      minNotional: minNotional?.notional || minNotional?.minNotional || '0',
      tickSize: priceFilter?.tickSize || '0.01'
    };
  }

  async setLeverage(symbol, leverage) {
    return this.request('POST', '/fapi/v1/leverage', { symbol, leverage }, true);
  }

  async placeMarketOrder(signal, plan) {
    return this.request('POST', '/fapi/v1/order', {
      symbol: signal.symbol,
      side: signal.action,
      type: 'MARKET',
      quantity: formatDecimal(plan.quantity),
      newClientOrderId: `ft_${Date.now()}`
    }, true);
  }

  async placeProtection(signal, plan, filters) {
    const closeSide = signal.action === 'BUY' ? 'SELL' : 'BUY';
    const stopOrder = await this.request('POST', '/fapi/v1/algoOrder', {
      algoType: 'CONDITIONAL',
      symbol: signal.symbol,
      side: closeSide,
      type: 'STOP_MARKET',
      triggerPrice: formatDecimal(roundDownToStep(signal.stopLoss, filters.tickSize)),
      closePosition: 'true',
      workingType: 'MARK_PRICE',
      clientAlgoId: `sl_${Date.now()}`
    }, true);

    const takeProfitOrder = await this.request('POST', '/fapi/v1/algoOrder', {
      algoType: 'CONDITIONAL',
      symbol: signal.symbol,
      side: closeSide,
      type: 'TAKE_PROFIT_MARKET',
      triggerPrice: formatDecimal(roundDownToStep(signal.takeProfit, filters.tickSize)),
      closePosition: 'true',
      workingType: 'MARK_PRICE',
      clientAlgoId: `tp_${Date.now()}`
    }, true);

    return { stopOrder, takeProfitOrder };
  }
}
