'use client'
import { useState, useEffect, useRef } from 'react'
import { runBacktest, evalForwardSignal, type BacktestResult, type ForwardTrade } from '@/lib/strategyBacktest'
import { CollapsiblePanel } from '@/components/AIPanel'
import type { Candle } from '@/lib/indicators'

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
  btStatus: 'pending' | 'running' | 'passed' | 'failed' | 'no_rules'
  bt?: BacktestResult
  btDate?: number
  fwTrades: ForwardTrade[]
  fwWinRate?: number
}

export interface StrategySignal { bullish: number; bearish: number }

const BULL = ['buy','long','bullish','uptrend','support','breakout','demand','rally','higher high']
const BEAR = ['sell','short','bearish','downtrend','resistance','breakdown','supply','decline','lower low']
function kwScore(text: string) {
  const t = text.toLowerCase()
  return {
    bullish: BULL.reduce((n,w) => n + (t.split(w).length-1), 0),
    bearish: BEAR.reduce((n,w) => n + (t.split(w).length-1), 0),
  }
}

const STATUS_COLOR = { passed:'#00c853', failed:'#ff1744', pending:'#ffd600', running:'#58a6ff', no_rules:'#8b949e' }
const STATUS_LABEL = { passed:'PASS ✔', failed:'FAIL ✖', pending:'PENDING', running:'TESTING…', no_rules:'NO RULES' }

export default function StrategyFeed({
  candles, onSignalsChange,
}: {
  candles: Candle[]
  onSignalsChange?: (s: StrategySignal) => void
}) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [tab,     setTab]    = useState<'url'|'text'|'pdf'>('text')
  const [urlVal,  setUrl]    = useState('')
  const [txtVal,  setTxt]    = useState('')
  const [title,   setTitle]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [expanded,setExp]     = useState<string|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { const s = localStorage.getItem('fx_strats_v2'); if (s) setStrategies(JSON.parse(s)) } catch {}
  }, [])

  // Forward-test resolution on each candle update
  useEffect(() => {
    if (candles.length < 30 || strategies.length === 0) return
    const currentPrice = candles[candles.length-1].close
    const now = Date.now()
    const updated = strategies.map(s => {
      if (!s.active || s.btStatus !== 'passed') return s
      const HOLD_MS = 5 * 60 * 60 * 1000
      const resolved = s.fwTrades.map(t => {
        if (t.outcome !== 'pending') return t
        if (now - t.timestamp < HOLD_MS) return t
        const won = t.direction==='long' ? currentPrice>t.entryPrice : currentPrice<t.entryPrice
        return { ...t, outcome: won ? 'win' as const : 'loss' as const, exitPrice: currentPrice }
      })
      const sig = evalForwardSignal(candles, s.content)
      const alreadyOpen = resolved.some(t => t.outcome==='pending')
      const newTrades = (!alreadyOpen && sig)
        ? [...resolved, { timestamp:now, direction:sig, entryPrice:currentPrice, outcome:'pending' as const }]
        : resolved
      const settled = newTrades.filter(t => t.outcome!=='pending')
      const fwWinRate = settled.length>=3 ? (settled.filter(t=>t.outcome==='win').length/settled.length)*100 : undefined
      const autoFail  = fwWinRate!==undefined && fwWinRate<40 && settled.length>=10
      return { ...s, fwTrades:newTrades.slice(-50), fwWinRate, active: autoFail ? false : s.active }
    })
    persist(updated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles])

  const persist = (list: Strategy[]) => {
    setStrategies(list)
    try { localStorage.setItem('fx_strats_v2', JSON.stringify(list)) } catch {}
    const active = list.filter(s => s.active && s.btStatus==='passed')
    onSignalsChange?.({
      bullish: active.reduce((n,s)=>n+s.bullish, 0),
      bearish: active.reduce((n,s)=>n+s.bearish, 0),
    })
  }

  const runBt = (draft: Strategy, list: Strategy[]) => {
    if (candles.length < 30) {
      const fail = { ...draft, btStatus:'failed' as const, bt:{ trades:0,winRate:0,profitFactor:0,maxDrawdown:0,avgWin:0,avgLoss:0,passed:false,failReason:'Load chart data first',rulesFound:[] } }
      persist(list.map(s => s.id===fail.id ? fail : s))
      return
    }
    const running = { ...draft, btStatus:'running' as const }
    const next = list.map(s => s.id===running.id ? running : s)
    setStrategies(next)
    setTimeout(() => {
      const result = runBacktest(candles, draft.content)
      const final: Strategy = {
        ...running,
        btStatus: result.rulesFound.length===0 ? 'no_rules' : result.passed ? 'passed' : 'failed',
        bt: result, btDate: Date.now(), active: result.passed,
      }
      persist(next.map(s => s.id===final.id ? final : s))
    }, 50)
  }

  const addFromContent = (content: string, source: string, type: Strategy['type']) => {
    const { bullish, bearish } = kwScore(content)
    const draft: Strategy = {
      id: Date.now().toString(),
      title: title.trim() || source.substring(0,48),
      source, type, content: content.substring(0,6000),
      active:false, addedAt:Date.now(), bullish, bearish,
      btStatus:'pending', fwTrades:[],
    }
    setTitle('')
    runBt(draft, [draft, ...strategies])
  }

  const addUrl = async () => {
    if (!urlVal.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/strategy/fetch?url=${encodeURIComponent(urlVal)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      addFromContent(data.text, urlVal, 'url')
      setUrl('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Fetch failed') }
    finally { setLoading(false) }
  }

  const addText = () => {
    if (!txtVal.trim()) return
    addFromContent(txtVal, 'Manual input', 'text')
    setTxt('')
  }

  const handlePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setLoading(true); setError('')
    try {
      const form = new FormData(); form.append('file', file)
      const res = await fetch('/api/strategy/pdf', { method:'POST', body:form })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      addFromContent(data.text, file.name, 'pdf')
    } catch (e) { setError(e instanceof Error ? e.message : 'PDF failed') }
    finally { setLoading(false); if (fileRef.current) fileRef.current.value='' }
  }

  const retest = (s: Strategy) => runBt({ ...s, fwTrades:[], fwWinRate:undefined }, strategies.map(x => x.id===s.id ? { ...s,fwTrades:[],fwWinRate:undefined } : x))
  const toggle = (id: string) => persist(strategies.map(s => s.id===id ? { ...s,active:!s.active } : s))
  const remove = (id: string) => persist(strategies.filter(s => s.id!==id))

  const passed = strategies.filter(s => s.active && s.btStatus==='passed')
  const passedCount = passed.length

  return (
    <CollapsiblePanel
      title="Strategy Feed"
      icon="📈"
      defaultOpen
      badge={
        passedCount > 0
          ? <span style={{ fontSize:9, color:'#00c853', fontWeight:700 }}>{passedCount} LIVE</span>
          : <span style={{ fontSize:9, color:'#444d56' }}>backtest ≥ 72% WR</span>
      }
    >
      {/* Input tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #30363d' }}>
        {(['text','url','pdf'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'5px 0', fontSize:9, border:'none', cursor:'pointer',
            fontFamily:'inherit', fontWeight:700, textTransform:'uppercase',
            background: tab===t ? '#21262d' : 'transparent',
            color:      tab===t ? '#e6edf3'  : '#8b949e',
          }}>{t==='url'?'🔗 URL':t==='text'?'📝 Paste':'📄 PDF'}</button>
        ))}
      </div>

      <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:5 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Label (optional)"
          className="fx-input" style={{ fontSize:10, width:'100%' }} />

        {tab==='text' && (
          <>
            <textarea value={txtVal} onChange={e => setTxt(e.target.value)} rows={4}
              placeholder="Paste strategy rules, newsletter, video transcript, forum post, indicator description…"
              className="fx-input" style={{ fontSize:10, width:'100%', resize:'vertical' }} />
            <button onClick={addText} disabled={!txtVal.trim()} className="btn-action"
              style={{ background:'#0d2137', borderColor:'#58a6ff40', color:'#58a6ff' }}>
              + Add → Backtest
            </button>
          </>
        )}
        {tab==='url' && (
          <>
            <input value={urlVal} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key==='Enter' && addUrl()}
              placeholder="https://forexfactory.com/... babypips.com/... any URL"
              className="fx-input" style={{ fontSize:10, width:'100%' }} />
            <button onClick={addUrl} disabled={loading||!urlVal.trim()} className="btn-action"
              style={{ background:'#0d2137', borderColor:'#58a6ff40', color:'#58a6ff', opacity:loading?0.5:1 }}>
              {loading?'Fetching…':'+ Fetch → Backtest'}
            </button>
          </>
        )}
        {tab==='pdf' && (
          <label style={{ cursor:'pointer' }}>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handlePdf} style={{ display:'none' }} />
            <div className="fx-input" style={{ textAlign:'center', color:'#58a6ff', fontSize:10, cursor:'pointer', padding:'8px' }}>
              {loading?'Parsing PDF…':'📄 Click to upload PDF → Auto-backtest'}
            </div>
          </label>
        )}
        {error && <div style={{ color:'#ff1744', fontSize:9 }}>⚠ {error}</div>}
      </div>

      {/* Strategy list */}
      <div style={{ borderTop:'1px solid #21262d' }}>
        {strategies.length===0 ? (
          <div style={{ padding:'14px', color:'#444d56', textAlign:'center', fontSize:10 }}>
            Add a strategy above — it will be backtested automatically
          </div>
        ) : strategies.map((s, i) => {
          const col = STATUS_COLOR[s.btStatus]
          const settled = s.fwTrades.filter(t => t.outcome!=='pending')
          return (
            <div key={s.id} style={{ borderBottom:'1px solid #21262d', background:i%2===0?'#161b22':'#1c2128' }}>
              <div style={{ display:'flex', alignItems:'center', padding:'6px 10px', gap:5 }}>
                <input type="checkbox" checked={s.active} onChange={() => toggle(s.id)}
                  disabled={s.btStatus!=='passed'}
                  style={{ cursor:s.btStatus==='passed'?'pointer':'not-allowed' }} />
                <span onClick={() => setExp(expanded===s.id?null:s.id)}
                  style={{ flex:1, cursor:'pointer', overflow:'hidden', textOverflow:'ellipsis',
                    whiteSpace:'nowrap', color:s.active?'#e6edf3':'#666', fontSize:10 }}>
                  {s.type==='pdf'?'📄':s.type==='url'?'🔗':'📝'} {s.title}
                </span>
                <span style={{ fontSize:8, fontWeight:800, color:col, border:`1px solid ${col}40`,
                  padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap', cursor:'default' }}>
                  {STATUS_LABEL[s.btStatus]}
                </span>
                <span onClick={() => retest(s)} title="Re-run backtest"
                  style={{ color:'#58a6ff80', cursor:'pointer', fontSize:12 }}>↺</span>
                <span onClick={() => remove(s.id)}
                  style={{ color:'#ff174480', cursor:'pointer', fontWeight:700, fontSize:14 }}>×</span>
              </div>

              {expanded===s.id && (
                <div style={{ background:'#0d1117', padding:'6px 10px 8px', borderTop:'1px solid #21262d' }}>
                  {s.bt?.rulesFound && s.bt.rulesFound.length>0 && (
                    <div style={{ marginBottom:5 }}>
                      <div style={{ color:'#58a6ff', fontSize:9, fontWeight:700, marginBottom:3 }}>Rules detected</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                        {s.bt.rulesFound.map(r => (
                          <span key={r} style={{ fontSize:8, padding:'1px 5px', borderRadius:3, background:'#21262d', color:'#8b949e' }}>{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.bt && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 10px', fontSize:9 }}>
                      {[
                        ['Trades',        s.bt.trades.toString()],
                        ['Win Rate',       s.bt.winRate.toFixed(1)+'%'],
                        ['Profit Factor',  s.bt.profitFactor.toFixed(2)],
                        ['Max Drawdown',   s.bt.maxDrawdown.toFixed(1)+' ATR'],
                      ].map(([label,val]) => (
                        <div key={label} style={{ display:'flex', justifyContent:'space-between' }}>
                          <span style={{ color:'#8b949e' }}>{label}</span>
                          <span style={{ color:'#e6edf3', fontWeight:700 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.bt?.failReason && (
                    <div style={{ marginTop:5, fontSize:9, color:'#ff1744', background:'#3d0d1420', padding:'4px 6px', borderRadius:4 }}>
                      ⚠ {s.bt.failReason}
                    </div>
                  )}
                  {s.btStatus==='passed' && (
                    <div style={{ marginTop:5, borderTop:'1px solid #21262d', paddingTop:5 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9 }}>
                        <span style={{ color:'#58a6ff', fontWeight:700 }}>Forward Test</span>
                        <span style={{ color:s.fwWinRate===undefined?'#8b949e':s.fwWinRate>=52?'#00c853':'#ff1744' }}>
                          {s.fwWinRate!==undefined ? `${s.fwWinRate.toFixed(0)}% (${settled.length})` : `${settled.length} settled`}
                        </span>
                      </div>
                      {settled.length>0 && (
                        <div style={{ display:'flex', height:4, borderRadius:2, overflow:'hidden', background:'#21262d', marginTop:3 }}>
                          <div style={{ width:`${settled.filter(t=>t.outcome==='win').length/settled.length*100}%`, background:'#00c853' }} />
                          <div style={{ width:`${settled.filter(t=>t.outcome==='loss').length/settled.length*100}%`, background:'#ff1744' }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </CollapsiblePanel>
  )
}
