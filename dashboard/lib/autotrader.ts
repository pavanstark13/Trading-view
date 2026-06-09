// Auto-Trader State Machine
// Core logic: config, state, risk checks, position sizing, logging

export interface AutoTraderConfig {
  enabled: boolean
  // Risk controls
  dailyLossLimit: number      // e.g. 2000 (₹)
  weeklyLossLimit: number     // e.g. 5000
  maxDrawdownPct: number      // e.g. 5 (%)
  maxTradesPerDay: number     // e.g. 5
  maxOpenPositions: number    // e.g. 3
  riskPerTrade: number        // e.g. 1 (% of account)
  accountSize: number         // e.g. 100000
  // Strategy selection
  strategies: string[]        // strategy IDs to run
  symbols: string[]           // symbols to scan
  interval: string            // '15m' | '1h' | '4h' | '1d'
  // Broker
  broker: 'angelone' | 'oanda' | 'binance' | 'paper'
  // Auto-approve (skip human gate)
  autoApprove: boolean
}

export interface AutoTraderState {
  config: AutoTraderConfig
  running: boolean
  dailyPnL: number
  weeklyPnL: number
  peakEquity: number
  currentEquity: number
  drawdownPct: number
  tradesToday: number
  openPositions: number
  lastScanAt: string | null
  status: 'IDLE' | 'SCANNING' | 'SIGNAL_FOUND' | 'RISK_CHECK' | 'BLOCKED' | 'PLACING_ORDER' | 'ACTIVE'
  blockedReason: string | null
  log: AutoTraderLogEntry[]
}

export interface AutoTraderLogEntry {
  ts: string
  type: 'INFO' | 'SIGNAL' | 'RISK_BLOCK' | 'ORDER' | 'FILL' | 'ERROR' | 'RESET'
  message: string
  data?: unknown
}

export const AVAILABLE_STRATEGIES = [
  { id: 'ema_cross',    label: 'EMA Cross' },
  { id: 'rsi_reversal', label: 'RSI Reversal' },
  { id: 'macd_cross',   label: 'MACD Cross' },
  { id: 'supertrend',   label: 'Supertrend' },
  { id: 'bb_squeeze',   label: 'BB Squeeze' },
] as const

export function createDefaultConfig(): AutoTraderConfig {
  return {
    enabled: false,
    dailyLossLimit: 2000,
    weeklyLossLimit: 5000,
    maxDrawdownPct: 5,
    maxTradesPerDay: 5,
    maxOpenPositions: 3,
    riskPerTrade: 1,
    accountSize: 100000,
    strategies: ['ema_cross'],
    symbols: ['NIFTY', 'BANKNIFTY'],
    interval: '15m',
    broker: 'paper',
    autoApprove: false,
  }
}

export function createDefaultState(config: AutoTraderConfig): AutoTraderState {
  return {
    config,
    running: false,
    dailyPnL: 0,
    weeklyPnL: 0,
    peakEquity: config.accountSize,
    currentEquity: config.accountSize,
    drawdownPct: 0,
    tradesToday: 0,
    openPositions: 0,
    lastScanAt: null,
    status: 'IDLE',
    blockedReason: null,
    log: [],
  }
}

export function checkRiskLimits(state: AutoTraderState): { allowed: boolean; reason: string | null } {
  const { config, dailyPnL, weeklyPnL, drawdownPct, tradesToday, openPositions } = state

  if (dailyPnL <= -config.dailyLossLimit) {
    return { allowed: false, reason: `Daily loss limit hit (₹${Math.abs(dailyPnL).toFixed(0)} / ₹${config.dailyLossLimit})` }
  }
  if (weeklyPnL <= -config.weeklyLossLimit) {
    return { allowed: false, reason: `Weekly loss limit hit (₹${Math.abs(weeklyPnL).toFixed(0)} / ₹${config.weeklyLossLimit})` }
  }
  if (drawdownPct >= config.maxDrawdownPct) {
    return { allowed: false, reason: `Max drawdown reached (${drawdownPct.toFixed(2)}% / ${config.maxDrawdownPct}%)` }
  }
  if (tradesToday >= config.maxTradesPerDay) {
    return { allowed: false, reason: `Max trades/day reached (${tradesToday} / ${config.maxTradesPerDay})` }
  }
  if (openPositions >= config.maxOpenPositions) {
    return { allowed: false, reason: `Max open positions reached (${openPositions} / ${config.maxOpenPositions})` }
  }

  return { allowed: true, reason: null }
}

/**
 * Calculate position size based on risk % of account.
 * Formula: (accountSize * riskPerTrade%) / |entryPrice - stopLoss|
 */
export function calcPositionSize(
  config: AutoTraderConfig,
  entryPrice: number,
  stopLoss: number
): number {
  const riskAmount = config.accountSize * (config.riskPerTrade / 100)
  const riskPerUnit = Math.abs(entryPrice - stopLoss)
  if (riskPerUnit <= 0) return 0
  return Math.floor(riskAmount / riskPerUnit)
}

/** Immutable log append — keeps last 200 entries */
export function addLog(state: AutoTraderState, entry: AutoTraderLogEntry): AutoTraderState {
  const log = [...state.log, entry].slice(-200)
  return { ...state, log }
}
