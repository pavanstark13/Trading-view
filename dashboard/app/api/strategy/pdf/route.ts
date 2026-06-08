export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    // Use path form to avoid pdf-parse test-file side effect
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse')
    const result = await pdfParse(buffer)
    const text = (result.text as string).replace(/\s+/g, ' ').trim().slice(0, 8000)
    return NextResponse.json({ text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
