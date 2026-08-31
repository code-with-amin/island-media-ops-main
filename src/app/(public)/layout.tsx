import { AppShell } from '@/ui/AppShell'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      surface="Catalogue"
      nav={[
        { href: '/', label: 'Browse media' },
        { href: '/portal', label: 'My account' },
      ]}
    >
      {children}
    </AppShell>
  )
}
