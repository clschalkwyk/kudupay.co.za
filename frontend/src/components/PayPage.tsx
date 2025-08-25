import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useLocation } from 'react-router-dom'
import { useStudentProfile } from '../hooks/useStudentProfile'
import { MerchantCategoryList } from '../constants/merchantCategories'

interface PublicMerchant {
  id: string
  businessName: string
  category?: string
  paymentId?: string
  logoDataUrl?: string | null
  whatsappNumber?: string | null
  isOnline?: boolean
}

interface StudentTransaction {
  id: string
  merchantId?: string
  merchantName?: string
  amount?: number
  amount_cents?: number
  category?: string
  created_at?: string
  [k: string]: any
}

// Canonicalize category to the exact label from MerchantCategoryList (case-insensitive)
function normalizeCategoryFront(input?: string | null): string | undefined {
  if (!input) return undefined
  const lc = String(input).toLowerCase()
  const all = Object.values(MerchantCategoryList) as string[]
  const match = all.find(c => c.toLowerCase() === lc)
  return match
}

function PayPage() {
  const { isAuthenticated, user, token } = useAuth()
  const { showInfo, showError, showSuccess } = useToast()
  const location = useLocation()
  const { profile, ensureProfileLoaded, refreshProfile } = useStudentProfile()

  const [merchantCode, setMerchantCode] = React.useState('')
  const [isLookingUp, setIsLookingUp] = React.useState(false)
  const [merchant, setMerchant] = React.useState<PublicMerchant | null>(null)
  const [amount, setAmount] = React.useState('')
  const [isLoadingStats, setIsLoadingStats] = React.useState(false)
  const [recentTx, setRecentTx] = React.useState<StudentTransaction[]>([])
  const [totalSpentAtMerchant, setTotalSpentAtMerchant] = React.useState(0)
  const [, setRecentNextCursor] = React.useState<string | null>(null)

  // Scanner state
  const [showScanner, setShowScanner] = React.useState(false)
  const [scannerError, setScannerError] = React.useState<string | null>(null)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)

  const stopScanner = React.useCallback(() => {
    try {
      const s = streamRef.current
      if (s) {
        s.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        try { (videoRef.current as any).srcObject = null } catch {}
        try { videoRef.current.pause() } catch {}
      }
    } catch {}
  }, [])

  const extractPaymentId = (raw: string): string | null => {
    if (!raw) return null
    try {
      const u = new URL(raw)
      const pid = u.searchParams.get('paymentId') || u.searchParams.get('code') || u.searchParams.get('m')
      return pid || raw
    } catch {
      return raw
    }
  }

  const onDecodeValue = React.useCallback(async (raw: string) => {
    const pid = extractPaymentId(raw)
    if (!pid) return
    setMerchantCode(pid)
    try {
      await lookupMerchant(pid)
    } finally {
      setShowScanner(false)
      stopScanner()
    }
  }, [lookupMerchant, stopScanner])

  const startScanner = React.useCallback(async () => {
    setScannerError(null)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScannerError('Camera not available on this device. Please type the code instead.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        try { (videoRef.current as any).srcObject = stream } catch {}
        await videoRef.current.play()
      }
      const hasBD = typeof (window as any).BarcodeDetector !== 'undefined'
      if (!hasBD) {
        setScannerError('QR scanning not supported in this browser. Please type the code.')
        return
      }
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      let stopped = false
      const loop = async () => {
        if (stopped) return
        try {
          const vid = videoRef.current as any
          if (vid && !vid.paused && !vid.ended) {
            const codes = await detector.detect(vid)
            if (Array.isArray(codes) && codes.length > 0) {
              const val = codes[0]?.rawValue || codes[0]?.raw || codes[0]?.displayValue || ''
              if (val) {
                stopped = true
                await onDecodeValue(String(val))
                return
              }
            }
          }
        } catch (e) {
          // ignore per frame errors
        }
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    } catch (e: any) {
      console.error('Scanner error', e)
      setScannerError(e?.message || 'Failed to start camera. Please type the code instead.')
    }
  }, [onDecodeValue])

  React.useEffect(() => {
    if (showScanner) {
      startScanner()
    } else {
      stopScanner()
    }
    return () => stopScanner()
  }, [showScanner, startScanner, stopScanner])

  React.useEffect(() => {
    if (!isAuthenticated) {
      showInfo('Login required', 'Please sign in as a student to make a payment.')
    }
  }, [isAuthenticated, showInfo])

  React.useEffect(() => {
    if (isAuthenticated && user?.role === 'student') {
      ensureProfileLoaded()
    }
  }, [isAuthenticated, user, ensureProfileLoaded])

  const apiBaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL)
    ? (import.meta as any).env.VITE_API_URL
    : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')

  async function lookupMerchant(codeRaw: string) {
    if (!isAuthenticated || user?.role !== 'student') return
    const code = codeRaw.trim()
    if (!code) {
      showError('Merchant code required', 'Please enter the merchant code (paymentId) to continue.')
      return
    }
    setIsLookingUp(true)
    setMerchant(null)
    try {
      const resp = await fetch(`${apiBaseUrl}/merchants/public/by-payment-id/${encodeURIComponent(code)}`)
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error || 'Failed to resolve merchant')
      }
      const m = data?.data?.merchant
      if (!m) throw new Error('Merchant not found')
      const pub: PublicMerchant = {
        id: String(m.id),
        businessName: String(m.businessName || 'Unknown Merchant'),
        category: m.category ? String(m.category) : undefined,
        paymentId: m.paymentId ? String(m.paymentId) : undefined,
        logoDataUrl: m.logoDataUrl ?? null,
        whatsappNumber: m.whatsappNumber ?? null,
        isOnline: Boolean(m.isOnline)
      }
      setMerchant(pub)
      showSuccess('Merchant found', `Ready to pay ${pub.businessName}. Enter an amount below.`)
      // Fetch stats for this merchant for the student
      fetchStatsForMerchant(pub)
    } catch (e: any) {
      console.error('Merchant lookup failed', e)
      showError('Lookup failed', e?.message || 'Could not find the merchant for that code.')
    } finally {
      setIsLookingUp(false)
    }
  }

  const handleContinue = async () => {
    await lookupMerchant(merchantCode)
  }

  // Deep-link support: read paymentId/code from URL
  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    const code = params.get('paymentId') || params.get('code') || params.get('m') || ''
    if (code && isAuthenticated && user?.role === 'student') {
      setMerchantCode(code)
      lookupMerchant(code)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, isAuthenticated, user?.role])

  const fetchStatsForMerchant = async (m: PublicMerchant) => {
    if (!isAuthenticated || user?.role !== 'student') return
    setIsLoadingStats(true)
    try {
      // Ensure budgets are available for remaining budget calculation
      await ensureProfileLoaded()

      // Load student's recent transactions from durable DB with cursor-based pagination
      if (token) {
        const base = `${apiBaseUrl}/students/${encodeURIComponent(String(user!.id))}/transactions?merchantId=${encodeURIComponent(m.id)}&limit=5&source=db`
        const resp = await fetch(base, { headers: { 'Authorization': `Bearer ${token}` } })
        const data = await resp.json()
        const txs = Array.isArray(data?.data?.transactions) ? data.data.transactions : []
        setRecentTx(txs.slice(0, 5))
        // Capture next_cursor for optional pagination
        const next = data?.data?.pagination?.next_cursor || null
        setRecentNextCursor(typeof next === 'string' ? next : null)
        const total = txs.reduce((sum: number, t: any) => {
          const amt = Number(t.amount ?? (typeof t.amount_cents === 'number' ? t.amount_cents / 100 : 0))
          return sum + (isFinite(amt) ? amt : 0)
        }, 0)
        setTotalSpentAtMerchant(Math.round(total * 100) / 100)
      } else {
        setRecentTx([])
        setRecentNextCursor(null)
        setTotalSpentAtMerchant(0)
      }
    } catch (e) {
      console.error('Fetch student transactions failed', e)
      setRecentTx([])
      setTotalSpentAtMerchant(0)
    } finally {
      setIsLoadingStats(false)
    }
  }

  const parsedAmount = React.useMemo(() => {
    const n = Number(amount)
    if (!isFinite(n)) return NaN
    return Math.round(n * 100) / 100
  }, [amount])

  const isValidAmount = parsedAmount > 0


  const remainingBudget = React.useMemo(() => {
    if (!profile || !merchant?.category) return undefined as undefined | { limit: number; spent: number; remaining: number }
    const mcat = normalizeCategoryFront(merchant.category)
    const found = Array.isArray((profile as any).categories)
      ? (profile as any).categories.find((c: any) => normalizeCategoryFront(String(c.name)) === mcat)
      : undefined
    if (!found) return undefined
    const limit = Number(found.limit || 0)
    const spent = Number(found.spent || 0)
    const remaining = Number(found.remaining ?? Math.max(0, limit - spent))
    return { limit, spent, remaining }
  }, [profile, merchant])

  const canPay = React.useMemo(() => {
    if (!merchant) return false
    if (!merchant.category) return false
    if (remainingBudget && typeof remainingBudget.remaining === 'number') {
      return remainingBudget.remaining > 0
    }
    // No budget found or unknown -> treat as no available funds
    return false
  }, [merchant, remainingBudget])

  const [isPaying, setIsPaying] = React.useState(false)

  const handlePay = async () => {
    if (!isAuthenticated || user?.role !== 'student' || !user?.id) {
      showError('Not signed in', 'Please sign in as a student to make a payment.')
      return
    }
    if (!merchant) return
    if (!isValidAmount || isNaN(parsedAmount)) {
      showError('Invalid amount', 'Please enter a valid amount greater than 0.00')
      return
    }

    const amount_cents = Math.round(parsedAmount * 100)

    // Ensure we have a category for backend fallback resolution
    if (!merchant.category) {
      showError('Merchant not configured', 'This merchant does not have a spending category set. Payment cannot proceed.')
      return
    }

    // Client-side double check vs remaining budget (advisory)
    if (remainingBudget && merchant.category) {
      const remCents = Math.round(Number(remainingBudget.remaining || 0) * 100)
      if (amount_cents > remCents) {
        const availableR = (remCents / 100).toFixed(2)
        const wantR = (amount_cents / 100).toFixed(2)
        const proceedPartial = remCents > 0 && window.confirm(`Insufficient budget. You want R${wantR} but only R${availableR} is available in ${merchant.category}.\n\nDo you want to proceed with a partial payment of R${availableR}?`)
        if (!proceedPartial) {
          showInfo('Payment not processed', 'You can adjust the amount or try again later.')
          return
        }
      }
    }

    setIsPaying(true)
    try {
      // Prepare transaction on backend (authoritative availability check)
      const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const prepResp = await fetch(`${apiBaseUrl}/students/${encodeURIComponent(String(user.id))}/transactions/prepare`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ merchantId: merchant.id, category: merchant.category, amount_cents, idempotency_key: idempotencyKey })
      })
      const prepData = await prepResp.json()
      if (!prepResp.ok) {
        throw new Error(prepData?.error || 'Failed to prepare transaction')
      }
      const tx = prepData?.transaction || prepData?.data?.transaction
      if (!tx || !tx.txId) throw new Error('Malformed prepare response')

      // If only partial amount is covered, prompt the user
      const covered = Number(tx.amount_covered_cents || 0)
      const shortfall = Number(tx.amount_shortfall_cents || 0)
      if (covered <= 0) {
        showError('Insufficient funds', 'No available budget in this category to cover this payment.')
        return
      }
      if (shortfall > 0) {
        const covR = (covered / 100).toFixed(2)
        const wantR = (Number(tx.amount_requested_cents || amount_cents) / 100).toFixed(2)
        const ok = window.confirm(`Only R${covR} is available out of requested R${wantR}.\n\nProceed with partial payment of R${covR}?`)
        if (!ok) {
          showInfo('Payment canceled', 'No funds were deducted.')
          return
        }
      }

      // Confirm transaction (consumes lots, writes ledger, updates budgets)
      const confirmOnce = async (): Promise<any> => {
        const confResp = await fetch(`${apiBaseUrl}/students/${encodeURIComponent(String(user.id))}/transactions/${encodeURIComponent(String(tx.txId))}/confirm`, {
          method: 'POST',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ idempotency_key: idempotencyKey })
        })
        const confData = await confResp.json().catch(() => ({}))
        if (confResp.status === 409 || confData?.reconfirm_required) {
          // Availability changed; ask again and retry once
          const avail = confData?.transaction?.amount_covered_cents
          const covR = typeof avail === 'number' ? (avail / 100).toFixed(2) : undefined
          const proceed = window.confirm(`Availability changed. ${covR ? `Now available: R${covR}. ` : ''}Proceed?`)
          if (!proceed) throw new Error('User canceled after availability change')
          // Retry confirm
          const retryResp = await fetch(`${apiBaseUrl}/students/${encodeURIComponent(String(user.id))}/transactions/${encodeURIComponent(String(tx.txId))}/confirm`, {
            method: 'POST',
            headers: {
              'Authorization': token ? `Bearer ${token}` : '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ idempotency_key: idempotencyKey })
          })
          const retryData = await retryResp.json().catch(() => ({}))
          if (!retryResp.ok) throw new Error(retryData?.error || 'Failed to confirm transaction (retry)')
          return retryData
        }
        if (!confResp.ok) throw new Error(confData?.error || 'Failed to confirm transaction')
        return confData
      }

      const finalData = await confirmOnce()
      const finalTx = finalData?.transaction || {}
      const paidCents = Number(finalTx.amount_covered_cents || covered)

      showSuccess('Payment successful', `Paid R${(paidCents / 100).toFixed(2)} to ${merchant.businessName}.`)

      // Refresh budgets and merchant stats
      await refreshProfile()
      await fetchStatsForMerchant(merchant)

      // Optionally clear the amount
      setAmount('')
    } catch (e: any) {
      console.error('Payment failed', e)
      showError('Payment failed', e?.message || 'An error occurred while processing the payment.')
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-kalahari-sand-light">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
          <h1 className="text-3xl font-bold text-kudu-brown mb-4 text-center">Pay a Merchant</h1>
          <p className="text-charcoal-light mb-6 text-center">
            {isAuthenticated && user?.role === 'student'
              ? 'Scan a merchant QR code with your camera, or enter a merchant code to pay.'
              : 'You need to be signed in as a student to continue.'}
          </p>

          {/* Scanner Panel */}
          <div className="bg-kalahari-sand-light rounded-lg p-6 mb-6 text-center border border-kalahari-sand-dark">
            {!showScanner ? (
              <div>
                <div className="w-32 h-32 bg-charcoal-light rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <span className="text-white text-4xl">📷</span>
                </div>
                <button
                  onClick={() => setShowScanner(true)}
                  disabled={!isAuthenticated || user?.role !== 'student'}
                  className="inline-block bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  Scan QR with camera
                </button>
                <div className="text-sm text-charcoal-light mt-2">or type the code below</div>
              </div>
            ) : (
              <div>
                <div className="flex justify-center mb-3">
                  <div className="relative w-64 h-40 bg-black rounded overflow-hidden">
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline></video>
                    <div className="absolute inset-0 border-2 border-acacia-green/60 rounded pointer-events-none"></div>
                  </div>
                </div>
                <div className="text-sm text-charcoal-light mb-3">Point the camera at the merchant QR</div>
                {scannerError && <div className="text-sm text-red-600 mb-2">{scannerError}</div>}
                <button
                  onClick={() => setShowScanner(false)}
                  className="inline-block bg-charcoal hover:bg-charcoal-dark text-white font-medium py-2 px-4 rounded-lg"
                >
                  Type code instead
                </button>
              </div>
            )}
          </div>

          {/* Merchant code input + Continue */}
          <form className="max-w-md mx-auto" onSubmit={(e) => { e.preventDefault(); handleContinue(); }}>
            <label className="block text-sm font-medium text-charcoal mb-2" htmlFor="manual-merchant-code">Merchant Code</label>
            <input
              id="manual-merchant-code"
              type="text"
              value={merchantCode}
              onChange={(e) => setMerchantCode(e.target.value)}
              placeholder="Enter merchant code (paymentId)"
              className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors mb-3"
              disabled={!isAuthenticated || user?.role !== 'student' || isLookingUp}
            />
            <button
              type="submit"
              className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
              disabled={!isAuthenticated || user?.role !== 'student' || isLookingUp}
            >
              {isLookingUp ? 'Looking up…' : 'Continue'}
            </button>
          </form>

          {/* Merchant details, insights and amount input */}
          {merchant && (
            <div className="max-w-md mx-auto mt-8">
              <div className="bg-kalahari-sand-light rounded-lg p-4 mb-4 border border-kalahari-sand-dark">
                <div className="flex items-center gap-3">
                  {merchant.logoDataUrl ? (
                    <img src={merchant.logoDataUrl} alt={merchant.businessName} className="w-12 h-12 rounded" />
                  ) : (
                    <div className="w-12 h-12 bg-charcoal-light rounded flex items-center justify-center text-white">🏪</div>
                  )}
                  <div>
                    <div className="font-semibold text-charcoal">{merchant.businessName}</div>
                    {merchant.category && (
                      <div className="text-sm text-charcoal-light">Category: {merchant.category}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                <div className="border border-kalahari-sand-dark rounded-lg p-4">
                  <div className="text-sm text-charcoal-light mb-1">Remaining budget in category</div>
                  <div className="text-lg font-semibold text-charcoal">
                    {remainingBudget && merchant.category ? (
                      <>
                        R{remainingBudget.remaining.toFixed(2)} <span className="text-sm font-normal text-charcoal-light">of R{remainingBudget.limit.toFixed(2)} in {merchant.category}</span>
                      </>
                    ) : (
                      'Unknown'
                    )}
                  </div>
                </div>

                <div className="border border-kalahari-sand-dark rounded-lg p-4">
                  <div className="text-sm text-charcoal-light mb-1">Total spent at this merchant</div>
                  <div className="text-lg font-semibold text-charcoal">R{totalSpentAtMerchant.toFixed(2)}</div>
                </div>

                <div className="border border-kalahari-sand-dark rounded-lg p-4">
                  <div className="text-sm text-charcoal-light mb-2">Your last 5 transactions here</div>
                  {isLoadingStats ? (
                    <div className="text-charcoal-light">Loading…</div>
                  ) : recentTx.length > 0 ? (
                    <ul className="space-y-2 max-h-40 overflow-auto pr-1">
                      {recentTx.map((t, idx) => (
                        <li key={t.id || idx} className="flex justify-between text-sm">
                          <span className="text-charcoal">{new Date(t.created_at || Date.now()).toLocaleDateString()}</span>
                          <span className="text-charcoal">R{(typeof t.amount === 'number' ? t.amount : (typeof t.amount_cents === 'number' ? t.amount_cents / 100 : 0)).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-charcoal-light">No transactions with this merchant yet.</div>
                  )}
                </div>
              </div>

              <label className="block text-sm font-medium text-charcoal mb-2">Amount (ZAR)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 50.00"
                className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors mb-3"
              />
              {canPay ? (
                <button
                  onClick={handlePay}
                  className="w-full bg-acacia-green hover:bg-acacia-green-dark text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                  disabled={!isValidAmount || isPaying}
                >
                  {isPaying ? 'Processing…' : `Pay R${isNaN(parsedAmount) ? '0.00' : parsedAmount.toFixed(2)}`}
                </button>
              ) : (
                <div className="w-full text-center text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg py-3 px-4">
                  No funds available in this category. You cannot make a payment right now.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PayPage
