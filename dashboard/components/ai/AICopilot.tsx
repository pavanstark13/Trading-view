'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  type?: 'market' | 'trade' | 'risk' | 'strategy' | 'journal' | 'general'
}

const QUICK_PROMPTS = [
  { label: 'Market Summary', icon: '📊', q: 'Give me a quick market summary for today' },
  { label: 'Risk Check',     icon: '🛡', q: 'Review my current risk exposure and warn me of any issues' },
  { label: 'Best Setup',     icon: '🎯', q: 'What is the best trading setup right now?' },
  { label: 'Journal Review', icon: '📓', q: 'Analyze my recent trading journal and give me insights' },
  { label: 'Strategy',       icon: '⚙', q: 'Suggest a strategy for current market conditions' },
  { label: 'Learn ICT',      icon: '📚', q: 'Explain ICT Order Blocks and how to trade them' },
]

const BOT_RESPONSES: Record<string, string> = {
  market: `**Market Summary — ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}**

NIFTY 50 is trading near the 24,350 level with moderate bullish momentum. Key observations:

• **Trend:** Uptrend on daily, consolidating on 1h
• **Volume:** Below average — institutional caution
• **MACD:** Bullish cross on 15m, neutral on 1h
• **RSI:** 58 on daily — room to move higher

**Key Levels:**
- Support: 24,150 | 23,900
- Resistance: 24,500 | 24,780

**Sector Rotation:** Banking & IT leading. Pharma lagging.

⚡ High-probability setup: HDFCBANK on 15m — OB retest near 1,695`,

  risk: `**Risk Analysis — Current Session**

Your current exposure looks manageable but monitor these:

• Daily P&L: -₹2,450 (49% of daily limit ⚠)
• Open positions: 3 (60% of max allowed)
• Largest position: NIFTY — ₹1.2L exposure

**Warnings:**
1. ⚠ You're at 49% of daily loss limit. Be selective on new trades.
2. ⚠ NIFTY position size is slightly above your 1% risk rule.
3. ✓ All SLs are set — good discipline.

**Recommendation:** Avoid over-trading. Max 1 more trade today. Keep size ≤ 0.5% risk.`,

  setup: `**High-Probability Setups Right Now**

1. **NIFTY 15m — BOS Continuation**
   - Price broke structure above 24,300
   - FVG exists at 24,260-24,280 (retest zone)
   - Entry: 24,270 | SL: 24,190 | Target: 24,480
   - R:R: 1:2.6 ✓

2. **HDFCBANK 1h — OB Retest**
   - Bullish OB at 1,695-1,705
   - MACD turning bullish
   - Entry: 1,700 | SL: 1,682 | Target: 1,748
   - R:R: 1:2.7 ✓

3. **EURUSD 4h — Institutional Order Flow**
   - Weekly bias: Bullish above 1.0820
   - OTE zone: 1.0825-1.0835
   - Entry: 1.0830 | SL: 1.0805 | Target: 1.0895
   - R:R: 1:2.6 ✓`,

  journal: `**Journal Analysis — Last 30 Days**

Based on your 5 recorded trades:

**Performance Metrics:**
- Win Rate: 80% (4W / 1L)
- Profit Factor: 3.2 (excellent)
- Avg R:R achieved: 2.4:1

**Strengths:**
✓ Excellent discipline on winners — you let them run
✓ ICT setups performing well (71% WR)
✓ No revenge trades detected

**Areas to Improve:**
⚠ XAUUSD trade — you moved your SL out of fear. This cost you ₹2,000.
⚠ ANXIOUS emotion correlated with losses. Trade smaller when feeling uncertain.

**Recommendation:**
Your EMA Breakout and OB Retest setups have the highest win rates. Focus on those. Avoid trading when anxious — take a break instead.`,

  strategy: `**Strategy Recommendation for Current Market**

Given the current consolidation phase on NIFTY, I recommend:

**Primary Strategy: ICT Order Block + FVG**
- Works best in this liquidity environment
- Use 15m for entries, 1h for bias

**Setup Rules:**
1. Identify daily bias (bullish above 24,200)
2. Mark all OBs on 1h chart
3. Wait for price to return to OB on 15m
4. Confirm with FVG fill + BOS
5. Enter with 1% risk, target 2:1 minimum

**Avoid:**
- Trading during news (RBI minutes at 2pm today)
- MACD crossover strategies in current range

**Backtest Results (6 months NIFTY):**
Win Rate: 67% | PF: 1.9 | Sharpe: 1.42`,

  ict: `**ICT Order Blocks — Complete Guide**

**What is an Order Block?**
An Order Block (OB) is the last bullish or bearish candle before a significant move. It represents institutional order flow.

**Types:**
- **Bullish OB:** Last bearish candle before a strong bullish impulse
- **Bearish OB:** Last bullish candle before a strong bearish impulse

**How to Trade:**
1. Identify the OB on 1h or 4h chart
2. Wait for price to pull back to the OB zone
3. Look for confirmation on lower TF (15m, 5m):
   - BOS (Break of Structure)
   - FVG (Fair Value Gap) fill
   - Rejection candle
4. Enter at the 50% of the OB candle (OTE zone)
5. SL: Below the OB low (bullish) / Above OB high (bearish)

**Key Rules:**
⚡ A touched OB loses strength — prefer fresh OBs
⚡ Combine with Liquidity Sweeps for highest accuracy
⚡ Align with HTF (Higher Time Frame) bias

**Example:** NIFTY 1h bullish OB at 24,260-24,300 with 1h BOS — target previous high at 24,580`,
}

function getResponse(input: string): { content: string; type: Message['type'] } {
  const lower = input.toLowerCase()
  if (lower.includes('market') || lower.includes('summary') || lower.includes('nifty') || lower.includes('today'))
    return { content: BOT_RESPONSES.market, type: 'market' }
  if (lower.includes('risk') || lower.includes('exposure') || lower.includes('limit'))
    return { content: BOT_RESPONSES.risk, type: 'risk' }
  if (lower.includes('setup') || lower.includes('trade') || lower.includes('entry') || lower.includes('signal'))
    return { content: BOT_RESPONSES.setup, type: 'trade' }
  if (lower.includes('journal') || lower.includes('review') || lower.includes('performance') || lower.includes('analysis'))
    return { content: BOT_RESPONSES.journal, type: 'journal' }
  if (lower.includes('strategy') || lower.includes('suggest') || lower.includes('recommend'))
    return { content: BOT_RESPONSES.strategy, type: 'strategy' }
  if (lower.includes('ict') || lower.includes('order block') || lower.includes('ob') || lower.includes('fvg') || lower.includes('smc') || lower.includes('learn'))
    return { content: BOT_RESPONSES.ict, type: 'strategy' }
  return {
    content: `I understand you're asking about: **"${input}"**\n\nAs your AI trading copilot, I can help with:\n\n• **Market Analysis** — current levels, bias, key zones\n• **Risk Management** — position sizing, exposure checks\n• **Trade Setups** — high-probability entries with SL/Target\n• **Strategy** — backtest results, optimization tips\n• **Journal Insights** — pattern analysis, mistake tracking\n• **Education** — ICT, SMC, technical analysis\n\nTry asking me: "What is the best setup right now?" or "Review my risk."`,
    type: 'general',
  }
}

function TypeBadge({ type }: { type?: Message['type'] }) {
  if (!type) return null
  const map: Record<string, [string, string]> = {
    market:   ['MARKET', 'var(--os-blue)'],
    trade:    ['SETUP',  'var(--os-green)'],
    risk:     ['RISK',   'var(--os-red)'],
    strategy: ['STRATEGY','var(--os-purple)'],
    journal:  ['JOURNAL','var(--os-amber)'],
    general:  ['AI',     'var(--os-cyan)'],
  }
  const [label, color] = map[type] ?? ['AI', 'var(--os-cyan)']
  return (
    <span style={{ fontSize:8, padding:'1px 5px', borderRadius:3, fontWeight:700,
      background:`${color}18`, color, border:`1px solid ${color}44`, marginBottom:4, display:'inline-block' }}>
      {label}
    </span>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const lines = msg.content.split('\n')

  const renderLine = (line: string, i: number) => {
    const bold = line.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--os-t1)">$1</strong>')
    return (
      <div key={i} style={{ lineHeight:1.65,
        marginBottom: line === '' ? 6 : 0,
        color: line.startsWith('•') || line.startsWith('-') || line.startsWith('⚠') || line.startsWith('✓') || line.startsWith('⚡') ? 'var(--os-t2)' : 'inherit' }}
        dangerouslySetInnerHTML={{ __html: bold }} />
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom:12 }}>
      {!isUser && <TypeBadge type={msg.type} />}
      <div style={{
        maxWidth:'88%', padding: isUser ? '8px 12px' : '10px 14px',
        background: isUser ? 'var(--os-blue)' : 'var(--os-surface2)',
        borderRadius: isUser ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
        border: isUser ? 'none' : '1px solid var(--os-border)',
        color: isUser ? '#fff' : 'var(--os-t2)',
        fontSize:11.5, fontFamily:'var(--font-ui)',
      }}>
        {isUser ? msg.content : lines.map(renderLine)}
      </div>
      <div style={{ fontSize:9, color:'var(--os-t3)', marginTop:3 }}>
        {msg.timestamp.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
      </div>
    </div>
  )
}

const INIT_MSG: Message = {
  id: 'init',
  role: 'assistant',
  content: `Hello! I'm your **AI Trading Copilot** — powered by intelligent market analysis.

I can help you with:
• 📊 **Market Summaries** — NIFTY, Forex, Crypto
• 🎯 **Trade Setups** — ICT, SMC, EMA, VWAP
• 🛡 **Risk Warnings** — exposure, limits, position sizing
• 📓 **Journal Insights** — patterns, mistakes, psychology
• ⚙ **Strategy** — backtest results, optimization

Use the quick prompts below or ask me anything about trading.`,
  timestamp: new Date(),
  type: 'general',
}

export default function AICopilot({ embedded = false }: { embedded?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([INIT_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  const send = (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')

    const userMsg: Message = { id: Date.now().toString(), role:'user', content:q, timestamp: new Date() }
    setMessages(m => [...m, userMsg])
    setLoading(true)

    setTimeout(() => {
      const { content, type } = getResponse(q)
      const aiMsg: Message = { id:(Date.now()+1).toString(), role:'assistant', content, timestamp:new Date(), type }
      setMessages(m => [...m, aiMsg])
      setLoading(false)
    }, 600 + Math.random() * 800)
  }

  const clearChat = () => setMessages([INIT_MSG])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--os-bg)' }}>
      {/* Header */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--os-border)', background:'var(--os-surface)',
        display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--os-green)', boxShadow:'0 0 6px var(--os-green)', animation:'os-pulse 2s ease infinite' }} />
        <span style={{ fontSize:12, fontWeight:800, color:'var(--os-t1)', letterSpacing:'0.05em' }}>AI COPILOT</span>
        <span className="os-badge os-badge-green" style={{ fontSize:8 }}>ONLINE</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          <button className="os-btn" style={{ fontSize:9, padding:'2px 8px' }} onClick={clearChat}>Clear</button>
        </div>
      </div>

      {/* Quick prompts */}
      <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--os-border)', background:'var(--os-surface)', flexShrink:0 }}>
        <div style={{ fontSize:9, color:'var(--os-t3)', marginBottom:5, letterSpacing:'0.06em' }}>QUICK ACTIONS</div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {QUICK_PROMPTS.map(p => (
            <button key={p.label} onClick={() => send(p.q)}
              style={{ padding:'3px 9px', fontSize:9.5, borderRadius:4, cursor:'pointer',
                background:'var(--os-surface2)', border:'1px solid var(--os-border)',
                color:'var(--os-t2)', fontFamily:'inherit', transition:'all .1s',
                display:'flex', alignItems:'center', gap:4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--os-blue)'; (e.currentTarget as HTMLElement).style.color='var(--os-t1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--os-border)'; (e.currentTarget as HTMLElement).style.color='var(--os-t2)' }}>
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 12px', display:'flex', flexDirection:'column' }}>
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
            <div style={{ padding:'10px 14px', background:'var(--os-surface2)', borderRadius:'3px 12px 12px 12px',
              border:'1px solid var(--os-border)', display:'flex', gap:4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--os-blue)',
                  animation:'os-pulse 1.2s ease infinite', animationDelay:`${i*0.2}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--os-border)', background:'var(--os-surface)', flexShrink:0 }}>
        <div style={{ display:'flex', gap:6 }}>
          <input
            className="os-input" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()}
            placeholder="Ask about market, risk, setups, strategy…"
            style={{ flex:1, fontSize:11 }}
            disabled={loading}
          />
          <button className="os-btn os-btn-primary" onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{ padding:'0 16px', fontSize:11, minWidth:60 }}>
            {loading ? '…' : '→'}
          </button>
        </div>
        <div style={{ fontSize:9, color:'var(--os-t3)', marginTop:5, textAlign:'center' }}>
          Enter to send · Responses are AI-simulated for demo purposes
        </div>
      </div>
    </div>
  )
}
