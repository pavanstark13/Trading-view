import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TradeOS — Professional AI Trading Terminal',
  description:
    'Institutional-grade AI trading operating system with NSE F&O scanner, strategy backtesting, risk management, portfolio tracking, and smart order execution.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable}`}
        style={{ height: '100%', margin: 0 }}
      >
        {children}
      </body>
    </html>
  )
}
