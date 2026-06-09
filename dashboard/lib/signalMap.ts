export const SIGNAL_MAP: Record<string, {
  label: string; exchange: 'MCX' | 'CDS' | null; searchQuery: string
  lotSize: number; note: string; available: boolean
}> = {
  XAUUSD: { label: 'MCX Gold (MiniGold)',    exchange: 'MCX', searchQuery: 'GOLDM',      lotSize: 100,  note: 'MiniGold 100g contract. MCX commodity.', available: true  },
  XAGUSD: { label: 'MCX Silver Micro',       exchange: 'MCX', searchQuery: 'SILVERMIC',   lotSize: 5000, note: 'Silver Micro 5kg contract. MCX commodity.', available: true },
  EURUSD: { label: 'NSE EURINR (correlated)',exchange: 'CDS', searchQuery: 'EURINR',      lotSize: 1000, note: 'EURINR ≠ EURUSD — INR-based. Correlated but not the same instrument.', available: true },
  GBPUSD: { label: 'NSE GBPINR (correlated)',exchange: 'CDS', searchQuery: 'GBPINR',      lotSize: 1000, note: 'GBPINR ≠ GBPUSD — INR-based. Correlated signal reference only.', available: true },
  USDJPY: { label: 'NSE USDINR (partial)',   exchange: 'CDS', searchQuery: 'USDINR',      lotSize: 1000, note: 'USDINR only. USDJPY has no direct CDS equivalent.', available: true },
  USDCHF: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'USDCHF has no Angel One equivalent. Use a forex broker.', available: false },
  USDCAD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'USDCAD has no Angel One equivalent. Use a forex broker.', available: false },
  AUDUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'AUDUSD has no Angel One equivalent. Use a forex broker.', available: false },
  NZDUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'NZDUSD has no Angel One equivalent. Use a forex broker.', available: false },
  GBPJPY: { label: 'NSE GBPINR (partial)',   exchange: 'CDS', searchQuery: 'GBPINR',      lotSize: 1000, note: 'GBP leg only via GBPINR. Partial correlation.', available: true },
  EURJPY: { label: 'NSE EURINR (partial)',   exchange: 'CDS', searchQuery: 'EURINR',      lotSize: 1000, note: 'EUR leg only via EURINR. Partial correlation.', available: true },
  EURCAD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'No Angel One equivalent.', available: false },
  BTCUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'Crypto not supported on Angel One. Use CoinDCX or WazirX.', available: false },
  ETHUSD: { label: 'Not available',          exchange: null,  searchQuery: '',             lotSize: 0,    note: 'Crypto not supported on Angel One. Use CoinDCX or WazirX.', available: false },
}
