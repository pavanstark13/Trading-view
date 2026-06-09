// Indian market instrument definitions — NSE indices, top F&O stocks
export type Exchange = 'NSE' | 'BSE' | 'NFO' | 'MCX' | 'CDS'

export interface IndiaInstrument {
  symbol:     string    // dashboard key (e.g. "NIFTY")
  yahoo:      string    // Yahoo Finance ticker (e.g. "^NSEI")
  label:      string
  exchange:   Exchange
  lotSize:    number    // F&O lot size (1 for equity)
  pipSize:    number    // tick size for P&L calc
  decimals:   number
  category:  'index' | 'stock' | 'metal' | 'currency'
  nfoSearch:  string    // Angel One NFO search query for futures/options
}

export const INDIA_INSTRUMENTS: IndiaInstrument[] = [
  // ── Indices ────────────────────────────────────────────────────────────────
  { symbol: 'NIFTY',     yahoo: '^NSEI',      label: 'Nifty 50',        exchange: 'NSE', lotSize: 50,   pipSize: 0.05, decimals: 2, category: 'index', nfoSearch: 'NIFTY'      },
  { symbol: 'BANKNIFTY', yahoo: '^NSEBANK',   label: 'Bank Nifty',      exchange: 'NSE', lotSize: 15,   pipSize: 0.05, decimals: 2, category: 'index', nfoSearch: 'BANKNIFTY'  },
  { symbol: 'FINNIFTY',  yahoo: '^CNXFIN',    label: 'Fin Nifty',       exchange: 'NSE', lotSize: 40,   pipSize: 0.05, decimals: 2, category: 'index', nfoSearch: 'FINNIFTY'   },
  { symbol: 'MIDCPNIFTY',yahoo: '^NSMIDCP50', label: 'Midcap Nifty',    exchange: 'NSE', lotSize: 75,   pipSize: 0.05, decimals: 2, category: 'index', nfoSearch: 'MIDCPNIFTY' },
  // ── Top F&O Stocks ─────────────────────────────────────────────────────────
  { symbol: 'RELIANCE',  yahoo: 'RELIANCE.NS', label: 'Reliance Inds',  exchange: 'NSE', lotSize: 250,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'RELIANCE'   },
  { symbol: 'TCS',       yahoo: 'TCS.NS',      label: 'TCS',            exchange: 'NSE', lotSize: 150,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'TCS'        },
  { symbol: 'INFY',      yahoo: 'INFY.NS',     label: 'Infosys',        exchange: 'NSE', lotSize: 400,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'INFY'       },
  { symbol: 'HDFCBANK',  yahoo: 'HDFCBANK.NS', label: 'HDFC Bank',      exchange: 'NSE', lotSize: 550,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'HDFCBANK'   },
  { symbol: 'ICICIBANK', yahoo: 'ICICIBANK.NS',label: 'ICICI Bank',     exchange: 'NSE', lotSize: 700,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'ICICIBANK'  },
  { symbol: 'SBIN',      yahoo: 'SBIN.NS',     label: 'SBI',            exchange: 'NSE', lotSize: 1500, pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'SBIN'       },
  { symbol: 'WIPRO',     yahoo: 'WIPRO.NS',    label: 'Wipro',          exchange: 'NSE', lotSize: 1500, pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'WIPRO'      },
  { symbol: 'AXISBANK',  yahoo: 'AXISBANK.NS', label: 'Axis Bank',      exchange: 'NSE', lotSize: 625,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'AXISBANK'   },
  { symbol: 'TATAMOTORS',yahoo: 'TATAMOTORS.NS',label: 'Tata Motors',   exchange: 'NSE', lotSize: 2400, pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'TATAMOTORS' },
  { symbol: 'BAJFINANCE',yahoo: 'BAJFINANCE.NS',label: 'Bajaj Finance', exchange: 'NSE', lotSize: 125,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'BAJFINANCE' },
  { symbol: 'HINDUNILVR',yahoo: 'HINDUNILVR.NS',label: 'HUL',           exchange: 'NSE', lotSize: 300,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'HINDUNILVR' },
  { symbol: 'ADANIENT',  yahoo: 'ADANIENT.NS', label: 'Adani Ent.',     exchange: 'NSE', lotSize: 250,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'ADANIENT'   },
  { symbol: 'LT',        yahoo: 'LT.NS',       label: 'L&T',            exchange: 'NSE', lotSize: 175,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'LT'         },
  { symbol: 'MARUTI',    yahoo: 'MARUTI.NS',   label: 'Maruti Suzuki',  exchange: 'NSE', lotSize: 100,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'MARUTI'     },
  { symbol: 'SUNPHARMA', yahoo: 'SUNPHARMA.NS',label: 'Sun Pharma',     exchange: 'NSE', lotSize: 700,  pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'SUNPHARMA'  },
  { symbol: 'ONGC',      yahoo: 'ONGC.NS',     label: 'ONGC',           exchange: 'NSE', lotSize: 1925, pipSize: 0.05, decimals: 2, category: 'stock', nfoSearch: 'ONGC'       },
]

export const INDIA_MAP: Record<string, IndiaInstrument> =
  Object.fromEntries(INDIA_INSTRUMENTS.map(i => [i.symbol, i]))

export const INDIA_SYMBOLS = INDIA_INSTRUMENTS.map(i => i.symbol)
export const INDEX_SYMBOLS  = INDIA_INSTRUMENTS.filter(i => i.category === 'index').map(i => i.symbol)
export const STOCK_SYMBOLS  = INDIA_INSTRUMENTS.filter(i => i.category === 'stock').map(i => i.symbol)
