'use client'
import { useState } from 'react'
import { AIAnalysis } from '@/lib/indicators'

// ── Shared collapsible wrapper ────────────────────────────────────────────────
interface CPProps {
  title: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}
export function CollapsiblePanel({ title, badge, defaultOpen = true, children }: CPProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header"
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {badge}
          <span style={{ color: '#58a6ff', fontSize: 10, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && children}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  if (pct >= 0.65) return '#00c853'
  if (pct >= 0.45) return '#58a6ff'
  if (pct >= 0.3)  return '#ffd600'
  return '#ff1744'
}

const biasColor = (b: string) =>
  b === 'BULLISH' ? '#00c853' : b === 'BEARISH' ? '#ff1744' : '#ffd600'

const catColor = (cat: string) => {
  if (cat === 'SMC')      return '#00e5ff'
  if (cat === 'Strategy') return '#ffd600'
  if (cat === 'Momentum') return '#ce93d8'
  if (cat === 'Context')  return '#8b949e'
  return '#58a6ff'
}

export default function AIPanel({ analysis: a, loading, pair, account, riskPct, pipSize }: Props) {
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
      <div style={{ color: '#8b949e', fontSize: 12 }} className="animate-pulse">
        🤖 Analysing {pair}…
      </div>
    </div>
  )
  if (!a) return null

  const risk$ = account * riskPct / 100
  const lots  = risk$ / Math.max(a.slPips * 10, 0.01)
  const tradeDir = a.bias === 'BULLISH' ? 'LONG' : a.bias === 'BEARISH' ? 'SHORT' : null

  const divLabel = a.rsiDiv
    ? ({ regular_bull: 'Regular Bull', regular_bear: 'Regular Bear', hidden_bull: 'Hidden Bull', hidden_bear: 'Hidden Bear' }[a.rsiDiv.type])
    : null

  const pvsraLabel = ({
    climax_bull: 'Climax ↑', climax_bear: 'Climax ↓',
    rising_bull: 'Rising ↑', rising_bear: 'Rising ↓', neutral: '–'
  })[a.pvsra]

  return (
    <div className="flex flex-col gap-2 fade-in" style={{ fontSize: 11 }}>

      {/* ── AI Verdict ── */}
      <CollapsiblePanel title="🤖 AI Verdict" defaultOpen={true}>
        <div style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{
            fontSize: 26, fontWeight: 800, letterSpacing: '0.1em',
            color: biasColor(a.bias),
            textShadow: `0 0 20px ${biasColor(a.bias)}66`,
          }}>{a.bias}</div>
          <div style={{ color: '#8b949e', fontSize: 10, marginTop: 4 }}>
            {pair} · {a.session}
            {a.bestSession
              ? <span style={{ color: '#00c853', marginLeft: 6 }}>✔ Prime Session</span>
              : <span style={{ color: '#ffd600', marginLeft: 6 }}>⏳ Off-Peak</span>}
          </div>
          {/* Strategy highlights */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 8 }}>
            {a.supertrendBull !== undefined && (
              <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                background: a.supertrendBull ? '#0d3320' : '#3d0d14',
                color: a.supertrendBull ? '#00c853' : '#ff1744',
                border: `1px solid ${a.supertrendBull ? '#00c85330' : '#ff174430'}` }}>
                ST {a.supertrendBull ? '▲' : '▼'}
              </span>
            )}
            {a.rsiDiv && (
              <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                background: a.rsiDiv.type.includes('bull') ? '#0d3320' : '#3d0d14',
                color: a.rsiDiv.type.includes('bull') ? '#00c853' : '#ff1744',
                border: `1px solid ${a.rsiDiv.type.includes('bull') ? '#00c85330' : '#ff174430'}` }}>
                DIV {divLabel}
              </span>
            )}
            {a.bbSqueeze && (
              <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                background: '#332600', color: '#ffd600', border: '1px solid #ffd60030' }}>
                BB SQUEEZE
              </span>
            )}
            {a.oteSignal?.inZone && (
              <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                background: a.oteSignal.direction === 'long' ? '#0d3320' : '#3d0d14',
                color: a.oteSignal.direction === 'long' ? '#00c853' : '#ff1744',
                border: `1px solid ${a.oteSignal.direction === 'long' ? '#00c85330' : '#ff174430'}` }}>
                OTE {a.oteSignal.fibLevel.toFixed(0)}%
              </span>
            )}
            {a.londonBreak && (
              <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                background: a.londonBreak.direction === 'bull' ? '#0d1a37' : '#2d0d1a',
                color: a.londonBreak.direction === 'bull' ? '#58a6ff' : '#ff6b9d',
                border: `1px solid ${a.londonBreak.direction === 'bull' ? '#58a6ff30' : '#ff6b9d30'}` }}>
                BREAK {a.londonBreak.direction === 'bull' ? '▲' : '▼'}
              </span>
            )}
          </div>
        </div>
      </CollapsiblePanel>

      {/* ── Confluence Score ── */}
      <CollapsiblePanel title="Confluence Score" defaultOpen={true}>
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
      </CollapsiblePanel>

      {/* ── AI Thinking Log ── */}
      <CollapsiblePanel title="AI Thinking Log" defaultOpen={false}
        badge={<span style={{ fontSize: 9, color: '#8b949e' }}>{a.signals.length} signals</span>}>
        <div>
          <div className="signal-row" style={{ background: '#0d1117' }}>
            <span style={{ color: '#8b949e', flex: 1 }}>Signal</span>
            <span style={{ color: '#8b949e', fontSize: 9, width: 36, textAlign: 'center' }}>CAT</span>
            <span style={{ color: '#00c853', width: 28, textAlign: 'center' }}>L</span>
            <span style={{ color: '#ff1744', width: 28, textAlign: 'center' }}>S</span>
          </div>
          {a.signals.map((sig, i) => (
            <div key={i} className="signal-row" style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color: sig.long ? '#e6edf3' : sig.short ? '#e6edf3' : '#8b949e', flex: 1 }}>{sig.name}</span>
              <span style={{ color: catColor(sig.category), fontSize: 8, width: 36, textAlign: 'center', textTransform: 'uppercase' }}>{sig.category}</span>
              <span style={{ color: sig.long  ? '#00c853' : '#30363d', width: 28, textAlign: 'center', fontWeight: 700 }}>
                {sig.long  ? '✔' : '·'}
              </span>
              <span style={{ color: sig.short ? '#ff1744' : '#30363d', width: 28, textAlign: 'center', fontWeight: 700 }}>
                {sig.short ? '✔' : '·'}
              </span>
            </div>
          ))}
        </div>
      </CollapsiblePanel>

      {/* ── Trade Idea ── */}
      {tradeDir && (
        <CollapsiblePanel
          title="Trade Idea"
          defaultOpen={true}
          badge={
            <span style={{ fontWeight: 800, fontSize: 11,
              color: tradeDir === 'LONG' ? '#00c853' : '#ff1744' }}>
              {tradeDir === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
            </span>
          }>
          <div style={{ padding: '4px 0' }}>
            {[
              { label: 'Entry',     value: a.entry.toFixed(pipSize < 0.01 ? 2 : pipSize < 0.001 ? 3 : 5), c: '#e6edf3' },
              { label: 'Stop Loss', value: (tradeDir === 'LONG' ? a.longSL : a.shortSL).toFixed(pipSize < 0.01 ? 2 : pipSize < 0.001 ? 3 : 5), c: '#ff1744' },
              { label: 'TP1',       value: (tradeDir === 'LONG' ? a.longTP1 : a.shortTP1).toFixed(pipSize < 0.01 ? 2 : pipSize < 0.001 ? 3 : 5), c: '#58a6ff' },
              { label: 'TP2',       value: (tradeDir === 'LONG' ? a.longTP2 : a.shortTP2).toFixed(pipSize < 0.01 ? 2 : pipSize < 0.001 ? 3 : 5), c: '#00c853' },
              { label: 'SL Pips',   value: a.slPips.toFixed(1) + ' pips',                   c: '#8b949e' },
              { label: 'R:R',       value: '1 : ' + (a.tp2Pips / (a.slPips || 1)).toFixed(1), c: '#ffd600' },
              { label: 'Risk $',    value: `$${risk$.toFixed(2)} (${riskPct}%)`,             c: '#ffd600' },
              { label: 'Lot Size',  value: '≈ ' + lots.toFixed(2) + ' lots',                c: '#8b949e' },
            ].map(({ label, value, c }, i) => (
              <div key={label} className="signal-row"
                style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
                <span style={{ color: '#8b949e' }}>{label}</span>
                <span style={{ color: c, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      )}

      {/* ── Strategy Insights ── */}
      <CollapsiblePanel title="Strategy Insights" defaultOpen={false}>
        <div style={{ padding: '4px 0' }}>
          {[
            { label: 'Supertrend',     value: a.supertrendBull ? '▲ Bullish' : '▼ Bearish',   c: a.supertrendBull ? '#00c853' : '#ff1744' },
            { label: 'RSI Divergence', value: divLabel ?? 'None detected',                     c: divLabel ? (divLabel.includes('Bull') ? '#00c853' : '#ff1744') : '#8b949e' },
            { label: 'BB Squeeze',     value: a.bbSqueeze ? 'Active ⚡' : 'Normal',            c: a.bbSqueeze ? '#ffd600' : '#8b949e' },
            { label: 'BB Breakout',    value: a.bbBreakout ? (a.bbBreakout === 'bull' ? '▲ Up' : '▼ Down') : 'None', c: a.bbBreakout === 'bull' ? '#00c853' : a.bbBreakout === 'bear' ? '#ff1744' : '#8b949e' },
            { label: 'ICT OTE',        value: a.oteSignal ? `${a.oteSignal.direction === 'long' ? 'Long' : 'Short'} ${a.oteSignal.fibLevel.toFixed(1)}%${a.oteSignal.inZone ? ' ★' : ''}` : 'Not in zone', c: a.oteSignal?.inZone ? '#ffd600' : '#8b949e' },
            { label: 'Alligator',      value: a.alligatorAwake ? (a.alligatorBull ? 'Awake ▲' : 'Awake ▼') : 'Sleeping', c: a.alligatorAwake ? (a.alligatorBull ? '#00c853' : '#ff1744') : '#8b949e' },
            { label: 'Session Break',  value: a.londonBreak ? `London ${a.londonBreak.direction === 'bull' ? '▲' : '▼'} (×${a.londonBreak.strength.toFixed(1)})` : 'None', c: a.londonBreak ? '#58a6ff' : '#8b949e' },
            { label: 'PVSRA',          value: pvsraLabel,                                      c: a.pvsra === 'neutral' ? '#8b949e' : a.pvsra.includes('bull') ? '#00c853' : '#ff1744' },
          ].map(({ label, value, c }, i) => (
            <div key={label} className="signal-row"
              style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color: '#8b949e' }}>{label}</span>
              <span style={{ color: c, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </CollapsiblePanel>

      {/* ── Market Context ── */}
      <CollapsiblePanel title="Market Context" defaultOpen={false}>
        <div style={{ padding: '4px 0' }}>
          {[
            { label: 'Trend',       value: a.trend, c: a.trend === 'BULL' ? '#00c853' : a.trend === 'BEAR' ? '#ff1744' : '#ffd600' },
            { label: 'Structure',   value: a.lastBOS ? `${a.lastBOS.type} ${a.lastBOS.direction === 'bull' ? '▲' : '▼'}` : 'No recent break', c: '#8b949e' },
            { label: 'Last Sweep',  value: a.recentSweep ? `${a.recentSweep.type} @ ${a.recentSweep.level.toFixed(pipSize < 0.01 ? 2 : 5)}` : 'None', c: '#8b949e' },
            { label: 'FVG',         value: a.recentFVG ? `${a.recentFVG.type === 'bull' ? 'Bullish' : 'Bearish'} open` : 'None', c: a.recentFVG ? '#00e5ff' : '#8b949e' },
            { label: 'Order Block', value: a.recentOB ? `${a.recentOB.type === 'bull' ? 'Demand' : 'Supply'} zone` : 'None', c: a.recentOB ? '#ffd600' : '#8b949e' },
            { label: 'ATR (14)',    value: (a.atrValue / pipSize).toFixed(1) + ' pips', c: '#8b949e' },
          ].map(({ label, value, c }, i) => (
            <div key={label} className="signal-row"
              style={{ background: i % 2 === 0 ? '#161b22' : '#1c2128' }}>
              <span style={{ color: '#8b949e' }}>{label}</span>
              <span style={{ color: c, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </CollapsiblePanel>
    </div>
  )
}
