import { type Candle, analyseMarket } from './indicators'

export interface BacktestResult {
  trades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  totalPips: number
  passed: boolean
  reason: string
}

export interface ForwardTest {
  trades: number
  wins: number
  active: boolean
  lastSignal: 'long' | 'short' | null
}

// ── Rule extraction from strategy text ───────────────────────────────────────
interface Rule {
  type: string
  direction: 'long' | 'short' | 'both'
  value?: number
}

function extractRules(text: string): Rule[] {
  const rules: Rule[] = []
  const t = text.toLowerCase()

  const tryNum = (re: RegExp): number | undefined => {
    const m = t.match(re)
    return m ? parseFloat(m[1]) : undefined
  }

  // RSI rules
  const rsiBuy  = tryNum(/rsi.*?(?:below|<|under)\s*(\d+).*?buy/i) ?? tryNum(/buy.*?rsi.*?(?:below|<)\s*(\d+)/i)
  const rsiSell = tryNum(/rsi.*?(?:above|>|over)\s*(\d+).*?sell/i) ?? tryNum(/sell.*?rsi.*?(?:above|>)\s*(\d+)/i)
  if (rsiBuy)  rules.push({ type: 'rsi_below', direction: 'long',  value: rsiBuy })
  if (rsiSell) rules.push({ type: 'rsi_above', direction: 'short', value: rsiSell })

  // EMA crossover
  if (/ema.*?cross.*?above|golden cross|bullish cross/i.test(t))
    rules.push({ type: 'ema_cross_bull', direction: 'long' })
  if (/ema.*?cross.*?below|death cross|bearish cross/i.test(t))
    rules.push({ type: 'ema_cross_bear', direction: 'short' })

  // MACD
  if (/macd.*?(?:cross.*?above|bullish|positive)/i.test(t))
    rules.push({ type: 'macd_bull', direction: 'long' })
  if (/macd.*?(?:cross.*?below|bearish|negative)/i.test(t))
    rules.push({ type: 'macd_bear', direction: 'short' })

  // Stochastic
  if (/stoch.*?(?:cross.*?above|bullish|oversold)/i.test(t))
    rules.push({ type: 'stoch_bull', direction: 'long' })
  if (/stoch.*?(?:cross.*?below|bearish|overbought)/i.test(t))
    rules.push({ type: 'stoch_bear', direction: 'short' })

  // SMC/ICT
  if (/order.?block|ob.?(?:demand|bull)/i.test(t))
    rules.push({ type: 'order_block_bull', direction: 'long' })
  if (/order.?block|ob.?(?:supply|bear)/i.test(t))
    rules.push({ type: 'order_block_bear', direction: 'short' })
  if (/fair.?value.?gap|fvg/i.test(t))
    rules.push({ type: 'fvg', direction: 'both' })
  if (/break.*?structure|bos|choch/i.test(t))
    rules.push({ type: 'bos', direction: 'both' })
  if (/liquidity.?sweep|sweeping/i.test(t))
    rules.push({ type: 'liq_sweep', direction: 'both' })
  if (/optimal.?trade.?entry|ote|fib.*?(?:61|62|79|78)/i.test(t))
    rules.push({ type: 'ote', direction: 'both' })

  // Bollinger Bands
  if (/bollinger|bb.*?squeeze|price.*?lower.?band/i.test(t))
    rules.push({ type: 'bb_bull', direction: 'long' })
  if (/bollinger|bb.*?squeeze|price.*?upper.?band/i.test(t))
    rules.push({ type: 'bb_bear', direction: 'short' })

  // Supertrend
  if (/supertrend.*?bull|price.*?above.*?supertrend/i.test(t))
    rules.push({ type: 'supertrend_bull', direction: 'long' })
  if (/supertrend.*?bear|price.*?below.*?supertrend/i.test(t))
    rules.push({ type: 'supertrend_bear', direction: 'short' })

  // Trend direction
  if (/uptrend|bullish trend|buy.*?trend|trend.*?up/i.test(t))
    rules.push({ type: 'trend_bull', direction: 'long' })
  if (/downtrend|bearish trend|sell.*?trend|trend.*?down/i.test(t))
    rules.push({ type: 'trend_bear', direction: 'short' })

  // Price action
  if (/pin.?bar|hammer|bullish.?engulf|morning.?star/i.test(t))
    rules.push({ type: 'pa_bull', direction: 'long' })
  if (/shooting.?star|hanging.?man|bearish.?engulf|evening.?star/i.test(t))
    rules.push({ type: 'pa_bear', direction: 'short' })

  // Support/Resistance
  if (/support|demand.?zone|bounce/i.test(t))
    rules.push({ type: 'support', direction: 'long' })
  if (/resistance|supply.?zone|rejection/i.test(t))
    rules.push({ type: 'resistance', direction: 'short' })

  // Volume
  if (/high.?volume|volume.?spike|volume.*?increase/i.test(t))
    rules.push({ type: 'vol_spike', direction: 'both' })

  // London/NY breakout
  if (/london.?break|ny.?break|session.?break|asia.?range/i.test(t))
    rules.push({ type: 'session_break', direction: 'both' })

  return rules
}

function evalSignal(analysis: ReturnType<typeof analyseMarket>, rules: Rule[]): 'long' | 'short' | null {
  let longScore = 0, shortScore = 0

  for (const rule of rules) {
    switch (rule.type) {
      case 'rsi_below':     if (analysis.signals.find(s => s.name.includes('RSI'))?.long)  { longScore++;  } break
      case 'rsi_above':     if (analysis.signals.find(s => s.name.includes('RSI'))?.short) { shortScore++; } break
      case 'ema_cross_bull':if (analysis.trend === 'BULL')  { longScore++;  } break
      case 'ema_cross_bear':if (analysis.trend === 'BEAR')  { shortScore++; } break
      case 'macd_bull':     if (analysis.signals.find(s => s.name.includes('MACD'))?.long)  { longScore++;  } break
      case 'macd_bear':     if (analysis.signals.find(s => s.name.includes('MACD'))?.short) { shortScore++; } break
      case 'stoch_bull':    if (analysis.signals.find(s => s.name.includes('Stoch'))?.long)  { longScore++;  } break
      case 'stoch_bear':    if (analysis.signals.find(s => s.name.includes('Stoch'))?.short) { shortScore++; } break
      case 'order_block_bull': if (analysis.recentOB?.type === 'bull') { longScore++;  } break
      case 'order_block_bear': if (analysis.recentOB?.type === 'bear') { shortScore++; } break
      case 'fvg':           analysis.recentFVG?.type === 'bull' ? longScore++ : analysis.recentFVG?.type === 'bear' ? shortScore++ : null; break
      case 'bos':           analysis.lastBOS?.direction === 'bull' ? longScore++ : analysis.lastBOS?.direction === 'bear' ? shortScore++ : null; break
      case 'liq_sweep':     analysis.recentSweep?.type === 'SSL' ? longScore++ : analysis.recentSweep?.type === 'BSL' ? shortScore++ : null; break
      case 'ote':           analysis.oteSignal?.direction === 'long' ? longScore++ : analysis.oteSignal?.direction === 'short' ? shortScore++ : null; break
      case 'bb_bull':       if (analysis.bbBreakout === 'bull' || analysis.bbSqueeze) { longScore++; } break
      case 'bb_bear':       if (analysis.bbBreakout === 'bear' || analysis.bbSqueeze) { shortScore++; } break
      case 'supertrend_bull': if (analysis.supertrendBull)  { longScore++;  } break
      case 'supertrend_bear': if (!analysis.supertrendBull) { shortScore++; } break
      case 'trend_bull':    if (analysis.trend === 'BULL')  { longScore++;  } break
      case 'trend_bear':    if (analysis.trend === 'BEAR')  { shortScore++; } break
      case 'pa_bull':       if (analysis.recentOB?.type === 'bull') { longScore++;  } break
      case 'pa_bear':       if (analysis.recentOB?.type === 'bear') { shortScore++; } break
      case 'support':       if (analysis.bias === 'BULLISH') { longScore++;  } break
      case 'resistance':    if (analysis.bias === 'BEARISH') { shortScore++; } break
      case 'vol_spike':     if (analysis.pvsra !== 'neutral') { longScore++; shortScore++; } break
      case 'session_break': analysis.londonBreak?.direction === 'bull' ? longScore++ : analysis.londonBreak?.direction === 'bear' ? shortScore++ : null; break
    }
  }

  if (longScore > 0 || shortScore > 0) {
    if (longScore > shortScore) return 'long'
    if (shortScore > longScore) return 'short'
  }
  return null
}

// ── Backtest engine ───────────────────────────────────────────────────────────
export function runBacktest(candles: Candle[], text: string, pipSize = 0.0001): BacktestResult {
  const rules = extractRules(text)
  if (rules.length === 0) {
    return { trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPips: 0, passed: false, reason: 'No rules detected' }
  }

  const MIN_CANDLES = 60
  if (candles.length < MIN_CANDLES) {
    return { trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPips: 0, passed: false, reason: 'Insufficient data' }
  }

  let wins = 0, losses = 0, totalProfit = 0, totalLoss = 0, totalPips = 0
  const step = 5 // evaluate every N candles

  for (let i = MIN_CANDLES; i < candles.length - 5; i += step) {
    const slice = candles.slice(0, i)
    const analysis = analyseMarket(slice, pipSize)
    const signal = evalSignal(analysis, rules)
    if (!signal) continue

    const entry = candles[i].close
    const atrPips = analysis.atrValue / pipSize
    const slPips  = Math.max(atrPips * 1.5, 5)
    const tp1Pips = slPips * 1.5
    const tp2Pips = slPips * 2.5

    // Simulate over next 5 candles
    let hit = false
    for (let j = i + 1; j <= Math.min(i + 5, candles.length - 1) && !hit; j++) {
      const c = candles[j]
      if (signal === 'long') {
        if (c.low <= entry - slPips * pipSize) {
          losses++; totalLoss += slPips; totalPips -= slPips; hit = true
        } else if (c.high >= entry + tp1Pips * pipSize) {
          wins++; totalProfit += tp1Pips; totalPips += tp1Pips; hit = true
        } else if (c.high >= entry + tp2Pips * pipSize) {
          wins++; totalProfit += tp2Pips; totalPips += tp2Pips; hit = true
        }
      } else {
        if (c.high >= entry + slPips * pipSize) {
          losses++; totalLoss += slPips; totalPips -= slPips; hit = true
        } else if (c.low <= entry - tp1Pips * pipSize) {
          wins++; totalProfit += tp1Pips; totalPips += tp1Pips; hit = true
        } else if (c.low <= entry - tp2Pips * pipSize) {
          wins++; totalProfit += tp2Pips; totalPips += tp2Pips; hit = true
        }
      }
    }
  }

  const trades = wins + losses
  if (trades < 5) {
    return { trades, wins, losses, winRate: 0, profitFactor: 0, totalPips, passed: false, reason: 'Too few trades (<5)' }
  }

  const winRate = (wins / trades) * 100
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0

  const passed = winRate >= 72 && profitFactor >= 1.5
  const reason = passed
    ? `✔ ${trades} trades · ${winRate.toFixed(0)}% WR · PF ${profitFactor.toFixed(2)}`
    : `✖ WR ${winRate.toFixed(0)}% (need 72%) · PF ${profitFactor.toFixed(2)} (need 1.5)`

  return { trades, wins, losses, winRate, profitFactor, totalPips, passed, reason }
}

// ── Forward test signal ───────────────────────────────────────────────────────
export function evalForwardSignal(candles: Candle[], text: string, pipSize = 0.0001): 'long' | 'short' | null {
  const rules = extractRules(text)
  if (rules.length === 0 || candles.length < 50) return null
  const analysis = analyseMarket(candles, pipSize)
  return evalSignal(analysis, rules)
}
