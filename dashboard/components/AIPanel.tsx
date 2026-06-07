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
  const pct = s / max
  if (pct >= 0.7) return '#00c853'
  if (pct >= 0.5) return '#58a6ff'
  if (pct >= 0.3) return '#ffd600'
  return '#ff1744'
}

const biasColor = (b: string) =>
  b === 'BULLISH' ? '#00c853' : b === 'BEARISH' ? '#ff1744' : '#ffd600'

export default function AIPanel({ analysis: a, loading, pair, account, riskPct, pipSize }: Props) {
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div style={{ color: '#8b949e', fontSize: 12 }} className="animate-pulse">
        🤖 Analysing {pair}…
      </div>
    </div>
  )
  if (!a) return null

  const risk$ = account * riskPct / 100
  const lots  = risk$ / Math.max(a.slPips * 10, 0.01)
  const tradeDir = a.bias === 'BULLISH' ? 'LONG' : a.bias === 'BEARISH' ? 'SHORT' : null

  return (
    <div className="flex flex-col gap-2 fade-in" style={{ fontSize: 11 }}>

      {/* ── Bias ── */}
      <div className="panel">
        <div className="panel-header">🤖 AI Verdict</div>
        <div style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '0.08em',
            color: biasColor(a.bias),
          }}>{a.bias}</div>
          <div style={{ color: '#8b949e', fontSize: 10, marginTop: 2 }}>
            {pair} · {a.session}
            {a.bestSession
              ? <span style={{ color: '#00c853', marginLeft: 6 }}>✔ Prime Session</span>
              : <span style={{ color: '#ffd600', marginLeft: 6 }}>⏳ Off-Peak</span>}
          </div>
        </div>
      </div>

      {/* ── Scores ── */}
      <div className="panel">
        <div className="panel-header">Confluence Score</div>
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'LONG',  score: a.longScore,  color: '#00c853' },
            { label: 'SHORT', score: a.shortScore, color: '#ff1744' },
          ].map(({ label, score, color }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: '#8b949e' }}>{label}</span>
                <span style={{ color: scoreColor(score, a.maxScore), fontWeight: 700 }}>
                  {score} / {a.maxScore}
                </span>
              </div>
              <div className="score-bar">
                <div className="score-bar-fill" style={{
                  width: `${(score / a.maxScore) * 100}%`,
                  background: color,
                  opacity: 0.85,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Signal Log ── */}
      <div className="panel">
        <div className="panel-header">AI Thinking Log</div>
        <div>
          <div className="signal-row" style={{ background: '#0d1117' }}>
            <span style={{ color: '#8b949e' }}>Signal</span>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: '#00c853', width: 32, textAlign: 'center' }}>L</span>
              <span style={{ color: '#ff1744', width: 32, textAlign: 'center' }}>S</span>
            </div>
          </div>
          {a.signals.map((sig, i) => (
            <div key={i} className="signal-row" style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color: '#8b949e' }}>{sig.name}</span>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ color: sig.long  ? '#00c853' : '#30363d', width: 32, textAlign: 'center', fontWeight: 700 }}>
                  {sig.long  ? '✔' : '–'}
                </span>
                <span style={{ color: sig.short ? '#ff1744' : '#30363d', width: 32, textAlign: 'center', fontWeight: 700 }}>
                  {sig.short ? '✔' : '–'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trade Idea ── */}
      {tradeDir && (
        <div className="panel">
          <div className="panel-header">
            Trade Idea
            <span style={{ float: 'right', color: tradeDir === 'LONG' ? '#00c853' : '#ff1744' }}>
              {tradeDir === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
            </span>
          </div>
          <div style={{ padding: '8px 0' }}>
            {[
              { label: 'Entry',    value: a.entry.toFixed(5),                             c: '#e6edf3' },
              { label: 'Stop Loss',value: tradeDir === 'LONG' ? a.longSL.toFixed(5) : a.shortSL.toFixed(5),   c: '#ff1744' },
              { label: 'TP1',      value: tradeDir === 'LONG' ? a.longTP1.toFixed(5) : a.shortTP1.toFixed(5), c: '#58a6ff' },
              { label: 'TP2',      value: tradeDir === 'LONG' ? a.longTP2.toFixed(5) : a.shortTP2.toFixed(5), c: '#00c853' },
              { label: 'SL Pips',  value: a.slPips.toFixed(1) + ' pips',                 c: '#8b949e' },
              { label: 'TP2 Pips', value: a.tp2Pips.toFixed(1) + ' pips',                c: '#8b949e' },
              { label: 'R:R',      value: '1 : ' + (a.tp2Pips / a.slPips).toFixed(1),    c: '#ffd600' },
              { label: 'Risk $',   value: `$${risk$.toFixed(2)} (${riskPct}%)`,           c: '#ffd600' },
              { label: 'Lot Size', value: '≈ ' + lots.toFixed(2) + ' lots',              c: '#8b949e' },
            ].map(({ label, value, c }, i) => (
              <div key={label} className="signal-row"
                style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
                <span style={{ color: '#8b949e' }}>{label}</span>
                <span style={{ color: c, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Market Context ── */}
      <div className="panel">
        <div className="panel-header">Market Context</div>
        <div style={{ padding: '8px 0' }}>
          {[
            { label: 'Trend',      value: a.trend, c: a.trend === 'BULL' ? '#00c853' : a.trend === 'BEAR' ? '#ff1744' : '#ffd600' },
            { label: 'Structure',  value: a.lastBOS ? `${a.lastBOS.type} ${a.lastBOS.direction === 'bull' ? '▲' : '▼'}` : 'No recent break', c: '#8b949e' },
            { label: 'Last Sweep', value: a.recentSweep ? `${a.recentSweep.type} @ ${a.recentSweep.level.toFixed(5)}` : 'None recent', c: '#8b949e' },
            { label: 'FVG',        value: a.recentFVG ? `${a.recentFVG.type === 'bull' ? 'Bullish' : 'Bearish'} open` : 'None', c: a.recentFVG ? '#00e5ff' : '#8b949e' },
            { label: 'Order Block',value: a.recentOB ? `${a.recentOB.type === 'bull' ? 'Demand' : 'Supply'} zone` : 'None', c: a.recentOB ? '#ffd600' : '#8b949e' },
            { label: 'ATR (14)',   value: (a.atrValue / pipSize).toFixed(1) + ' pips', c: '#8b949e' },
          ].map(({ label, value, c }, i) => (
            <div key={label} className="signal-row"
              style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color: '#8b949e' }}>{label}</span>
              <span style={{ color: c, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
