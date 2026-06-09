// OANDA v20 REST API integration for Forex trading
// Practice account: https://api-fxpractice.oanda.com
// Live account:     https://api-fxtrade.oanda.com

export interface OANDAConfig {
  accountId: string
  apiKey: string
  practice: boolean // true = demo, false = live
}

export interface OANDAOrder {
  instrument: string // e.g. "EUR_USD"
  units: number      // positive = buy, negative = sell
  type: 'MARKET' | 'LIMIT' | 'STOP'
  price?: number     // for LIMIT/STOP orders
  stopLossOnFill?: { price: string }
  takeProfitOnFill?: { price: string }
}

export interface OANDAPosition {
  instrument: string
  units: number
  avgPrice: number
  pl: number
  unrealizedPL: number
}

// ── Base URL ──────────────────────────────────────────────────────────────────

export function getOANDABaseUrl(config: OANDAConfig): string {
  return config.practice
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com'
}

// ── Auth headers helper ───────────────────────────────────────────────────────

function oandaHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

// ── Account discovery ─────────────────────────────────────────────────────────

export async function getOANDAAccounts(
  apiKey: string,
  practice: boolean,
): Promise<any> {
  const base = practice
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com'

  const res = await fetch(`${base}/v3/accounts`, {
    headers: oandaHeaders(apiKey),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OANDA getAccounts ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Account summary / balance ─────────────────────────────────────────────────

export async function getOANDABalance(config: OANDAConfig): Promise<{
  balance: number
  currency: string
  unrealizedPL: number
  nav: number
}> {
  const base = getOANDABaseUrl(config)
  const res = await fetch(
    `${base}/v3/accounts/${config.accountId}/summary`,
    { headers: oandaHeaders(config.apiKey) },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OANDA getBalance ${res.status}: ${text}`)
  }
  const data = await res.json()
  const acct = data.account
  return {
    balance:      parseFloat(acct.balance      ?? '0'),
    currency:     acct.currency                ?? 'USD',
    unrealizedPL: parseFloat(acct.unrealizedPL ?? '0'),
    nav:          parseFloat(acct.NAV          ?? '0'),
  }
}

// ── Place order ───────────────────────────────────────────────────────────────

export async function placeOANDAOrder(
  config: OANDAConfig,
  order: OANDAOrder,
): Promise<{ orderId: string; status: string }> {
  const base = getOANDABaseUrl(config)

  const orderBody: Record<string, any> = {
    type:       order.type,
    instrument: order.instrument,
    units:      String(order.units),
  }

  if (order.type !== 'MARKET' && order.price !== undefined) {
    orderBody.price = String(order.price)
  }
  if (order.stopLossOnFill)   orderBody.stopLossOnFill   = order.stopLossOnFill
  if (order.takeProfitOnFill) orderBody.takeProfitOnFill = order.takeProfitOnFill

  const res = await fetch(
    `${base}/v3/accounts/${config.accountId}/orders`,
    {
      method:  'POST',
      headers: oandaHeaders(config.apiKey),
      body:    JSON.stringify({ order: orderBody }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OANDA placeOrder ${res.status}: ${text}`)
  }
  const data = await res.json()

  // Response contains either orderFillTransaction or orderCreateTransaction
  const tx =
    data.orderFillTransaction ??
    data.orderCreateTransaction ??
    data.relatedTransactionIDs?.[0]

  return {
    orderId: tx?.id ?? data.relatedTransactionIDs?.[0] ?? 'unknown',
    status:  data.orderFillTransaction ? 'FILLED' : 'PENDING',
  }
}

// ── Open positions ────────────────────────────────────────────────────────────

export async function getOANDAPositions(
  config: OANDAConfig,
): Promise<OANDAPosition[]> {
  const base = getOANDABaseUrl(config)
  const res = await fetch(
    `${base}/v3/accounts/${config.accountId}/openPositions`,
    { headers: oandaHeaders(config.apiKey) },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OANDA getPositions ${res.status}: ${text}`)
  }
  const data = await res.json()

  return (data.positions ?? []).map((p: any) => {
    // OANDA returns long + short sub-objects; pick whichever side has units
    const longUnits  = parseFloat(p.long?.units  ?? '0')
    const shortUnits = parseFloat(p.short?.units ?? '0')
    const isLong     = Math.abs(longUnits) >= Math.abs(shortUnits)
    const side       = isLong ? p.long : p.short

    return {
      instrument:   p.instrument,
      units:        parseFloat(side?.units         ?? '0'),
      avgPrice:     parseFloat(side?.averagePrice  ?? '0'),
      pl:           parseFloat(side?.pl            ?? '0'),
      unrealizedPL: parseFloat(side?.unrealizedPL ?? '0'),
    } as OANDAPosition
  })
}

// ── Close position ────────────────────────────────────────────────────────────

export async function closeOANDAPosition(
  config: OANDAConfig,
  instrument: string,
): Promise<void> {
  const base = getOANDABaseUrl(config)
  const res = await fetch(
    `${base}/v3/accounts/${config.accountId}/positions/${instrument}/close`,
    {
      method:  'PUT',
      headers: oandaHeaders(config.apiKey),
      // Close all long and short units
      body: JSON.stringify({ longUnits: 'ALL', shortUnits: 'ALL' }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OANDA closePosition ${res.status}: ${text}`)
  }
}

// ── Symbol conversion ─────────────────────────────────────────────────────────

/**
 * Converts common symbol formats to OANDA instrument notation.
 * Examples:
 *   "EURUSD=X"  → "EUR_USD"
 *   "GBPUSD=X"  → "GBP_USD"
 *   "EUR/USD"   → "EUR_USD"
 *   "EURUSD"    → "EUR_USD"  (assumes 6-char pairs)
 */
export function convertSymbolToOANDA(symbol: string): string {
  // Strip Yahoo Finance suffix
  let s = symbol.replace(/=X$/i, '').toUpperCase()

  // Slash notation: EUR/USD → EUR_USD
  if (s.includes('/')) return s.replace('/', '_')

  // Already underscore-separated
  if (s.includes('_')) return s

  // Raw 6-char pair like EURUSD → EUR_USD
  if (s.length === 6) return `${s.slice(0, 3)}_${s.slice(3)}`

  // Fallback: return as-is
  return s
}
