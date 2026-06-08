// Core indicator calculations — SMC/ICT + 7 proven strategies

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

// ── Strategy 1: Bollinger Bands + Squeeze ─────────────────────────────────────
export function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period)
  const stdDev = closes.map((_, i) => {
    if (i < period - 1) return NaN
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = mid[i]
    return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
  })
  const upper = mid.map((m, i) => isNaN(stdDev[i]) ? NaN : m + mult * stdDev[i])
  const lower = mid.map((m, i) => isNaN(stdDev[i]) ? NaN : m - mult * stdDev[i])
  const width = upper.map((u, i) => isNaN(u) || mid[i] === 0 ? NaN : (u - lower[i]) / mid[i])
  return { upper, mid, lower, width }
}

// ── Strategy 2: Supertrend ────────────────────────────────────────────────────
export function supertrend(candles: Candle[], period = 10, mult = 3) {
  const atrValues = atr(candles, period)
  const trend: ('bull' | 'bear')[] = []
  const upperBand: number[] = []
  const lowerBand: number[] = []

  for (let i = 0; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2
    const atrVal = isNaN(atrValues[i]) ? 0 : atrValues[i]
    const basicUpper = hl2 + mult * atrVal
    const basicLower = hl2 - mult * atrVal

    const prevUpper = i > 0 ? upperBand[i - 1] : basicUpper
    const prevLower = i > 0 ? lowerBand[i - 1] : basicLower
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close

    const finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper
    const finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower

    upperBand.push(finalUpper)
    lowerBand.push(finalLower)

    let dir: 'bull' | 'bear'
    if (i === 0) {
      dir = 'bull'
    } else {
      const prev = trend[i - 1]
      if (prev === 'bear' && candles[i].close > upperBand[i - 1]) dir = 'bull'
      else if (prev === 'bull' && candles[i].close < lowerBand[i - 1]) dir = 'bear'
      else dir = prev
    }
    trend.push(dir)
  }

  const line = trend.map((t, i) => t === 'bull' ? lowerBand[i] : upperBand[i])
  return { trend, line }
}

// ── Strategy 3: RSI Divergence ────────────────────────────────────────────────
export interface Divergence {
  type: 'regular_bull' | 'regular_bear' | 'hidden_bull' | 'hidden_bear'
  bars: number
}

export function rsiDivergence(candles: Candle[], rsiValues: number[], lookback = 35): Divergence | null {
  const n = candles.length - 1
  if (n < lookback) return null

  const rc = candles.slice(n - lookback, n + 1)
  const rr = rsiValues.slice(n - lookback, n + 1)
  const L = rc.length

  const priceLows: number[] = []
  const priceHighs: number[] = []

  for (let i = 2; i < L - 1; i++) {
    if (rc[i].low < rc[i - 1].low && rc[i].low < rc[i + 1].low) priceLows.push(i)
    if (rc[i].high > rc[i - 1].high && rc[i].high > rc[i + 1].high) priceHighs.push(i)
  }

  if (priceLows.length >= 2) {
    const i1 = priceLows[priceLows.length - 1]
    const i2 = priceLows[priceLows.length - 2]
    if (L - 1 - i1 <= 6) {
      if (rc[i1].low < rc[i2].low && rr[i1] > rr[i2])
        return { type: 'regular_bull', bars: L - 1 - i1 }
      if (rc[i1].low > rc[i2].low && rr[i1] < rr[i2])
        return { type: 'hidden_bull', bars: L - 1 - i1 }
    }
  }

  if (priceHighs.length >= 2) {
    const i1 = priceHighs[priceHighs.length - 1]
    const i2 = priceHighs[priceHighs.length - 2]
    if (L - 1 - i1 <= 6) {
      if (rc[i1].high > rc[i2].high && rr[i1] < rr[i2])
        return { type: 'regular_bear', bars: L - 1 - i1 }
      if (rc[i1].high < rc[i2].high && rr[i1] > rr[i2])
        return { type: 'hidden_bear', bars: L - 1 - i1 }
    }
  }

  return null
}

// ── Strategy 4: ICT Optimal Trade Entry (OTE) ─────────────────────────────────
export interface OTE {
  direction: 'long' | 'short'
  fibLevel: number
  inZone: boolean
}

export function ictOTE(swings: SwingPoint[], breaks: StructureBreak[], currentPrice: number): OTE | null {
  if (breaks.length === 0 || swings.length < 2) return null
  const lastBreak = breaks[breaks.length - 1]

  if (lastBreak.direction === 'bull') {
    const lows = swings.filter(s => s.type === 'L' && s.index < lastBreak.index)
    const highs = swings.filter(s => s.type === 'H' && s.index <= lastBreak.index)
    if (!lows.length || !highs.length) return null
    const swLow = lows[lows.length - 1].price
    const swHigh = highs[highs.length - 1].price
    const range = swHigh - swLow
    if (range <= 0) return null
    const ote62 = swHigh - range * 0.618
    const ote79 = swHigh - range * 0.786
    const fibLevel = ((swHigh - currentPrice) / range) * 100
    const inZone = currentPrice >= ote79 && currentPrice <= ote62
    if (fibLevel >= 45 && fibLevel <= 95)
      return { direction: 'long', fibLevel, inZone }
  }

  if (lastBreak.direction === 'bear') {
    const highs = swings.filter(s => s.type === 'H' && s.index < lastBreak.index)
    const lows = swings.filter(s => s.type === 'L' && s.index <= lastBreak.index)
    if (!highs.length || !lows.length) return null
    const swHigh = highs[highs.length - 1].price
    const swLow = lows[lows.length - 1].price
    const range = swHigh - swLow
    if (range <= 0) return null
    const ote62 = swLow + range * 0.618
    const ote79 = swLow + range * 0.786
    const fibLevel = ((currentPrice - swLow) / range) * 100
    const inZone = currentPrice >= ote62 && currentPrice <= ote79
    if (fibLevel >= 45 && fibLevel <= 95)
      return { direction: 'short', fibLevel, inZone }
  }

  return null
}

// ── Strategy 5: Williams Alligator ───────────────────────────────────────────
export function alligator(candles: Candle[]): { jaw: number; teeth: number; lips: number; awake: boolean; bull: boolean } {
  const hl2 = candles.map(c => (c.high + c.low) / 2)

  // SMMA (Smoothed MA)
  const smma = (data: number[], period: number): number => {
    if (data.length < period) return data[data.length - 1] ?? 0
    let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period
    for (let i = period; i < data.length; i++) {
      val = (val * (period - 1) + data[i]) / period
    }
    return val
  }

  const jaw = smma(hl2, 13)    // slowest — blue
  const teeth = smma(hl2, 8)   // medium — red
  const lips = smma(hl2, 5)    // fastest — green

  const spread = Math.abs(lips - jaw)
  const avgPrice = hl2[hl2.length - 1] ?? 1
  const awake = spread / avgPrice > 0.0008

  // Bull = lips > teeth > jaw (upward spread); Bear = lips < teeth < jaw
  const bull = lips > teeth && teeth > jaw

  return { jaw, teeth, lips, awake, bull }
}

// ── Strategy 6: London/NY Session Breakout ────────────────────────────────────
export interface SessionBreakout {
  direction: 'bull' | 'bear'
  asiaHigh: number
  asiaLow: number
  strength: number
}

export function londonBreakout(candles: Candle[]): SessionBreakout | null {
  const n = candles.length - 1
  const asiaC: Candle[] = []
  const londonC: Candle[] = []

  for (let i = Math.max(0, n - 72); i <= n; i++) {
    const utcH = new Date(candles[i].time * 1000).getUTCHours()
    if (utcH >= 0 && utcH < 7) asiaC.push(candles[i])
    if (utcH >= 7 && utcH < 11) londonC.push(candles[i])
  }

  if (asiaC.length < 3 || londonC.length === 0) return null

  const asiaHigh = Math.max(...asiaC.map(c => c.high))
  const asiaLow = Math.min(...asiaC.map(c => c.low))
  const asiaRange = asiaHigh - asiaLow
  if (asiaRange === 0) return null

  const latest = londonC[londonC.length - 1]

  if (latest.close > asiaHigh)
    return { direction: 'bull', asiaHigh, asiaLow, strength: Math.min(3, (latest.close - asiaHigh) / asiaRange * 8) }
  if (latest.close < asiaLow)
    return { direction: 'bear', asiaHigh, asiaLow, strength: Math.min(3, (asiaLow - latest.close) / asiaRange * 8) }
  return null
}

// ── Strategy 7: PVSRA (Price Volume S/R Analysis) ────────────────────────────
export type PVSRASignal = 'climax_bull' | 'climax_bear' | 'rising_bull' | 'rising_bear' | 'neutral'

export function pvsraSignal(candles: Candle[]): PVSRASignal {
  const n = candles.length - 1
  if (n < 10) return 'neutral'

  const window = candles.slice(n - 9, n + 1)
  const avgVol = window.reduce((s, c) => s + (c.volume ?? 0), 0) / window.length
  const currVol = candles[n].volume ?? 0
  const c = candles[n]
  const isBull = c.close > c.open
  const spread = c.high - c.low
  const avgSpread = candles.slice(n - 9, n).reduce((s, cv) => s + cv.high - cv.low, 0) / 9
  const wideSpread = spread > avgSpread * 1.2

  if (currVol > avgVol * 2 && wideSpread && !isBull) return 'climax_bull'
  if (currVol > avgVol * 2 && wideSpread && isBull) return 'climax_bear'
  if (currVol > avgVol * 1.5 && isBull) return 'rising_bull'
  if (currVol > avgVol * 1.5 && !isBull) return 'rising_bear'
  return 'neutral'
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
export interface Signal { name: string; long: boolean; short: boolean; category: string }

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
  // New strategy fields
  supertrendBull: boolean
  rsiDiv: Divergence | null
  bbSqueeze: boolean
  bbBreakout: 'bull' | 'bear' | null
  oteSignal: OTE | null
  alligatorBull: boolean
  alligatorAwake: boolean
  londonBreak: SessionBreakout | null
  pvsra: PVSRASignal
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
  const ema200v = ema(closes, Math.min(200, closes.length - 1))[n]

  const currBull = ema20v > ema50v && ema50v > ema200v
  const currBear = ema20v < ema50v && ema50v < ema200v
  const trend = currBull ? 'BULL' : currBear ? 'BEAR' : 'RANGING'

  // Momentum
  const rsiArr  = rsi(closes, 14)
  const rsiVal  = rsiArr[n]
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

  // VWAP
  const vwap = candles.slice(-50).reduce((s, c) => s + (c.high + c.low + c.close) / 3 * (c.volume ?? 1), 0) /
               candles.slice(-50).reduce((s, c) => s + (c.volume ?? 1), 0)
  const aboveVwap = candles[n].close > vwap

  // Volume
  const volAvg = sma(candles.map(c => c.volume ?? 0), 20)[n]
  const volSpike = (candles[n].volume ?? 0) > volAvg * 1.2

  // Session
  const now = new Date()
  const nyH = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(now))
  const inLondonKZ = nyH >= 2 && nyH < 5
  const inNYKZ     = nyH >= 7 && nyH < 10
  const inAsia     = nyH >= 20 || nyH < 2
  const bestSess   = inLondonKZ || inNYKZ
  const session = (nyH >= 7 && nyH < 10) ? 'London/NY Overlap' : inNYKZ ? 'New York KZ' : inLondonKZ ? 'London KZ' : inAsia ? 'Asia' : 'Off-Hours'

  // ── New Strategy Calculations ─────────────────────────────────────────────

  // 1. Supertrend
  const stResult = supertrend(candles, 10, 3)
  const supertrendBull = stResult.trend[n] === 'bull'

  // 2. RSI Divergence
  const rsiDiv = rsiDivergence(candles, rsiArr, 35)

  // 3. Bollinger Bands Squeeze + Breakout
  const bbResult = bollingerBands(closes, 20, 2)
  const bbWidths = bbResult.width.filter(w => !isNaN(w))
  const bbMinWidth = bbWidths.length > 20 ? Math.min(...bbWidths.slice(-30)) : NaN
  const currBBWidth = bbResult.width[n]
  const bbSqueeze = !isNaN(currBBWidth) && !isNaN(bbMinWidth) && currBBWidth < bbMinWidth * 1.15
  const bbBreakout: 'bull' | 'bear' | null =
    candles[n].close > (bbResult.upper[n] ?? Infinity) ? 'bull' :
    candles[n].close < (bbResult.lower[n] ?? -Infinity) ? 'bear' : null

  // 4. ICT OTE
  const oteSignal = ictOTE(swings, breaks, candles[n].close)

  // 5. Williams Alligator
  const alligResult = alligator(candles)
  const alligatorBull = alligResult.bull && alligResult.awake
  const alligatorAwake = alligResult.awake

  // 6. London Breakout
  const londonBreak = londonBreakout(candles)

  // 7. PVSRA
  const pvsra = pvsraSignal(candles)

  // ── Build Signal List ─────────────────────────────────────────────────────
  const signals: Signal[] = [
    // SMC/ICT Core
    { name: 'EMA Trend 20>50>200',    long: currBull,    short: currBear,    category: 'Trend' },
    { name: 'Market Structure (MS)',  long: bullMs,      short: !bullMs,     category: 'SMC' },
    { name: 'BOS / CHoCH',           long: lastBOS?.direction === 'bull', short: lastBOS?.direction === 'bear', category: 'SMC' },
    { name: 'Liquidity Swept',        long: sslSwept,    short: bslSwept,    category: 'SMC' },
    { name: 'Fair Value Gap',         long: recentFVG?.type === 'bull', short: recentFVG?.type === 'bear', category: 'SMC' },
    // Momentum
    { name: 'RSI (50–70 / 30–50)',   long: rsiVal > 50 && rsiVal < 72, short: rsiVal < 50 && rsiVal > 28, category: 'Momentum' },
    { name: 'MACD Direction',         long: macdBull,    short: macdBear,    category: 'Momentum' },
    { name: 'Stochastic K>D',         long: stochBull,   short: stochBear,   category: 'Momentum' },
    // Context
    { name: 'Above VWAP',             long: aboveVwap,   short: !aboveVwap,  category: 'Context' },
    { name: 'Volume Spike',           long: volSpike,    short: volSpike,    category: 'Context' },
    // Strategies
    { name: '① Supertrend',          long: supertrendBull,  short: !supertrendBull, category: 'Strategy' },
    { name: '② RSI Divergence',      long: rsiDiv?.type === 'regular_bull' || rsiDiv?.type === 'hidden_bull', short: rsiDiv?.type === 'regular_bear' || rsiDiv?.type === 'hidden_bear', category: 'Strategy' },
    { name: '③ BB Squeeze Break',    long: bbBreakout === 'bull' || (bbSqueeze && currBull), short: bbBreakout === 'bear' || (bbSqueeze && currBear), category: 'Strategy' },
    { name: '④ ICT OTE Zone',        long: oteSignal?.direction === 'long' && oteSignal?.inZone, short: oteSignal?.direction === 'short' && oteSignal?.inZone, category: 'Strategy' },
    { name: '⑤ Alligator (Spread)',  long: alligatorBull && alligResult.bull, short: alligatorBull && !alligResult.bull, category: 'Strategy' },
    { name: '⑥ Session Breakout',    long: londonBreak?.direction === 'bull', short: londonBreak?.direction === 'bear', category: 'Strategy' },
    { name: '⑦ PVSRA Volume',        long: pvsra === 'climax_bull' || pvsra === 'rising_bull', short: pvsra === 'climax_bear' || pvsra === 'rising_bear', category: 'Strategy' },
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
    supertrendBull,
    rsiDiv,
    bbSqueeze,
    bbBreakout,
    oteSignal,
    alligatorBull,
    alligatorAwake,
    londonBreak,
    pvsra,
  }
}

function emptyAnalysis(entry: number): AIAnalysis {
  return {
    longScore: 0, shortScore: 0, maxScore: 17,
    bias: 'NEUTRAL', signals: [], entry,
    longSL: 0, longTP1: 0, longTP2: 0,
    shortSL: 0, shortTP1: 0, shortTP2: 0,
    slPips: 0, tp2Pips: 0, atrValue: 0,
    trend: 'RANGING', htfTrend: 'RANGING',
    session: 'Off-Hours', bestSession: false,
    lastBOS: null, recentFVG: null, recentOB: null, recentSweep: null,
    supertrendBull: false, rsiDiv: null,
    bbSqueeze: false, bbBreakout: null,
    oteSignal: null, alligatorBull: false, alligatorAwake: false,
    londonBreak: null, pvsra: 'neutral',
  }
}
