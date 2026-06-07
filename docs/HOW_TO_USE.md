# SMC / ICT TradingView Suite — How to Use

## Files Overview

| File | Type | Purpose |
|------|------|---------|
| `indicators/SMC_ICT_Complete.pine` | Indicator | Full SMC/ICT overlay |
| `indicators/Support_Resistance_Zones.pine` | Indicator | S/R + Supply/Demand + Pivots |
| `indicators/Liquidity_Sweep_Detector.pine` | Indicator | Liquidity sweeps + PO3 |
| `indicators/ICT_Killzones_Sessions.pine` | Indicator | Session boxes + killzone highlights |
| `strategies/SMC_ICT_Strategy.pine` | Strategy | SMC backtest strategy |
| `strategies/Multi_Confluence_Strategy.pine` | Strategy | Multi-confluence scored strategy |

---

## Adding to TradingView

1. Open TradingView → Pine Script Editor (bottom panel).
2. Click **New** → paste the contents of any `.pine` file.
3. Click **Add to chart** (or **Save** first, then **Add**).
4. For strategies, use **Strategy Tester** tab after adding.

---

## Indicator Details

### 1. SMC/ICT Complete Suite (`SMC_ICT_Complete.pine`)

Covers all core Smart Money Concepts in one overlay:

| Feature | Description |
|---------|-------------|
| **Order Blocks (OB)** | Last opposing candle before a structure impulse. Green = Bullish OB (demand), Red = Bearish OB (supply). Yellow = Breaker (mitigated OB). |
| **Fair Value Gaps (FVG)** | 3-candle imbalance — cyan = bullish (unfilled demand), orange = bearish (unfilled supply). Auto-deleted when mitigated. |
| **BOS** | Break of Structure — confirms trend continuation. |
| **CHoCH** | Change of Character — early reversal signal. |
| **Liquidity (BSL/SSL)** | Buy/Sell Side Liquidity pools (equal highs/lows). |
| **Premium/Discount** | Labels when price enters above/below 50% of the last N-bar range. |
| **Session Killzones** | Asia (purple), London (blue), NY (orange) session highlights. |

**Settings to tune:**
- `Swing Length` — higher = fewer but more significant structure breaks (default 10).
- `FVG Extend Bars` — how far gaps project right (default 50).
- `OB Extend Bars` — how far order block boxes project right (default 20).

---

### 2. Support & Resistance Zones (`Support_Resistance_Zones.pine`)

| Feature | Description |
|---------|-------------|
| **Pivot S/R Zones** | Multi-touch S/R zones. Shows touch count. |
| **Supply/Demand Zones** | Strong candle departure zones (volume-confirmed). |
| **Pivot Points** | Classic, Camarilla, or Fibonacci daily pivots (PP, R1–R3, S1–S3). |
| **HTF Previous H/L** | Previous daily/weekly high and low as key levels. |

---

### 3. Liquidity Sweep Detector (`Liquidity_Sweep_Detector.pine`)

| Feature | Description |
|---------|-------------|
| **BSL/SSL Sweeps** | Wicks above/below swing highs/lows that close back inside. |
| **Power of 3 (PO3)** | Labels Accumulation (Asia), Manipulation (London), Distribution (NY) phases. |
| **PDH/PDL/PWH/PWL** | Previous Day/Week High & Low plotted as liquidity targets. |

---

### 4. ICT Killzones & Sessions (`ICT_Killzones_Sessions.pine`)

| Killzone | Time (NY) | Significance |
|----------|-----------|-------------|
| Asia KZ | 20:00–23:00 | Accumulation / set daily range |
| London KZ | 02:00–05:00 | Manipulation / stop hunt |
| NY Open KZ | 07:00–10:00 | True move / distribution |
| London Close | 10:00–12:00 | Reversal / profit taking |

Shows session high/low lines + Asia range breakout alerts.

---

## Strategy Details

### SMC/ICT Strategy (`SMC_ICT_Strategy.pine`)

**Entry Logic (Long):**
1. Bullish market structure (last BOS was bullish)
2. Sell-side liquidity swept (stop hunt below recent swing low)
3. Price returns into a bullish Order Block
4. FVG present inside the OB (optional, toggle-able)
5. Price above EMA 200
6. Volume above average
7. RSI not overbought
8. Inside London or NY session

**Entry Logic (Short):** Mirror of above in bearish context.

**Risk Management:**
- SL: `close ± ATR × 1.5`
- TP: `close ± ATR × 3.0` (default 1:2 R:R)
- Optional trailing stop

---

### Multi-Confluence Strategy (`Multi_Confluence_Strategy.pine`)

Scores up to 7 signals and fires only when 3+ align:

| Signal | Long | Short |
|--------|------|-------|
| Trend (EMA stack) | EMAs bullish | EMAs bearish |
| EMA Cross | Fast crosses above slow | Fast crosses below slow |
| RSI | 50–70 | 30–50 |
| Stochastic | K > D, not extreme | K < D, not extreme |
| Volume spike | > 1.5× avg | > 1.5× avg |
| VWAP | Close above | Close below |
| S/R level | Near support | Near resistance |

Live confluence score shown in top-right table.

---

## Recommended Setup

**Scalping / Day Trading (5m–15m):**
- SMC/ICT Complete + ICT Killzones
- Trade during London KZ or NY Open KZ only
- Look for: Liquidity sweep → CHoCH → FVG entry

**Swing Trading (1H–4H–Daily):**
- S/R Zones + SMC/ICT Complete
- Multi-Confluence Strategy for confirmed entries
- Use HTF levels as targets

**Alerts to set:**
- BSL/SSL Sweep → potential reversal
- BOS/CHoCH → structure shift
- SMC Long/Short signal → entry
- Asia Range Break → trend continuation

---

## Disclaimer

These scripts are for **educational and research purposes only**. Past performance of any strategy does not guarantee future results. Always manage risk appropriately and never risk more than you can afford to lose.
