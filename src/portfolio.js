import { BinanceClient, BinanceFuturesClient } from './binance.js';
import { safeNumber } from './utils.js';

function binanceMode(mode) {
  if (mode === 'live') return 'live';
  if (mode === 'demo') return 'demo';
  return 'testnet';
}

function signedClient(config) {
  const Client = config.executionMarket === 'futures' ? BinanceFuturesClient : BinanceClient;
  return new Client({
    apiKey: config.binanceApiKey,
    apiSecret: config.binanceApiSecret,
    mode: binanceMode(config.mode)
  });
}

function signedAccessAvailable(config) {
  return config.tradeEnabled && config.mode !== 'dry-run' && config.binanceApiKey && config.binanceApiSecret;
}

function sumIncome(incomeRows, incomeType) {
  return incomeRows
    .filter((row) => row.incomeType === incomeType)
    .reduce((total, row) => total + safeNumber(row.income, 0), 0);
}

function normalizePosition(position) {
  const amount = safeNumber(position.positionAmt, 0);
  const notional = safeNumber(position.notional, 0);
  const pnl = safeNumber(position.unrealizedProfit, 0);
  const entryPrice = safeNumber(position.entryPrice, 0);
  return {
    symbol: position.symbol,
    side: amount < 0 ? 'SHORT' : 'LONG',
    positionAmt: amount,
    entryPrice,
    notional,
    leverage: safeNumber(position.leverage, 0),
    unrealizedPnlUsdt: pnl,
    liquidationPrice: safeNumber(position.liquidationPrice, 0)
  };
}

function normalizeIncome(row) {
  return {
    symbol: row.symbol || '-',
    incomeType: row.incomeType,
    income: safeNumber(row.income, 0),
    asset: row.asset || 'USDT',
    time: row.time ? new Date(row.time).toISOString() : null,
    info: row.info || ''
  };
}

async function loadFuturesSnapshot({ config }) {
  const binance = signedClient(config);
  const account = await binance.getFuturesAccount();
  let incomeRows = [];
  let incomeError = null;

  try {
    incomeRows = await binance.getIncomeHistory({ limit: 200 });
  } catch (error) {
    incomeError = error.message;
  }

  const positions = (account.positions || [])
    .map(normalizePosition)
    .filter((position) => Math.abs(position.positionAmt) > 0 || Math.abs(position.unrealizedPnlUsdt) > 0)
    .sort((a, b) => Math.abs(b.notional) - Math.abs(a.notional));

  const recentIncome = incomeRows
    .map(normalizeIncome)
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  const realizedPnlUsdt = sumIncome(incomeRows, 'REALIZED_PNL');
  const commissionUsdt = sumIncome(incomeRows, 'COMMISSION');
  const fundingFeeUsdt = sumIncome(incomeRows, 'FUNDING_FEE');

  return {
    market: 'futures',
    syncedAt: new Date().toISOString(),
    totals: {
      walletBalanceUsdt: safeNumber(account.totalWalletBalance, 0),
      marginBalanceUsdt: safeNumber(account.totalMarginBalance, 0),
      availableBalanceUsdt: safeNumber(account.availableBalance, 0),
      unrealizedPnlUsdt: safeNumber(account.totalUnrealizedProfit, 0),
      initialMarginUsdt: safeNumber(account.totalInitialMargin, 0),
      maintMarginUsdt: safeNumber(account.totalMaintMargin, 0),
      realizedPnlUsdt,
      commissionUsdt,
      fundingFeeUsdt,
      netIncomeUsdt: realizedPnlUsdt + commissionUsdt + fundingFeeUsdt
    },
    positions,
    income: {
      incomeError,
      recent: recentIncome.slice(0, 20)
    }
  };
}

async function loadSpotSnapshot({ config }) {
  const binance = signedClient(config);
  const account = await binance.getAccount();
  const balances = (account.balances || [])
    .map((balance) => ({
      asset: balance.asset,
      free: safeNumber(balance.free, 0),
      locked: safeNumber(balance.locked, 0)
    }))
    .filter((balance) => balance.free > 0 || balance.locked > 0)
    .sort((a, b) => a.asset.localeCompare(b.asset));

  const usdt = balances.find((balance) => balance.asset === 'USDT');
  return {
    market: 'spot',
    syncedAt: new Date().toISOString(),
    totals: {
      walletBalanceUsdt: usdt?.free || 0,
      marginBalanceUsdt: usdt?.free || 0,
      availableBalanceUsdt: usdt?.free || 0,
      unrealizedPnlUsdt: 0,
      realizedPnlUsdt: 0,
      commissionUsdt: 0,
      fundingFeeUsdt: 0,
      netIncomeUsdt: 0
    },
    balances,
    positions: []
  };
}

export async function loadAccountSnapshot({ config }) {
  if (!signedAccessAvailable(config)) return null;
  if (config.executionMarket === 'futures') return loadFuturesSnapshot({ config });
  return loadSpotSnapshot({ config });
}
