import fs from 'node:fs';
import path from 'node:path';

function loadDotenv(filePath = path.resolve('.env')) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...parts] = trimmed.split('=');
    const value = parts.join('=').trim().replace(/^["']|["']$/g, '');
    if (process.env[key.trim()] === undefined) process.env[key.trim()] = value;
  }
}

loadDotenv();

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function numberFromEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} debe ser un numero valido`);
  }
  return parsed;
}

function listFromEnv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

const defaultSymbols = 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,LTCUSDT,DOTUSDT,TRXUSDT';

export function loadConfig(env = process.env) {
  const mode = (env.BOT_MODE || 'dry-run').toLowerCase();
  if (!['dry-run', 'testnet', 'demo', 'live'].includes(mode)) {
    throw new Error('BOT_MODE debe ser dry-run, testnet, demo o live');
  }

  const tradeEnabled = boolFromEnv(env.TRADE_ENABLED, false);
  if (mode === 'live' && tradeEnabled && env.I_UNDERSTAND_LIVE_RISK !== 'true') {
    throw new Error('Para operar en vivo define I_UNDERSTAND_LIVE_RISK=true');
  }

  return {
    port: Number(env.PORT || 3000),
    webhookSecret: env.WEBHOOK_SECRET || '',
    mode,
    tradeEnabled,
    binanceApiKey: env.BINANCE_API_KEY || '',
    binanceApiSecret: env.BINANCE_API_SECRET || '',
    riskPerTradePct: numberFromEnv(env, 'RISK_PER_TRADE_PCT', 0.5),
    maxDailyLossPct: numberFromEnv(env, 'MAX_DAILY_LOSS_PCT', 3),
    maxOpenTrades: numberFromEnv(env, 'MAX_OPEN_TRADES', 3),
    maxDailyTrades: numberFromEnv(env, 'MAX_DAILY_TRADES', 6),
    startingEquityUsdt: numberFromEnv(env, 'STARTING_EQUITY_USDT', 1000),
    allowedSymbols: listFromEnv(env.ALLOWED_SYMBOLS || defaultSymbols),
    longOnly: boolFromEnv(env.LONG_ONLY, true),
    requireProtectiveOrders: boolFromEnv(env.REQUIRE_PROTECTIVE_ORDERS, true),
    protectiveOrdersEnabled: boolFromEnv(env.PROTECTIVE_ORDERS_ENABLED, true),
    scannerEnabled: boolFromEnv(env.SCANNER_ENABLED, true),
    scannerSymbols: listFromEnv(env.SCANNER_SYMBOLS || env.ALLOWED_SYMBOLS || defaultSymbols),
    scannerTimeframe: env.SCANNER_TIMEFRAME || '1h',
    scannerIntervalSeconds: numberFromEnv(env, 'SCANNER_INTERVAL_SECONDS', 300),
    scannerLookback: numberFromEnv(env, 'SCANNER_LOOKBACK', 300),
    scannerUseClosedCandle: boolFromEnv(env.SCANNER_USE_CLOSED_CANDLE, true),
    scannerRiskReward: numberFromEnv(env, 'SCANNER_RISK_REWARD', 2),
    scannerMinRiskReward: numberFromEnv(env, 'SCANNER_MIN_RISK_REWARD', 1.5),
    scannerAtrLength: numberFromEnv(env, 'SCANNER_ATR_LENGTH', 14),
    scannerAtrStopMult: numberFromEnv(env, 'SCANNER_ATR_STOP_MULT', 1.5),
    dataDir: path.resolve(env.DATA_DIR || './data')
  };
}
