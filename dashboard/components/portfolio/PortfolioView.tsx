'use client'

import { useState } from 'react'
import type { PortfolioPosition } from '@/lib/os/types'
import { PORTFOLIO_POSITIONS } from '@/lib/os/mockData'

type Period = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y'
type Tab    = 'holdings' | 'performance' | 'analytics'

const PERIODS: Period[] = ['1D','1W','1M','3M','YTD','1Y']

const SECTOR_ALLOC = [
  { name: 'BANKING', pct: 35, color: 'var(--os-blue)'   },
  { name: 'IT',      pct: 22, color: 'var(--os-cyan)'   },
  { name: 'OIL&GAS', pct: 15, color: 'var(--os-amber)'  },
  { name: 'AUTO',    pct: 12, color: 'var(--os-purple)'  },
  { name: 'PHARMA',  pct: 10, color: 'var(--os-green)'  },
  { name: 'OTHERS',  pct: 6,  color: 'var(--os-t3)'     },
]

const PRODUCT_BADGE: Record<string, string> = {
  INTRADAY: 'os-badge-amber', DELIVERY: 'os-badge-cyan',
  FUTURES:  'os-badge-blue',  OPTIONS:  'os-badge-purple',
}

// ── Mini equity SVG ───────────────────────────────────────────────────────────
function MiniEquity({ period, positive }: { period: Period; positive: boolean }) {
  const pts = Array.from({ length: 20 }, (_, i) => {
    const base = 100 + i * (positive ? 0.8 : -0.6)
    return base + (Math.random() - 0.5) * 8
  })
  const W = 380, H = 100, PAD = 8
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1
  const xStep = (W - PAD * 2) / (pts.length - 1)
  const toY   = (v: number) => PAD + (H - PAD * 2) * (1 - (v - min) / range)
  const toX   = (i: number) => PAD + i * xStep
  const pathD = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const fillD = `${pathD} L${toX(pts.length - 1)},${H - PAD} L${PAD},${H - PAD} Z`
  const c     = positive ? 'var(--os-green)' : 'var(--os-red)'
  return (
    <svg width={W} height={H} style={{ display: 'block', borderRadius: 6, background: 'var(--os-surface2)', marginBottom: 12 }}>
      <defs>
        <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#perfGrad)" />
      <path d={pathD} fill="none" stroke={c} strokeWidth="1.5" />
    </svg>
  )
}

// ── Monthly returns grid ──────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function MonthlyReturns() {
  const returns = Array.from({ length: 12 }, () => +(Math.random() * 6 - 2).toFixed(1))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
      {MONTHS.map((m, i) => {
        const r = returns[i]
        return (
          <div key={m} style={{ padding: '6px 4px', borderRadius: 4, background: r >= 0 ? `rgba(34,197,94,${Math.min(r / 5, 1) * 0.4 + 0.05})` : `rgba(239,68,68,${Math.min(Math.abs(r) / 5, 1) * 0.4 + 0.05})`, textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: 'var(--os-t3)' }}>{m}</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: r >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>{r >= 0 ? '+' : ''}{r}%</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Holdings tab ──────────────────────────────────────────────────────────────
function HoldingsTab({ positions }: { positions: PortfolioPosition[] }) {
  const totalValue = positions.reduce((s, p) => s + p.value, 0)
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table className="os-table" style={{ width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th>SYMBOL</th><th>EXCH</th><th>TYPE</th><th style={{ textAlign: 'right' }}>QTY</th>
              <th style={{ textAlign: 'right' }}>AVG</th><th style={{ textAlign: 'right' }}>CMP</th>
              <th style={{ textAlign: 'right' }}>DAY CHG</th><th style={{ textAlign: 'right' }}>P&L</th>
              <th style={{ textAlign: 'right' }}>P&L%</th><th style={{ textAlign: 'right' }}>VALUE</th>
              <th style={{ width: 70 }}>WEIGHT</th><th style={{ width: 60 }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 700, fontSize: 11 }}>{p.symbol}</td>
                <td><span className="os-badge" style={{ fontSize: 8 }}>{p.exchange}</span></td>
                <td><span className={`os-badge ${PRODUCT_BADGE[p.productType] || ''}`} style={{ fontSize: 8 }}>{p.productType}</span></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{p.quantity}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10 }}>₹{p.avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>₹{p.cmp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`os-badge ${p.dayChangePct >= 0 ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 9 }}>
                    {p.dayChangePct >= 0 ? '+' : ''}{p.dayChangePct.toFixed(2)}%
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: p.pnl >= 0 ? 'var(--os-green)' : 'var(--os-red)', fontWeight: 700 }}>
                  {p.pnl >= 0 ? '+' : ''}₹{Math.abs(p.pnl).toLocaleString('en-IN')}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`os-badge ${p.pnlPct >= 0 ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 9 }}>
                    {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10 }}>₹{p.value.toLocaleString('en-IN')}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1, height: 3, background: 'var(--os-surface2)', borderRadius: 2 }}>
                      <div style={{ height: '100%', background: 'var(--os-blue)', borderRadius: 2, width: `${(p.value / totalValue) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--os-t3)', minWidth: 28 }}>{((p.value / totalValue) * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td>
                  <button className="os-btn" style={{ fontSize: 9, padding: '2px 6px', color: 'var(--os-red)', borderColor: 'var(--os-red)' }}>Exit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Allocation panel */}
      <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--os-border)', padding: 12, overflowY: 'auto' }}>
        <div className="os-label" style={{ marginBottom: 10 }}>ALLOCATION BY SECTOR</div>
        {SECTOR_ALLOC.map(s => (
          <div key={s.name} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
              <span style={{ color: 'var(--os-t2)' }}>{s.name}</span>
              <span style={{ color: s.color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{s.pct}%</span>
            </div>
            <div className="os-progress">
              <div className="os-progress-fill" style={{ width: `${s.pct}%`, background: s.color, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Performance tab ───────────────────────────────────────────────────────────
function PerformanceTab({ period }: { period: Period }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--os-t2)', marginBottom: 6 }}>
          <span>Portfolio vs NIFTY · {period}</span>
          <span><span style={{ color: 'var(--os-blue)' }}>— Portfolio</span> <span style={{ color: 'var(--os-t3)', marginLeft: 8 }}>— NIFTY</span></span>
        </div>
        <MiniEquity period={period} positive />
      </div>
      <div>
        <div className="os-label" style={{ marginBottom: 8 }}>MONTHLY RETURNS · 2025</div>
        <MonthlyReturns />
      </div>
    </div>
  )
}

// ── Analytics tab ─────────────────────────────────────────────────────────────
function AnalyticsTab({ positions }: { positions: PortfolioPosition[] }) {
  const bestPos = positions.reduce((a, b) => b.pnlPct > a.pnlPct ? b : a, positions[0])
  const worstPos = positions.reduce((a, b) => b.pnlPct < a.pnlPct ? b : a, positions[0])

  const cards = [
    { label: 'Win Rate',             value: '68.2%',            sub: 'Closed positions',    color: 'var(--os-green)' },
    { label: 'Avg Holding Period',   value: '12.4 days',         sub: 'All positions',       color: 'var(--os-t1)'   },
    { label: 'Best Trade',           value: `+${bestPos?.pnlPct.toFixed(2)}%`,  sub: bestPos?.symbol,   color: 'var(--os-green)' },
    { label: 'Worst Trade',          value: `${worstPos?.pnlPct.toFixed(2)}%`,  sub: worstPos?.symbol,  color: 'var(--os-red)'   },
    { label: 'Largest Position',     value: positions.length ? positions.reduce((a,b) => b.value > a.value ? b : a, positions[0]).symbol : '-', sub: 'By value', color: 'var(--os-blue)' },
    { label: 'Most Profitable Sector', value: 'BANKING',         sub: '+₹42,350 total',      color: 'var(--os-amber)' },
    { label: 'Trading Frequency',    value: '4.2 / week',        sub: 'Last 30 days',        color: 'var(--os-cyan)'  },
    { label: 'Risk-Adj Return',      value: '1.42',              sub: 'Sharpe Ratio',        color: 'var(--os-purple)'},
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {cards.map(c => (
          <div key={c.label} className="os-card" style={{ padding: '12px 14px' }}>
            <div className="os-label" style={{ marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c.color, marginBottom: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: 'var(--os-t3)' }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PortfolioView() {
  const [period,    setPeriod]    = useState<Period>('1D')
  const [activeTab, setActiveTab] = useState<Tab>('holdings')
  const positions = PORTFOLIO_POSITIONS as PortfolioPosition[]

  const totalValue  = positions.reduce((s, p) => s + p.value, 0)
  const totalPnL    = positions.reduce((s, p) => s + p.pnl,   0)
  const totalInvest = totalValue - totalPnL
  const dayPnL      = positions.reduce((s, p) => s + p.dayChange, 0)
  const dayPnLPct   = (dayPnL / (totalValue - dayPnL)) * 100

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, height: 44, display: 'flex', alignItems: 'center', gap: 0, padding: '0 14px', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)', letterSpacing: '0.06em', marginRight: 16 }}>PORTFOLIO</span>
        <div className="os-tabs" style={{ marginRight: 'auto' }}>
          {(['holdings','performance','analytics'] as Tab[]).map(t => (
            <button key={t} className={`os-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={period === p ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>{p}</button>
          ))}
        </div>
        <button className="os-btn" style={{ fontSize: 10, marginLeft: 8 }}>⬆ Import</button>
      </div>

      {/* Summary row */}
      <div style={{ flexShrink: 0, height: 80, display: 'flex', gap: 0, borderBottom: '1px solid var(--os-border)', background: 'var(--os-surface)' }}>
        {[
          { label: 'Total Value',   value: `₹${totalValue.toLocaleString('en-IN')}`,         sub: 'Portfolio', color: 'var(--os-green)' },
          { label: 'Day P&L',       value: `${dayPnL >= 0 ? '+' : ''}₹${Math.abs(Math.round(dayPnL)).toLocaleString('en-IN')}`, sub: `${dayPnLPct >= 0 ? '+' : ''}${dayPnLPct.toFixed(2)}%`, color: dayPnL >= 0 ? 'var(--os-green)' : 'var(--os-red)' },
          { label: 'Total P&L',     value: `${totalPnL >= 0 ? '+' : ''}₹${Math.abs(Math.round(totalPnL)).toLocaleString('en-IN')}`, sub: `${((totalPnL / totalInvest) * 100).toFixed(2)}%`, color: totalPnL >= 0 ? 'var(--os-green)' : 'var(--os-red)' },
          { label: 'Invested',      value: `₹${Math.round(totalInvest).toLocaleString('en-IN')}`,   sub: `${positions.length} positions`, color: 'var(--os-t1)' },
          { label: 'Free Margin',   value: `₹2,52,766`,                                       sub: 'Available',  color: 'var(--os-cyan)' },
        ].map((s, i) => (
          <div key={s.label} style={{ flex: 1, padding: '12px 16px', borderRight: i < 4 ? '1px solid var(--os-border)' : 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="os-label" style={{ marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--os-t3)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {activeTab === 'holdings'    && <HoldingsTab positions={positions} />}
      {activeTab === 'performance' && <PerformanceTab period={period} />}
      {activeTab === 'analytics'   && <AnalyticsTab positions={positions} />}
    </div>
  )
}
