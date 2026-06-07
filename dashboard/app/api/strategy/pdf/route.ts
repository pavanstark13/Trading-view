export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Use pdf-parse via direct lib path to avoid test-file loading issue in Next.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse')
    const data = await pdfParse(buffer)

    return NextResponse.json({
      text: (data.text as string).substring(0, 6000),
      pages: data.numpages as number,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Parse failed' }, { status: 500 })
  }
}
