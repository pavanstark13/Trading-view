'use client'
import { useState } from 'react'
import { AIAnalysis, Signal } from '@/lib/indicators'

// ── CollapsiblePanel ──────────────────────────────────────────────────────────
interface CPProps { title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }
export function CollapsiblePanel({ title, badge, defaultOpen = true, children }: CPProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header" style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {badge}
          <span style={{ fontSize: 9, opacity: 0.5, color: 'var(--text-dim)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && children}
    </div>
  )
}

// ── Score Arc (SVG gauge) ─────────────────────────────────────────────────────
function ScoreArc({ score, max, color }: { score: number; max: number; color: string }) {
  const r = 26, cx = 32, cy = 32
  const full = 2 * Math.PI * r
  const arcPct = 0.72  // 259.2° visible arc
  const arcLen = full * arcPct
  const filled = (score / max) * arcLen
  const rot = -130 // start angle offset

  return (
    <svg width={64} height={64} style={{ transform: `rotate(${rot}deg)`, overflow: 'visible', flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-hi)" strokeWidth={5}
        strokeDasharray={`${arcLen} ${full - arcLen}`} strokeLinecap="round" />
      {/* Fill */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${filled} ${full - filled}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .7s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 4px ${color}88)` }} />
    </svg>
  )
}

// ── Signal chip ───────────────────────────────────────────────────────────────
function SigChip({ sig }: { sig: Signal }) {
  const active = sig.long || sig.short
  const isBull = sig.long && !sig.short
  const isBear = sig.short && !sig.long
  const bg = isBull ? 'var(--bull-glow)' : isBear ? 'var(--bear-glow)' : active ? '#f0a83211' : 'transparent'
  const col = isBull ? 'var(--bull)' : isBear ? 'var(--bear)' : active ? 'var(--amber)' : 'var(--text-muted)'
  const border = isBull ? '#00d48f33' : isBear ? '#ff4e6a33' : active ? '#f0a83233' : 'var(--border)'
  const icon = isBull ? '▲' : isBear ? '▼' : active ? '◆' : '·'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 7px', borderRadius: 4,
      background: bg, border: `1px solid ${border}`,
      color: col, fontSize: 9, fontWeight: active ? 700 : 400,
    }}>
      <span style={{ fontSize: 8 }}>{icon}</span>
      <span style={{ lineHeight: 1 }}>{sig.name.replace(/^[①②③④⑤⑥⑦] /, '')}</span>
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

const biasColor = (b: string) =>
  b === 'BULLISH' ? 'var(--bull)' : b === 'BEARISH' ? 'var(--bear)' : 'var(--amber)'
const biasGlow  = (b: string) =>
  b === 'BULLISH' ? 'glow-bull' : b === 'BEARISH' ? 'glow-bear' : 'glow-amber'

function fmtLevel(v: number, ps: number) {
  return v.toFixed(ps < 0.01 ? 2 : ps < 0.001 ? 3 : 5)
}

const CAT_ORDER = ['Trend', 'SMC', 'Momentum', 'Context', 'Strategy']
const CAT_COLOR: Record<string, string> = {
  Trend:    'var(--blue)',
  SMC:      'var(--cyan)',
  Momentum: 'var(--purple)',
  Context:  'var(--text-dim)',
  Strategy: 'var(--amber)',
}

export default function AIPanel({ analysis: a, loading, pair, account, riskPct, pipSize }: Props) {
  if (loading && !a) return (
    <div style={{ padding: '24px 12px', textAlign: 'center' }}>
      <div className="animate-pulse" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        🤖 Analysing {pair}…
      </div>
    </div>
  )
  if (!a) return null

  const risk$ = account * riskPct / 100
  const lots  = risk$ / Math.max(a.slPips * 10, 0.01)
  const tradeDir = a.bias === 'BULLISH' ? 'LONG' : a.bias === 'BEARISH' ? 'SHORT' : null
  const accentClass = biasGlow(a.bias)

  const divLabel = a.rsiDiv
    ? ({ regular_bull: 'Div ▲', regular_bear: 'Div ▼', hidden_bull: 'Hid ▲', hidden_bear: 'Hid ▼' }[a.rsiDiv.type])
    : null

  // Group signals by category
  const grouped = CAT_ORDER.map(cat => ({
    cat,
    sigs: a.signals.filter(s => s.category === cat),
  })).filter(g => g.sigs.length > 0)

  const scoreColor = a.longScore > a.shortScore
    ? 'var(--bull)' : a.shortScore > a.longScore
    ? 'var(--bear)' : 'var(--amber)'
  const activeScore = Math.max(a.longScore, a.shortScore)

  return (
    <div className="col gap8 fade-in" style={{ fontSize: 11 }}>

      {/* ── Verdict Card ── */}
      <div className={`panel panel-accent-${a.bias === 'BULLISH' ? 'bull' : a.bias === 'BEARISH' ? 'bear' : 'amber'}`}>
        <div className="panel-header">🤖 AI Confluence</div>
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

            {/* Bias text */}
            <div style={{ flex: 1 }}>
              <div className={accentClass} style={{
                display: 'inline-block',
                fontSize: 24, fontWeight: 800,
                color: biasColor(a.bias),
                letterSpacing: '0.06em',
                padding: '2px 10px',
                borderRadius: 6,
                background: a.bias === 'BULLISH' ? 'var(--bull-glow)' : a.bias === 'BEARISH' ? 'var(--bear-glow)' : 'var(--amber-glow)',
              }}>{a.bias}</div>

              <div style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 10 }}>
                {pair}
                <span style={{ margin: '0 5px', color: 'var(--text-muted)' }}>·</span>
                {a.session}
                {a.bestSession
                  ? <span style={{ color: 'var(--bull)', marginLeft: 6 }}>✦ Prime</span>
                  : <span style={{ color: 'var(--amber)', marginLeft: 6 }}>◌ Off-Peak</span>}
              </div>

              {/* Strategy badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {a.supertrendBull !== undefined && (
                  <span className={`badge ${a.supertrendBull ? 'badge-bull' : 'badge-bear'}`}>
                    ST {a.supertrendBull ? '▲' : '▼'}
                  </span>
                )}
                {divLabel && (
                  <span className={`badge ${a.rsiDiv!.type.includes('bull') ? 'badge-bull' : 'badge-bear'}`}>
                    RSI {divLabel}
                  </span>
                )}
                {a.bbSqueeze && <span className="badge badge-amber">BB ⚡ SQZ</span>}
                {a.bbBreakout && (
                  <span className={`badge ${a.bbBreakout === 'bull' ? 'badge-bull' : 'badge-bear'}`}>
                    BB BREAK {a.bbBreakout === 'bull' ? '▲' : '▼'}
                  </span>
                )}
                {a.oteSignal?.inZone && (
                  <span className={`badge ${a.oteSignal.direction === 'long' ? 'badge-bull' : 'badge-bear'}`}>
                    OTE {a.oteSignal.fibLevel.toFixed(0)}%
                  </span>
                )}
                {a.londonBreak && (
                  <span className={`badge ${a.londonBreak.direction === 'bull' ? 'badge-blue' : 'badge-bear'}`}>
                    BREAK {a.londonBreak.direction === 'bull' ? '▲' : '▼'}
                  </span>
                )}
              </div>
            </div>

            {/* Score gauge */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <ScoreArc score={activeScore} max={a.maxScore} color={scoreColor} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor,
                  textShadow: `0 0 10px ${scoreColor}` }}>{activeScore}</span>
                <span style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 1 }}>/{a.maxScore}</span>
              </div>
            </div>
          </div>

          {/* Long / Short mini bars */}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'LONG',  s: a.longScore,  c: 'var(--bull)' },
              { label: 'SHORT', s: a.shortScore, c: 'var(--bear)' },
            ].map(({ label, s, c }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 36, color: 'var(--text-muted)', fontSize: 9, fontWeight: 700 }}>{label}</span>
                <div className="score-bar" style={{ flex: 1 }}>
                  <div className="score-bar-fill" style={{ width: `${(s / a.maxScore) * 100}%`, background: c }} />
                </div>
                <span style={{ width: 24, textAlign: 'right', fontSize: 9, fontWeight: 700, color: c }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Signal Grid ── */}
      <CollapsiblePanel title="Signal Analysis" defaultOpen={true}
        badge={<span className="badge badge-dim">{a.signals.filter(s => s.long || s.short).length} active</span>}>
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grouped.map(({ cat, sigs }) => (
            <div key={cat}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em',
                color: CAT_COLOR[cat], marginBottom: 5, textTransform: 'uppercase' }}>
                {cat}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                {sigs.map((sig, i) => <SigChip key={i} sig={sig} />)}
              </div>
            </div>
          ))}
        </div>
      </CollapsiblePanel>

      {/* ── Trade Setup ── */}
      {tradeDir && (
        <CollapsiblePanel title="Trade Setup" defaultOpen={true}
          badge={
            <span className={`badge ${tradeDir === 'LONG' ? 'badge-bull' : 'badge-bear'}`}>
              {tradeDir === 'LONG' ? '▲ LONG' : '▼ SHORT'}
            </span>
          }>
          <div style={{ padding: '10px 14px' }}>

            {/* Visual price levels */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 6, marginBottom: 12,
            }}>
              {[
                { label: 'ENTRY',    value: fmtLevel(a.entry, pipSize),    c: 'var(--text)',   bg: 'var(--bg-raised)' },
                { label: 'STOP',     value: fmtLevel(tradeDir === 'LONG' ? a.longSL : a.shortSL, pipSize), c: 'var(--bear)', bg: 'var(--bear-glow)' },
                { label: 'TP1',      value: fmtLevel(tradeDir === 'LONG' ? a.longTP1 : a.shortTP1, pipSize), c: 'var(--blue)', bg: 'var(--blue-glow)' },
                { label: 'TP2',      value: fmtLevel(tradeDir === 'LONG' ? a.longTP2 : a.shortTP2, pipSize), c: 'var(--bull)', bg: 'var(--bull-glow)' },
              ].map(({ label, value, c, bg }) => (
                <div key={label} style={{
                  background: bg, borderRadius: 5,
                  border: `1px solid ${c}33`,
                  padding: '5px 6px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 3, letterSpacing: '0.1em' }}>{label}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: c, letterSpacing: '-0.01em' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Trade meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                { label: 'SL Pips',  value: a.slPips.toFixed(1) },
                { label: 'R:R',      value: `1 : ${(a.tp2Pips / (a.slPips || 1)).toFixed(1)}`, highlight: true },
                { label: 'Risk $',   value: `$${risk$.toFixed(2)}` },
                { label: 'Lot Size', value: `${lots.toFixed(2)} lots` },
              ].map(({ label, value, highlight }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 8px', borderRadius: 4,
                  background: highlight ? 'var(--amber-glow)' : 'var(--bg-raised)',
                  border: `1px solid ${highlight ? '#f0a83233' : 'var(--border)'}`,
                }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{label}</span>
                  <span style={{ color: highlight ? 'var(--amber)' : 'var(--text)', fontWeight: 700, fontSize: 9 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </CollapsiblePanel>
      )}

      {/* ── Strategy Insights ── */}
      <CollapsiblePanel title="Strategy Details" defaultOpen={false}>
        <div style={{ padding: '6px 0' }}>
          {[
            { label: '① Supertrend',    value: a.supertrendBull ? 'Bullish ▲' : 'Bearish ▼', active: true, bull: a.supertrendBull },
            { label: '② RSI Divergence', value: divLabel ?? 'None',      active: !!a.rsiDiv, bull: a.rsiDiv?.type.includes('bull') },
            { label: '③ BB Squeeze',    value: a.bbSqueeze ? '⚡ Active' : 'Normal', active: a.bbSqueeze, bull: a.bbSqueeze },
            { label: '③ BB Breakout',   value: a.bbBreakout ? (a.bbBreakout === 'bull' ? '▲ Upper' : '▼ Lower') : 'None', active: !!a.bbBreakout, bull: a.bbBreakout === 'bull' },
            { label: '④ ICT OTE',       value: a.oteSignal ? `${a.oteSignal.direction.toUpperCase()} ${a.oteSignal.fibLevel.toFixed(1)}%${a.oteSignal.inZone ? ' ★' : ''}` : 'Not in zone', active: !!a.oteSignal?.inZone, bull: a.oteSignal?.direction === 'long' },
            { label: '⑤ Alligator',     value: a.alligatorAwake ? (a.alligatorBull ? 'Awake ▲' : 'Awake ▼') : 'Sleeping', active: a.alligatorAwake, bull: a.alligatorBull },
            { label: '⑥ Session Break', value: a.londonBreak ? `London ${a.londonBreak.direction === 'bull' ? '▲' : '▼'} ×${a.londonBreak.strength.toFixed(1)}` : 'None', active: !!a.londonBreak, bull: a.londonBreak?.direction === 'bull' },
            { label: '⑦ PVSRA Vol',     value: ({ climax_bull:'Climax ▲', climax_bear:'Climax ▼', rising_bull:'Rising ▲', rising_bear:'Rising ▼', neutral:'Neutral' })[a.pvsra], active: a.pvsra !== 'neutral', bull: a.pvsra.includes('bull') },
          ].map(({ label, value, active, bull }, i) => (
            <div key={label} className="signal-row"
              style={{ background: i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-raised)' }}>
              <span style={{ color: active ? 'var(--text-dim)' : 'var(--text-muted)', flex: 1, fontSize: 10 }}>{label}</span>
              <span style={{
                fontWeight: active ? 700 : 400,
                fontSize: 10,
                color: !active ? 'var(--text-muted)' : bull ? 'var(--bull)' : 'var(--bear)',
              }}>{value}</span>
            </div>
          ))}
        </div>
      </CollapsiblePanel>

      {/* ── Market Context ── */}
      <CollapsiblePanel title="Market Context" defaultOpen={false}>
        <div style={{ padding: '6px 0' }}>
          {[
            { l: 'Trend',       v: a.trend, c: a.trend === 'BULL' ? 'var(--bull)' : a.trend === 'BEAR' ? 'var(--bear)' : 'var(--amber)' },
            { l: 'Structure',   v: a.lastBOS ? `${a.lastBOS.type} ${a.lastBOS.direction === 'bull' ? '▲' : '▼'}` : '—', c: 'var(--text-dim)' },
            { l: 'Last Sweep',  v: a.recentSweep ? `${a.recentSweep.type} @ ${fmtLevel(a.recentSweep.level, pipSize)}` : '—', c: 'var(--text-dim)' },
            { l: 'FVG',         v: a.recentFVG ? `${a.recentFVG.type === 'bull' ? 'Bull' : 'Bear'} open` : '—', c: a.recentFVG ? 'var(--cyan)' : 'var(--text-muted)' },
            { l: 'Order Block', v: a.recentOB ? `${a.recentOB.type === 'bull' ? 'Demand' : 'Supply'} zone` : '—', c: a.recentOB ? 'var(--amber)' : 'var(--text-muted)' },
            { l: 'ATR (14)',    v: `${(a.atrValue / pipSize).toFixed(1)} pips`, c: 'var(--text-dim)' },
          ].map(({ l, v, c }, i) => (
            <div key={l} className="signal-row"
              style={{ background: i % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-raised)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{l}</span>
              <span style={{ color: c, fontWeight: 600, fontSize: 10 }}>{v}</span>
            </div>
          ))}
        </div>
      </CollapsiblePanel>
    </div>
  )
}
