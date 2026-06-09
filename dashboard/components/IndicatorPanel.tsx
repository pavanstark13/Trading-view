'use client'
import { useState } from 'react'
import type { IndicatorConfig } from './TradingChart'

interface Props {
  indicators: IndicatorConfig
  onChange: (key: keyof IndicatorConfig, value: boolean) => void
}

interface LayerDef {
  key: keyof IndicatorConfig
  label: string
  color: string
  group: string
  desc: string
}

const LAYERS: LayerDef[] = [
  // Lines
  { key: 'ema20',    label: 'EMA 20',    color: '#22d3ee', group: 'Lines',    desc: 'Fast moving average (20-period)' },
  { key: 'ema50',    label: 'EMA 50',    color: '#f0a832', group: 'Lines',    desc: 'Mid moving average (50-period)' },
  { key: 'ema200',   label: 'EMA 200',   color: '#a78bfa', group: 'Lines',    desc: 'Slow moving average (200-period)' },
  { key: 'vwap',     label: 'VWAP',      color: '#4d8fff', group: 'Lines',    desc: 'Volume-weighted average price' },
  { key: 'supertrend', label: 'Supertrend', color: '#00d48f', group: 'Lines', desc: 'ATR-based trend direction line' },
  // SMC Zones
  { key: 'orderBlocks', label: 'Order Blocks', color: '#00d48f', group: 'SMC Zones', desc: 'Bull/Bear OBs — institutional entry zones' },
  { key: 'fvgs',    label: 'Fair Value Gaps', color: '#22d3ee', group: 'SMC Zones', desc: 'Imbalanced price areas (FVGs)' },
  // SMC Events
  { key: 'bosChoch', label: 'BOS / CHoCH', color: '#f0a832', group: 'SMC Events', desc: 'Break of Structure & Change of Character' },
  { key: 'sweeps',  label: 'Liq Sweeps',  color: '#ff4e6a', group: 'SMC Events', desc: 'Buyside & Sellside liquidity sweeps' },
  { key: 'swingPoints', label: 'Swing Points', color: '#a78bfa', group: 'SMC Events', desc: 'HH / HL / LH / LL market structure labels' },
]

const GROUPS = ['Lines', 'SMC Zones', 'SMC Events']

const GROUP_ICONS: Record<string, string> = {
  'Lines':      '📈',
  'SMC Zones':  '🟦',
  'SMC Events': '⚡',
}

export default function IndicatorPanel({ indicators, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)

  const activeCount = Object.values(indicators).filter(Boolean).length

  return (
    <div style={{ position: 'absolute', top: 42, left: 12, zIndex: 10 }}>

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 6,
          background: open ? '#1b2a45' : '#0f1a2a',
          border: `1px solid ${open ? '#2d4a7a' : '#1a2540'}`,
          color: open ? '#7ab8ff' : '#4a6a8a',
          fontSize: 10, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '0.05em',
          backdropFilter: 'blur(8px)',
          transition: 'all .15s',
          boxShadow: open ? '0 4px 20px #00000066' : 'none',
        }}>
        <span>⚙</span>
        <span>LAYERS</span>
        <span style={{
          background: '#4d8fff33', color: '#4d8fff',
          borderRadius: 3, padding: '0 5px', fontSize: 9, fontWeight: 800,
        }}>{activeCount}</span>
        <span style={{ fontSize: 9, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          marginTop: 6,
          background: '#0c1525ee',
          border: '1px solid #1a2540',
          borderRadius: 8,
          padding: '10px 12px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 40px #00000077',
          minWidth: 260,
        }}>
          <div style={{ fontSize: 8.5, color: '#2d3f58', fontWeight: 700,
            letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>
            Chart Layers — click to toggle
          </div>

          {GROUPS.map(group => {
            const items = LAYERS.filter(l => l.group === group)
            return (
              <div key={group} style={{ marginBottom: 10 }}>
                {/* Group header */}
                <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em',
                  color: '#3d506a', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>{GROUP_ICONS[group]}</span>
                  <span style={{ textTransform: 'uppercase' }}>{group}</span>
                </div>
                {/* Toggles */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {items.map(({ key, label, color, desc }) => {
                    const on = indicators[key]
                    return (
                      <button
                        key={key}
                        onClick={() => onChange(key, !on)}
                        onMouseEnter={() => setTooltip(desc)}
                        onMouseLeave={() => setTooltip(null)}
                        title={desc}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '4px 9px', borderRadius: 4,
                          background: on ? `${color}18` : 'transparent',
                          border: `1px solid ${on ? color + '55' : '#1a2540'}`,
                          color: on ? color : '#3d506a',
                          fontSize: 9.5, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all .12s',
                          whiteSpace: 'nowrap',
                        }}>
                        {/* Dot indicator */}
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: on ? color : '#2d3f58',
                          boxShadow: on ? `0 0 6px ${color}` : 'none',
                          flexShrink: 0,
                          transition: 'all .15s',
                        }} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              marginTop: 6, padding: '5px 8px',
              background: '#0f1a2a', borderRadius: 4,
              border: '1px solid #1a2540',
              fontSize: 9, color: '#4a6a8a', lineHeight: 1.5,
              borderLeft: '2px solid #4d8fff',
            }}>
              💡 {tooltip}
            </div>
          )}

          {/* All on / All off */}
          <div style={{ display: 'flex', gap: 4, marginTop: 10, paddingTop: 8,
            borderTop: '1px solid #1a2540' }}>
            <button onClick={() => LAYERS.forEach(l => onChange(l.key, true))} style={{
              flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700,
              borderRadius: 4, cursor: 'pointer', border: '1px solid #1a2540',
              background: 'transparent', color: '#4a6a8a', fontFamily: 'inherit',
              transition: 'all .12s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color='#7ab8ff'; e.currentTarget.style.borderColor='#4d8fff44' }}
              onMouseLeave={e => { e.currentTarget.style.color='#4a6a8a'; e.currentTarget.style.borderColor='#1a2540' }}>
              All On
            </button>
            <button onClick={() => LAYERS.forEach(l => onChange(l.key, false))} style={{
              flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700,
              borderRadius: 4, cursor: 'pointer', border: '1px solid #1a2540',
              background: 'transparent', color: '#4a6a8a', fontFamily: 'inherit',
              transition: 'all .12s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color='#ff8a9a'; e.currentTarget.style.borderColor='#ff4e6a44' }}
              onMouseLeave={e => { e.currentTarget.style.color='#4a6a8a'; e.currentTarget.style.borderColor='#1a2540' }}>
              All Off
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
