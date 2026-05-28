# TradingView + Render + Binance Bot

Bot de trading Spot para recibir alertas de TradingView, validar riesgo, alojarse en Render y enviar ordenes a Binance. Viene en `dry-run` por defecto para evitar operaciones reales accidentales.

> Aviso: esto no garantiza ganancias. Es software para automatizar una estrategia; si la estrategia pierde, el bot tambien pierde. Pruebalo primero en `dry-run` y Binance Spot Testnet.

## Que incluye

- Webhook `POST /webhook/tradingview`
- Dashboard `GET /dashboard`
- Modo `dry-run`, `testnet` y `live`
- Calculo de posicion por porcentaje de riesgo
- Limite de perdida diaria
- Limite de operaciones abiertas
- Lista de simbolos permitidos
- Modo solo long por defecto
- Orden market en Binance Spot
- OCO de proteccion para take profit y stop loss en entradas BUY
- Pine Script para TradingView
- Configuracion lista para Render

## Flujo

```text
TradingView alert
  -> Render webhook
  -> validacion de secret, simbolo y riesgo
  -> Binance Spot Testnet o Live
  -> dashboard con eventos
```

## Instalacion local

```bash
cp .env.example .env
npm start
```

Abre:

```text
http://localhost:3000/dashboard
```

En esta maquina puede que `npm` no este instalado, pero Render si lo usa normalmente. El proyecto no tiene dependencias externas; tambien puedes correr:

```bash
node src/server.js
```

## Variables importantes

```env
WEBHOOK_SECRET=cambia-este-secreto-largo
BOT_MODE=dry-run
TRADE_ENABLED=false
BINANCE_API_KEY=
BINANCE_API_SECRET=
RISK_PER_TRADE_PCT=1
MAX_DAILY_LOSS_PCT=3
MAX_OPEN_TRADES=1
ALLOWED_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT
LONG_ONLY=true
REQUIRE_PROTECTIVE_ORDERS=true
PROTECTIVE_ORDERS_ENABLED=true
```

## Como probar el webhook

```bash
curl -X POST http://localhost:3000/webhook/tradingview \
  -H "content-type: application/json" \
  -d '{
    "secret": "cambia-este-secreto-largo",
    "strategy": "EMA_20_50_200_PULLBACK",
    "action": "BUY",
    "symbol": "BTCUSDT",
    "timeframe": "15",
    "price": 100,
    "stopLoss": 95,
    "takeProfit": 110
  }'
```

Debe responder `202` en `dry-run`.

## TradingView

1. Abre TradingView.
2. Pega el script de `scripts/tradingview-ema-pullback.pine`.
3. Cambia el `Webhook secret`.
4. Crea una alerta del script.
5. Activa Webhook URL:

```text
https://TU-SERVICIO.onrender.com/webhook/tradingview
```

El script usa `alert()` para mandar JSON completo con precio, stop y take profit.

## Binance

Primero usa Spot Testnet:

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

## Render

1. Sube el repo a GitHub.
2. En Render crea un Web Service desde ese repo.
3. Usa el `render.yaml` o configura:
   - Build command vacio
   - Start command `npm start`
   - Health check `/health`
4. Agrega variables de entorno en Render.
5. Prueba `/health` y `/dashboard`.

## Formato de alerta esperado

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
