'use client'
import dynamic from 'next/dynamic'

const Shell = dynamic(() => import('@/components/os/Shell'), { ssr: false })

export default function Page() {
  return <Shell />
}
