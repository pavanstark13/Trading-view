'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { OSView } from '@/lib/os/types'

// ── Dynamic view imports ──────────────────────────────────────────────────────
const TerminalView  = dynamic(() => import('@/components/terminal/TerminalView'),  { ssr: false, loading: () => <ViewLoader /> })
const ScannerView   = dynamic(() => import('@/components/scanner/ScannerView'),    { ssr: false, loading: () => <ViewLoader /> })
const StrategyView  = dynamic(() => import('@/components/strategy/StrategyView'),  { ssr: false, loading: () => <ViewLoader /> })
const PortfolioView = dynamic(() => import('@/components/portfolio/PortfolioView'),{ ssr: false, loading: () => <ViewLoader /> })
const RiskView      = dynamic(() => import('@/components/risk/RiskView'),          { ssr: false, loading: () => <ViewLoader /> })
const JournalView   = dynamic(() => import('@/components/journal/JournalView'),    { ssr: false, loading: () => <ViewLoader /> })
const AlertsView    = dynamic(() => import('@/components/alerts/AlertsView'),      { ssr: false, loading: () => <ViewLoader /> })
const BrokerPanel   = dynamic(() => import('@/components/BrokerPanel'),            { ssr: false, loading: () => <ViewLoader /> })
const SignalQueue   = dynamic(() => import('@/components/signals/SignalQueue'),    { ssr: false, loading: () => <ViewLoader /> })
const AICopilot     = dynamic(() => import('@/components/ai/AICopilot'),           { ssr: false })

function ViewLoader() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--os-t3)', fontSize: 12 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="os-live-dot" style={{ background: 'var(--os-blue)' }} />
        Loading…
      </span>
    </div>
  )
}

// ── Market status pill ────────────────────────────────────────────────────────
function MarketPill({ label }: { label: string }) {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const mins = h * 60 + m
  const isNSEOpen  = mins >= 555 && mins <= 930   // 9:15–15:30
  const isMCXOpen  = mins >= 540 && mins <= 1380  // 9:00–23:00
  const isFXOpen   = true
  const open = label === 'NSE' ? isNSEOpen : label === 'MCX' ? isMCXOpen : isFXOpen
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--os-t2)', padding: '2px 7px', background: 'var(--os-surface2)', borderRadius: 4, border: '1px solid var(--os-border)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: open ? 'var(--os-green)' : 'var(--os-t3)', display: 'inline-block' }} />
      {label} <span style={{ color: open ? 'var(--os-green)' : 'var(--os-t3)' }}>{open ? 'LIVE' : 'CLOSED'}</span>
    </span>
  )
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
function TopBar({ aiOpen, onAIToggle }: { aiOpen: boolean; onAIToggle: () => void }) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12, background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)', flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 16, height: 16, background: 'var(--os-blue)', borderRadius: 3, display: 'inline-block' }} />
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--os-t1)' }}>TRADE</span>
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--os-blue)' }}>OS</span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--os-border)', flexShrink: 0 }} />

      {/* Market pills */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <MarketPill label="NSE" />
        <MarketPill label="MCX" />
        <MarketPill label="FX" />
      </div>

      {/* Search */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 300 }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, pointerEvents: 'none' }}>🔍</span>
          <input
            className="os-input"
            style={{ width: '100%', paddingLeft: 28, fontSize: 11 }}
            placeholder="Search symbol or command… (⌘K)"
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'k') e.preventDefault()
            }}
          />
        </div>
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--os-green)' }}>₹8,47,234</div>
          <div style={{ fontSize: 10, color: 'var(--os-green)', fontFamily: 'var(--font-mono)' }}>+₹10,452 +1.24%</div>
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--os-border)' }} />

        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--os-t2)', minWidth: 70, textAlign: 'right' }}>
          {time} <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>IST</span>
        </div>

        <button className="os-btn-icon" title="Notifications">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2a4 4 0 0 1 4 4v3l1 1.5H3L4 9V6a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        <button
          className="os-btn-icon"
          title="AI Copilot"
          onClick={onAIToggle}
          style={{
            background: aiOpen ? 'rgba(59,130,246,0.15)' : undefined,
            color: aiOpen ? 'var(--os-blue)' : undefined,
            border: aiOpen ? '1px solid var(--os-blue)' : undefined,
            boxShadow: aiOpen ? '0 0 8px rgba(59,130,246,0.4)' : undefined,
            fontSize: 11,
            fontWeight: 700,
            padding: '0 8px',
            borderRadius: 4,
            minWidth: 32,
          }}
        >
          AI
        </button>

        <button className="os-btn-icon" title="Settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Nav icons SVG ─────────────────────────────────────────────────────────────
const NAV_ITEMS: { view: OSView; label: string; icon: React.ReactNode }[] = [
  {
    view: 'terminal', label: 'Terminal',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14v10H2z" stroke="currentColor" strokeWidth="1.3" rx="1" /><path d="M5 8l3 3 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 6h14" stroke="currentColor" strokeWidth="1.3" /><circle cx="4.5" cy="5" r="0.6" fill="currentColor" /><circle cx="6.5" cy="5" r="0.6" fill="currentColor" /></svg>,
  },
  {
    view: 'scanner', label: 'Scanner',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" /><path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  },
  {
    view: 'signals', label: 'Signals',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.22 4.22l1.41 1.41M12.37 12.37l1.41 1.41M4.22 13.78l1.41-1.41M12.37 5.63l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.3"/></svg>,
  },
  {
    view: 'strategy', label: 'Strategy',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="2" y="8" width="10" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="2" y="13" width="7" height="2" rx="1" stroke="currentColor" strokeWidth="1.3" /></svg>,
  },
  {
    view: 'backtest', label: 'Backtest',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 14l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 4v4h-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    view: 'portfolio', label: 'Portfolio',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.3" /><path d="M9 9L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M9 9 l5.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M9 9 l-4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  },
  {
    view: 'risk', label: 'Risk',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L3 5v5c0 3.5 2.5 6.2 6 7 3.5-.8 6-3.5 6-7V5L9 2Z" stroke="currentColor" strokeWidth="1.3" /></svg>,
  },
  {
    view: 'journal', label: 'Journal',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M3 5h1M3 9h1M3 13h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  },
  {
    view: 'alerts', label: 'Alerts',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a4.5 4.5 0 0 1 4.5 4.5v3.5l1 1.5H3.5L4.5 10V6.5A4.5 4.5 0 0 1 9 2Z" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M7 14.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.3" /></svg>,
  },
  {
    view: 'broker', label: 'Broker',
    icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="13" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" /><circle cx="13" cy="13" r="2" stroke="currentColor" strokeWidth="1.3" /><path d="M7.5 8l3.5-2M7.5 10l3.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ activeView, onViewChange }: { activeView: OSView; onViewChange: (v: OSView) => void }) {
  return (
    <div style={{ width: 60, flexShrink: 0, background: 'var(--os-surface)', borderRight: '1px solid var(--os-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
      {/* Logo dot */}
      <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--os-blue)', display: 'inline-block', boxShadow: '0 0 8px rgba(59,130,246,0.5)' }} />
      </div>

      <div style={{ width: '100%', height: 1, background: 'var(--os-border)', margin: '4px 0 6px' }} />

      {/* Nav items */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', gap: 2, padding: '0 4px' }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeView === item.view || (activeView === 'backtest' && item.view === 'strategy')
          return (
            <div key={item.view} style={{ position: 'relative' }} className="nav-item-wrapper">
              <button
                onClick={() => onViewChange(item.view)}
                className="os-nav-item"
                style={{
                  width: '100%',
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'var(--os-active)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--os-blue)' : '2px solid transparent',
                  color: isActive ? 'var(--os-blue)' : 'var(--os-t3)',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 4,
                  transition: 'all 0.12s ease',
                }}
                title={item.label}
              >
                {item.icon}
              </button>
            </div>
          )
        })}
      </div>

      {/* Settings at bottom */}
      <div style={{ padding: '8px 0 12px' }}>
        <button className="os-btn-icon" title="Settings" style={{ width: 44, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Status Bar ────────────────────────────────────────────────────────────────
function StatusBar() {
  return (
    <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: 'var(--os-surface)', borderTop: '1px solid var(--os-border)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--os-t3)', fontFamily: 'var(--font-mono)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--os-green)', display: 'inline-block' }} />
          Connected
        </span>
        <span style={{ color: 'var(--os-border2)' }}>·</span>
        <span>Data: Yahoo Finance</span>
        <span style={{ color: 'var(--os-border2)' }}>·</span>
        <span>NSE F&O · MCX · CDS</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--os-t3)', fontFamily: 'var(--font-mono)' }}>
        <span>⌘K Search · Tab Switch Panel</span>
        <span style={{ color: 'var(--os-border2)' }}>·</span>
        <span style={{ color: 'var(--os-blue)' }}>v2.0</span>
      </div>
    </div>
  )
}

// ── AI Panel ──────────────────────────────────────────────────────────────────
function AIPanel({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--os-border)', background: 'var(--os-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 44, borderBottom: '1px solid var(--os-border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-t1)', letterSpacing: '0.05em' }}>AI COPILOT</span>
        <button className="os-btn-icon" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AICopilot embedded />
      </div>
    </div>
  )
}

// ── Active view renderer ──────────────────────────────────────────────────────
function ActiveView({ view }: { view: OSView }) {
  switch (view) {
    case 'terminal':  return <TerminalView />
    case 'scanner':   return <ScannerView />
    case 'signals':   return <SignalQueue />
    case 'strategy':
    case 'backtest':  return <StrategyView initialTab={view === 'backtest' ? 'backtest' : 'library'} />
    case 'portfolio': return <PortfolioView />
    case 'risk':      return <RiskView />
    case 'journal':   return <JournalView />
    case 'alerts':    return <AlertsView />
    case 'broker':    return <BrokerPanel />
    default:          return <TerminalView />
  }
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export default function Shell() {
  const [activeView, setActiveView] = useState<OSView>('terminal')
  const [aiOpen, setAiOpen]         = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      const el = document.querySelector<HTMLInputElement>('input[placeholder*="Search symbol"]')
      el?.focus()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--os-bg)' }}>
      <TopBar aiOpen={aiOpen} onAIToggle={() => setAiOpen(o => !o)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'row' }}>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ActiveView view={activeView} />
          </div>
          {aiOpen && <AIPanel onClose={() => setAiOpen(false)} />}
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
