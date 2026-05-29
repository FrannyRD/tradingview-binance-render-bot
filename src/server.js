import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { MarketScanner } from './scanner.js';
import { loadAccountSnapshot } from './portfolio.js';
import { Store } from './store.js';
import { handleTradingViewWebhook } from './webhook.js';
import { jsonResponse, readJsonBody } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const config = loadConfig();
const store = new Store(config.dataDir);
await store.init(config.startingEquityUsdt);
const scanner = new MarketScanner({ config, store });

async function serveStatic(res, fileName, contentType) {
  const filePath = path.join(publicDir, fileName);
  const body = await fs.readFile(filePath);
  res.writeHead(200, { 'content-type': contentType });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(res, 200, {
        ok: true,
        mode: config.mode,
        tradeEnabled: config.tradeEnabled,
        scannerEnabled: config.scannerEnabled,
        time: new Date().toISOString()
      });
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
      return serveStatic(res, 'index.html', 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      return serveStatic(res, 'app.js', 'text/javascript; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const state = await store.loadState();
      const events = await store.listEvents(200);
      let account = null;
      let accountError = null;
      try {
        account = await loadAccountSnapshot({ config });
      } catch (error) {
        accountError = error.message;
      }
      return jsonResponse(res, 200, {
        ok: true,
        config: {
          mode: config.mode,
          tradeEnabled: config.tradeEnabled,
          executionMarket: config.executionMarket,
          futuresLeverage: config.futuresLeverage,
          allowedSymbols: config.allowedSymbols,
          riskPerTradePct: config.riskPerTradePct,
          maxDailyLossPct: config.maxDailyLossPct,
          maxOpenTrades: config.maxOpenTrades,
          maxDailyTrades: config.maxDailyTrades,
          tradeCooldownMinutes: config.tradeCooldownMinutes,
          blockSymbolWhenPositionOpen: config.blockSymbolWhenPositionOpen,
          longOnly: config.longOnly,
          scannerEnabled: config.scannerEnabled,
          scannerSymbols: config.scannerSymbols,
          scannerTimeframe: config.scannerTimeframe,
          scannerIntervalSeconds: config.scannerIntervalSeconds,
          scannerUseClosedCandle: config.scannerUseClosedCandle,
          scannerMinEmaSeparationAtr: config.scannerMinEmaSeparationAtr,
          scannerMinEma200SlopeAtr: config.scannerMinEma200SlopeAtr,
          scannerMaxStopPct: config.scannerMaxStopPct
        },
        state,
        events,
        account,
        accountError
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/scan/run') {
      const result = await scanner.scanOnce();
      return jsonResponse(res, 200, { ok: true, result });
    }

    if (req.method === 'POST' && url.pathname === '/webhook/tradingview') {
      const payload = await readJsonBody(req);
      const result = await handleTradingViewWebhook({ req, payload, config, store });
      return jsonResponse(res, result.statusCode, result.body);
    }

    return jsonResponse(res, 404, { ok: false, error: 'Ruta no encontrada' });
  } catch (error) {
    return jsonResponse(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Error interno'
    });
  }
});

server.listen(config.port, () => {
  console.log(`Bot escuchando en http://localhost:${config.port}`);
  console.log(`Modo: ${config.mode} | tradeEnabled: ${config.tradeEnabled}`);
  console.log(`Scanner: ${config.scannerEnabled ? 'activo' : 'apagado'} | ${config.scannerSymbols.join(',')} ${config.scannerTimeframe}`);
  scanner.start();
});
