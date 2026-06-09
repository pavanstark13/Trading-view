'use client'

import { useState } from 'react'
import type { Strategy, BacktestResult } from '@/lib/os/types'

type Tab = 'library' | 'builder' | 'backtest'

const LIBRARY_STRATEGIES: Strategy[] = [
  { id: '1', name: 'EMA Crossover (20/50)',      description: 'Classic EMA cross strategy using 20 and 50 period EMAs for trend following on any timeframe.',   indicators: ['EMA20','EMA50'],                       timeframe: '15m', enabled: true,  winRate: 63, profitFactor: 1.8, createdAt: '', tags: ['trend','ema']     },
  { id: '2', name: 'RSI Divergence',              description: 'Identifies hidden and regular RSI divergence against price to catch reversals early.',           indicators: ['RSI'],                                 timeframe: '1h',  enabled: true,  winRate: 58, profitFactor: 1.6, createdAt: '', tags: ['reversal','rsi']  },
  { id: '3', name: 'ICT Order Block',             description: 'Trades from institutional order blocks with confluent FVGs. High accuracy with tight SLs.',     indicators: ['OB','FVG','BOS'],                      timeframe: '15m', enabled: false, winRate: 71, profitFactor: 2.1, createdAt: '', tags: ['ict','smc']       },
  { id: '4', name: 'SMC CHoCH + FVG',            description: 'Change of Character detection combined with Fair Value Gap entry for precision entries.',        indicators: ['CHoCH','FVG','OB'],                    timeframe: '5m',  enabled: true,  winRate: 67, profitFactor: 1.9, createdAt: '', tags: ['smc','ict']       },
  { id: '5', name: 'MACD + Volume',               description: 'MACD histogram cross combined with above-average volume confirmation for momentum trades.',     indicators: ['MACD','Volume'],                       timeframe: '1h',  enabled: false, winRate: 55, profitFactor: 1.4, createdAt: '', tags: ['momentum','macd'] },
  { id: '6', name: 'Supertrend Trend Following',  description: 'Supertrend indicator combined with EMA200 filter for high probability trend following.',        indicators: ['Supertrend','EMA200'],                 timeframe: '4h',  enabled: true,  winRate: 61, profitFactor: 1.7, createdAt: '', tags: ['trend','supertrend'] },
  { id: '7', name: 'London Session Breakout',     description: 'Trades breakouts of the London session range with ATR-based targets and stops.',                indicators: ['ATR'],                                 timeframe: '15m', enabled: false, winRate: 64, profitFactor: 2.0, createdAt: '', tags: ['session','breakout'] },
  { id: '8', name: 'VWAP Reversion',              description: 'Mean reversion back to VWAP after extended moves. Works best in ranging intraday sessions.',    indicators: ['VWAP','RSI'],                          timeframe: '5m',  enabled: true,  winRate: 59, profitFactor: 1.5, createdAt: '', tags: ['vwap','reversion'] },
]

const INDICATOR_OPTIONS = ['RSI','EMA20','EMA50','EMA200','MACD','VWAP','Volume','Supertrend','ATR','OB','FVG','BOS','CHoCH']
const OPERATOR_OPTIONS  = ['crosses above','crosses below','is above','is below','=','!=']
const SETUP_PRESETS     = ['EMA Breakout','OB Retest','RSI Divergence','MACD Cross','BOS Continuation','CHoCH Reversal','ICT OTE','Volume Spike','Supertrend Flip','London Breakout','VWAP Reversion']

interface Condition { id: string; indicator: string; operator: string; value: string; timeframe: string }

function pfColor(pf: number): string {
  if (pf >= 2)   return 'var(--os-green)'
  if (pf >= 1.5) return 'var(--os-amber)'
  return 'var(--os-red)'
}

// ── Mock equity curve ─────────────────────────────────────────────────────────
function mockEquity(totalTrades: number, winRate: number): { date: string; value: number }[] {
  const pts: { date: string; value: number }[] = []
  let v = 100000
  for (let i = 0; i < totalTrades; i++) {
    const win = Math.random() < winRate / 100
    v += win ? Math.random() * 3000 + 500 : -(Math.random() * 2000 + 300)
    pts.push({ date: `2024-${String(Math.floor(i / (totalTrades / 12)) + 1).padStart(2, '0')}-01`, value: Math.max(v, 60000) })
  }
  return pts
}

function EquityCurve({ equity }: { equity: { date: string; value: number }[] }) {
  if (!equity.length) return null
  const W = 560, H = 180, PAD = 20
  const min = Math.min(...equity.map(e => e.value))
  const max = Math.max(...equity.map(e => e.value))
  const range = max - min || 1
  const xStep = (W - PAD * 2) / (equity.length - 1)
  const toY   = (v: number) => PAD + (H - PAD * 2) * (1 - (v - min) / range)
  const toX   = (i: number) => PAD + i * xStep

  const pathD  = equity.map((e, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(e.value).toFixed(1)}`).join(' ')
  const fillD  = `${pathD} L${toX(equity.length - 1).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`
  const isPos  = equity[equity.length - 1].value >= equity[0].value
  const lineC  = isPos ? 'var(--os-green)' : 'var(--os-red)'

  return (
    <svg width={W} height={H} style={{ display: 'block', borderRadius: 6, background: 'var(--os-surface2)' }}>
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineC} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineC} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#eqGrad)" />
      <path d={pathD} fill="none" stroke={lineC} strokeWidth="1.5" />
      <text x={PAD + 4} y={PAD + 10} fontSize="9" fill="var(--os-t3)">₹{equity[0].value.toLocaleString('en-IN')}</text>
      <text x={W - PAD - 4} y={PAD + 10} fontSize="9" fill={lineC} textAnchor="end">₹{equity[equity.length - 1].value.toLocaleString('en-IN')}</text>
    </svg>
  )
}

// ── Library tab ───────────────────────────────────────────────────────────────
function LibraryTab({ onRunBacktest, onEdit }: { onRunBacktest: (s: Strategy) => void; onEdit: (s: Strategy) => void }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(LIBRARY_STRATEGIES.map(s => [s.id, s.enabled])))
  return (
    <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, overflowY: 'auto', flex: 1 }}>
      {LIBRARY_STRATEGIES.map(s => (
        <div key={s.id} className="os-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)' }}>{s.name}</div>
              <div style={{ fontSize: 10, color: 'var(--os-t3)', marginTop: 2, lineHeight: 1.4 }}>{s.description}</div>
            </div>
            <label className="os-toggle" style={{ flexShrink: 0, marginLeft: 8 }}>
              <input type="checkbox" checked={!!enabled[s.id]} onChange={e => setEnabled(p => ({ ...p, [s.id]: e.target.checked }))} />
              <span />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="os-badge os-badge-blue" style={{ fontSize: 9 }}>{s.timeframe}</span>
            {s.indicators.map(ind => <span key={ind} className="os-badge" style={{ fontSize: 9 }}>{ind}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
            <div>
              <span style={{ color: 'var(--os-t3)' }}>Win Rate </span>
              <span className="os-badge os-badge-green" style={{ fontSize: 9 }}>{s.winRate}%</span>
            </div>
            <div>
              <span style={{ color: 'var(--os-t3)' }}>PF </span>
              <span style={{ color: pfColor(s.profitFactor!), fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.profitFactor!.toFixed(1)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button className="os-btn os-btn-primary" style={{ flex: 1, fontSize: 10 }} onClick={() => onRunBacktest(s)}>▶ Run Backtest</button>
            <button className="os-btn" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => onEdit(s)}>Edit</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Builder tab ───────────────────────────────────────────────────────────────
function BuilderTab({ initial, onQuickBacktest }: { initial: Strategy | null; onQuickBacktest: () => void }) {
  const mkCond = (): Condition => ({ id: Math.random().toString(36).slice(2), indicator: 'RSI', operator: 'crosses above', value: '30', timeframe: '15m' })
  const [entryConds, setEntryConds] = useState<Condition[]>([mkCond()])
  const [exitConds,  setExitConds]  = useState<Condition[]>([mkCond()])
  const [name, setName]             = useState(initial?.name || '')
  const [desc, setDesc]             = useState(initial?.description || '')
  const [slMultiple, setSlMultiple] = useState('1.5')
  const [rrRatio,    setRrRatio]    = useState('1:2')
  const [trailing,   setTrailing]   = useState(false)
  const [markets,    setMarkets]    = useState<Record<string,boolean>>({ 'NSE F&O': true, 'Forex': false, 'Crypto': false, 'MCX': false })
  const [timeframes, setTimeframes] = useState<Record<string,boolean>>({ '5m': false, '15m': true, '1h': false, '4h': false, '1d': false })

  const updCond = (list: Condition[], setList: (c: Condition[]) => void, id: string, field: keyof Condition, val: string) =>
    setList(list.map(c => c.id === id ? { ...c, [field]: val } : c))

  const ConditionList = ({ label, conds, setConds }: { label: string; conds: Condition[]; setConds: (c: Condition[]) => void }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--os-t2)', marginBottom: 6, letterSpacing: '0.05em' }}>{label}</div>
      {conds.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <select value={c.indicator} onChange={e => updCond(conds, setConds, c.id, 'indicator', e.target.value)} className="os-input" style={{ fontSize: 10, flex: 1 }}>
            {INDICATOR_OPTIONS.map(i => <option key={i}>{i}</option>)}
          </select>
          <select value={c.operator} onChange={e => updCond(conds, setConds, c.id, 'operator', e.target.value)} className="os-input" style={{ fontSize: 10, flex: 2 }}>
            {OPERATOR_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
          <input value={c.value} onChange={e => updCond(conds, setConds, c.id, 'value', e.target.value)} className="os-input" style={{ fontSize: 10, width: 50 }} placeholder="value" />
          <select value={c.timeframe} onChange={e => updCond(conds, setConds, c.id, 'timeframe', e.target.value)} className="os-input" style={{ fontSize: 10, width: 55 }}>
            {['1m','5m','15m','30m','1h','4h','1d'].map(t => <option key={t}>{t}</option>)}
          </select>
          <button className="os-btn-icon" onClick={() => setConds(conds.filter(x => x.id !== c.id))} style={{ color: 'var(--os-red)', fontSize: 12, padding: '0 6px' }}>✕</button>
        </div>
      ))}
      <button className="os-btn" style={{ fontSize: 10, marginTop: 2 }} onClick={() => setConds([...conds, mkCond()])}>+ Add Condition</button>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 0 }}>
      {/* Left: conditions */}
      <div style={{ flex: 1, padding: 14, borderRight: '1px solid var(--os-border)', overflowY: 'auto' }}>
        <ConditionList label="ENTRY CONDITIONS" conds={entryConds} setConds={setEntryConds} />
        <ConditionList label="EXIT CONDITIONS"  conds={exitConds}  setConds={setExitConds}  />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--os-t2)', marginBottom: 8, letterSpacing: '0.05em' }}>RISK RULES</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="os-label" style={{ marginBottom: 3 }}>Stop Loss (ATR Multiple)</div>
            <select value={slMultiple} onChange={e => setSlMultiple(e.target.value)} className="os-input" style={{ fontSize: 10, width: '100%' }}>
              {['0.5x','1x','1.5x','2x','2.5x','3x'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div className="os-label" style={{ marginBottom: 3 }}>Take Profit (R:R)</div>
            <select value={rrRatio} onChange={e => setRrRatio(e.target.value)} className="os-input" style={{ fontSize: 10, width: '100%' }}>
              {['1:1','1:1.5','1:2','1:2.5','1:3','1:4','1:5'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--os-t2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={trailing} onChange={e => setTrailing(e.target.checked)} style={{ accentColor: 'var(--os-blue)' }} />
          Trailing Stop
        </label>
      </div>

      {/* Right: preview */}
      <div style={{ width: 240, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div className="os-label" style={{ marginBottom: 3 }}>Strategy Name</div>
          <input value={name} onChange={e => setName(e.target.value)} className="os-input" placeholder="My Strategy" style={{ width: '100%', fontSize: 11 }} />
        </div>
        <div>
          <div className="os-label" style={{ marginBottom: 3 }}>Description</div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} className="os-input" placeholder="Describe your strategy…" style={{ width: '100%', fontSize: 10, height: 60, resize: 'vertical' }} />
        </div>
        <div>
          <div className="os-label" style={{ marginBottom: 5 }}>Markets</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.keys(markets).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--os-t2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={markets[m]} onChange={e => setMarkets(p => ({ ...p, [m]: e.target.checked }))} style={{ accentColor: 'var(--os-blue)' }} /> {m}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="os-label" style={{ marginBottom: 5 }}>Timeframes</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.keys(timeframes).map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--os-t2)', cursor: 'pointer', padding: '2px 6px', border: '1px solid var(--os-border)', borderRadius: 3, background: timeframes[t] ? 'rgba(59,130,246,0.1)' : undefined, borderColor: timeframes[t] ? 'var(--os-blue)' : undefined }}>
                <input type="checkbox" checked={timeframes[t]} onChange={e => setTimeframes(p => ({ ...p, [t]: e.target.checked }))} style={{ display: 'none' }} /> {t}
              </label>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="os-btn os-btn-primary" style={{ fontSize: 11 }}>💾 Save Strategy</button>
          <button className="os-btn" style={{ fontSize: 11 }} onClick={onQuickBacktest}>⚡ Quick Backtest</button>
        </div>
      </div>
    </div>
  )
}

// ── Backtest Results tab ──────────────────────────────────────────────────────
function BacktestTab({ result, running }: { result: BacktestResult | null; running: boolean }) {
  if (running) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <span className="os-live-dot" style={{ background: 'var(--os-blue)', width: 10, height: 10 }} />
      <span style={{ fontSize: 12, color: 'var(--os-t2)' }}>Running backtest simulation…</span>
      <span style={{ fontSize: 10, color: 'var(--os-t3)' }}>Processing 500+ candles</span>
    </div>
  )
  if (!result) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 32 }}>📊</span>
      <span style={{ fontSize: 13, color: 'var(--os-t2)' }}>No backtest results yet</span>
      <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>Select a strategy from Library and click "Run Backtest"</span>
    </div>
  )

  const metrics: [string, string | number, string?][] = [
    ['Total Trades', result.totalTrades],
    ['Win Rate',     result.winRate.toFixed(1) + '%'],
    ['Profit Factor',result.profitFactor.toFixed(2)],
    ['Net P&L',      '₹' + result.netPnL.toLocaleString('en-IN')],
    ['Max Drawdown', result.maxDrawdown.toFixed(1) + '%'],
    ['Sharpe Ratio', result.sharpeRatio.toFixed(2)],
    ['Avg Win',      '₹' + result.avgWin.toLocaleString('en-IN')],
    ['Avg Loss',     '₹' + result.avgLoss.toLocaleString('en-IN')],
    ['Avg R:R',      result.avgRR.toFixed(2)],
    ['Expectancy',   '₹' + result.expectancy.toLocaleString('en-IN')],
    ['Best Trade',   '₹' + result.bestTrade.toLocaleString('en-IN')],
    ['Worst Trade',  '₹' + result.worstTrade.toLocaleString('en-IN')],
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {metrics.map(([label, value]) => (
          <div key={label} className="os-card" style={{ padding: '8px 10px' }}>
            <div className="os-label" style={{ marginBottom: 2 }}>{label}</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
              color: label === 'Win Rate' ? (result.winRate >= 55 ? 'var(--os-green)' : 'var(--os-amber)') :
                     label === 'Profit Factor' ? pfColor(result.profitFactor) :
                     label === 'Net P&L' ? (result.netPnL >= 0 ? 'var(--os-green)' : 'var(--os-red)') :
                     label === 'Max Drawdown' ? 'var(--os-red)' :
                     label === 'Best Trade' ? 'var(--os-green)' :
                     label === 'Worst Trade' ? 'var(--os-red)' :
                     'var(--os-t1)'
            }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <div>
        <div className="os-label" style={{ marginBottom: 6 }}>EQUITY CURVE · {result.period}</div>
        <EquityCurve equity={result.equity} />
      </div>

      {/* Trade list */}
      <div>
        <div className="os-label" style={{ marginBottom: 6 }}>RECENT TRADES (last {result.trades.length})</div>
        <table className="os-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Dir</th><th style={{ textAlign: 'right' }}>P&L</th><th style={{ textAlign: 'right' }}>P&L%</th>
            </tr>
          </thead>
          <tbody>
            {result.trades.map((t, i) => (
              <tr key={i}>
                <td style={{ fontSize: 10, color: 'var(--os-t3)', fontFamily: 'var(--font-mono)' }}>{t.date}</td>
                <td style={{ fontWeight: 700, fontSize: 11 }}>{t.symbol}</td>
                <td><span className={`os-badge ${t.direction === 'LONG' ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 9 }}>{t.direction}</span></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: t.pnl >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>
                  {t.pnl >= 0 ? '+' : ''}₹{Math.abs(t.pnl).toLocaleString('en-IN')}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`os-badge ${t.pnlPct >= 0 ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 9 }}>
                    {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Symbols for mock backtest ─────────────────────────────────────────────────
const BT_SYMBOLS = ['NIFTY','BANKNIFTY','RELIANCE','HDFCBANK','INFY','TCS','AXISBANK']

function generateBacktestResult(s: Strategy): BacktestResult {
  const wr  = s.winRate  ?? 60
  const pf  = s.profitFactor ?? 1.8
  const n   = 80 + Math.floor(Math.random() * 60)
  const wins = Math.floor(n * wr / 100)
  const avgW = 2800 + Math.floor(Math.random() * 1200)
  const avgL = Math.floor(avgW / pf)
  const netPnL = wins * avgW - (n - wins) * avgL
  const eq  = mockEquity(n, wr)

  return {
    strategyId: s.id,
    totalTrades: n,
    winRate: wr + (Math.random() - 0.5) * 4,
    profitFactor: pf + (Math.random() - 0.5) * 0.2,
    netPnL,
    netPnLPct: (netPnL / 100000) * 100,
    maxDrawdown: 8 + Math.random() * 10,
    sharpeRatio: 1.2 + Math.random() * 0.8,
    avgWin: avgW,
    avgLoss: avgL,
    avgRR: pf * 0.9,
    bestTrade: avgW * 3,
    worstTrade: -(avgL * 2.5),
    expectancy: (wr / 100 * avgW) - ((1 - wr / 100) * avgL),
    period: 'Jan 2024 – Jun 2025',
    equity: eq,
    trades: Array.from({ length: 10 }, (_, i) => {
      const win = Math.random() < wr / 100
      const pnl = win ? avgW + Math.floor(Math.random() * 1000) : -(avgL + Math.floor(Math.random() * 500))
      return {
        date: `2025-${String(Math.floor(Math.random() * 6) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
        symbol: BT_SYMBOLS[i % BT_SYMBOLS.length],
        direction: Math.random() > 0.4 ? 'LONG' : 'SHORT',
        pnl,
        pnlPct: pnl / 100000 * 100,
      }
    }),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StrategyView({ initialTab = 'library' }: { initialTab?: Tab }) {
  const [activeTab,        setActiveTab]        = useState<Tab>(initialTab)
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null)
  const [backtestRunning,  setBacktestRunning]  = useState(false)
  const [backtestResult,   setBacktestResult]   = useState<BacktestResult | null>(null)

  const handleRunBacktest = (s: Strategy) => {
    setSelectedStrategy(s)
    setActiveTab('backtest')
    setBacktestRunning(true)
    setBacktestResult(null)
    setTimeout(() => {
      setBacktestResult(generateBacktestResult(s))
      setBacktestRunning(false)
    }, 1600 + Math.random() * 800)
  }

  const handleEdit = (s: Strategy) => { setSelectedStrategy(s); setActiveTab('builder') }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, height: 44, display: 'flex', alignItems: 'center', gap: 0, padding: '0 14px', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)', letterSpacing: '0.06em', marginRight: 16 }}>STRATEGY ENGINE</span>
        <div className="os-tabs">
          {(['library','builder','backtest'] as Tab[]).map(t => (
            <button key={t} className={`os-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'library' ? 'Library' : t === 'builder' ? 'Builder' : 'Backtest Results'}
              {t === 'backtest' && backtestResult && <span className="os-badge os-badge-green" style={{ fontSize: 8, marginLeft: 5 }}>DONE</span>}
              {t === 'backtest' && backtestRunning && <span className="os-badge os-badge-amber" style={{ fontSize: 8, marginLeft: 5 }}>RUNNING</span>}
            </button>
          ))}
        </div>
        {selectedStrategy && (
          <span style={{ marginLeft: 12, fontSize: 10, color: 'var(--os-t3)' }}>
            Active: <span style={{ color: 'var(--os-blue)' }}>{selectedStrategy.name}</span>
          </span>
        )}
      </div>

      {activeTab === 'library' && <LibraryTab onRunBacktest={handleRunBacktest} onEdit={handleEdit} />}
      {activeTab === 'builder' && <BuilderTab initial={selectedStrategy} onQuickBacktest={() => {
        if (selectedStrategy) handleRunBacktest(selectedStrategy)
        else handleRunBacktest(LIBRARY_STRATEGIES[0])
      }} />}
      {activeTab === 'backtest' && <BacktestTab result={backtestResult} running={backtestRunning} />}
    </div>
  )
}
