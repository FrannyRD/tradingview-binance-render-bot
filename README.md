# Render + Binance Scanner Bot

Bot de trading Spot para Render y Binance. Puede trabajar sin TradingView: consulta velas publicas de Binance, evalua una estrategia EMA 20/50/200 con pullback y registra senales en el dashboard. Viene en `dry-run` por defecto para evitar operaciones reales accidentales.

> Aviso: esto no garantiza ganancias. Es software para automatizar una estrategia; si la estrategia pierde, el bot tambien pierde. Pruebalo primero en `dry-run` y Binance Spot Testnet.

## Que incluye

- Scanner automatico de mercado desde Binance
- Boton manual `Escanear` en el dashboard
- Dashboard con resumen de salud, ultimo escaneo, simbolos, eventos, riesgo, posiciones abiertas y PnL sincronizado desde Binance
- API `POST /api/scan/run` para disparar una revision
- Webhook opcional `POST /webhook/tradingview`
- Dashboard `GET /dashboard`
- Modo `dry-run`, `demo`, `testnet` y `live`
- Ejecucion en Futures demo para poder operar compras y ventas/shorts
- Calculo de posicion por porcentaje de riesgo
- Limite de perdida diaria
- Limite de operaciones abiertas
- Limite maximo de operaciones por dia
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
  -> dry-run, Binance Demo Futures, Binance Testnet o Binance Live
  -> dashboard con eventos, posiciones y ganancias/costos de Binance
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
EXECUTION_MARKET=futures
FUTURES_LEVERAGE=1
RISK_PER_TRADE_PCT=0.10
MAX_DAILY_LOSS_PCT=3
MAX_OPEN_TRADES=1
MAX_DAILY_TRADES=2
TRADE_COOLDOWN_MINUTES=240
BLOCK_SYMBOL_WHEN_POSITION_OPEN=true
ALLOWED_SYMBOLS=BTCUSDT,ETHUSDT
LONG_ONLY=false
REQUIRE_PROTECTIVE_ORDERS=true
PROTECTIVE_ORDERS_ENABLED=true
SCANNER_ENABLED=true
SCANNER_SYMBOLS=BTCUSDT,ETHUSDT
SCANNER_TIMEFRAME=1h
SCANNER_INTERVAL_SECONDS=300
SCANNER_LOOKBACK=300
SCANNER_USE_CLOSED_CANDLE=true
SCANNER_RISK_REWARD=2
SCANNER_MIN_RISK_REWARD=1.5
SCANNER_ATR_LENGTH=14
SCANNER_ATR_STOP_MULT=1.5
SCANNER_PULLBACK_ATR_MULT=0.35
SCANNER_MIN_EMA_SEPARATION_ATR=0.12
SCANNER_MIN_EMA200_SLOPE_ATR=0.03
SCANNER_MAX_STOP_PCT=2
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

Luego usa Binance Demo Trading:

```env
BOT_MODE=demo
TRADE_ENABLED=true
EXECUTION_MARKET=futures
FUTURES_LEVERAGE=1
BINANCE_API_KEY=tu_key_demo
BINANCE_API_SECRET=tu_secret_demo
```

Mi configuracion sugerida para demo:

```env
BOT_MODE=demo
TRADE_ENABLED=true
RISK_PER_TRADE_PCT=0.10
MAX_OPEN_TRADES=1
MAX_DAILY_TRADES=2
MAX_DAILY_LOSS_PCT=3
```

Para esta version conservadora enfocada en mejores entradas:

```env
ALLOWED_SYMBOLS=BTCUSDT,ETHUSDT
SCANNER_SYMBOLS=BTCUSDT,ETHUSDT
SCANNER_TIMEFRAME=1h
SCANNER_INTERVAL_SECONDS=300
RISK_PER_TRADE_PCT=0.10
TRADE_COOLDOWN_MINUTES=240
BLOCK_SYMBOL_WHEN_POSITION_OPEN=true
LONG_ONLY=false
EXECUTION_MARKET=futures
FUTURES_LEVERAGE=1
SCANNER_MIN_EMA_SEPARATION_ATR=0.12
SCANNER_MIN_EMA200_SLOPE_ATR=0.03
SCANNER_MAX_STOP_PCT=2
```

Las senales `BUY` abren largos y las senales `SELL` abren shorts en Futures. En Spot una venta no es short; por eso el bot bloquea `SELL` si `EXECUTION_MARKET` no es `futures`.

En Futures, la proteccion usa ordenes condicionales por `/fapi/v1/algoOrder` para stop loss y take profit. Si Binance acepta la entrada pero rechaza la proteccion, el dashboard registra `order.protection_failed`; en ese caso revisa Binance Demo y cierra o protege la posicion manualmente antes de seguir probando.

El dashboard consulta Binance en `/api/status` para mostrar:

- PnL abierto: ganancias o perdidas no realizadas de las posiciones que siguen abiertas.
- PnL realizado: ganancias o perdidas ya cerradas, tomadas desde el historial `REALIZED_PNL`.
- Comisiones y funding: costos que Binance registra aparte del precio de entrada/salida.
- Posiciones abiertas: lado long/short, entrada y PnL actual.

Si ves ordenes en Binance pero el PnL realizado aparece en cero, normalmente significa que la posicion sigue abierta. La ganancia cerrada aparece cuando Binance ejecuta el take profit, stop loss o cuando cierras la posicion manualmente.

Si usas el Spot Testnet oficial de Binance en `testnet.binance.vision`, usa:

```env
BOT_MODE=testnet
TRADE_ENABLED=true
BINANCE_API_KEY=tu_key_testnet
BINANCE_API_SECRET=tu_secret_testnet
```

Con esto el bot opera menos, pero con filtros mas exigentes: maximo 1 posicion abierta, 2 intentos por dia, solo BTC/ETH, timeframe 1h, medias EMA completamente alineadas, separacion minima entre EMAs para evitar lateralidad y stop maximo de 2% del precio. `BLOCK_SYMBOL_WHEN_POSITION_OPEN=true` evita que el bot siga agregando entradas en un simbolo que ya tiene posicion abierta, y `TRADE_COOLDOWN_MINUTES=240` obliga a esperar 4 horas antes de volver a operar el mismo simbolo. Si el rendimiento en demo es estable durante varias semanas, se puede subir gradualmente.

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
