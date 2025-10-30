import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Translation Ranker',
  description: 'Annotate and rerank translation options',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

