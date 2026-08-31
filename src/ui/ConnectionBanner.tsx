'use client'

import { useEffect, useState } from 'react'

/**
 * Connection state.
 *
 * A fitter working inside a depot or a multi-storey car park loses signal
 * routinely. Saying so plainly, before they tap something that will fail, is
 * the difference between "the app is broken" and "I'll do that when I'm
 * outside".
 */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null

  return (
    <p
      role="status"
      className="bg-caution px-4 py-2 text-center text-xs font-medium text-white"
    >
      No signal. Updates are saved on this phone and sent when you reconnect.
    </p>
  )
}
