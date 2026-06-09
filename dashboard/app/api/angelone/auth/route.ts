import { NextRequest, NextResponse } from 'next/server'
import { angelLogin, generateTOTP } from '@/lib/angelone'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, clientId, password, totpSecret, totpCode } = await req.json()
    if (!apiKey || !clientId || !password) {
      return NextResponse.json({ error: 'apiKey, clientId, password are required' }, { status: 400 })
    }

    const totp = totpSecret ? generateTOTP(totpSecret) : (totpCode ?? '')
    if (!totp) {
      return NextResponse.json({ error: 'Provide either totpSecret (auto-generate) or totpCode (manual)' }, { status: 400 })
    }

    const session = await angelLogin(apiKey, clientId, password, totp)
    const res = NextResponse.json({ ok: true, name: session.name, email: session.email })
    // Store creds in HttpOnly cookies — jwtToken expires ~24h on Angel One
    res.cookies.set('ao_jwt',     session.jwtToken,     { httpOnly: true, sameSite: 'strict', maxAge: 82800 })
    res.cookies.set('ao_refresh', session.refreshToken, { httpOnly: true, sameSite: 'strict', maxAge: 82800 })
    res.cookies.set('ao_feed',    session.feedToken,    { httpOnly: true, sameSite: 'strict', maxAge: 82800 })
    res.cookies.set('ao_apikey',  apiKey,               { httpOnly: true, sameSite: 'strict', maxAge: 82800 })
    return res
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Auth failed' }, { status: 401 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('ao_jwt')
  res.cookies.delete('ao_refresh')
  res.cookies.delete('ao_feed')
  res.cookies.delete('ao_apikey')
  return res
}
