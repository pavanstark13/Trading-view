'use client'
import { useState, useEffect, useRef } from 'react'

interface Strategy {
  id: string
  title: string
  source: string
  type: 'url' | 'pdf' | 'text'
  content: string
  active: boolean
  addedAt: number
  bullish: number
  bearish: number
}

export interface StrategySignal { bullish: number; bearish: number }

const BULL = ['buy','long','bullish','uptrend','support','breakout','demand','accumulation','higher high','ascending','rally','upside','bounce','reversal up']
const BEAR = ['sell','short','bearish','downtrend','resistance','breakdown','supply','distribution','lower low','descending','decline','downside','drop','reversal down']

function score(text: string) {
  const t = text.toLowerCase()
  const count = (words: string[]) => words.reduce((n, w) => n + (t.split(w).length - 1), 0)
  return { bullish: count(BULL), bearish: count(BEAR) }
}

export default function StrategyFeed({ onSignalsChange }: { onSignalsChange?: (s: StrategySignal) => void }) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [tab, setTab]     = useState<'url' | 'text' | 'pdf'>('url')
  const [urlVal, setUrl]  = useState('')
  const [txtVal, setTxt]  = useState('')
  const [title,  setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { const s = localStorage.getItem('fx_strategies'); if (s) setStrategies(JSON.parse(s)) } catch {}
  }, [])

  const persist = (list: Strategy[]) => {
    setStrategies(list)
    try { localStorage.setItem('fx_strategies', JSON.stringify(list)) } catch {}
    const active = list.filter(s => s.active)
    onSignalsChange?.({
      bullish: active.reduce((n, s) => n + s.bullish, 0),
      bearish: active.reduce((n, s) => n + s.bearish, 0),
    })
  }

  const addUrl = async () => {
    if (!urlVal.trim()) return
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/strategy/fetch?url=${encodeURIComponent(urlVal)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const { bullish, bearish } = score(data.text)
      persist([{ id: Date.now().toString(), title: title || urlVal.substring(0, 50),
        source: urlVal, type: 'url', content: data.text, active: true,
        addedAt: Date.now(), bullish, bearish }, ...strategies])
      setUrl(''); setTitle('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Fetch failed') }
    finally { setLoading(false) }
  }

  const addText = () => {
    if (!txtVal.trim()) return
    const { bullish, bearish } = score(txtVal)
    persist([{ id: Date.now().toString(), title: title || 'Manual note',
      source: 'Manual', type: 'text', content: txtVal, active: true,
      addedAt: Date.now(), bullish, bearish }, ...strategies])
    setTxt(''); setTitle('')
  }

  const handlePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/strategy/pdf', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const { bullish, bearish } = score(data.text)
      persist([{ id: Date.now().toString(), title: title || file.name,
        source: file.name, type: 'pdf', content: data.text, active: true,
        addedAt: Date.now(), bullish, bearish }, ...strategies])
      setTitle('')
    } catch (e) { setError(e instanceof Error ? e.message : 'PDF parse failed') }
    finally { setLoading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const toggle = (id: string) => persist(strategies.map(s => s.id === id ? { ...s, active: !s.active } : s))
  const remove = (id: string) => persist(strategies.filter(s => s.id !== id))

  const active    = strategies.filter(s => s.active)
  const totalBull = active.reduce((n, s) => n + s.bullish, 0)
  const totalBear = active.reduce((n, s) => n + s.bearish, 0)
  const sentiment = totalBull > totalBear ? 'BULLISH' : totalBear > totalBull ? 'BEARISH' : 'NEUTRAL'
  const sentCol   = sentiment === 'BULLISH' ? '#00c853' : sentiment === 'BEARISH' ? '#ff1744' : '#ffd600'

  return (
    <div className="panel" style={{ fontSize: 11 }}>
      <div className="panel-header">
        Strategy Feed
        {active.length > 0 && <span style={{ float: 'right', color: sentCol, fontSize: 10 }}>{sentiment}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #30363d' }}>
        {(['url','text','pdf'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '5px 0', fontSize: 9, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700, textTransform: 'uppercase',
            background: tab === t ? '#21262d' : 'transparent',
            color:      tab === t ? '#e6edf3'  : '#8b949e',
          }}>{t === 'url' ? 'URL / Web' : t === 'text' ? 'Paste Text' : 'PDF'}</button>
        ))}
      </div>

      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Label (optional)"
          style={{ padding: '3px 6px', background: '#21262d', border: '1px solid #30363d',
            borderRadius: 4, color: '#e6edf3', fontSize: 10, fontFamily: 'inherit', width: '100%' }} />

        {tab === 'url' && (
          <>
            <input value={urlVal} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addUrl()}
              placeholder="https://forexfactory.com/... or any news/forum URL"
              style={{ padding: '3px 6px', background: '#21262d', border: '1px solid #30363d',
                borderRadius: 4, color: '#e6edf3', fontSize: 10, fontFamily: 'inherit', width: '100%' }} />
            <button onClick={addUrl} disabled={loading || !urlVal.trim()} style={{
              padding: '4px', background: '#0d2137', border: '1px solid #58a6ff40',
              borderRadius: 4, color: '#58a6ff', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 10, fontWeight: 700, opacity: loading ? 0.5 : 1,
            }}>{loading ? 'Fetching…' : '+ Fetch & Add'}</button>
          </>
        )}

        {tab === 'text' && (
          <>
            <textarea value={txtVal} onChange={e => setTxt(e.target.value)} rows={4}
              placeholder="Paste newsletter, strategy rules, video transcript, forum post, indicator description…"
              style={{ padding: '3px 6px', background: '#21262d', border: '1px solid #30363d',
                borderRadius: 4, color: '#e6edf3', fontSize: 10, fontFamily: 'inherit',
                width: '100%', resize: 'vertical' }} />
            <button onClick={addText} disabled={!txtVal.trim()} style={{
              padding: '4px', background: '#0d2137', border: '1px solid #58a6ff40',
              borderRadius: 4, color: '#58a6ff', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 10, fontWeight: 700,
            }}>+ Add</button>
          </>
        )}

        {tab === 'pdf' && (
          <label style={{ cursor: 'pointer' }}>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handlePdf} style={{ display: 'none' }} />
            <div style={{ padding: '8px 10px', background: '#21262d', border: '1px dashed #30363d',
              borderRadius: 4, color: '#58a6ff', textAlign: 'center', fontSize: 10 }}>
              {loading ? 'Parsing PDF…' : '📄 Click to upload PDF'}
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: '#444d56', textAlign: 'center' }}>
              Supports trading books, strategy PDFs, indicator manuals
            </div>
          </label>
        )}

        {error && <div style={{ color: '#ff1744', fontSize: 9 }}>⚠ {error}</div>}
      </div>

      {/* Sentiment bar */}
      {strategies.length > 0 && (
        <div style={{ padding: '5px 10px 7px', borderTop: '1px solid #21262d' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: '#8b949e' }}>Custom Sentiment ({active.length} active)</span>
            <span style={{ fontSize: 9, color: sentCol, fontWeight: 700 }}>
              {totalBull}↑ {totalBear}↓
            </span>
          </div>
          <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: '#21262d' }}>
            {(totalBull + totalBear) > 0 && (
              <>
                <div style={{ width: `${totalBull / (totalBull + totalBear) * 100}%`, background: '#00c853' }} />
                <div style={{ width: `${totalBear / (totalBull + totalBear) * 100}%`, background: '#ff1744' }} />
              </>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ borderTop: '1px solid #21262d', maxHeight: 200, overflowY: 'auto' }}>
        {strategies.length === 0 ? (
          <div style={{ padding: '14px', color: '#444d56', textAlign: 'center', fontSize: 10 }}>
            Add a URL, PDF, or paste text from any source
          </div>
        ) : strategies.map((s, i) => (
          <div key={s.id} style={{ borderBottom: '1px solid #21262d', background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', gap: 6 }}>
              <input type="checkbox" checked={s.active} onChange={() => toggle(s.id)} style={{ cursor: 'pointer' }} />
              <span onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', color: s.active ? '#e6edf3' : '#555', fontSize: 10 }}>
                {s.type === 'pdf' ? '📄' : s.type === 'url' ? '🔗' : '📝'} {s.title}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700,
                color: s.bullish > s.bearish ? '#00c853' : s.bearish > s.bullish ? '#ff1744' : '#8b949e' }}>
                {s.bullish > s.bearish ? '▲' : s.bearish > s.bullish ? '▼' : '·'}
              </span>
              <span onClick={() => remove(s.id)}
                style={{ color: '#ff174480', cursor: 'pointer', fontWeight: 700, fontSize: 13, lineHeight: 1 }}>×</span>
            </div>
            {expanded === s.id && (
              <div style={{ padding: '5px 10px 8px', background: '#0d1117', color: '#8b949e',
                fontSize: 9, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {s.content.substring(0, 800)}{s.content.length > 800 ? '…' : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
