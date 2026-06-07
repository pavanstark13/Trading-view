// Core indicator calculations — all SMC/ICT logic in TypeScript

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

// ── Basic indicators ──────────────────────────────────────────────────────────
export function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const result: number[] = []
  let prev = data[0]
  for (let i = 0; i < data.length; i++) {
    prev = i === 0 ? data[i] : data[i] * k + prev * (1 - k)
    result.push(prev)
  }
  return result
}

export function sma(data: number[], period: number): number[] {
  return data.map((_, i) =>
    i < period - 1 ? NaN : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  )
}

export function rsi(closes: number[], period = 14): number[] {
  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? -diff : 0)
  }
  const result: number[] = [NaN]
  let avgG = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgL = losses.slice(0, period).reduce((a, b) => a + b, 0) / period
  result.push(100 - 100 / (1 + avgG / (avgL || 1e-10)))
  for (let i = period; i < gains.length; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period
    avgL = (avgL * (period - 1) + losses[i]) / period
    result.push(100 - 100 / (1 + avgG / (avgL || 1e-10)))
  }
  return result
}

export function atr(candles: Candle[], period = 14): number[] {
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prev = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
  })
  return sma(trs, period)
}

export function macd(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const macdLine = fast.map((f, i) => f - slow[i])
  const signal = ema(macdLine, 9)
  const hist = macdLine.map((m, i) => m - signal[i])
  return { macd: macdLine, signal, hist }
}

export function stoch(candles: Candle[], kPeriod = 14, smooth = 3): { k: number[]; d: number[] } {
  const k = candles.map((_, i) => {
    if (i < kPeriod - 1) return NaN
    const slice = candles.slice(i - kPeriod + 1, i + 1)
    const highest = Math.max(...slice.map(c => c.high))
    const lowest = Math.min(...slice.map(c => c.low))
    return highest === lowest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100
  })
  const kSmooth = sma(k.map(v => isNaN(v) ? 0 : v), smooth)
  const d = sma(kSmooth, smooth)
  return { k: kSmooth, d }
}

// ── Market Structure ──────────────────────────────────────────────────────────
export interface SwingPoint { index: number; price: number; type: 'H' | 'L'; label: string }

export function swingPoints(candles: Candle[], len = 10): SwingPoint[] {
  const points: SwingPoint[] = []
  let lastH = NaN, lastL = NaN

  for (let i = len; i < candles.length - len; i++) {
    const slice = candles.slice(i - len, i + len + 1)
    const isHigh = candles[i].high === Math.max(...slice.map(c => c.high))
    const isLow  = candles[i].low  === Math.min(...slice.map(c => c.low))

    if (isHigh) {
      const label = !isNaN(lastH) ? (candles[i].high > lastH ? 'HH' : 'LH') : 'SH'
      points.push({ index: i, price: candles[i].high, type: 'H', label })
      lastH = candles[i].high
    }
    if (isLow) {
      const label = !isNaN(lastL) ? (candles[i].low > lastL ? 'HL' : 'LL') : 'SL'
      points.push({ index: i, price: candles[i].low, type: 'L', label })
      lastL = candles[i].low
    }
  }
  return points
}

export interface StructureBreak { index: number; type: 'BOS' | 'CHoCH'; direction: 'bull' | 'bear'; level: number }

export function structureBreaks(candles: Candle[], swings: SwingPoint[]): StructureBreak[] {
  const breaks: StructureBreak[] = []
  let bullMs = true

  for (let i = 1; i < candles.length; i++) {
    const lastH = [...swings].reverse().find(s => s.type === 'H' && s.index < i)
    const lastL = [...swings].reverse().find(s => s.type === 'L' && s.index < i)
    if (!lastH || !lastL) continue

    const bullBos = candles[i].close > lastH.price && candles[i - 1].close <= lastH.price
    const bearBos = candles[i].close < lastL.price && candles[i - 1].close >= lastL.price

    if (bullBos) {
      breaks.push({ index: i, type: bullMs ? 'BOS' : 'CHoCH', direction: 'bull', level: lastH.price })
      bullMs = true
    }
    if (bearBos) {
      breaks.push({ index: i, type: bullMs ? 'CHoCH' : 'BOS', direction: 'bear', level: lastL.price })
      bullMs = false
    }
  }
  return breaks
}

// ── Order Blocks ──────────────────────────────────────────────────────────────
export interface OrderBlock { index: number; high: number; low: number; type: 'bull' | 'bear'; mitigated: boolean }

export function orderBlocks(candles: Candle[]): OrderBlock[] {
  const blocks: OrderBlock[] = []
  for (let i = 3; i < candles.length; i++) {
    const bullImpulse = candles[i].close > candles[i-1].close && candles[i-1].close > candles[i-2].close
    const bearImpulse = candles[i].close < candles[i-1].close && candles[i-1].close < candles[i-2].close

    if (bullImpulse) {
      for (let j = 1; j <= 5 && i - j >= 0; j++) {
        if (candles[i-j].close < candles[i-j].open) {
          blocks.push({ index: i-j, high: candles[i-j].high, low: candles[i-j].low, type: 'bull', mitigated: false })
          break
        }
      }
    }
    if (bearImpulse) {
      for (let j = 1; j <= 5 && i - j >= 0; j++) {
        if (candles[i-j].close > candles[i-j].open) {
          blocks.push({ index: i-j, high: candles[i-j].high, low: candles[i-j].low, type: 'bear', mitigated: false })
          break
        }
      }
    }
  }

  // Mark mitigated
  const last = candles[candles.length - 1]
  return blocks.map(b => ({
    ...b,
    mitigated: b.type === 'bull' ? last.low <= b.low : last.high >= b.high
  }))
}

// ── Fair Value Gaps ───────────────────────────────────────────────────────────
export interface FVG { index: number; top: number; bottom: number; type: 'bull' | 'bear'; mitigated: boolean }

export function fairValueGaps(candles: Candle[]): FVG[] {
  const gaps: FVG[] = []
  for (let i = 2; i < candles.length; i++) {
    if (candles[i].low > candles[i-2].high) {
      gaps.push({ index: i, top: candles[i].low, bottom: candles[i-2].high, type: 'bull', mitigated: false })
    }
    if (candles[i].high < candles[i-2].low) {
      gaps.push({ index: i, top: candles[i-2].low, bottom: candles[i].high, type: 'bear', mitigated: false })
    }
  }
  const last = candles[candles.length - 1]
  return gaps.map(g => ({
    ...g,
    mitigated: g.type === 'bull' ? last.low <= g.top : last.high >= g.bottom
  }))
}

// ── Liquidity Sweeps ──────────────────────────────────────────────────────────
export interface LiqSweep { index: number; type: 'BSL' | 'SSL'; level: number }

export function liquiditySweeps(candles: Candle[], lookback = 20): LiqSweep[] {
  const sweeps: LiqSweep[] = []
  for (let i = lookback; i < candles.length; i++) {
    const prevHigh = Math.max(...candles.slice(i - lookback, i).map(c => c.high))
    const prevLow  = Math.min(...candles.slice(i - lookback, i).map(c => c.low))
    const body = Math.abs(candles[i].close - candles[i].open)
    const uWick = candles[i].high - Math.max(candles[i].open, candles[i].close)
    const lWick = Math.min(candles[i].open, candles[i].close) - candles[i].low

    if (candles[i].high > prevHigh && candles[i].close < prevHigh && uWick > body * 0.5)
      sweeps.push({ index: i, type: 'BSL', level: prevHigh })
    if (candles[i].low < prevLow && candles[i].close > prevLow && lWick > body * 0.5)
      sweeps.push({ index: i, type: 'SSL', level: prevLow })
  }
  return sweeps
}

// ── AI Confluence Score ───────────────────────────────────────────────────────
export interface Signal { name: string; long: boolean; short: boolean }
export interface AIAnalysis {
  longScore: number
  shortScore: number
  maxScore: number
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  signals: Signal[]
  entry: number
  longSL: number
  longTP1: number
  longTP2: number
  shortSL: number
  shortTP1: number
  shortTP2: number
  slPips: number
  tp2Pips: number
  atrValue: number
  trend: string
  htfTrend: string
  session: string
  bestSession: boolean
  lastBOS: StructureBreak | null
  recentFVG: FVG | null
  recentOB: OrderBlock | null
  recentSweep: LiqSweep | null
}

export function analyseMarket(candles: Candle[], pipSize = 0.0001): AIAnalysis {
  if (candles.length < 50) {
    return emptyAnalysis(candles[candles.length - 1]?.close ?? 0)
  }

  const closes = candles.map(c => c.close)
  const n = candles.length - 1

  // EMAs
  const ema20v  = ema(closes, 20)[n]
  const ema50v  = ema(closes, 50)[n]
  const ema200v = ema(closes, 200)[n]

  const currBull = ema20v > ema50v && ema50v > ema200v
  const currBear = ema20v < ema50v && ema50v < ema200v
  const trend = currBull ? 'BULL' : currBear ? 'BEAR' : 'RANGING'

  // Momentum
  const rsiVal  = rsi(closes, 14)[n]
  const macdRes = macd(closes)
  const macdBull = macdRes.macd[n] > macdRes.signal[n]
  const macdBear = macdRes.macd[n] < macdRes.signal[n]
  const stochRes = stoch(candles)
  const stochBull = stochRes.k[n] > stochRes.d[n] && stochRes.k[n] < 80
  const stochBear = stochRes.k[n] < stochRes.d[n] && stochRes.k[n] > 20

  // ATR
  const atrArr = atr(candles, 14)
  const atrVal = atrArr[n]

  // Structure
  const swings = swingPoints(candles, 10)
  const breaks = structureBreaks(candles, swings)
  const bullMs = breaks.length === 0 || breaks[breaks.length - 1].direction === 'bull'

  // Liquidity
  const sweeps = liquiditySweeps(candles)
  const recentSweep = sweeps.length ? sweeps[sweeps.length - 1] : null
  const sslSwept = recentSweep?.type === 'SSL' && n - (recentSweep?.index ?? 0) <= 5
  const bslSwept = recentSweep?.type === 'BSL' && n - (recentSweep?.index ?? 0) <= 5

  // FVG
  const fvgs = fairValueGaps(candles)
  const recentFVG = fvgs.filter(f => !f.mitigated).slice(-1)[0] ?? null

  // OBs
  const obs = orderBlocks(candles)
  const recentOB = obs.filter(o => !o.mitigated).slice(-1)[0] ?? null

  // BOS
  const lastBOS = breaks.slice(-1)[0] ?? null

  // VWAP (simple session VWAP approx)
  const vwap = candles.slice(-50).reduce((s, c) => s + (c.high + c.low + c.close) / 3 * (c.volume ?? 1), 0) /
               candles.slice(-50).reduce((s, c) => s + (c.volume ?? 1), 0)
  const aboveVwap = candles[n].close > vwap

  // Volume
  const volAvg = sma(candles.map(c => c.volume ?? 0), 20)[n]
  const volSpike = (candles[n].volume ?? 0) > volAvg * 1.2

  // Session (UTC time)
  const now = new Date()
  const nyH = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(now))
  const inLondonKZ = nyH >= 2 && nyH < 5
  const inNYKZ     = nyH >= 7 && nyH < 10
  const inOverlap  = nyH >= 7 && nyH < 10
  const inAsia     = nyH >= 20 || nyH < 2
  const bestSess   = inLondonKZ || inNYKZ
  const session = inOverlap ? 'London/NY Overlap' : inNYKZ ? 'New York KZ' : inLondonKZ ? 'London KZ' : inAsia ? 'Asia' : 'Off-Hours'

  const signals: Signal[] = [
    { name: 'EMA Trend (20>50>200)',    long: currBull,    short: currBear },
    { name: 'Bullish Structure (MS)',   long: bullMs,      short: !bullMs },
    { name: 'BOS / CHoCH',             long: lastBOS?.direction === 'bull', short: lastBOS?.direction === 'bear' },
    { name: 'Liquidity Swept',         long: sslSwept,    short: bslSwept },
    { name: 'RSI (50–70 / 30–50)',     long: rsiVal > 50 && rsiVal < 72, short: rsiVal < 50 && rsiVal > 28 },
    { name: 'MACD Direction',          long: macdBull,    short: macdBear },
    { name: 'Stochastic K > D',        long: stochBull,   short: stochBear },
    { name: 'Above VWAP',              long: aboveVwap,   short: !aboveVwap },
    { name: 'Volume Spike',            long: volSpike,    short: volSpike },
    { name: 'Fair Value Gap Present',  long: recentFVG?.type === 'bull', short: recentFVG?.type === 'bear' },
  ]

  const longScore  = signals.reduce((s, sig) => s + (sig.long  ? 1 : 0), 0)
  const shortScore = signals.reduce((s, sig) => s + (sig.short ? 1 : 0), 0)
  const bias = longScore > shortScore ? 'BULLISH' : shortScore > longScore ? 'BEARISH' : 'NEUTRAL'

  const entry = candles[n].close
  const slD   = atrVal * 1.5

  return {
    longScore, shortScore, maxScore: signals.length, bias, signals,
    entry,
    longSL:  entry - slD, longTP1: entry + slD * 1.5, longTP2: entry + slD * 3,
    shortSL: entry + slD, shortTP1: entry - slD * 1.5, shortTP2: entry - slD * 3,
    slPips:  slD / pipSize,
    tp2Pips: (slD * 3) / pipSize,
    atrValue: atrVal,
    trend, htfTrend: trend,
    session, bestSession: bestSess,
    lastBOS, recentFVG, recentOB, recentSweep,
  }
}

function emptyAnalysis(entry: number): AIAnalysis {
  return {
    longScore: 0, shortScore: 0, maxScore: 10,
    bias: 'NEUTRAL', signals: [], entry,
    longSL: 0, longTP1: 0, longTP2: 0,
    shortSL: 0, shortTP1: 0, shortTP2: 0,
    slPips: 0, tp2Pips: 0, atrValue: 0,
    trend: 'RANGING', htfTrend: 'RANGING',
    session: 'Off-Hours', bestSession: false,
    lastBOS: null, recentFVG: null, recentOB: null, recentSweep: null,
  }
}
