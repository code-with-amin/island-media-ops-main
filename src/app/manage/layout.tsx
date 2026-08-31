import { AppShell } from '@/ui/AppShell'
import { getSession } from '@/server/session'
import { EmptyState } from '@/ui/primitives'

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <AppShell
      surface="Management"
      nav={[
        { href: '/manage', label: 'Today' },
        { href: '/manage/requests', label: 'Requests' },
        { href: '/manage/contracts', label: 'Contracts' },
        { href: '/manage/work-orders', label: 'Field work' },
        { href: '/manage/inventory', label: 'Inventory' },
        { href: '/manage/clients', label: 'Clients' },
      ]}
    >
      {session?.role === 'manager' ? (
        children
      ) : (
        <EmptyState
          title="Management is for agency accounts"
          description="Use the account switcher above to sign in as Morgan Reed, the seeded manager."
        />
      )}
    </AppShell>
  )
}
