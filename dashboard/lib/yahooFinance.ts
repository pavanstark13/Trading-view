/**
 * Market data fetcher with Yahoo Finance + Stooq fallback.
 *
 * Yahoo Finance auth flow (tried in order):
 *  1. Crumb extracted from finance.yahoo.com/quote/{sym} HTML
 *  2. Crumb from /v1/test/getcrumb with fc.yahoo.com cookies
 *  3. query2 with latest Chrome UA + period1/period2 params
 *  4. query1 direct (no crumb, older endpoint)
 *  5. v7 CSV download (daily only, no crumb needed)
 *
 * Fallback:
 *  6. Stooq CSV (free, no auth, daily data only)
 */

export interface YahooCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Cache-Control': 'no-cache',
}

// Cache crumb + cookies for up to 45 minutes
let crumbCache: { crumb: string; cookie: string; at: number } | null = null
const CRUMB_TTL = 45 * 60 * 1000

async function fetchCrumb(): Promise<{ crumb: string; cookie: string }> {
  const now = Date.now()
  if (crumbCache && now - crumbCache.at < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie }
  }

  let cookie = ''
  let crumb  = ''

  // Method A: fetch a quote page to get crumb embedded in __NEXT_DATA__ or JS
  try {
    const pageRes = await fetch('https://finance.yahoo.com/quote/EURUSD=X/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    })
    const rawCookies = pageRes.headers.getSetCookie?.() ?? []
    cookie = rawCookies.map(c => c.split(';')[0]).join('; ')

    const html = await pageRes.text()
    const m1 = html.match(/"crumb"\s*:\s*"([^"]+)"/)
    const m2 = html.match(/crumb=([A-Za-z0-9._/%-]{5,30})/)
    if (m1) crumb = m1[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
    else if (m2) crumb = decodeURIComponent(m2[1])
  } catch { /* ignore */ }

  // Method B: dedicated crumb endpoint (query2)
  if (!crumb) {
    try {
      const cRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
      })
      if (cRes.ok) {
        const text = (await cRes.text()).trim()
        if (text && !text.startsWith('<') && text.length < 50) crumb = text
      }
    } catch { /* ignore */ }
  }

  // Method C: fc.yahoo.com consent cookie then crumb
  if (!crumb) {
    try {
      const fcRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } })
      const fcCookies = fcRes.headers.getSetCookie?.() ?? []
      const fcCookie = fcCookies.map(c => c.split(';')[0]).join('; ')
      const cRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...BROWSER_HEADERS, Cookie: fcCookie || cookie },
      })
      if (cRes.ok) {
        const text = (await cRes.text()).trim()
        if (text && !text.startsWith('<') && text.length < 50) {
          crumb = text
          if (fcCookie) cookie = fcCookie
        }
      }
    } catch { /* ignore */ }
  }

  crumbCache = { crumb, cookie, at: now }
  return { crumb, cookie }
}

// ── Yahoo Finance fetch ───────────────────────────────────────────────────────

async function doYahooFetch(symbol: string, interval: string, range: string): Promise<unknown> {
  const sym = encodeURIComponent(symbol)
  const now  = Math.floor(Date.now() / 1000)

  // period1/period2 calculation from range string
  const rangeSeconds: Record<string, number> = {
    '1d': 86400, '5d': 432000, '7d': 604800, '14d': 1209600,
    '30d': 2592000, '60d': 5184000, '90d': 7776000, '180d': 15552000,
    '1y': 31536000, '2y': 63072000,
  }
  const seconds = rangeSeconds[range] ?? 2592000
  const p1 = now - seconds
  const p2 = now

  const { crumb, cookie } = await fetchCrumb()
  const hdrs = { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }

  // Attempt 1: query2 v8 with crumb + period params
  const params1 = new URLSearchParams({ interval, period1: String(p1), period2: String(p2), includePrePost: 'false' })
  if (crumb) params1.set('crumb', crumb)
  const r1 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?${params1}`, {
    headers: hdrs, next: { revalidate: 180 },
  })
  if (r1.ok) return r1.json()

  // Attempt 2: query2 v8 with range string (no period params)
  const params2 = new URLSearchParams({ interval, range, includePrePost: 'false' })
  if (crumb) params2.set('crumb', crumb)
  const r2 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?${params2}`, {
    headers: hdrs, next: { revalidate: 180 },
  })
  if (r2.ok) return r2.json()

  // Attempt 3: if 401 invalidate crumb and retry
  if (r1.status === 401 || r2.status === 401) {
    crumbCache = null
    const { crumb: nc, cookie: nk } = await fetchCrumb()
    const params3 = new URLSearchParams({ interval, period1: String(p1), period2: String(p2) })
    if (nc) params3.set('crumb', nc)
    const r3 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?${params3}`, {
      headers: { ...BROWSER_HEADERS, ...(nk ? { Cookie: nk } : {}) },
      next: { revalidate: 180 },
    })
    if (r3.ok) return r3.json()
  }

  // Attempt 4: query1 without crumb
  const params4 = new URLSearchParams({ interval, period1: String(p1), period2: String(p2) })
  const r4 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?${params4}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
    next: { revalidate: 180 },
  })
  if (r4.ok) return r4.json()

  // Attempt 5: v7 CSV download (daily only)
  const csvParams = new URLSearchParams({ period1: String(p1), period2: String(p2), interval: '1d', events: 'history' })
  const r5 = await fetch(`https://query1.finance.yahoo.com/v7/finance/download/${sym}?${csvParams}`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://finance.yahoo.com/', ...(cookie ? { Cookie: cookie } : {}) },
    next: { revalidate: 300 },
  })
  if (r5.ok) {
    const csv = await r5.text()
    if (csv.startsWith('Date')) return csvToChart(csv)
  }

  throw new Error(`Yahoo Finance HTTP ${r1.status} (symbol: ${symbol}, tried 5 methods)`)
}

// ── Stooq fallback (daily data, no auth required) ────────────────────────────

function toStooqSymbol(yahooSymbol: string): string {
  // Forex: EURUSD=X → eurusd
  if (yahooSymbol.endsWith('=X')) return yahooSymbol.slice(0, -2).toLowerCase()
  // Crypto: BTC-USD → btcusd
  if (yahooSymbol.includes('-')) return yahooSymbol.replace('-', '').toLowerCase()
  // NSE stocks: RELIANCE.NS → reliance.ns
  if (yahooSymbol.endsWith('.NS')) return yahooSymbol.toLowerCase()
  // Indices: ^NSEI → ^nsei
  if (yahooSymbol.startsWith('^')) return yahooSymbol.toLowerCase()
  return yahooSymbol.toLowerCase()
}

async function doStooqFetch(symbol: string): Promise<unknown> {
  const stooqSym = toStooqSymbol(symbol)
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/csv,text/plain,*/*' },
    next: { revalidate: 600 },
  })
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status} for ${stooqSym}`)

  const csv = await res.text()
  if (!csv.includes(',') || csv.includes('No data found')) {
    throw new Error(`Stooq: no data for ${stooqSym}`)
  }
  return csvToChart(csv)
}

// ── CSV → Yahoo chart format ──────────────────────────────────────────────────

function csvToChart(csv: string): unknown {
  const lines = csv.trim().split('\n').slice(1)  // skip header
  const timestamps: number[] = []
  const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = []

  for (const line of lines) {
    const [date, o, h, l, c, , v] = line.split(',')
    const ts = Math.floor(new Date(date.trim()).getTime() / 1000)
    const closeVal = Number(c)
    if (isNaN(ts) || isNaN(closeVal) || closeVal <= 0) continue
    timestamps.push(ts)
    open.push(Number(o) || closeVal)
    high.push(Number(h) || closeVal)
    low.push(Number(l) || closeVal)
    close.push(closeVal)
    volume.push(Number(v) || 0)
  }

  return {
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: { quote: [{ open, high, low, close, volume }] },
      }],
    },
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchYahooChart(symbol: string, interval: string, range: string): Promise<unknown> {
  // Try Yahoo Finance first
  try {
    return await doYahooFetch(symbol, interval, range)
  } catch (yahooErr) {
    // For intraday intervals, Stooq won't help — re-throw Yahoo's error
    if (interval !== '1d' && interval !== '1wk') {
      throw yahooErr
    }
    // Fall back to Stooq for daily data
    try {
      return await doStooqFetch(symbol)
    } catch {
      // Both failed — re-throw original Yahoo error
      throw yahooErr
    }
  }
}

export function parseYahooChart(json: unknown): YahooCandle[] {
  // Handle csvToChart / Stooq format (already in chart wrapper)
  const result = (json as {
    chart?: {
      result?: {
        timestamp?: number[]
        indicators?: {
          quote?: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }[]
        }
      }[]
    }
  })?.chart?.result?.[0]

  if (!result) throw new Error('No chart data in API response')

  const timestamps = result.timestamp ?? []
  const ohlcv      = result.indicators?.quote?.[0]
  if (!ohlcv || !timestamps.length) throw new Error('Empty OHLCV data returned')

  return timestamps
    .map((t, i) => ({
      time:   t,
      open:   ohlcv.open[i],
      high:   ohlcv.high[i],
      low:    ohlcv.low[i],
      close:  ohlcv.close[i],
      volume: ohlcv.volume[i] ?? 0,
    }))
    .filter(c => c.open != null && c.close != null && !isNaN(c.close) && !isNaN(c.open) && c.close > 0)
}
