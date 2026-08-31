import type { Metadata, Viewport } from 'next'
import { FieldShell } from '@/ui/FieldShell'

export const metadata: Metadata = {
  title: 'Island Media Co — Field',
}

/** Sized for a phone held in one hand, not a scaled-down desktop page. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#12615c',
}

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldShell>{children}</FieldShell>
}
