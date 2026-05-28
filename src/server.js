import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
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
      const events = await store.listEvents(50);
      return jsonResponse(res, 200, {
        ok: true,
        config: {
          mode: config.mode,
          tradeEnabled: config.tradeEnabled,
          allowedSymbols: config.allowedSymbols,
          riskPerTradePct: config.riskPerTradePct,
          maxDailyLossPct: config.maxDailyLossPct,
          maxOpenTrades: config.maxOpenTrades,
          longOnly: config.longOnly
        },
        state,
        events
      });
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
});
