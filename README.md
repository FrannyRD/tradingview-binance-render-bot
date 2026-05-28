# Render + Binance Scanner Bot

Bot de trading Spot para Render y Binance. Puede trabajar sin TradingView: consulta velas publicas de Binance, evalua una estrategia EMA 20/50/200 con pullback y registra senales en el dashboard. Viene en `dry-run` por defecto para evitar operaciones reales accidentales.

> Aviso: esto no garantiza ganancias. Es software para automatizar una estrategia; si la estrategia pierde, el bot tambien pierde. Pruebalo primero en `dry-run` y Binance Spot Testnet.

## Que incluye

- Scanner automatico de mercado desde Binance
- Boton manual `Escanear` en el dashboard
- API `POST /api/scan/run` para disparar una revision
- Webhook opcional `POST /webhook/tradingview`
- Dashboard `GET /dashboard`
- Modo `dry-run`, `testnet` y `live`
- Calculo de posicion por porcentaje de riesgo
- Limite de perdida diaria
- Limite de operaciones abiertas
- Lista de simbolos permitidos
- Modo solo long por defecto
- Orden market en Binance Spot
- OCO de proteccion para take profit y stop loss en entradas BUY
- Pine Script opcional para TradingView
- Configuracion lista para Render

## Flujo principal sin TradingView

```text
Render scanner
  -> consulta velas publicas de Binance
  -> evalua EMA 20/50/200 + pullback + vela de rechazo
  -> valida simbolo, stop loss, take profit y riesgo
  -> dry-run, Binance Spot Testnet o Binance Live
  -> dashboard con eventos
```

## Instalacion local

```bash
cp .env.example .env
npm install
npm start
```

Abre:

```text
http://localhost:3000/dashboard
```

El proyecto no tiene dependencias externas; tambien puedes correr:

```bash
node src/server.js
```

## Variables importantes

```env
BOT_MODE=dry-run
TRADE_ENABLED=false
RISK_PER_TRADE_PCT=1
MAX_DAILY_LOSS_PCT=3
MAX_OPEN_TRADES=1
ALLOWED_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT
LONG_ONLY=true
REQUIRE_PROTECTIVE_ORDERS=true
PROTECTIVE_ORDERS_ENABLED=true
SCANNER_ENABLED=true
SCANNER_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT
SCANNER_TIMEFRAME=1h
SCANNER_INTERVAL_SECONDS=300
SCANNER_LOOKBACK=300
SCANNER_USE_CLOSED_CANDLE=true
SCANNER_RISK_REWARD=2
SCANNER_MIN_RISK_REWARD=1.5
SCANNER_ATR_LENGTH=14
SCANNER_ATR_STOP_MULT=1.5
```

## Render

1. Sube el repo a GitHub.
2. En Render crea un Web Service desde ese repo.
3. Configura:
   - Build command `npm install`
   - Start command `npm start`
   - Health check `/health`
4. Agrega las variables de entorno.
5. Prueba `/health` y `/dashboard`.

## Como probar el scanner

Con el servicio activo, abre:

```text
https://TU-SERVICIO.onrender.com/dashboard
```

Pulsa `Escanear`. El bot consultara Binance y registrara un evento `scanner.completed`. Si encuentra una senal valida, veras `signal.accepted` en `dry-run`.

Tambien puedes probar por API:

```bash
curl -X POST https://TU-SERVICIO.onrender.com/api/scan/run
```

## Binance

Primero usa solo `dry-run`:

```env
BOT_MODE=dry-run
TRADE_ENABLED=false
```

Luego usa Spot Testnet:

```env
BOT_MODE=testnet
TRADE_ENABLED=true
BINANCE_API_KEY=tu_key_testnet
BINANCE_API_SECRET=tu_secret_testnet
```

Para live, ademas de cambiar claves reales:

```env
BOT_MODE=live
TRADE_ENABLED=true
I_UNDERSTAND_LIVE_RISK=true
```

Recomendaciones:

- Crea API key sin permisos de retiro.
- Restringe IP si puedes.
- Empieza con capital pequeno.
- Mantente en Spot antes de pensar en futuros.
- No subas `.env` a GitHub.

## TradingView opcional

TradingView solo es necesario si quieres usar alertas webhook desde su plataforma. Si tu plan no permite webhooks, usa el scanner interno.

1. Abre TradingView.
2. Pega el script de `scripts/tradingview-ema-pullback.pine`.
3. Cambia el `Webhook secret`.
4. Crea una alerta del script.
5. Activa Webhook URL:

```text
https://TU-SERVICIO.onrender.com/webhook/tradingview
```

## Formato de alerta TradingView

```json
{
  "secret": "cambia-este-secreto-largo",
  "strategy": "EMA_20_50_200_PULLBACK",
  "action": "BUY",
  "symbol": "BTCUSDT",
  "timeframe": "15",
  "price": 100,
  "stopLoss": 95,
  "takeProfit": 110
}
```

## Seguridad operativa

El bot arranca con `BOT_MODE=dry-run` y `TRADE_ENABLED=false`. No hace operaciones reales hasta que cambies ambas variables. Para modo live tambien exige `I_UNDERSTAND_LIVE_RISK=true`.
