'use client'
import { useState, useEffect } from 'react'
import { CollapsiblePanel } from './AIPanel'
import { type Candle } from '@/lib/indicators'
import { runBacktest, evalForwardSignal, type BacktestResult } from '@/lib/strategyBacktest'

interface Strategy {
  id: string; name: string; text: string
  source: 'paste' | 'url' | 'pdf'
  addedAt: number
  backtest: BacktestResult | null
  testing: boolean
  forwardWins: number; forwardLosses: number
  forwardActive: boolean
  lastSignal: 'long' | 'short' | null
}

interface Props { candles: Candle[]; pipSize: number }

const KEY = 'fx_strats_v3'
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

export default function StrategyFeed({ candles, pipSize }: Props) {
  const [strats,  setStrats]  = useState<Strategy[]>([])
  const [tab,     setTab]     = useState<'paste' | 'url' | 'pdf'>('paste')
  const [text,    setText]    = useState('')
  const [url,     setUrl]     = useState('')
  const [name,    setName]    = useState('')
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    try { const r = localStorage.getItem(KEY); if (r) setStrats(JSON.parse(r)) } catch { /**/ }
  }, [])

  const persist = (list: Strategy[]) => {
    setStrats(list)
    try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /**/ }
  }

  const runTest = (s: Strategy): Strategy => {
    const bt = runBacktest(candles, s.text, pipSize)
    return { ...s, backtest: bt, testing: false, lastSignal: bt.passed ? evalForwardSignal(candles, s.text, pipSize) : null }
  }

  const add = async (content: string, src: Strategy['source']) => {
    if (!content.trim()) return
    const s: Strategy = {
      id: uid(), name: name.trim() || `Strategy #${strats.length + 1}`,
      text: content, source: src, addedAt: Date.now(),
      backtest: null, testing: true,
      forwardWins: 0, forwardLosses: 0, forwardActive: true, lastSignal: null,
    }
    persist([...strats, s])
    setText(''); setUrl(''); setName('')
    setTimeout(() => {
      setStrats(prev => {
        const next = prev.map(x => x.id === s.id ? runTest({ ...x }) : x)
        try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /**/ }
        return next
      })
    }, 80)
  }

  const fetchUrl = async () => {
    if (!url.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/strategy/url?u=${encodeURIComponent(url)}`)
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      await add(d.text, 'url')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  const uploadPdf = async (file: File) => {
    setBusy(true); setErr('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/strategy/pdf', { method: 'POST', body: fd })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      await add(d.text, 'pdf')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  const retest = (id: string) => {
    setStrats(prev => {
      const next = prev.map(s => s.id === id ? { ...s, testing: true } : s)
      persist(next)
      setTimeout(() => setStrats(p => {
        const s = p.find(x => x.id === id)
        if (!s) return p
        const n = p.map(x => x.id === id ? runTest({ ...x, testing: false }) : x)
        try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /**/ }
        return n
      }), 80)
      return next
    })
  }

  const remove = (id: string) => persist(strats.filter(s => s.id !== id))

  const passed = strats.filter(s => s.backtest?.passed && s.forwardActive)

  const badge = passed.length > 0
    ? <span className="badge badge-bull">{passed.length} LIVE</span>
    : <span className="badge badge-dim">{strats.length} added</span>

  const TABS: { id: typeof tab; icon: string; label: string }[] = [
    { id: 'paste', icon: '📝', label: 'Paste' },
    { id: 'url',   icon: '🔗', label: 'URL'   },
    { id: 'pdf',   icon: '📄', label: 'PDF'   },
  ]

  return (
    <CollapsiblePanel title="📋 Strategy Feed" defaultOpen={true} badge={badge}>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 2,
          background: 'var(--bg-raised)', padding: 3, borderRadius: 6,
          border: '1px solid var(--border)',
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 700,
              borderRadius: 4, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
              background: tab === t.id ? 'var(--bg-panel)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              transition: 'all .12s',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Name field */}
        <input className="fx-input" placeholder="Name (optional)"
          value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%' }} />

        {/* Tab content */}
        {tab === 'paste' && <>
          <textarea className="fx-input" placeholder="Paste strategy rules, indicator conditions, or any trading logic…"
            value={text} onChange={e => setText(e.target.value)} rows={4}
            style={{ width: '100%', resize: 'vertical' }} />
          <button className="btn btn-primary" onClick={() => add(text, 'paste')}
            disabled={busy || !text.trim()} style={{ width: '100%', padding: '7px 0' }}>
            {busy ? '⏳ Testing…' : '+ Add & Backtest'}
          </button>
        </>}

        {tab === 'url' && <>
          <input className="fx-input" placeholder="https://…  (article, forum post, doc)"
            value={url} onChange={e => setUrl(e.target.value)} style={{ width: '100%' }} />
          <button className="btn btn-primary" onClick={fetchUrl}
            disabled={busy || !url.trim()} style={{ width: '100%', padding: '7px 0' }}>
            {busy ? '⏳ Fetching…' : '🔗 Fetch & Backtest'}
          </button>
        </>}

        {tab === 'pdf' && (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '18px 12px', cursor: 'pointer', borderRadius: 6,
            background: 'var(--bg-raised)', border: '1px dashed var(--border-hi)',
            color: 'var(--text-muted)', fontSize: 10, transition: 'all .12s',
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}>
            <input type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) uploadPdf(e.target.files[0]) }} />
            {busy ? '⏳ Parsing PDF…' : '📄 Click to upload PDF strategy'}
          </label>
        )}

        {err && <div style={{ color: 'var(--bear)', fontSize: 9.5, padding: '4px 8px',
          background: 'var(--bear-glow)', borderRadius: 4, border: '1px solid #ff4e6a33' }}>
          ⚠ {err}
        </div>}

        {/* Strategy list */}
        {strats.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)',
              textTransform: 'uppercase', marginBottom: 2 }}>
              {strats.length} {strats.length === 1 ? 'strategy' : 'strategies'}
            </div>
            {strats.map(s => {
              const bt = s.backtest
              const passed = bt?.passed
              const statusCol = s.testing ? 'var(--amber)' : passed ? 'var(--bull)' : bt ? 'var(--bear)' : 'var(--text-dim)'
              const statusTxt = s.testing ? 'TESTING' : passed ? 'PASS ✦' : bt ? 'FAIL' : 'NO RULES'
              const fwTrades  = s.forwardWins + s.forwardLosses
              const fwPct     = fwTrades > 0 ? Math.round(s.forwardWins / fwTrades * 100) : null

              return (
                <div key={s.id} style={{
                  background: 'var(--bg-raised)', border: `1px solid ${passed ? '#00d48f22' : 'var(--border)'}`,
                  borderRadius: 6, padding: '7px 10px',
                  borderLeft: `2px solid ${passed ? 'var(--bull)' : 'var(--border-hi)'}`,
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ flex: 1, color: 'var(--text)', fontWeight: 700, fontSize: 10,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: statusCol, flexShrink: 0 }}>
                      {statusTxt}
                    </span>
                    <button className="btn btn-ghost" onClick={() => retest(s.id)}
                      style={{ padding: '1px 5px', fontSize: 9 }} title="Re-run backtest">↺</button>
                    <button className="btn btn-danger" onClick={() => remove(s.id)}
                      style={{ padding: '1px 5px', fontSize: 9 }} title="Remove">✕</button>
                  </div>

                  {/* Backtest result */}
                  {bt && !s.testing && (
                    <div style={{ fontSize: 9, color: bt.passed ? 'var(--bull)' : 'var(--text-muted)',
                      marginBottom: passed ? 6 : 0 }}>
                      {bt.reason}
                    </div>
                  )}

                  {/* Forward test */}
                  {passed && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 9 }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Forward: {s.forwardWins}W / {s.forwardLosses}L{fwPct !== null ? ` · ${fwPct}%` : ''}
                        </span>
                        {s.lastSignal && (
                          <span style={{ color: s.lastSignal === 'long' ? 'var(--bull)' : 'var(--bear)', fontWeight: 800 }}>
                            → {s.lastSignal.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {fwTrades > 0 && (
                        <div className="score-bar">
                          <div className="score-bar-fill" style={{
                            width: `${fwPct}%`,
                            background: (fwPct ?? 0) >= 65 ? 'var(--bull)' : (fwPct ?? 0) >= 45 ? 'var(--amber)' : 'var(--bear)',
                          }} />
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 4, fontSize: 8.5, color: 'var(--text-muted)' }}>
                    {s.source.toUpperCase()} · {new Date(s.addedAt).toLocaleDateString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {strats.length === 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 9.5,
            lineHeight: 1.6 }}>
            Paste strategy text, a URL, or upload a PDF.<br />
            Auto-backtest requires ≥72% win rate + 1.5 profit factor.
          </div>
        )}
      </div>
    </CollapsiblePanel>
  )
}
