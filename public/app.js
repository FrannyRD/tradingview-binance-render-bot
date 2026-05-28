const $ = (id) => document.getElementById(id);

function money(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function shortJson(value) {
  return JSON.stringify(value).slice(0, 180);
}

async function loadStatus() {
  const response = await fetch('/api/status');
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Error');

  $('mode').textContent = data.config.mode;
  $('tradeEnabled').innerHTML = data.config.tradeEnabled
    ? '<span class="badge good">activo</span>'
    : '<span class="badge warn">apagado</span>';
  $('equity').textContent = `$${money(data.state.equityUsdt)}`;
  $('openTrades').textContent = data.state.openTrades.filter((trade) => trade.status === 'open').length;
  $('scanner').innerHTML = data.config.scannerEnabled
    ? '<span class="badge good">activo</span>'
    : '<span class="badge warn">apagado</span>';

  $('config').innerHTML = Object.entries(data.config)
    .map(([key, value]) => `<p><code>${key}</code> ${Array.isArray(value) ? value.join(', ') : value}</p>`)
    .join('');

  $('events').innerHTML = data.events.map((event) => `
    <tr>
      <td>${new Date(event.createdAt).toLocaleString()}</td>
      <td><code>${event.type}</code></td>
      <td>${event.reason || shortJson(event.signal || event.result || event.order || {})}</td>
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
