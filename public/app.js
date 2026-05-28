const $ = (id) => document.getElementById(id);

function money(value, digits = 2) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
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

function renderOpenTrades(openTrades) {
  const active = openTrades.filter((trade) => trade.status === 'open');
  $('openTradesTable').innerHTML = active.map((trade) => `
    <tr>
      <td><code>${trade.symbol}</code></td>
      <td>${money(trade.entryPrice, trade.entryPrice > 100 ? 2 : 4)}</td>
      <td>${money(trade.stopLoss, 4)} / ${money(trade.takeProfit, 4)}</td>
      <td>${money(trade.quantity, 6)}</td>
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

async function loadStatus() {
  const response = await fetch('/api/status');
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Error');

  const events = data.events || [];
  const openTrades = data.state.openTrades || [];
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
  $('equity').textContent = `$${money(data.state.equityUsdt)}`;
  $('openTrades').textContent = openTrades.filter((trade) => trade.status === 'open').length;
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
  renderOpenTrades(openTrades);

  renderKeyValue('riskConfig', [
    ['Riesgo por trade', `${data.config.riskPerTradePct}%`],
    ['Max abiertas', data.config.maxOpenTrades],
    ['Max por dia', data.config.maxDailyTrades],
    ['Perdida diaria', `${data.config.maxDailyLossPct}%`],
    ['Solo long', data.config.longOnly ? 'si' : 'no'],
    ['Timeframe', data.config.scannerTimeframe],
    ['Vela cerrada', data.config.scannerUseClosedCandle ? 'si' : 'no']
  ]);

  renderKeyValue('config', [
    ['Modo', data.config.mode],
    ['Trading habilitado', data.config.tradeEnabled ? 'si' : 'no'],
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
