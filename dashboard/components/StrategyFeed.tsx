'use client'
import { useState, useEffect } from 'react'
import { CollapsiblePanel } from './AIPanel'
import { type Candle } from '@/lib/indicators'
import { runBacktest, evalForwardSignal, type BacktestResult } from '@/lib/strategyBacktest'

interface Strategy {
  id: string
  name: string
  text: string
  source: 'paste' | 'url' | 'pdf'
  addedAt: number
  backtest: BacktestResult | null
  testing: boolean
  forwardWins: number
  forwardLosses: number
  forwardActive: boolean
  lastSignal: 'long' | 'short' | null
}

interface Props {
  candles: Candle[]
  pipSize: number
}

const STORAGE_KEY = 'fx_strats_v3'

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

export default function StrategyFeed({ candles, pipSize }: Props) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [tab, setTab] = useState<'paste' | 'url' | 'pdf'>('paste')
  const [text,  setText]  = useState('')
  const [url,   setUrl]   = useState('')
  const [name,  setName]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setStrategies(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const save = (list: Strategy[]) => {
    setStrategies(list)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  }

  const runTest = (strat: Strategy, candleData: Candle[]): Strategy => {
    const bt = runBacktest(candleData, strat.text, pipSize)
    const sig = bt.passed ? evalForwardSignal(candleData, strat.text, pipSize) : null
    return { ...strat, backtest: bt, testing: false, lastSignal: sig }
  }

  const addStrategy = async (stratText: string, source: Strategy['source']) => {
    if (!stratText.trim()) return
    setBusy(true); setError('')
    const strat: Strategy = {
      id: newId(),
      name: name.trim() || `Strategy ${Date.now().toString(36).slice(-4).toUpperCase()}`,
      text: stratText,
      source,
      addedAt: Date.now(),
      backtest: null,
      testing: true,
      forwardWins: 0,
      forwardLosses: 0,
      forwardActive: true,
      lastSignal: null,
    }
    const list = [...strategies, strat]
    save(list)
    // Run backtest async
    setTimeout(() => {
      const tested = runTest(strat, candles)
      setStrategies(prev => {
        const next = prev.map(s => s.id === strat.id ? tested : s)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    }, 100)
    setText(''); setUrl(''); setName(''); setBusy(false)
  }

  const fetchUrl = async () => {
    if (!url.trim()) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/strategy/url?u=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await addStrategy(data.text, 'url')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally { setBusy(false) }
  }

  const uploadPdf = async (file: File) => {
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/strategy/pdf', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await addStrategy(data.text, 'pdf')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  const retest = (id: string) => {
    setStrategies(prev => {
      const next = prev.map(s => s.id === id ? { ...s, testing: true } : s)
      save(next)
      setTimeout(() => {
        setStrategies(prev2 => {
          const strat = prev2.find(s => s.id === id)
          if (!strat) return prev2
          const tested = runTest({ ...strat, testing: true }, candles)
          const final = prev2.map(s => s.id === id ? tested : s)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(final)) } catch { /* ignore */ }
          return final
        })
      }, 100)
      return next
    })
  }

  const remove = (id: string) => {
    save(strategies.filter(s => s.id !== id))
  }

  const activePassed = strategies.filter(s => s.backtest?.passed && s.forwardActive)

  const badge = activePassed.length > 0
    ? <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#0d3320', color: '#00c853', border: '1px solid #00c85330' }}>
        {activePassed.length} LIVE
      </span>
    : null

  return (
    <CollapsiblePanel title="📋 Strategy Feed" defaultOpen={true} badge={badge}>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['paste', 'url', 'pdf'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 700,
              borderRadius: 4, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
              background: tab === t ? '#21262d' : 'transparent',
              color: tab === t ? '#58a6ff' : '#8b949e',
            }}>
              {t === 'paste' ? '📝 Paste' : t === 'url' ? '🔗 URL' : '📄 PDF'}
            </button>
          ))}
        </div>

        {/* Name field */}
        <input
          placeholder="Strategy name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ width: '100%', padding: '4px 8px', background: '#21262d',
            border: '1px solid #30363d', borderRadius: 4, color: '#e6edf3',
            fontSize: 10, fontFamily: 'inherit' }}
        />

        {/* Input */}
        {tab === 'paste' && (
          <>
            <textarea
              placeholder="Paste strategy rules, indicator conditions, or any trading logic here…"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              style={{ width: '100%', padding: '6px 8px', background: '#21262d',
                border: '1px solid #30363d', borderRadius: 4, color: '#e6edf3',
                fontSize: 10, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <button onClick={() => addStrategy(text, 'paste')} disabled={busy || !text.trim()}
              style={{ padding: '5px 0', background: '#1f6feb', border: 'none', borderRadius: 4,
                color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: (busy || !text.trim()) ? 0.5 : 1 }}>
              {busy ? 'Running backtest…' : '+ Add & Backtest'}
            </button>
          </>
        )}

        {tab === 'url' && (
          <>
            <input
              placeholder="https://… (strategy article, forum post, or doc)"
              value={url}
              onChange={e => setUrl(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', background: '#21262d',
                border: '1px solid #30363d', borderRadius: 4, color: '#e6edf3',
                fontSize: 10, fontFamily: 'inherit' }}
            />
            <button onClick={fetchUrl} disabled={busy || !url.trim()}
              style={{ padding: '5px 0', background: '#1f6feb', border: 'none', borderRadius: 4,
                color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: (busy || !url.trim()) ? 0.5 : 1 }}>
              {busy ? 'Fetching…' : '🔗 Fetch & Backtest'}
            </button>
          </>
        )}

        {tab === 'pdf' && (
          <>
            <label style={{ display: 'block', padding: '10px', background: '#21262d',
              border: '1px dashed #30363d', borderRadius: 4, textAlign: 'center',
              cursor: 'pointer', color: '#8b949e', fontSize: 10 }}>
              <input type="file" accept=".pdf" style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) uploadPdf(e.target.files[0]) }} />
              {busy ? '⏳ Parsing PDF…' : '📄 Click to upload PDF strategy'}
            </label>
          </>
        )}

        {error && <div style={{ color: '#ff1744', fontSize: 10 }}>⚠ {error}</div>}

        {/* Strategy list */}
        {strategies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 700, letterSpacing: '0.05em' }}>
              STRATEGIES ({strategies.length})
            </div>
            {strategies.map(s => {
              const bt = s.backtest
              const statusColor = s.testing ? '#ffd600' : bt?.passed ? '#00c853' : bt ? '#ff1744' : '#8b949e'
              const statusText  = s.testing ? 'TESTING…' : bt?.passed ? 'PASS ✔' : bt ? 'FAIL ✖' : 'NO RULES'
              const fwPct = s.forwardWins + s.forwardLosses > 0
                ? Math.round(s.forwardWins / (s.forwardWins + s.forwardLosses) * 100)
                : null

              return (
                <div key={s.id} style={{ background: '#0d1117', border: '1px solid #30363d',
                  borderRadius: 6, padding: '6px 8px', fontSize: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ color: '#e6edf3', fontWeight: 700, flex: 1, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 4 }}>
                      <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                        background: statusColor + '22', color: statusColor,
                        border: `1px solid ${statusColor}44` }}>{statusText}</span>
                      <button onClick={() => retest(s.id)} title="Re-run backtest"
                        style={{ padding: '1px 5px', background: '#21262d', border: '1px solid #30363d',
                          borderRadius: 3, color: '#8b949e', cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' }}>↺</button>
                      <button onClick={() => remove(s.id)} title="Remove"
                        style={{ padding: '1px 5px', background: '#21262d', border: '1px solid #30363d',
                          borderRadius: 3, color: '#ff1744', cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' }}>✕</button>
                    </div>
                  </div>

                  {bt && !s.testing && (
                    <div style={{ color: '#8b949e', fontSize: 9, marginBottom: 3 }}>
                      {bt.reason}
                    </div>
                  )}

                  {/* Forward test bar */}
                  {bt?.passed && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 9 }}>
                        <span style={{ color: '#8b949e' }}>Live forward: {s.forwardWins}W / {s.forwardLosses}L
                          {fwPct !== null ? ` (${fwPct}%)` : ''}</span>
                        {s.lastSignal && (
                          <span style={{ color: s.lastSignal === 'long' ? '#00c853' : '#ff1744', fontWeight: 700 }}>
                            Signal: {s.lastSignal.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {s.forwardWins + s.forwardLosses > 0 && (
                        <div className="score-bar">
                          <div className="score-bar-fill" style={{
                            width: `${fwPct}%`,
                            background: (fwPct ?? 0) >= 60 ? '#00c853' : (fwPct ?? 0) >= 40 ? '#ffd600' : '#ff1744',
                          }} />
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: 9, color: '#444d56', marginTop: 3 }}>
                    {(['paste','url','pdf'] as const).includes(s.source) ? s.source.toUpperCase() : 'PASTE'} · {new Date(s.addedAt).toLocaleDateString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {strategies.length === 0 && (
          <div style={{ color: '#444d56', fontSize: 10, textAlign: 'center', padding: '8px 0' }}>
            Add strategies from PDFs, URLs, or paste text above.
            They auto-backtest (min 72% WR + 1.5 PF to pass).
          </div>
        )}
      </div>
    </CollapsiblePanel>
  )
}
