// Binance REST API for Crypto spot trading
// Spot base:  https://api.binance.com
// Testnet:    https://testnet.binance.vision

import { createHmac } from 'crypto'

export interface BinanceConfig {
  apiKey: string
  secretKey: string
  testnet: boolean
}

// ── Base URL ──────────────────────────────────────────────────────────────────

export function getBinanceBaseUrl(testnet: boolean): string {
  return testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com'
}

// ── HMAC-SHA256 signature ─────────────────────────────────────────────────────

function signQuery(queryString: string, secret: string): string {
  return createHmac('sha256', secret).update(queryString).digest('hex')
}

function binanceHeaders(apiKey: string) {
  return { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }
}

// ── Account balances ──────────────────────────────────────────────────────────

export async function getBinanceBalance(
  apiKey: string,
  secretKey: string,
  testnet: boolean,
): Promise<{ asset: string; free: number; locked: number }[]> {
  const base      = getBinanceBaseUrl(testnet)
  const timestamp = Date.now()
  const qs        = `timestamp=${timestamp}`
  const signature = signQuery(qs, secretKey)

  const res = await fetch(
    `${base}/api/v3/account?${qs}&signature=${signature}`,
    { headers: binanceHeaders(apiKey) },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Binance getBalance ${res.status}: ${text}`)
  }
  const data = await res.json()

  // Return only non-zero balances
  return (data.balances ?? [])
    .map((b: any) => ({
      asset:  b.asset as string,
      free:   parseFloat(b.free   ?? '0'),
      locked: parseFloat(b.locked ?? '0'),
    }))
    .filter((b: { asset: string; free: number; locked: number }) => b.free > 0 || b.locked > 0)
}

// ── Place order ───────────────────────────────────────────────────────────────

export async function placeBinanceOrder(
  config: BinanceConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price?: number,
): Promise<{ orderId: string; status: string }> {
  const base      = getBinanceBaseUrl(config.testnet)
  const timestamp = Date.now()

  const params: Record<string, string> = {
    symbol,
    side,
    type:      price ? 'LIMIT' : 'MARKET',
    quantity:  String(quantity),
    timestamp: String(timestamp),
  }

  if (price) {
    params.price       = String(price)
    params.timeInForce = 'GTC'
  }

  const qs        = new URLSearchParams(params).toString()
  const signature = signQuery(qs, config.secretKey)
  const body      = `${qs}&signature=${signature}`

  const res = await fetch(`${base}/api/v3/order`, {
    method:  'POST',
    headers: binanceHeaders(config.apiKey),
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Binance placeOrder ${res.status}: ${text}`)
  }
  const data = await res.json()
  return {
    orderId: String(data.orderId),
    status:  data.status ?? 'UNKNOWN',
  }
}

// ── Open orders (positions proxy for spot) ────────────────────────────────────

export async function getBinancePositions(config: BinanceConfig): Promise<any[]> {
  const base      = getBinanceBaseUrl(config.testnet)
  const timestamp = Date.now()
  const qs        = `timestamp=${timestamp}`
  const signature = signQuery(qs, config.secretKey)

  const res = await fetch(
    `${base}/api/v3/openOrders?${qs}&signature=${signature}`,
    { headers: binanceHeaders(config.apiKey) },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Binance getPositions ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Symbol conversion ─────────────────────────────────────────────────────────

/**
 * Converts common symbol formats to Binance trading pair notation.
 * Examples:
 *   "BTC-USD"   → "BTCUSDT"
 *   "ETH-USD"   → "ETHUSDT"
 *   "BTC/USDT"  → "BTCUSDT"
 *   "BTCUSD"    → "BTCUSDT"
 *   "SOL-USDT"  → "SOLUSDT"
 */
export function convertSymbolToBinance(symbol: string): string {
  let s = symbol.toUpperCase()

  // Remove slashes/dashes
  s = s.replace(/[-/]/g, '')

  // Replace trailing USD (not USDT) with USDT
  if (s.endsWith('USD') && !s.endsWith('USDT')) {
    s = s.slice(0, -3) + 'USDT'
  }

  return s
}
