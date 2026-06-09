'use client'

import { useState, useEffect, useMemo } from 'react'
import type { JournalEntry } from '@/lib/os/types'

type TabType       = 'trades' | 'stats' | 'review'
type StatusFilter  = 'ALL' | 'OPEN' | 'CLOSED'
type DirFilter     = 'ALL' | 'LONG' | 'SHORT'

const EMOTIONS: { key: JournalEntry['emotion']; emoji: string; label: string }[] = [
  { key: 'CONFIDENT', emoji: '😊', label: 'Confident'  },
  { key: 'NEUTRAL',   emoji: '😐', label: 'Neutral'    },
  { key: 'ANXIOUS',   emoji: '😰', label: 'Anxious'    },
  { key: 'FOMO',      emoji: '😱', label: 'FOMO'       },
  { key: 'GREEDY',    emoji: '🤑', label: 'Greedy'     },
  { key: 'FEARFUL',   emoji: '😨', label: 'Fearful'    },
]

const MISTAKES_OPTIONS = ['FOMO Entry','Late Entry','Moved SL','Over-leveraged','Ignored Plan','Revenge Trade']

const SETUPS = ['EMA Breakout','OB Retest','RSI Divergence','MACD Cross','BOS Continuation','CHoCH Reversal','ICT OTE','Volume Spike','Supertrend Flip','London Breakout','VWAP Reversion']

const GRADES: JournalEntry['grade'][] = ['A','B','C','D','F']
const GRADE_COLORS: Record<string, string> = { A: 'var(--os-green)', B: 'var(--os-cyan)', C: 'var(--os-amber)', D: 'var(--os-orange)', F: 'var(--os-red)' }

const MOCK_ENTRIES: JournalEntry[] = [
  { id: '1', date: '2025-06-05', symbol: 'NIFTY',   exchange: 'NSE', direction: 'LONG',  entry: 24200, exit: 24480, stopLoss: 24050, target: 24600, quantity: 50,  pnl: 14000,  pnlPct: 1.16,  status: 'CLOSED', setup: 'EMA Breakout',  entryReason: 'EMA20 cross above EMA50', emotion: 'CONFIDENT', mistakes: [],              lessons: 'Good discipline, held to target.', tags: ['nifty','trending'], timeframe: '15m', strategy: 'EMA Crossover', riskReward: 2.6, createdAt: '', grade: 'A' },
  { id: '2', date: '2025-06-04', symbol: 'EURUSD',  exchange: 'FX',  direction: 'SHORT', entry: 1.0842, exit: 1.0798, stopLoss: 1.0870, target: 1.0780, quantity: 1, pnl: 4400, pnlPct: 0.41,  status: 'CLOSED', setup: 'OB Retest',     entryReason: 'Bearish OB + FVG',        emotion: 'NEUTRAL',   mistakes: [],              lessons: 'Entry was perfect.',              tags: ['eurusd','ict'],    timeframe: '1h',  strategy: 'ICT OB',      riskReward: 2.2, createdAt: '', grade: 'A' },
  { id: '3', date: '2025-06-03', symbol: 'XAUUSD',  exchange: 'FX',  direction: 'LONG',  entry: 2318, exit: 2298,   stopLoss: 2305,   target: 2360, quantity: 1,   pnl: -2000,  pnlPct: -0.86, status: 'CLOSED', setup: 'RSI Divergence', entryReason: 'Bullish divergence',       emotion: 'ANXIOUS',   mistakes: ['Moved SL'],    lessons: 'Moved SL out of fear, should have held.', tags: ['gold'],        timeframe: '4h',  strategy: 'RSI Div',     riskReward: 3.2, createdAt: '', grade: 'C' },
  { id: '4', date: '2025-06-06', symbol: 'HDFCBANK', exchange: 'NSE', direction: 'LONG', entry: 1680, stopLoss: 1650, target: 1750, quantity: 50, status: 'OPEN',   setup: 'BOS Continuation', entryReason: 'BOS with volume',          emotion: 'CONFIDENT', mistakes: [],              lessons: '',                                tags: ['banking'],     timeframe: '15m', strategy: 'SMC',         riskReward: 2.3, createdAt: '', grade: undefined },
  { id: '5', date: '2025-06-02', symbol: 'BTCUSD',  exchange: 'CRYPTO', direction: 'SHORT', entry: 69200, exit: 65800, stopLoss: 70500, target: 64000, quantity: 0.1, pnl: 34000, pnlPct: 4.91, status: 'CLOSED', setup: 'CHoCH Reversal', entryReason: 'CHoCH + FVG fill',         emotion: 'NEUTRAL',   mistakes: [],              lessons: 'Excellent trade, held conviction.',tags: ['crypto'],      timeframe: '1h',  strategy: 'SMC CHoCH',   riskReward: 4.1, createdAt: '', grade: 'A' },
]

function mkId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

const BLANK_ENTRY: Omit<JournalEntry, 'id' | 'createdAt'> = {
  date: new Date().toISOString().split('T')[0],
  symbol: '', exchange: 'NSE', direction: 'LONG',
  entry: 0, stopLoss: 0, target: 0, quantity: 1,
  status: 'OPEN', setup: 'EMA Breakout', entryReason: '',
  emotion: 'NEUTRAL', mistakes: [], lessons: '', tags: [],
  timeframe: '15m', strategy: '', riskReward: 0,
}

// ── Trade form ────────────────────────────────────────────────────────────────
function TradeForm({ initial, onSave, onCancel }: { initial: Partial<JournalEntry>; onSave: (e: JournalEntry) => void; onCancel: () => void }) {
  const [form, setForm]     = useState<typeof BLANK_ENTRY>({ ...BLANK_ENTRY, ...initial })
  const [tagInput, setTagInput] = useState('')

  const upd = <K extends keyof typeof BLANK_ENTRY>(k: K, v: (typeof BLANK_ENTRY)[K]) => setForm(f => ({ ...f, [k]: v }))

  const rr = form.entry && form.stopLoss && form.target
    ? Math.abs(form.target - form.entry) / Math.abs(form.entry - form.stopLoss)
    : 0

  const addTag = (t: string) => { if (t.trim() && !form.tags.includes(t.trim())) { upd('tags', [...form.tags, t.trim()]); setTagInput('') } }
  const toggleMistake = (m: string) => upd('mistakes', form.mistakes.includes(m) ? form.mistakes.filter(x => x !== m) : [...form.mistakes, m])

  const handleSave = () => {
    onSave({ ...form, id: (initial as JournalEntry).id || mkId(), createdAt: new Date().toISOString(), riskReward: +rr.toFixed(2) })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 680, maxHeight: '90vh', background: 'var(--os-surface)', border: '1px solid var(--os-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--os-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)' }}>{(initial as JournalEntry).id ? 'EDIT TRADE' : 'NEW TRADE'}</span>
          <button className="os-btn-icon" onClick={onCancel} style={{ fontSize: 16 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Trade details */}
          <div>
            <div className="os-label" style={{ marginBottom: 8 }}>TRADE DETAILS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><div className="os-label" style={{ marginBottom: 3 }}>Symbol</div><input value={form.symbol} onChange={e => upd('symbol', e.target.value.toUpperCase())} className="os-input" style={{ width: '100%', fontSize: 11 }} placeholder="NIFTY" /></div>
              <div><div className="os-label" style={{ marginBottom: 3 }}>Exchange</div>
                <select value={form.exchange} onChange={e => upd('exchange', e.target.value)} className="os-input" style={{ width: '100%', fontSize: 11 }}>
                  {['NSE','BSE','NFO','MCX','FX','CRYPTO'].map(x => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div><div className="os-label" style={{ marginBottom: 3 }}>Date</div><input type="date" value={form.date} onChange={e => upd('date', e.target.value)} className="os-input" style={{ width: '100%', fontSize: 11 }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
              <button className={`os-btn ${form.direction === 'LONG' ? 'os-btn-buy' : 'os-btn'}`} style={{ flex: 1, fontSize: 11 }} onClick={() => upd('direction', 'LONG')}>▲ LONG / BUY</button>
              <button className={`os-btn ${form.direction === 'SHORT' ? 'os-btn-sell' : 'os-btn'}`} style={{ flex: 1, fontSize: 11 }} onClick={() => upd('direction', 'SHORT')}>▼ SHORT / SELL</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {[['Entry','entry'],['Exit','exit'],['Stop Loss','stopLoss'],['Target','target'],['Quantity','quantity']].map(([lbl, key]) => (
                <div key={key}><div className="os-label" style={{ marginBottom: 3 }}>{lbl}</div>
                  <input type="number" value={(form as any)[key] || ''} onChange={e => upd(key as any, parseFloat(e.target.value) || 0)} className="os-input" style={{ width: '100%', fontSize: 11 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Analysis */}
          <div>
            <div className="os-label" style={{ marginBottom: 8 }}>ANALYSIS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><div className="os-label" style={{ marginBottom: 3 }}>Setup</div>
                <select value={form.setup} onChange={e => upd('setup', e.target.value)} className="os-input" style={{ width: '100%', fontSize: 11 }}>
                  {SETUPS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><div className="os-label" style={{ marginBottom: 3 }}>Timeframe</div>
                <select value={form.timeframe} onChange={e => upd('timeframe', e.target.value)} className="os-input" style={{ width: '100%', fontSize: 11 }}>
                  {['1m','5m','15m','30m','1h','4h','1d'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><div className="os-label" style={{ marginBottom: 3 }}>R:R (auto)</div>
                <div className="os-input" style={{ fontSize: 11, color: rr >= 2 ? 'var(--os-green)' : rr >= 1.5 ? 'var(--os-amber)' : 'var(--os-red)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {rr > 0 ? `1:${rr.toFixed(2)}` : '—'}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}><div className="os-label" style={{ marginBottom: 3 }}>Entry Reason</div>
              <textarea value={form.entryReason} onChange={e => upd('entryReason', e.target.value)} className="os-input" style={{ width: '100%', fontSize: 11, height: 48, resize: 'vertical' }} placeholder="Why did you take this trade?" />
            </div>
          </div>

          {/* Psychology */}
          <div>
            <div className="os-label" style={{ marginBottom: 8 }}>PSYCHOLOGY</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {EMOTIONS.map(em => (
                <button key={em.key} onClick={() => upd('emotion', em.key)}
                  style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid', cursor: 'pointer', fontSize: 11,
                    borderColor: form.emotion === em.key ? 'var(--os-blue)' : 'var(--os-border)',
                    background:  form.emotion === em.key ? 'rgba(59,130,246,0.15)' : 'var(--os-surface2)', color: 'var(--os-t1)' }}>
                  {em.emoji} {em.label}
                </button>
              ))}
            </div>
            <div className="os-label" style={{ marginBottom: 6 }}>Mistakes</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {MISTAKES_OPTIONS.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--os-t2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.mistakes.includes(m)} onChange={() => toggleMistake(m)} style={{ accentColor: 'var(--os-red)' }} />{m}
                </label>
              ))}
            </div>
            <div className="os-label" style={{ marginBottom: 3 }}>Lessons Learned</div>
            <textarea value={form.lessons} onChange={e => upd('lessons', e.target.value)} className="os-input" style={{ width: '100%', fontSize: 11, height: 56, resize: 'vertical' }} placeholder="What did you learn from this trade?" />
          </div>

          {/* Tags + Grade */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="os-label" style={{ marginBottom: 6 }}>Tags</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {form.tags.map(t => <span key={t} className="os-badge" style={{ fontSize: 9, cursor: 'pointer' }} onClick={() => upd('tags', form.tags.filter(x => x !== t))}>{t} ✕</span>)}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag(tagInput)} className="os-input" style={{ flex: 1, fontSize: 11 }} placeholder="Add tag + Enter" />
                <button className="os-btn" style={{ fontSize: 10 }} onClick={() => addTag(tagInput)}>Add</button>
              </div>
            </div>
            <div>
              <div className="os-label" style={{ marginBottom: 6 }}>Grade</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {GRADES.map(g => (
                  <button key={g} onClick={() => upd('grade', g)}
                    style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      borderColor: form.grade === g ? GRADE_COLORS[g!] : 'var(--os-border)',
                      background:  form.grade === g ? `${GRADE_COLORS[g!]}22` : 'var(--os-surface2)',
                      color: form.grade === g ? GRADE_COLORS[g!] : 'var(--os-t3)' }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--os-border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="os-btn os-btn-primary" style={{ fontSize: 11 }} onClick={handleSave}>💾 Save Trade</button>
          <button className="os-btn" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Stats tab ─────────────────────────────────────────────────────────────────
function StatsTab({ entries }: { entries: JournalEntry[] }) {
  const closed  = entries.filter(e => e.status === 'CLOSED')
  const wins    = closed.filter(e => (e.pnl ?? 0) > 0)
  const losses  = closed.filter(e => (e.pnl ?? 0) <= 0)
  const netPnL  = closed.reduce((s, e) => s + (e.pnl ?? 0), 0)
  const avgWin  = wins.length  ? wins.reduce((s, e)   => s + (e.pnl ?? 0), 0) / wins.length   : 0
  const avgLoss = losses.length? losses.reduce((s, e) => s + (e.pnl ?? 0), 0) / losses.length : 0
  const wr      = closed.length ? (wins.length / closed.length) * 100 : 0
  const pf      = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0

  const emotionStats = EMOTIONS.map(em => {
    const emTrades = closed.filter(e => e.emotion === em.key)
    const emWins   = emTrades.filter(e => (e.pnl ?? 0) > 0)
    return { ...em, count: emTrades.length, wr: emTrades.length ? Math.round((emWins.length / emTrades.length) * 100) : 0 }
  }).filter(e => e.count > 0)

  const setupStats = SETUPS.map(setup => {
    const t = closed.filter(e => e.setup === setup)
    const w = t.filter(e => (e.pnl ?? 0) > 0)
    return { setup, count: t.length, wr: t.length ? Math.round((w.length / t.length) * 100) : 0 }
  }).filter(s => s.count > 0).sort((a, b) => b.wr - a.wr)

  const mistakeFreq = MISTAKES_OPTIONS.map(m => ({
    m, count: entries.filter(e => e.mistakes.includes(m)).length
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count)

  const bestTrade  = closed.reduce<JournalEntry | null>((a, b) => (!a || (b.pnl ?? 0) > (a.pnl ?? 0)) ? b : a, null)
  const worstTrade = closed.reduce<JournalEntry | null>((a, b) => (!a || (b.pnl ?? 0) < (a.pnl ?? 0)) ? b : a, null)

  const statCards = [
    { label: 'Total Trades', value: entries.length.toString() },
    { label: 'Win Rate', value: `${wr.toFixed(1)}%`, color: wr >= 60 ? 'var(--os-green)' : wr >= 50 ? 'var(--os-amber)' : 'var(--os-red)' },
    { label: 'Profit Factor', value: pf.toFixed(2), color: pf >= 2 ? 'var(--os-green)' : pf >= 1.5 ? 'var(--os-amber)' : 'var(--os-red)' },
    { label: 'Net P&L', value: `${netPnL >= 0 ? '+' : ''}₹${Math.abs(netPnL).toLocaleString('en-IN')}`, color: netPnL >= 0 ? 'var(--os-green)' : 'var(--os-red)' },
    { label: 'Avg Win', value: `₹${Math.abs(avgWin).toFixed(0)}`, color: 'var(--os-green)' },
    { label: 'Avg Loss', value: `₹${Math.abs(avgLoss).toFixed(0)}`, color: 'var(--os-red)' },
    { label: 'Best Trade', value: bestTrade ? `+₹${(bestTrade.pnl ?? 0).toLocaleString('en-IN')}` : '—', color: 'var(--os-green)' },
    { label: 'Worst Trade', value: worstTrade ? `₹${(worstTrade.pnl ?? 0).toLocaleString('en-IN')}` : '—', color: 'var(--os-red)' },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {statCards.map(c => (
          <div key={c.label} className="os-card" style={{ padding: '8px 12px' }}>
            <div className="os-label" style={{ marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c.color || 'var(--os-t1)' }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div className="os-card" style={{ padding: '10px 12px' }}>
          <div className="os-label" style={{ marginBottom: 8 }}>EMOTION BREAKDOWN</div>
          {emotionStats.length === 0 ? <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>No data yet</span> :
            emotionStats.map(e => (
              <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 14 }}>{e.emoji}</span>
                <span style={{ fontSize: 10, flex: 1 }}>{e.label}</span>
                <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>{e.count}x</span>
                <span className={`os-badge ${e.wr >= 60 ? 'os-badge-green' : e.wr >= 50 ? 'os-badge-amber' : 'os-badge-red'}`} style={{ fontSize: 9 }}>{e.wr}% WR</span>
              </div>
            ))
          }
        </div>
        <div className="os-card" style={{ padding: '10px 12px' }}>
          <div className="os-label" style={{ marginBottom: 8 }}>TOP SETUPS BY WIN RATE</div>
          {setupStats.length === 0 ? <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>No data yet</span> :
            setupStats.slice(0, 6).map(s => (
              <div key={s.setup} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, flex: 1, color: 'var(--os-t2)' }}>{s.setup}</span>
                <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>{s.count}x</span>
                <span className={`os-badge ${s.wr >= 60 ? 'os-badge-green' : s.wr >= 50 ? 'os-badge-amber' : 'os-badge-red'}`} style={{ fontSize: 9 }}>{s.wr}%</span>
              </div>
            ))
          }
        </div>
        <div className="os-card" style={{ padding: '10px 12px' }}>
          <div className="os-label" style={{ marginBottom: 8 }}>MISTAKE FREQUENCY</div>
          {mistakeFreq.length === 0 ? <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>No mistakes recorded</span> :
            mistakeFreq.map(({ m, count }) => (
              <div key={m} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ color: 'var(--os-t2)' }}>{m}</span>
                  <span style={{ color: 'var(--os-red)', fontFamily: 'var(--font-mono)' }}>{count}x</span>
                </div>
                <div className="os-progress" style={{ height: 3 }}>
                  <div className="os-progress-fill" style={{ width: `${(count / entries.length) * 100}%`, background: 'var(--os-red)' }} />
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// ── Review tab ────────────────────────────────────────────────────────────────
function ReviewTab({ entries }: { entries: JournalEntry[] }) {
  const now   = new Date()
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
  const thisWeek  = entries.filter(e => new Date(e.date) >= weekStart)
  const weekPnL   = thisWeek.filter(e => e.status === 'CLOSED').reduce((s, e) => s + (e.pnl ?? 0), 0)
  const dominantEmotion = EMOTIONS.find(em => thisWeek.filter(e => e.emotion === em.key).length > 0)

  const insights = [
    thisWeek.some(e => e.mistakes.includes('FOMO Entry')) && '⚠ FOMO entries detected this week — slow down and wait for setups.',
    thisWeek.some(e => e.emotion === 'FEARFUL') && '⚠ Fear-driven trades present — review your risk settings.',
    thisWeek.filter(e => e.status === 'CLOSED' && (e.pnl ?? 0) > 0).length > 2 && '✓ Strong win streak — maintain discipline.',
    weekPnL > 0 && '✓ Profitable week — stick to the system.',
    thisWeek.length === 0 && 'No trades recorded this week yet.',
  ].filter(Boolean)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div className="os-card" style={{ padding: '10px 14px' }}>
          <div className="os-label" style={{ marginBottom: 4 }}>This Week P&L</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: weekPnL >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>
            {weekPnL >= 0 ? '+' : ''}₹{Math.abs(weekPnL).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="os-card" style={{ padding: '10px 14px' }}>
          <div className="os-label" style={{ marginBottom: 4 }}>Trades This Week</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--os-t1)' }}>{thisWeek.length}</div>
        </div>
        <div className="os-card" style={{ padding: '10px 14px' }}>
          <div className="os-label" style={{ marginBottom: 4 }}>Dominant Emotion</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--os-t1)' }}>
            {dominantEmotion ? `${dominantEmotion.emoji} ${dominantEmotion.label}` : '—'}
          </div>
        </div>
      </div>

      <div className="os-card" style={{ padding: '10px 14px' }}>
        <div className="os-label" style={{ marginBottom: 8 }}>RECENT TRADES THIS WEEK</div>
        {thisWeek.length === 0 ? <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>No trades this week</span> :
          thisWeek.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--os-border)', fontSize: 11 }}>
              <span style={{ color: 'var(--os-t3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.date.slice(5)}</span>
              <span style={{ fontWeight: 700 }}>{e.symbol}</span>
              <span className={`os-badge ${e.direction === 'LONG' ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 9 }}>{e.direction}</span>
              <span style={{ flex: 1, color: 'var(--os-t3)', fontSize: 10 }}>{e.setup}</span>
              {e.pnl !== undefined && <span style={{ fontFamily: 'var(--font-mono)', color: e.pnl >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>{e.pnl >= 0 ? '+' : ''}₹{Math.abs(e.pnl).toLocaleString('en-IN')}</span>}
              {e.grade && <span style={{ fontWeight: 700, color: GRADE_COLORS[e.grade] }}>{e.grade}</span>}
            </div>
          ))
        }
      </div>

      <div className="os-card" style={{ padding: '10px 14px', border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-blue)' }}>AI INSIGHTS</span>
        </div>
        {insights.map((ins, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--os-t2)', marginBottom: 5, lineHeight: 1.5 }}>{ins as string}</div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function JournalView() {
  const [entries,       setEntries]       = useState<JournalEntry[]>(() => {
    try { const s = localStorage.getItem('os_journal_v1'); return s ? JSON.parse(s) : MOCK_ENTRIES } catch { return MOCK_ENTRIES }
  })
  const [showForm,      setShowForm]      = useState(false)
  const [editingEntry,  setEditingEntry]  = useState<JournalEntry | null>(null)
  const [activeTab,     setActiveTab]     = useState<TabType>('trades')
  const [filterStatus,  setFilterStatus]  = useState<StatusFilter>('ALL')
  const [filterDir,     setFilterDir]     = useState<DirFilter>('ALL')

  useEffect(() => {
    localStorage.setItem('os_journal_v1', JSON.stringify(entries))
  }, [entries])

  const filtered = useMemo(() => {
    let d = [...entries]
    if (filterStatus !== 'ALL') d = d.filter(e => e.status === filterStatus)
    if (filterDir    !== 'ALL') d = d.filter(e => e.direction === filterDir)
    return d.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterStatus, filterDir])

  const handleSave = (entry: JournalEntry) => {
    setEntries(prev => prev.some(e => e.id === entry.id) ? prev.map(e => e.id === entry.id ? entry : e) : [entry, ...prev])
    setShowForm(false); setEditingEntry(null)
  }

  const handleDelete = (id: string) => { if (confirm('Delete this trade?')) setEntries(prev => prev.filter(e => e.id !== id)) }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)', letterSpacing: '0.06em' }}>TRADING JOURNAL</span>
        <div className="os-tabs">
          {(['trades','stats','review'] as TabType[]).map(t => (
            <button key={t} className={`os-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {activeTab === 'trades' && (
          <>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['ALL','OPEN','CLOSED'] as StatusFilter[]).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={filterStatus === s ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>{s}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['ALL','LONG','SHORT'] as DirFilter[]).map(d => (
                <button key={d} onClick={() => setFilterDir(d)} className={filterDir === d ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>{d}</button>
              ))}
            </div>
          </>
        )}
        <button className="os-btn os-btn-primary" style={{ fontSize: 10 }} onClick={() => { setEditingEntry(null); setShowForm(true) }}>+ New Trade</button>
      </div>

      {showForm && (
        <TradeForm
          initial={editingEntry || {}}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingEntry(null) }}
        />
      )}

      {activeTab === 'trades' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--os-t3)', fontSize: 13 }}>
              No trades yet. Record your first trade!<br />
              <button className="os-btn os-btn-primary" style={{ marginTop: 12, fontSize: 11 }} onClick={() => setShowForm(true)}>+ New Trade</button>
            </div>
          ) : (
            <table className="os-table" style={{ width: '100%', minWidth: 1000 }}>
              <thead>
                <tr>
                  <th>DATE</th><th>SYMBOL</th><th>DIR</th><th>ENTRY</th><th>EXIT</th>
                  <th>SL</th><th>TARGET</th><th>QTY</th><th>P&L</th><th>R:R</th>
                  <th>SETUP</th><th>EMOTION</th><th>GRADE</th><th>STATUS</th><th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => { setEditingEntry(e); setShowForm(true) }}>
                    <td style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--os-t3)' }}>{e.date.slice(5).replace('-','/')}</td>
                    <td style={{ fontWeight: 700, fontSize: 11 }}>{e.symbol}</td>
                    <td><span className={`os-badge ${e.direction === 'LONG' ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 9 }}>{e.direction}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.entry}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.exit ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-red)' }}>{e.stopLoss}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-green)' }}>{e.target}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.quantity}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: (e.pnl ?? 0) >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>
                      {e.pnl !== undefined ? `${e.pnl >= 0 ? '+' : ''}₹${Math.abs(e.pnl).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.riskReward > 0 ? `1:${e.riskReward}` : '—'}</td>
                    <td style={{ fontSize: 10, color: 'var(--os-t2)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.setup}</td>
                    <td style={{ fontSize: 13 }} title={e.emotion}>{EMOTIONS.find(em => em.key === e.emotion)?.emoji}</td>
                    <td>{e.grade && <span style={{ fontWeight: 700, fontSize: 12, color: GRADE_COLORS[e.grade] }}>{e.grade}</span>}</td>
                    <td><span className={`os-badge ${e.status === 'OPEN' ? 'os-badge-amber' : e.status === 'CLOSED' ? 'os-badge-green' : ''}`} style={{ fontSize: 9 }}>{e.status}</span></td>
                    <td onClick={ev => ev.stopPropagation()}>
                      <button className="os-btn" style={{ fontSize: 9, padding: '1px 6px', color: 'var(--os-red)' }} onClick={() => handleDelete(e.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {activeTab === 'stats'  && <StatsTab  entries={entries} />}
      {activeTab === 'review' && <ReviewTab entries={entries} />}
    </div>
  )
}
