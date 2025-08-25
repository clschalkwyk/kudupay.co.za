import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <div className="bg-kudu-gray-light text-white text-sm p-2 text-center">Offline. Balances may be outdated.</div>
  )
}
