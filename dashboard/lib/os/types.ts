export type OSView =
  | 'terminal'
  | 'scanner'
  | 'strategy'
  | 'backtest'
  | 'portfolio'
  | 'risk'
  | 'journal'
  | 'alerts'
  | 'broker'

export type Exchange = 'NSE' | 'BSE' | 'NFO' | 'MCX' | 'CDS' | 'FOREX' | 'CRYPTO'

export interface ScanResult {
  symbol: string
  name: string
  exchange: Exchange
  price: number
  change: number
  changePct: number
  volume: number
  volumeAvg: number
  volumeRatio: number
  rsi: number
  macd: 'BULL_CROSS' | 'BEAR_CROSS' | 'BULL' | 'BEAR' | 'NEUTRAL'
  emaPosition: 'ABOVE_ALL' | 'ABOVE_200' | 'BELOW_200' | 'BELOW_ALL'
  signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
  strength: number
  setup: string
  pattern?: string
  sector: string
  lotSize?: number
  high52w: number
  low52w: number
  nearHigh: boolean
  nearLow: boolean
  marketCap: 'LARGE' | 'MID' | 'SMALL'
}

export interface JournalEntry {
  id: string
  date: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT'
  entry: number
  exit?: number
  stopLoss: number
  target: number
  quantity: number
  pnl?: number
  pnlPct?: number
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
  setup: string
  entryReason: string
  exitReason?: string
  emotion: 'CONFIDENT' | 'NEUTRAL' | 'ANXIOUS' | 'FOMO' | 'GREEDY' | 'FEARFUL'
  mistakes: string[]
  lessons: string
  tags: string[]
  timeframe: string
  strategy: string
  riskReward: number
  createdAt: string
  grade?: 'A' | 'B' | 'C' | 'D' | 'F'
  screenshots?: string[]
}

export interface RiskSettings {
  dailyLossLimit: number
  weeklyLossLimit: number
  maxDrawdownPct: number
  maxPositions: number
  riskPerTrade: number
  autoStopEnabled: boolean
  marginLimit: number
  accountSize: number
}

export interface AlertRule {
  id: string
  name: string
  symbol: string
  exchange: string
  type:
    | 'PRICE_ABOVE'
    | 'PRICE_BELOW'
    | 'PCT_CHANGE'
    | 'VOLUME_SPIKE'
    | 'RSI_OVERBOUGHT'
    | 'RSI_OVERSOLD'
    | 'MACD_CROSS'
    | 'EMA_CROSS'
  value: number
  enabled: boolean
  triggered: boolean
  triggeredAt?: string
  createdAt: string
  notifySound: boolean
  message?: string
}

export interface Strategy {
  id: string
  name: string
  description: string
  indicators: string[]
  timeframe: string
  enabled: boolean
  winRate?: number
  profitFactor?: number
  createdAt: string
  tags: string[]
}

export interface BacktestResult {
  strategyId: string
  totalTrades: number
  winRate: number
  profitFactor: number
  netPnL: number
  netPnLPct: number
  maxDrawdown: number
  sharpeRatio: number
  avgWin: number
  avgLoss: number
  avgRR: number
  bestTrade: number
  worstTrade: number
  expectancy: number
  period: string
  equity: { date: string; value: number }[]
  trades: {
    date: string
    symbol: string
    direction: string
    pnl: number
    pnlPct: number
  }[]
}

export interface PortfolioPosition {
  id: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT'
  quantity: number
  avgPrice: number
  cmp: number
  pnl: number
  pnlPct: number
  value: number
  dayChange: number
  dayChangePct: number
  weight: number
  sector: string
  productType: 'INTRADAY' | 'DELIVERY' | 'FUTURES' | 'OPTIONS'
  openedAt: string
}
