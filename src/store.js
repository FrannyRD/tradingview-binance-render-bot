import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso, todayKey } from './utils.js';

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.eventsPath = path.join(dataDir, 'events.jsonl');
    this.statePath = path.join(dataDir, 'state.json');
  }

  async init(startingEquityUsdt) {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      await fs.access(this.statePath);
    } catch {
      await this.saveState({
        equityUsdt: startingEquityUsdt,
        openTrades: [],
        daily: {},
        scanner: {
          lastSignalKeys: {}
        },
        lastTradeAtBySymbol: {},
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }
  }

  async loadState() {
    const raw = await fs.readFile(this.statePath, 'utf8');
    const state = JSON.parse(raw);
    state.openTrades ||= [];
    state.daily ||= {};
    state.lastTradeAtBySymbol ||= {};
    state.scanner ||= { lastSignalKeys: {} };
    state.scanner.lastSignalKeys ||= {};
    return state;
  }

  async saveState(state) {
    await fs.writeFile(this.statePath, `${JSON.stringify({ ...state, updatedAt: nowIso() }, null, 2)}\n`);
  }

  async appendEvent(event) {
    await fs.appendFile(this.eventsPath, `${JSON.stringify({ ...event, createdAt: nowIso() })}\n`);
  }

  async listEvents(limit = 100) {
    try {
      const raw = await fs.readFile(this.eventsPath, 'utf8');
      return raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .slice(-limit)
        .reverse();
    } catch {
      return [];
    }
  }

  async recordAcceptedSignal(signal, result) {
    await this.appendEvent({ type: 'signal.accepted', signal, result });
  }

  async recordRejectedSignal(signal, reason) {
    await this.appendEvent({ type: 'signal.rejected', signal, reason });
  }

  async recordOrder(signal, order, plan) {
    const state = await this.loadState();
    const key = todayKey();
    state.daily[key] ||= { realizedPnlUsdt: 0, orders: 0 };
    state.daily[key].orders += 1;
    state.lastTradeAtBySymbol ||= {};
    state.lastTradeAtBySymbol[signal.symbol] = nowIso();
    state.openTrades.push({
      id: order.clientOrderId || order.orderId || crypto.randomUUID(),
      symbol: signal.symbol,
      side: signal.action,
      entryPrice: plan.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      quantity: plan.quantity,
      openedAt: nowIso(),
      status: 'open',
      order
    });
    await this.saveState(state);
    await this.appendEvent({ type: 'order.created', signal, order, plan });
  }

  async markScannerSignalIfNew(signalKey) {
    const state = await this.loadState();
    if (state.scanner.lastSignalKeys[signalKey]) return false;
    state.scanner.lastSignalKeys[signalKey] = nowIso();
    await this.saveState(state);
    await this.appendEvent({ type: 'scanner.signal.new', signalKey });
    return true;
  }
}
