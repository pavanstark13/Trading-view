'use client'
import { useState, useEffect } from 'react'

// ── Palette (mirrors BrokerPanel) ─────────────────────────────────────────────
const RED   = '#ff4e6a'
const GREEN = '#00d48f'
const AMBER = '#f0a832'
const BLUE  = '#4d8fff'
const CYAN  = '#22d3ee'
const MUTED = '#4a6a8a'
const BG    = '#0c1220'
const CARD  = '#0f1a2a'
const BORDER = '#1a2540'

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const LS = {
  oandaAccount: 'oanda_account_id',
  oandaKey:     'oanda_api_key',
  oandaPractice:'oanda_practice',
  binanceKey:   'binance_api_key',
  binanceSecret:'binance_secret_key',
  binanceTestnet:'binance_testnet',
}

type Section = 'india' | 'forex' | 'crypto'
type ConnStatus = 'idle' | 'testing' | 'ok' | 'error'

interface OANDAResult { balance: number; currency: string; unrealizedPL: number; nav: number }
interface BinanceAsset { asset: string; free: number; locked: number }

// ── Helpers ───────────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 8.5, color: MUTED, marginBottom: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder: string; type?: string
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '6px 9px', fontSize: 10, borderRadius: 4, background: BG,
        border: `1px solid ${BORDER}`, color: '#d4e2f8', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
  )
}

function Toggle({ active, onChange, labelOn, labelOff }: {
  active: boolean; onChange: (v: boolean) => void; labelOn: string; labelOff: string
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {([true, false] as const).map(v => (
        <button key={String(v)} onClick={() => onChange(v)} style={{
          flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
          background: active === v ? '#1b2a45' : 'transparent',
          border: `1px solid ${active === v ? BLUE + '88' : BORDER}`,
          color: active === v ? BLUE : MUTED, fontFamily: 'inherit',
        }}>{v ? labelOn : labelOff}</button>
      ))}
    </div>
  )
}

function StatusChip({ status, msg }: { status: ConnStatus; msg: string }) {
  if (status === 'idle') return null
  const [bg, col] = status === 'testing' ? [AMBER+'12', AMBER] : status === 'ok' ? [GREEN+'12', GREEN] : [RED+'12', RED]
  return (
    <div style={{ marginTop: 8, padding: '6px 9px', borderRadius: 4,
      background: bg, border: `1px solid ${col}33`, fontSize: 9, color: col, lineHeight: 1.5 }}>
      {status === 'testing' ? '⟳ Testing connection…' : msg}
    </div>
  )
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol style={{ margin: '6px 0 0', paddingLeft: 16 }}>
      {steps.map((s, i) => <li key={i} style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.6, marginBottom: 2 }}>{s}</li>)}
    </ol>
  )
}

function SectionHeader({ icon, title, color, badge, open, onToggle }: {
  icon: string; title: string; color: string; badge?: string; open: boolean; onToggle: () => void
}) {
  return (
    <button onClick={onToggle} style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: open ? '6px 6px 0 0' : 6, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#d4e2f8' }}>{title}</span>
        {badge && <span style={{ fontSize: 7.5, padding: '1px 6px', borderRadius: 10,
          background: color+'18', color, border: `1px solid ${color}44`, fontWeight: 700 }}>{badge}</span>}
      </div>
      <span style={{ fontSize: 10, color: MUTED }}>{open ? '▲' : '▼'}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BrokerSetupGuide() {
  const [open, setOpen] = useState<Section | null>('india')

  // OANDA state
  const [oaAccount, setOaAccount] = useState('')
  const [oaKey,     setOaKey]     = useState('')
  const [oaPractice, setOaPractice] = useState(true)
  const [oaStatus,   setOaStatus]   = useState<ConnStatus>('idle')
  const [oaMsg,      setOaMsg]      = useState('')

  // Binance state
  const [bnKey,     setBnKey]     = useState('')
  const [bnSecret,  setBnSecret]  = useState('')
  const [bnTestnet, setBnTestnet] = useState(true)
  const [bnStatus,  setBnStatus]  = useState<ConnStatus>('idle')
  const [bnMsg,     setBnMsg]     = useState('')

  // Angel One state
  const [aoClientId,   setAoClientId]   = useState('')
  const [aoApiKey,     setAoApiKey]     = useState('')
  const [aoPassword,   setAoPassword]   = useState('')
  const [aoTotp,       setAoTotp]       = useState('')
  const [aoStatus,     setAoStatus]     = useState<ConnStatus>('idle')
  const [aoMsg,        setAoMsg]        = useState('')
  const [aoConnected,  setAoConnected]  = useState(false)

  // Hydrate from localStorage
  useEffect(() => {
    setOaAccount(localStorage.getItem(LS.oandaAccount) ?? '')
    setOaKey    (localStorage.getItem(LS.oandaKey)     ?? '')
    setOaPractice(localStorage.getItem(LS.oandaPractice) !== 'false')
    setBnKey    (localStorage.getItem(LS.binanceKey)    ?? '')
    setBnSecret (localStorage.getItem(LS.binanceSecret) ?? '')
    setBnTestnet(localStorage.getItem(LS.binanceTestnet) !== 'false')
    setAoClientId(localStorage.getItem('ao_client_id') ?? '')
    setAoApiKey  (localStorage.getItem('ao_api_key')   ?? '')
  }, [])

  // Persist OANDA creds
  const saveOanda = () => {
    localStorage.setItem(LS.oandaAccount, oaAccount)
    localStorage.setItem(LS.oandaKey,     oaKey)
    localStorage.setItem(LS.oandaPractice, String(oaPractice))
  }

  // Persist Binance creds
  const saveBinance = () => {
    localStorage.setItem(LS.binanceKey,    bnKey)
    localStorage.setItem(LS.binanceSecret, bnSecret)
    localStorage.setItem(LS.binanceTestnet, String(bnTestnet))
  }

  // Connect Angel One
  const connectAngelOne = async () => {
    if (!aoClientId || !aoApiKey || !aoPassword || !aoTotp) return
    localStorage.setItem('ao_client_id', aoClientId)
    localStorage.setItem('ao_api_key',   aoApiKey)
    setAoStatus('testing'); setAoMsg('')
    try {
      const res = await fetch('/api/angelone/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: aoClientId, apiKey: aoApiKey, password: aoPassword, totpSecret: aoTotp }),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error ?? 'Login failed')
      setAoStatus('ok')
      setAoConnected(true)
      setAoMsg(`Connected! ${d.name ?? aoClientId} · ${d.email ?? ''} · ${d.broker ?? 'Angel One'}`)
    } catch (e) {
      setAoStatus('error')
      setAoConnected(false)
      setAoMsg(e instanceof Error ? e.message : 'Authentication failed')
    }
  }

  // Test OANDA
  const testOanda = async () => {
    saveOanda()
    setOaStatus('testing'); setOaMsg('')
    try {
      // Pass creds as headers so we can test without env vars being set
      const params = new URLSearchParams({
        accountId: oaAccount, apiKey: oaKey, practice: String(oaPractice),
      })
      const res = await fetch(`/api/oanda/balance?${params}`)
      const d: OANDAResult | { error: string } = await res.json()
      if ('error' in d) throw new Error(d.error)
      const b = d as OANDAResult
      setOaStatus('ok')
      setOaMsg(
        `Connected! Balance: ${b.balance.toFixed(2)} ${b.currency} | NAV: ${b.nav.toFixed(2)} | P&L: ${b.unrealizedPL >= 0 ? '+' : ''}${b.unrealizedPL.toFixed(2)}`
      )
    } catch (e) {
      setOaStatus('error')
      setOaMsg(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  // Test Binance
  const testBinance = async () => {
    saveBinance()
    setBnStatus('testing'); setBnMsg('')
    try {
      const params = new URLSearchParams({
        apiKey: bnKey, secretKey: bnSecret, testnet: String(bnTestnet),
      })
      const res = await fetch(`/api/binance/balance?${params}`)
      const d: BinanceAsset[] | { error: string } = await res.json()
      if (!Array.isArray(d) && 'error' in d) throw new Error(d.error)
      const assets = d as BinanceAsset[]
      setBnStatus('ok')
      const top = assets.slice(0, 4).map(a => `${a.asset}: ${a.free.toFixed(4)}`).join(' · ')
      setBnMsg(`Connected! ${assets.length} asset(s) with balance. ${top}`)
    } catch (e) {
      setBnStatus('error')
      setBnMsg(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  const toggle = (s: Section) => setOpen(prev => prev === s ? null : s)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ color: '#d4e2f8', fontFamily: 'inherit', maxWidth: 520 }}>
      {/* Header */}
      <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 6,
        background: BLUE + '10', border: `1px solid ${BLUE}33` }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#d4e2f8', marginBottom: 4 }}>
          Broker Setup Guide
        </div>
        <div style={{ fontSize: 9, color: MUTED, lineHeight: 1.6 }}>
          Connect your brokerage accounts to enable live trading directly from the terminal.
          Credentials are stored in <strong style={{ color: AMBER }}>localStorage</strong> for convenience —
          in production use server-side environment variables.
        </div>
      </div>

      {/* ── Indian Stocks ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <SectionHeader icon="🇮🇳" title="Indian Stocks (NSE / BSE / F&O)" color={AMBER}
          badge="Integrated" open={open === 'india'} onToggle={() => toggle('india')} />
        {open === 'india' && (
          <div style={{ padding: '14px 14px', background: BG,
            border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 6px 6px' }}>

            {/* Angel One card */}
            <div style={{ padding: '10px 12px', borderRadius: 5, marginBottom: 12,
              background: CARD, border: `1px solid ${AMBER}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: AMBER }}>Angel One</span>
                  <span style={{ marginLeft: 6, fontSize: 7.5, padding: '1px 5px', borderRadius: 3,
                    background: GREEN + '18', color: GREEN, border: `1px solid ${GREEN}44`, fontWeight: 700 }}>
                    RECOMMENDED
                  </span>
                </div>
                <a href="https://www.angelone.in" target="_blank" rel="noreferrer"
                  style={{ fontSize: 8.5, color: BLUE, textDecoration: 'none' }}>angelone.in ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[['Exchange','NSE · BSE · MCX'],['Segments','Equity · F&O · CDS'],['API','Smart API v2']].map(([k,v]) => (
                  <div key={k} style={{ padding: '4px 6px', borderRadius: 3, background: BG, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 7.5, color: MUTED }}>{k}</div>
                    <div style={{ fontSize: 8.5, color: '#d4e2f8', fontWeight: 700, marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
                SEBI-registered broker. REST API for live equities, F&amp;O, MCX and CDS.
                Enable Smart API from your Angel One account settings.
              </div>
              <StepList steps={[
                'Login to angelone.in → My Profile → Enable Smart API',
                'Create an API app and copy the API Key',
                'Enable TOTP 2FA in your Angel One security settings',
                'Use the TOTP secret (scan the QR code manually to get the secret)',
              ]} />
            </div>

            {/* Angel One login form */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, marginBottom: 2 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#d4e2f8', marginBottom: 10,
                letterSpacing: '0.05em' }}>CONNECT ANGEL ONE ACCOUNT</div>
              <Row label="Client ID">
                <Input value={aoClientId} onChange={setAoClientId} placeholder="e.g. A123456" />
              </Row>
              <Row label="API Key">
                <Input value={aoApiKey} onChange={setAoApiKey} placeholder="Paste API key from Smart API settings" type="password" />
              </Row>
              <Row label="Password">
                <Input value={aoPassword} onChange={setAoPassword} placeholder="Angel One login password" type="password" />
              </Row>
              <Row label="TOTP Secret (for auto-generated OTP)">
                <Input value={aoTotp} onChange={setAoTotp} placeholder="Base32 secret from TOTP QR code" type="password" />
              </Row>
              <button
                onClick={connectAngelOne}
                disabled={aoStatus === 'testing' || !aoClientId || !aoApiKey || !aoPassword || !aoTotp}
                style={{
                  width: '100%', padding: '7px 0', fontSize: 10, fontWeight: 800, borderRadius: 5,
                  cursor: (aoStatus === 'testing' || !aoClientId || !aoApiKey || !aoPassword || !aoTotp) ? 'not-allowed' : 'pointer',
                  background: aoConnected ? GREEN + '18' : AMBER + '18',
                  border: `1px solid ${aoConnected ? GREEN : AMBER}44`,
                  color: aoConnected ? GREEN : AMBER,
                  fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'all .15s',
                }}>
                {aoConnected ? '✓ Connected to Angel One' : 'Connect Angel One'}
              </button>
              <StatusChip status={aoStatus} msg={aoMsg} />
            </div>
          </div>
        )}
      </div>

      {/* ── Forex ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <SectionHeader icon="💱" title="Forex (Currency Pairs)" color={CYAN}
          badge="OANDA" open={open === 'forex'} onToggle={() => toggle('forex')} />
        {open === 'forex' && (
          <div style={{ padding: '14px 14px', background: BG,
            border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 6px 6px' }}>

            {/* OANDA card */}
            <div style={{ padding: '10px 12px', borderRadius: 5, marginBottom: 12,
              background: CARD, border: `1px solid ${CYAN}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: CYAN }}>OANDA</span>
                  <span style={{ marginLeft: 6, fontSize: 7.5, padding: '1px 5px', borderRadius: 3,
                    background: GREEN + '18', color: GREEN, border: `1px solid ${GREEN}44`, fontWeight: 700 }}>
                    RECOMMENDED
                  </span>
                </div>
                <a href="https://www.oanda.com" target="_blank" rel="noreferrer"
                  style={{ fontSize: 8.5, color: BLUE, textDecoration: 'none' }}>oanda.com ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[['Regulated','FCA · NFA · ASIC'],['Pairs','70+ currency pairs'],['Spreads','From 0.0 pips']].map(([k,v]) => (
                  <div key={k} style={{ padding: '4px 6px', borderRadius: 3, background: BG, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 7.5, color: MUTED }}>{k}</div>
                    <div style={{ fontSize: 8.5, color: '#d4e2f8', fontWeight: 700, marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
                Tier-1 regulated broker. Free practice account. REST API + FIX API.
                No minimum deposit for demo · Live from $1.
              </div>
              <StepList steps={[
                'Open account at oanda.com (practice is free)',
                'Dashboard → Manage Funds → API Access',
                'Generate an API token',
                'Copy your Account ID from the dashboard',
              ]} />
            </div>

            {/* OANDA config form */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#d4e2f8', marginBottom: 10,
                letterSpacing: '0.05em' }}>CONFIGURE OANDA</div>
              <Row label="Account ID">
                <Input value={oaAccount} onChange={setOaAccount} placeholder="001-001-XXXXXXX-001" />
              </Row>
              <Row label="API Token">
                <Input value={oaKey} onChange={setOaKey} placeholder="Paste API token here" type="password" />
              </Row>
              <Row label="Environment">
                <Toggle active={oaPractice} onChange={setOaPractice} labelOn="Practice (Demo)" labelOff="Live (Real)" />
              </Row>
              <button onClick={testOanda} disabled={oaStatus === 'testing' || !oaAccount || !oaKey}
                style={{
                  width: '100%', padding: '7px 0', fontSize: 10, fontWeight: 800, borderRadius: 5,
                  cursor: (!oaAccount || !oaKey || oaStatus === 'testing') ? 'not-allowed' : 'pointer',
                  background: CYAN + '18', border: `1px solid ${CYAN}44`, color: CYAN,
                  fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'all .15s',
                }}>
                Test OANDA Connection
              </button>
              <StatusChip status={oaStatus} msg={oaMsg} />
            </div>

            {/* Interactive Brokers mention */}
            <div style={{ padding: '8px 10px', borderRadius: 4, background: CARD,
              border: `1px solid ${BORDER}`, opacity: 0.7 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, marginBottom: 2 }}>
                Interactive Brokers (Advanced)
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5 }}>
                Professional traders. Lowest forex spreads. Globally regulated.
                Complex TWS API — custom integration required.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Crypto ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <SectionHeader icon="₿" title="Crypto (Spot + Futures)" color={AMBER}
          badge="Binance" open={open === 'crypto'} onToggle={() => toggle('crypto')} />
        {open === 'crypto' && (
          <div style={{ padding: '14px 14px', background: BG,
            border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 6px 6px' }}>

            {/* Binance card */}
            <div style={{ padding: '10px 12px', borderRadius: 5, marginBottom: 12,
              background: CARD, border: `1px solid ${AMBER}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: AMBER }}>Binance</span>
                  <span style={{ marginLeft: 6, fontSize: 7.5, padding: '1px 5px', borderRadius: 3,
                    background: GREEN + '18', color: GREEN, border: `1px solid ${GREEN}44`, fontWeight: 700 }}>
                    RECOMMENDED
                  </span>
                </div>
                <a href="https://www.binance.com" target="_blank" rel="noreferrer"
                  style={{ fontSize: 8.5, color: BLUE, textDecoration: 'none' }}>binance.com ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[['Pairs','600+ pairs'],['Fees','0.1% spot'],['APIs','REST + WS']].map(([k,v]) => (
                  <div key={k} style={{ padding: '4px 6px', borderRadius: 3, background: BG, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 7.5, color: MUTED }}>{k}</div>
                    <div style={{ fontSize: 8.5, color: '#d4e2f8', fontWeight: 700, marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
                World's largest crypto exchange by volume. Spot & Futures.
                Testnet available for safe development and testing.
              </div>
              <StepList steps={[
                'Open account at binance.com',
                'Complete KYC (identity verification)',
                'Profile → API Management → Create API Key',
                'Enable "Enable Trading" permission',
                'Add IP restriction for security (recommended)',
              ]} />
            </div>

            {/* Binance config form */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#d4e2f8', marginBottom: 10,
                letterSpacing: '0.05em' }}>CONFIGURE BINANCE</div>
              <Row label="API Key">
                <Input value={bnKey} onChange={setBnKey} placeholder="Paste Binance API key" type="password" />
              </Row>
              <Row label="Secret Key">
                <Input value={bnSecret} onChange={setBnSecret} placeholder="Paste Binance secret key" type="password" />
              </Row>
              <Row label="Environment">
                <Toggle active={bnTestnet} onChange={setBnTestnet} labelOn="Testnet (Safe)" labelOff="Mainnet (Real)" />
              </Row>
              <button onClick={testBinance} disabled={bnStatus === 'testing' || !bnKey || !bnSecret}
                style={{
                  width: '100%', padding: '7px 0', fontSize: 10, fontWeight: 800, borderRadius: 5,
                  cursor: (!bnKey || !bnSecret || bnStatus === 'testing') ? 'not-allowed' : 'pointer',
                  background: AMBER + '18', border: `1px solid ${AMBER}44`, color: AMBER,
                  fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'all .15s',
                }}>
                Test Binance Connection
              </button>
              <StatusChip status={bnStatus} msg={bnMsg} />
            </div>
          </div>
        )}
      </div>

      {/* Footer warning */}
      <div style={{ padding: '8px 10px', borderRadius: 5, background: RED + '0a',
        border: `1px solid ${RED}22`, fontSize: 8.5, color: MUTED, lineHeight: 1.6 }}>
        <strong style={{ color: RED }}>Security note:</strong> Credentials saved here are stored in browser
        localStorage — never share your screen or export them. For production deployments, set
        OANDA_ACCOUNT_ID, OANDA_API_KEY, BINANCE_API_KEY, BINANCE_SECRET_KEY as server-side
        environment variables in your .env.local file.
      </div>
    </div>
  )
}
