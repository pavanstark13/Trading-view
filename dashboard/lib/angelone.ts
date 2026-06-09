// Angel One Smart API client — all calls are server-side only
import { createHmac } from 'crypto'

const BASE = 'https://apiconnect.angelbroking.com'

// ── TOTP auto-generation from stored secret ───────────────────────────────────
function b32decode(input: string): Buffer {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const str = input.toUpperCase().replace(/[\s=]/g, '')
  let bits = 0, val = 0
  const out: number[] = []
  for (const c of str) {
    const i = ALPHA.indexOf(c)
    if (i < 0) continue
    val = (val << 5) | i; bits += 5
    if (bits >= 8) { out.push((val >> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}

export function generateTOTP(secret: string): string {
  const key = b32decode(secret)
  const t   = BigInt(Math.floor(Date.now() / 30000))
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(t)
  const hmac = createHmac('sha1', key).update(msg).digest()
  const off  = hmac[hmac.length - 1] & 0x0f
  const code = (hmac.readUInt32BE(off) & 0x7fffffff) % 1_000_000
  return code.toString().padStart(6, '0')
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AngelSession {
  jwtToken: string
  refreshToken: string
  feedToken: string
  clientcode: string
  name: string
  email: string
  mobileno: string
  exchanges: string[]
  products: string[]
}

export interface AngelFunds {
  net: string
  availablecash: string
  utiliseddebits: string
  utilisedmargin: string
  m2mUnrealised: string
  m2mRealised: string
  collateral: string
}

export interface AngelPosition {
  tradingsymbol: string
  exchange: string
  symboltoken: string
  producttype: string
  netqty: string
  unrealised: string
  realised: string
  ltp: string
  buyavgprice: string
  sellavgprice: string
}

export interface AngelOrder {
  orderid: string
  tradingsymbol: string
  transactiontype: string
  quantity: string
  status: string
  orderstatus: string
  ordertype: string
  price: string
  triggerprice: string
  exchange: string
  producttype: string
  stoploss: string
  squareoff: string
  updatetime: string
}

export interface PlaceOrderParams {
  variety:         'NORMAL' | 'STOPLOSS' | 'ROBO'
  tradingsymbol:   string
  symboltoken:     string
  transactiontype: 'BUY' | 'SELL'
  exchange:        'NSE' | 'BSE' | 'NFO' | 'MCX' | 'CDS'
  ordertype:       'MARKET' | 'LIMIT' | 'STOPLOSS_MARKET' | 'STOPLOSS_LIMIT'
  producttype:     'INTRADAY' | 'DELIVERY' | 'CARRYFORWARD' | 'MARGIN'
  duration:        'DAY' | 'IOC'
  price:           string
  triggerprice?:   string
  squareoff?:      string
  stoploss?:       string
  quantity:        string
}

// ── Headers helper ────────────────────────────────────────────────────────────
function hdr(apiKey: string, jwt?: string) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': apiKey,
    ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function angelLogin(
  apiKey: string, clientId: string, password: string, totp: string
): Promise<AngelSession> {
  const res  = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: 'POST', headers: hdr(apiKey),
    body: JSON.stringify({ clientcode: clientId, password, totp }),
  })
  const json = await res.json()
  if (!json.status || !json.data) throw new Error(json.message || 'Login failed')
  return json.data as AngelSession
}

// ── Funds ─────────────────────────────────────────────────────────────────────
export async function angelGetFunds(apiKey: string, jwt: string): Promise<AngelFunds> {
  const res  = await fetch(`${BASE}/rest/secure/angelbroking/user/v1/getRMS`, {
    headers: hdr(apiKey, jwt),
  })
  const json = await res.json()
  if (!json.status || !json.data) throw new Error(json.message || 'Failed to fetch funds')
  return json.data as AngelFunds
}

// ── Positions ─────────────────────────────────────────────────────────────────
export async function angelGetPositions(apiKey: string, jwt: string): Promise<AngelPosition[]> {
  const res  = await fetch(`${BASE}/rest/secure/angelbroking/order/v1/getPosition`, {
    headers: hdr(apiKey, jwt),
  })
  const json = await res.json()
  return (json.data?.day ?? []) as AngelPosition[]
}

// ── Order book ────────────────────────────────────────────────────────────────
export async function angelGetOrders(apiKey: string, jwt: string): Promise<AngelOrder[]> {
  const res  = await fetch(`${BASE}/rest/secure/angelbroking/order/v1/getOrderBook`, {
    headers: hdr(apiKey, jwt),
  })
  const json = await res.json()
  return (json.data ?? []) as AngelOrder[]
}

// ── Place order ───────────────────────────────────────────────────────────────
export async function angelPlaceOrder(
  apiKey: string, jwt: string, order: PlaceOrderParams
): Promise<{ orderid: string; uniqueorderid: string }> {
  const res  = await fetch(`${BASE}/rest/secure/angelbroking/order/v1/placeOrder`, {
    method: 'POST', headers: hdr(apiKey, jwt),
    body: JSON.stringify(order),
  })
  const json = await res.json()
  if (!json.status || !json.data) throw new Error(json.message || 'Order failed: ' + JSON.stringify(json))
  return json.data
}

// ── Cancel order ──────────────────────────────────────────────────────────────
export async function angelCancelOrder(
  apiKey: string, jwt: string, variety: string, orderid: string
): Promise<void> {
  await fetch(`${BASE}/rest/secure/angelbroking/order/v1/cancelOrder`, {
    method: 'POST', headers: hdr(apiKey, jwt),
    body: JSON.stringify({ variety, orderid }),
  })
}

// ── Instrument search ─────────────────────────────────────────────────────────
export async function angelSearchScrip(
  apiKey: string, jwt: string, exchange: string, query: string
): Promise<{ symboltoken: string; tradingsymbol: string; name: string; expiry: string }[]> {
  const res  = await fetch(`${BASE}/rest/secure/angelbroking/order/v1/searchScrip`, {
    method: 'POST', headers: hdr(apiKey, jwt),
    body: JSON.stringify({ exchange, searchscrip: query }),
  })
  const json = await res.json()
  return json.data ?? []
}

// ── Signal → Angel One instrument map ────────────────────────────────────────
export const SIGNAL_MAP: Record<string, {
  label: string; exchange: 'MCX' | 'CDS' | null; searchQuery: string
  lotSize: number; note: string; available: boolean
}> = {
  XAUUSD: { label: 'MCX Gold (MiniGold)',    exchange: 'MCX', searchQuery: 'GOLDM',      lotSize: 100,  note: 'MiniGold 100g contract. MCX commodity.', available: true  },
  XAGUSD: { label: 'MCX Silver Micro',       exchange: 'MCX', searchQuery: 'SILVERMIC',   lotSize: 5000, note: 'Silver Micro 5kg contract. MCX commodity.', available: true },
  EURUSD: { label: 'NSE EURINR (correlated)',exchange: 'CDS', searchQuery: 'EURINR',      lotSize: 1000, note: 'EURINR ≠ EURUSD — INR-based. Correlated but not the same instrument.', available: true },
  GBPUSD: { label: 'NSE GBPINR (correlated)',exchange: 'CDS', searchQuery: 'GBPINR',      lotSize: 1000, note: 'GBPINR ≠ GBPUSD — INR-based. Correlated signal reference only.', available: true },
  USDJPY: { label: 'NSE USDINR (partial)',   exchange: 'CDS', searchQuery: 'USDINR',      lotSize: 1000, note: 'USDINR only. USDJPY has no direct CDS equivalent.', available: true },
  USDCHF: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'USDCHF has no Angel One equivalent. Use a forex broker.', available: false },
  USDCAD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'USDCAD has no Angel One equivalent. Use a forex broker.', available: false },
  AUDUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'AUDUSD has no Angel One equivalent. Use a forex broker.', available: false },
  NZDUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'NZDUSD has no Angel One equivalent. Use a forex broker.', available: false },
  GBPJPY: { label: 'NSE GBPINR (partial)',   exchange: 'CDS', searchQuery: 'GBPINR',      lotSize: 1000, note: 'GBP leg only via GBPINR. Partial correlation.', available: true },
  EURJPY: { label: 'NSE EURINR (partial)',   exchange: 'CDS', searchQuery: 'EURINR',      lotSize: 1000, note: 'EUR leg only via EURINR. Partial correlation.', available: true },
  EURCAD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'No Angel One equivalent.', available: false },
  BTCUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'Crypto not supported on Angel One. Use CoinDCX or WazirX.', available: false },
  ETHUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'Crypto not supported on Angel One. Use CoinDCX or WazirX.', available: false },
}
