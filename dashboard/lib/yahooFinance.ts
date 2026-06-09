/**
 * Yahoo Finance data fetcher with multi-method auth fallback.
 *
 * Auth flow (tried in order):
 *  1. Crumb extracted from Yahoo Finance HTML (most reliable for server)
 *  2. Crumb from /v1/test/getcrumb with fc.yahoo.com cookies
 *  3. Direct fetch with browser headers only (works for Forex/Crypto)
 *  4. query1 fallback (older endpoint, sometimes less restricted)
 */

export interface YahooCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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
}

// Cache crumb + cookies for up to 50 minutes
let crumbCache: { crumb: string; cookie: string; at: number } | null = null
const CRUMB_TTL = 50 * 60 * 1000

async function fetchCrumb(): Promise<{ crumb: string; cookie: string }> {
  const now = Date.now()
  if (crumbCache && now - crumbCache.at < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie }
  }

  let cookie = ''
  let crumb  = ''

  // Method A: hit the Yahoo Finance main page, extract crumb from HTML
  try {
    const pageRes = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
    })
    const rawCookies = pageRes.headers.getSetCookie?.() ?? []
    cookie = rawCookies.map(c => c.split(';')[0]).join('; ')

    const html = await pageRes.text()
    // Yahoo embeds the crumb as "crumb":"XXXXXX" in a <script> block
    const m = html.match(/"crumb":"([^"]+)"/)
    if (m) crumb = m[1].replace(/\\u002F/g, '/')
  } catch { /* ignore */ }

  // Method B: dedicated crumb endpoint
  if (!crumb) {
    try {
      const cRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
      })
      if (cRes.ok) crumb = (await cRes.text()).trim()
    } catch { /* ignore */ }
  }

  // Method C: fc.yahoo.com consent cookie
  if (!crumb) {
    try {
      const fcRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } })
      const fcCookies = fcRes.headers.getSetCookie?.() ?? []
      const fcCookie = fcCookies.map(c => c.split(';')[0]).join('; ')
      const cRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...BROWSER_HEADERS, Cookie: fcCookie },
      })
      if (cRes.ok) { crumb = (await cRes.text()).trim(); cookie = fcCookie }
    } catch { /* ignore */ }
  }

  crumbCache = { crumb, cookie, at: now }
  return { crumb, cookie }
}

async function doFetch(symbol: string, interval: string, range: string): Promise<unknown> {
  const params = new URLSearchParams({ interval, range, includePrePost: 'false' })
  const sym    = encodeURIComponent(symbol)

  const { crumb, cookie } = await fetchCrumb()
  if (crumb) params.set('crumb', crumb)

  const hdrs = { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }

  // Attempt 1: query2 with crumb
  const r1 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?${params}`, {
    headers: hdrs, next: { revalidate: 120 },
  })
  if (r1.ok) return r1.json()

  // If 401 (stale crumb), invalidate and retry
  if (r1.status === 401) {
    crumbCache = null
    const { crumb: nc, cookie: nk } = await fetchCrumb()
    if (nc) params.set('crumb', nc)
    const r2 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?${params}`, {
      headers: { ...BROWSER_HEADERS, ...(nk ? { Cookie: nk } : {}) },
      next: { revalidate: 120 },
    })
    if (r2.ok) return r2.json()
  }

  // Attempt 2: query1 without crumb (works for some symbols/regions)
  const plainParams = new URLSearchParams({ interval, range })
  const r3 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?${plainParams}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
    next: { revalidate: 120 },
  })
  if (r3.ok) return r3.json()

  // Attempt 3: v7 download CSV (works for historical data without crumb)
  const now   = Math.floor(Date.now() / 1000)
  const start = now - 365 * 24 * 3600
  const csvParams = new URLSearchParams({ period1: String(start), period2: String(now), interval, events: 'history' })
  const r4 = await fetch(`https://query1.finance.yahoo.com/v7/finance/download/${sym}?${csvParams}`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://finance.yahoo.com/' },
  })
  if (r4.ok) {
    const csv = await r4.text()
    return csvToChart(csv)
  }

  throw new Error(`HTTP ${r1.status} from Yahoo Finance (tried 4 methods)`)
}

function csvToChart(csv: string): unknown {
  const lines = csv.trim().split('\n').slice(1)  // skip header
  const timestamps: number[] = []
  const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = []

  for (const line of lines) {
    const [date, o, h, l, c, , v] = line.split(',')
    const ts = Math.floor(new Date(date).getTime() / 1000)
    if (isNaN(ts) || isNaN(Number(c))) continue
    timestamps.push(ts)
    open.push(Number(o)); high.push(Number(h)); low.push(Number(l))
    close.push(Number(c)); volume.push(Number(v) || 0)
  }

  return { chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open, high, low, close, volume }] } }] } }
}

export async function fetchYahooChart(symbol: string, interval: string, range: string): Promise<unknown> {
  return doFetch(symbol, interval, range)
}

export function parseYahooChart(json: unknown): YahooCandle[] {
  const result = (json as {
    chart?: { result?: {
      timestamp?: number[]
      indicators?: { quote?: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }[] }
    }[] }
  })?.chart?.result?.[0]

  if (!result) throw new Error('No chart data in response')

  const timestamps = result.timestamp ?? []
  const ohlcv      = result.indicators?.quote?.[0]
  if (!ohlcv || !timestamps.length) throw new Error('Empty OHLCV')

  return timestamps
    .map((t, i) => ({
      time:   t,
      open:   ohlcv.open[i],
      high:   ohlcv.high[i],
      low:    ohlcv.low[i],
      close:  ohlcv.close[i],
      volume: ohlcv.volume[i] ?? 0,
    }))
    .filter(c => c.open != null && c.close != null && !isNaN(c.close) && !isNaN(c.open))
}
