'use client'
import { AIAnalysis } from '@/lib/indicators'

interface Props {
  analysis: AIAnalysis | null
  loading: boolean
  pair: string
  account: number
  riskPct: number
  pipSize: number
}

const scoreColor = (s: number, max: number) => {
  const p = s / max
  return p >= 0.7 ? '#00c853' : p >= 0.5 ? '#58a6ff' : p >= 0.3 ? '#ffd600' : '#ff1744'
}
const biasColor = (b: string) => b === 'BULLISH' ? '#00c853' : b === 'BEARISH' ? '#ff1744' : '#ffd600'

function fmt(pipSize: number, value: number): string {
  if (pipSize >= 1)     return value.toFixed(2)
  if (pipSize >= 0.1)   return value.toFixed(2)
  if (pipSize >= 0.01)  return value.toFixed(3)
  if (pipSize >= 0.001) return value.toFixed(3)
  return value.toFixed(5)
}

export default function AIPanel({ analysis: a, loading, pair, account, riskPct, pipSize }: Props) {
  if (loading) return (
    <div className="panel" style={{ padding:'20px 12px', textAlign:'center' }}>
      <div style={{ color:'#8b949e', fontSize:12 }} className="animate-pulse">🤖 Analysing {pair}…</div>
    </div>
  )
  if (!a) return null

  const risk$   = account * riskPct / 100
  const lots    = risk$ / Math.max(a.slPips * 10, 0.01)
  const tradeDir = a.bias === 'BULLISH' ? 'LONG' : a.bias === 'BEARISH' ? 'SHORT' : null

  return (
    <div className="flex flex-col gap-2 fade-in" style={{ fontSize:11 }}>

      {/* Bias */}
      <div className="panel">
        <div className="panel-header">🤖 AI Verdict</div>
        <div style={{ padding:'12px', textAlign:'center' }}>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:'0.1em',
            color: biasColor(a.bias), textShadow:`0 0 20px ${biasColor(a.bias)}50` }}>
            {a.bias === 'BULLISH' ? '▲ ' : a.bias === 'BEARISH' ? '▼ ' : '● '}{a.bias}
          </div>
          <div style={{ color:'#8b949e', fontSize:10, marginTop:4 }}>
            {pair} · {a.session}
            {a.bestSession
              ? <span style={{ color:'#00c853', marginLeft:6 }}>✔ Prime Session</span>
              : <span style={{ color:'#ffd60080', marginLeft:6 }}>⏳ Off-Peak</span>}
          </div>
        </div>
      </div>

      {/* Confluence scores */}
      <div className="panel">
        <div className="panel-header">📊 Confluence Score</div>
        <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:7 }}>
          {[
            { label:'LONG',  score: a.longScore,  color:'#00c853' },
            { label:'SHORT', score: a.shortScore, color:'#ff1744' },
          ].map(({ label, score, color }) => (
            <div key={label}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'#8b949e' }}>{label}</span>
                <span style={{ color: scoreColor(score, a.maxScore), fontWeight:800 }}>
                  {score} / {a.maxScore}
                </span>
              </div>
              <div className="score-bar">
                <div className="score-bar-fill" style={{ width:`${(score/a.maxScore)*100}%`, background: color, opacity:0.9 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signal log */}
      <div className="panel">
        <div className="panel-header">🧠 AI Thinking Log</div>
        <div>
          <div className="signal-row" style={{ background:'#0d1117' }}>
            <span style={{ color:'#8b949e' }}>Signal</span>
            <div style={{ display:'flex', gap:14 }}>
              <span style={{ color:'#00c853', width:28, textAlign:'center', fontWeight:800 }}>L</span>
              <span style={{ color:'#ff1744', width:28, textAlign:'center', fontWeight:800 }}>S</span>
            </div>
          </div>
          {a.signals.map((sig, i) => (
            <div key={i} className="signal-row" style={{ background: i%2===0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color:'#8b949e' }}>{sig.name}</span>
              <div style={{ display:'flex', gap:14 }}>
                <span style={{ color: sig.long  ? '#00c853' : '#30363d', width:28, textAlign:'center', fontWeight:800 }}>
                  {sig.long  ? '✔' : '–'}
                </span>
                <span style={{ color: sig.short ? '#ff1744' : '#30363d', width:28, textAlign:'center', fontWeight:800 }}>
                  {sig.short ? '✔' : '–'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade idea */}
      {tradeDir && (
        <div className="panel">
          <div className="panel-header">
            💡 Trade Idea
            <span style={{ marginLeft:'auto', color: tradeDir==='LONG' ? '#00c853' : '#ff1744', fontWeight:900 }}>
              {tradeDir==='LONG' ? '🟢 LONG' : '🔴 SHORT'}
            </span>
          </div>
          <div style={{ padding:'6px 0' }}>
            {[
              { label:'Entry',     value: fmt(pipSize, a.entry),                                                      c:'#e6edf3' },
              { label:'Stop Loss', value: fmt(pipSize, tradeDir==='LONG' ? a.longSL  : a.shortSL),                   c:'#ff1744' },
              { label:'TP 1',      value: fmt(pipSize, tradeDir==='LONG' ? a.longTP1 : a.shortTP1),                  c:'#58a6ff' },
              { label:'TP 2',      value: fmt(pipSize, tradeDir==='LONG' ? a.longTP2 : a.shortTP2),                  c:'#00c853' },
              { label:'SL Pips',   value: a.slPips.toFixed(1)  + ' pips',                                            c:'#8b949e' },
              { label:'TP2 Pips',  value: a.tp2Pips.toFixed(1) + ' pips',                                            c:'#8b949e' },
              { label:'R : R',     value: '1 : ' + (a.tp2Pips / Math.max(a.slPips, 0.1)).toFixed(1),                c:'#ffd600' },
              { label:'Risk $',    value: `$${risk$.toFixed(2)} (${riskPct}%)`,                                      c:'#ffd600' },
              { label:'Lot Size',  value: '≈ ' + lots.toFixed(2) + ' lots',                                          c:'#8b949e' },
            ].map(({ label, value, c }, i) => (
              <div key={label} className="signal-row" style={{ background: i%2===0 ? '#161b22' : '#1c2128' }}>
                <span style={{ color:'#8b949e' }}>{label}</span>
                <span style={{ color:c, fontWeight:700 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market context */}
      <div className="panel">
        <div className="panel-header">🌐 Market Context</div>
        <div style={{ padding:'6px 0' }}>
          {[
            { label:'Trend',       value: a.trend, c: a.trend==='BULL'?'#00c853':a.trend==='BEAR'?'#ff1744':'#ffd600' },
            { label:'Structure',   value: a.lastBOS ? `${a.lastBOS.type} ${a.lastBOS.direction==='bull'?'▲':'▼'}` : 'No recent break', c:'#8b949e' },
            { label:'Last Sweep',  value: a.recentSweep ? `${a.recentSweep.type} @ ${fmt(pipSize, a.recentSweep.level)}` : 'None', c:'#8b949e' },
            { label:'FVG',         value: a.recentFVG ? `${a.recentFVG.type==='bull'?'Bullish':'Bearish'} open` : 'None', c: a.recentFVG?'#00e5ff':'#8b949e' },
            { label:'Order Block', value: a.recentOB ? `${a.recentOB.type==='bull'?'Demand':'Supply'} zone` : 'None',  c: a.recentOB?'#ffd600':'#8b949e' },
            { label:'ATR (14)',    value: (a.atrValue / pipSize).toFixed(1) + ' pips', c:'#8b949e' },
          ].map(({ label, value, c }, i) => (
            <div key={label} className="signal-row" style={{ background: i%2===0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color:'#8b949e' }}>{label}</span>
              <span style={{ color:c, fontWeight:700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
