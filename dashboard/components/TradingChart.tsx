'use client'
import { useEffect, useRef } from 'react'
import type { Candle } from '@/lib/indicators'

interface Props { candles: Candle[]; pair: string }

export default function TradingChart({ candles, pair }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    const init = async () => {
      const lc = await import('lightweight-charts')

      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

      const chart = lc.createChart(containerRef.current!, {
        layout: {
          background: { color: '#0d1117' },
          textColor: '#8b949e',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#21262d' },
          horzLines: { color: '#21262d' },
        },
        rightPriceScale: { borderColor: '#30363d', scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
        width:  containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
      })

      chartRef.current = chart

      // Candles
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: '#00c853', downColor: '#ff1744',
        borderUpColor: '#00c853', borderDownColor: '#ff1744',
        wickUpColor: '#00c853', wickDownColor: '#ff1744',
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candleSeries.setData(candles.map(k => ({ time: k.time as any, open: k.open, high: k.high, low: k.low, close: k.close })))

      // EMA helper
      const calcEma = (arr: number[], p: number) => {
        const k = 2 / (p + 1); let prev = arr[0]
        return arr.map((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); return prev })
      }
      const closes = candles.map(c => c.close)
      const times  = candles.map(c => c.time as number)

      const lineOpts: { period: number; color: string; width: 1 | 2 }[] = [
        { period: 20,  color: '#00e5ff', width: 1 },
        { period: 50,  color: '#ffd600', width: 1 },
        { period: 200, color: '#ff6d00', width: 2 },
      ]
      for (const { period, color, width } of lineOpts) {
        const s = chart.addSeries(lc.LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.setData(calcEma(closes, period).map((v, i) => ({ time: times[i] as any, value: v })))
      }

      // VWAP
      let cumPV = 0, cumV = 0
      const vwapData = candles.map(k => {
        const tp = (k.high + k.low + k.close) / 3
        const v = k.volume ?? 1
        cumPV += tp * v; cumV += v
        return { time: k.time as unknown as import('lightweight-charts').UTCTimestamp, value: cumPV / cumV }
      })
      const vwapSeries = chart.addSeries(lc.LineSeries, {
        color: '#7b1fa2', lineWidth: 2 as 2, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
      })
      vwapSeries.setData(vwapData)

      chart.timeScale().fitContent()

      const ro = new ResizeObserver(() => {
        if (containerRef.current)
          chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
      })
      containerRef.current && ro.observe(containerRef.current)
      return () => ro.disconnect()
    }

    init()
    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [candles])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position:'absolute', top:10, left:12, fontSize:13, fontWeight:700,
        color:'#e6edf3', pointerEvents:'none', textShadow:'0 1px 4px #0d1117' }}>
        {pair}
      </div>
      {/* Legend */}
      <div style={{ position:'absolute', top:10, right:12, display:'flex', gap:10,
        fontSize:9, color:'#8b949e', pointerEvents:'none' }}>
        {[['EMA 20','#00e5ff'],['EMA 50','#ffd600'],['EMA 200','#ff6d00'],['VWAP','#7b1fa2']].map(([l,c]) => (
          <span key={l}><span style={{ color: c }}>─</span> {l}</span>
        ))}
      </div>
    </div>
  )
}
