import { RegisterForm } from '@/ui/RegisterForm'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams

  return (
    <div className="mx-auto max-w-lg">
      <p className="eyebrow">New account</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
        Create your Island Media account
      </h1>
      <p className="mt-2 text-ink-600">
        You do not need a contract with us to sign up. An account lets you shortlist media, send
        enquiries and follow anything you go on to book.
      </p>

      <div className="mt-6">
        <RegisterForm next={params.next} />
      </div>
    </div>
  )
}
