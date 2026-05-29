const $ = (id) => document.getElementById(id);

function money(value, digits = 2) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function signedMoney(value, digits = 2) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? '+' : '';
  return `${sign}$${money(amount, digits)}`;
}

function valueClass(value) {
  const amount = Number(value || 0);
  if (amount > 0) return 'value-good';
  if (amount < 0) return 'value-bad';
  return '';
}

function compact(value) {
  if (value === undefined || value === null) return '-';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 220);
  return String(value);
}

function badge(text, kind = '') {
  return `<span class="badge ${kind}">${text}</span>`;
}

function latestEvent(events, type) {
  return events.find((event) => event.type === type);
}

function countEvents(events, type) {
  return events.filter((event) => event.type === type).length;
}

function eventDetail(event) {
  if (event.type === 'scanner.completed') {
    const results = event.results || [];
    const signals = results.filter((item) => item.signal).length;
    return `${results.length} simbolos, ${signals} senales`;
  }
  if (event.type === 'scanner.error') return event.error || 'Error';
  if (event.type === 'signal.accepted') {
    const signal = event.signal || {};
    const plan = event.result?.plan || {};
    return `${signal.symbol} ${signal.action} entrada ${money(signal.price)} riesgo $${money(plan.maxRiskUsdt)}`;
  }
  if (event.type === 'signal.rejected') return event.reason || 'Rechazada';
  if (event.type === 'order.created') return `${event.signal?.symbol || '-'} orden creada`;
  if (event.type === 'order.protection_failed') return event.error || 'Proteccion fallida';
  return compact(event.signal || event.result || event.order || event.results || {});
}

function renderScannerResults(event) {
  const results = event?.results || [];
  $('lastScanTime').textContent = event?.createdAt ? new Date(event.createdAt).toLocaleString() : 'sin datos';
  $('scannerResults').innerHTML = results.map((item) => `
    <tr>
      <td><code>${item.symbol}</code></td>
      <td>${item.price ? money(item.price, item.price > 100 ? 2 : 4) : '-'}</td>
      <td>${item.signal ? badge(item.duplicate ? 'duplicada' : 'senal', item.duplicate ? 'warn' : 'good') : badge('sin setup')}</td>
      <td>${item.candleTime ? new Date(item.candleTime).toLocaleString() : '-'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">Sin escaneos todavia.</td></tr>';
}

function renderOpenTrades(openTrades, account) {
  const accountPositions = account?.positions || [];
  if (accountPositions.length) {
    $('openTradesTable').innerHTML = accountPositions.map((position) => `
      <tr>
        <td><code>${position.symbol}</code></td>
        <td>${badge(position.side, position.side === 'LONG' ? 'good' : 'warn')}</td>
        <td>${money(position.entryPrice, position.entryPrice > 100 ? 2 : 4)}</td>
        <td class="${valueClass(position.unrealizedPnlUsdt)}">${signedMoney(position.unrealizedPnlUsdt)}</td>
      </tr>
    `).join('');
    return;
  }

  const active = openTrades.filter((trade) => trade.status === 'open');
  $('openTradesTable').innerHTML = active.map((trade) => `
    <tr>
      <td><code>${trade.symbol}</code></td>
      <td>${badge(trade.side === 'SELL' ? 'SHORT' : 'LONG', trade.side === 'SELL' ? 'warn' : 'good')}</td>
      <td>${money(trade.entryPrice, trade.entryPrice > 100 ? 2 : 4)}</td>
      <td class="muted">Binance sincronizando</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">Sin operaciones abiertas.</td></tr>';
}

function renderKeyValue(target, entries) {
  $(target).innerHTML = entries.map(([key, value]) => `
    <div class="kv">
      <span>${key}</span>
      <strong>${value}</strong>
    </div>
  `).join('');
}

function renderAccountSummary(account, accountError) {
  if (accountError) {
    $('accountSummary').innerHTML = `<p class="muted">No pude sincronizar Binance: ${accountError}</p>`;
    $('incomeTable').innerHTML = '<tr><td colspan="4" class="muted">Sin datos de Binance.</td></tr>';
    return;
  }

  if (!account) {
    $('accountSummary').innerHTML = '<p class="muted">Activa trading con claves API para ver PnL desde Binance.</p>';
    $('incomeTable').innerHTML = '<tr><td colspan="4" class="muted">Sin datos de Binance.</td></tr>';
    return;
  }

  const totals = account.totals || {};
  renderKeyValue('accountSummary', [
    ['Balance billetera', `$${money(totals.walletBalanceUsdt)}`],
    ['Balance margen', `$${money(totals.marginBalanceUsdt)}`],
    ['Disponible', `$${money(totals.availableBalanceUsdt)}`],
    ['Margen usado', `$${money(totals.initialMarginUsdt)}`],
    ['PnL no realizado', `<span class="${valueClass(totals.unrealizedPnlUsdt)}">${signedMoney(totals.unrealizedPnlUsdt)}</span>`],
    ['PnL realizado', `<span class="${valueClass(totals.realizedPnlUsdt)}">${signedMoney(totals.realizedPnlUsdt)}</span>`],
    ['Comisiones', `<span class="${valueClass(totals.commissionUsdt)}">${signedMoney(totals.commissionUsdt)}</span>`],
    ['Funding', `<span class="${valueClass(totals.fundingFeeUsdt)}">${signedMoney(totals.fundingFeeUsdt)}</span>`],
    ['Neto registrado', `<span class="${valueClass(totals.netIncomeUsdt)}">${signedMoney(totals.netIncomeUsdt)}</span>`],
    ['Sincronizado', account.syncedAt ? new Date(account.syncedAt).toLocaleString() : '-']
  ]);

  const incomeRows = account.income?.recent || [];
  $('incomeTable').innerHTML = incomeRows.map((row) => `
    <tr>
      <td>${row.time ? new Date(row.time).toLocaleString() : '-'}</td>
      <td><code>${row.symbol}</code></td>
      <td><code>${row.incomeType}</code></td>
      <td class="${valueClass(row.income)}">${signedMoney(row.income, 6)} ${row.asset || 'USDT'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">Aun no hay ganancias cerradas. El PnL realizado aparece cuando una posicion se cierra.</td></tr>';
}

async function loadStatus() {
  const response = await fetch('/api/status');
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Error');

  const events = data.events || [];
  const openTrades = data.state.openTrades || [];
  const account = data.account;
  const totals = account?.totals || {};
  const latestScan = latestEvent(events, 'scanner.completed');
  const acceptedSignals = countEvents(events, 'signal.accepted');
  const rejectedSignals = countEvents(events, 'signal.rejected');
  const errors = countEvents(events, 'scanner.error');
  const orders = countEvents(events, 'order.created');
  const scans = countEvents(events, 'scanner.completed');

  $('mode').textContent = data.config.mode;
  $('modeNote').textContent = data.config.mode === 'dry-run' ? 'simulacion sin ordenes' : data.config.mode;
  $('tradeEnabled').innerHTML = data.config.tradeEnabled ? badge('activo', 'good') : badge('apagado', 'warn');
  $('riskNote').textContent = `${data.config.riskPerTradePct}% por trade`;
  $('equity').textContent = `$${money(totals.marginBalanceUsdt ?? data.state.equityUsdt)}`;
  $('equityNote').textContent = account ? `${account.market} sincronizado` : 'base para calculo de riesgo';
  $('unrealizedPnl').textContent = signedMoney(totals.unrealizedPnlUsdt);
  $('unrealizedPnl').className = `metric-value ${valueClass(totals.unrealizedPnlUsdt)}`;
  $('realizedPnl').textContent = signedMoney(totals.realizedPnlUsdt);
  $('realizedPnl').className = `metric-value ${valueClass(totals.realizedPnlUsdt)}`;
  $('realizedNote').textContent = account?.income?.incomeError ? 'income parcial' : 'ultimos movimientos';
  $('openTrades').textContent = account?.positions?.length ?? openTrades.filter((trade) => trade.status === 'open').length;
  $('openTradesLimit').textContent = `max ${data.config.maxOpenTrades} abiertas`;
  $('scanner').innerHTML = data.config.scannerEnabled ? badge('activo', 'good') : badge('apagado', 'warn');
  $('scannerNote').textContent = `${data.config.scannerTimeframe} cada ${data.config.scannerIntervalSeconds}s`;
  $('signals').textContent = acceptedSignals;
  $('signalsNote').textContent = `${rejectedSignals} rechazadas`;
  $('scanCount').textContent = scans;
  $('errorCount').textContent = errors;
  $('orderCount').textContent = orders;

  $('symbols').innerHTML = data.config.scannerSymbols.map((symbol) => `<span class="badge">${symbol}</span>`).join('');

  renderScannerResults(latestScan);
  renderOpenTrades(openTrades, account);
  renderAccountSummary(account, data.accountError);

  renderKeyValue('riskConfig', [
    ['Riesgo por trade', `${data.config.riskPerTradePct}%`],
    ['Mercado', data.config.executionMarket],
    ['Apalancamiento', `${data.config.futuresLeverage}x`],
    ['Max abiertas', data.config.maxOpenTrades],
    ['Max por dia', data.config.maxDailyTrades],
    ['Cooldown simbolo', `${data.config.tradeCooldownMinutes || 0} min`],
    ['Bloquear duplicadas', data.config.blockSymbolWhenPositionOpen ? 'si' : 'no'],
    ['Perdida diaria', `${data.config.maxDailyLossPct}%`],
    ['Solo long', data.config.longOnly ? 'si' : 'no'],
    ['Timeframe', data.config.scannerTimeframe],
    ['Vela cerrada', data.config.scannerUseClosedCandle ? 'si' : 'no'],
    ['Separacion EMA/ATR', data.config.scannerMinEmaSeparationAtr],
    ['Pendiente EMA200/ATR', data.config.scannerMinEma200SlopeAtr],
    ['Stop maximo', `${data.config.scannerMaxStopPct}%`]
  ]);

  renderKeyValue('config', [
    ['Modo', data.config.mode],
    ['Trading habilitado', data.config.tradeEnabled ? 'si' : 'no'],
    ['Mercado ejecucion', data.config.executionMarket],
    ['Scanner habilitado', data.config.scannerEnabled ? 'si' : 'no'],
    ['Intervalo', `${data.config.scannerIntervalSeconds}s`],
    ['Simbolos permitidos', data.config.allowedSymbols.join(', ')]
  ]);

  $('events').innerHTML = events.map((event) => `
    <tr>
      <td>${new Date(event.createdAt).toLocaleString()}</td>
      <td><code>${event.type}</code></td>
      <td>${eventDetail(event)}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" class="muted">Sin eventos todavia.</td></tr>';
}

$('refresh').addEventListener('click', loadStatus);
$('scan').addEventListener('click', async () => {
  $('scan').disabled = true;
  try {
    await fetch('/api/scan/run', { method: 'POST' });
    await loadStatus();
  } finally {
    $('scan').disabled = false;
  }
});

loadStatus().catch((error) => {
  $('events').innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
});

setInterval(() => {
  loadStatus().catch(() => {});
}, 30_000);
