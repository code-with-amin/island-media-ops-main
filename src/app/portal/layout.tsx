import { AppShell } from '@/ui/AppShell'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      surface="Client portal"
      nav={[
        { href: '/portal', label: 'Overview' },
        { href: '/portal/contracts', label: 'Contracts' },
        { href: '/', label: 'Browse media' },
      ]}
    >
      {children}
    </AppShell>
  )
}
