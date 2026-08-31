import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/**
 * One superfamily across all three interfaces. Plex was drawn for technical
 * and signage contexts, which is what this is: dense operational data about
 * physical things on streets.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Island Media Co',
  description:
    'Out-of-home advertising operations — management, field work and client portal.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${plexSans.variable} ${plexMono.variable}`}>
      {/*
        Browser extensions — screen recorders, password managers, translators —
        add attributes to <body> before React hydrates, which React reports as a
        mismatch we did not cause and cannot prevent. Suppressing it here covers
        this element's own attributes only, one level deep, so a real hydration
        bug anywhere in the tree still surfaces.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
