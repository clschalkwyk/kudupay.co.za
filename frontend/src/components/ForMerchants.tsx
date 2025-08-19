import {useState, useEffect} from 'react'
import {useAuth} from '../contexts/AuthContext'
import {useMerchantProfile} from '../hooks/useMerchantProfile'
import {useToast} from '../contexts/ToastContext'
import { MerchantCategoryList } from '../constants/merchantCategories'
import type { MerchantCategory } from '../constants/merchantCategories'

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL)
  ? (import.meta as any).env.VITE_API_URL
  : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')
const PUBLIC_QR_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL)
  ? ((import.meta as any).env.VITE_PUBLIC_QR_BASE_URL as string).replace(/\/$/, '')
  : ''

// Canonical list and helpers for merchant categories
const CATEGORY_VALUES = Object.values(MerchantCategoryList) as MerchantCategory[];

const normalizeCategory = (value: string | undefined | null): MerchantCategory => {
    const v = String(value || '').trim();
    if (!v) return MerchantCategoryList.Other;
    const low = v.toLowerCase();

    // Exact match with labels
    const labelMatch = CATEGORY_VALUES.find(lbl => lbl.toLowerCase() === low);
    if (labelMatch) return labelMatch as MerchantCategory;

    // Match against keys (e.g., "FoodGroceries") case-insensitive
    const keys = Object.keys(MerchantCategoryList) as (keyof typeof MerchantCategoryList)[];
    const keyMatch = keys.find(k => String(k).toLowerCase() === low);
    if (keyMatch) return MerchantCategoryList[keyMatch];

    // Common synonyms mapping
    const synonymMap: Record<string, MerchantCategory> = {
        'food': MerchantCategoryList.FoodGroceries,
        'foods': MerchantCategoryList.FoodGroceries,
        'food & beverages': MerchantCategoryList.FoodGroceries,
        'beverages': MerchantCategoryList.FoodGroceries,
        'restaurants': MerchantCategoryList.RestaurantsFastFood,
        'fast food': MerchantCategoryList.RestaurantsFastFood,
        'books': MerchantCategoryList.Books,
        'stationery': MerchantCategoryList.StationerySupplies,
        'books & stationery': MerchantCategoryList.Books,
        'transport': MerchantCategoryList.Transport,
        'clothing': MerchantCategoryList.Apparel,
        'apparel': MerchantCategoryList.Apparel,
        'electronics': MerchantCategoryList.Hardware,
        'hardware': MerchantCategoryList.Hardware,
        'data': MerchantCategoryList.DataAirtime,
        'airtime': MerchantCategoryList.DataAirtime,
        'housing': MerchantCategoryList.Housing,
        'accommodation': MerchantCategoryList.Housing,
        'utilities': MerchantCategoryList.Utilities,
        'general': MerchantCategoryList.GeneralRetail,
        'retail': MerchantCategoryList.GeneralRetail,
        'library': MerchantCategoryList.Libraries,
        'libraries': MerchantCategoryList.Libraries,
        'health': MerchantCategoryList.HealthServices,
        'wellness': MerchantCategoryList.HealthServices,
        'sports': MerchantCategoryList.SportsRecreation,
        'recreation': MerchantCategoryList.SportsRecreation,
        'arts': MerchantCategoryList.ArtsCulture,
        'culture': MerchantCategoryList.ArtsCulture,
        'financial': MerchantCategoryList.FinancialServices
    };
    const syn = synonymMap[low];
    if (syn) return syn;

    return MerchantCategoryList.Other;
};

function ForMerchants() {
    const {showSuccess, showError, showInfo} = useToast()
    const {isAuthenticated, user, register, login, logout, error, clearError, token} = useAuth()
    const {profile: merchantProfile, ensureProfileLoaded, fetchMerchantProfile, clearMerchantProfile} = useMerchantProfile()

    const [activeTab, setActiveTab] = useState<'join' | 'login' | 'dashboard' | 'profile' | 'sales' | 'withdraw' | 'support'>('join')
    const [darkMode, setDarkMode] = useState(false)

    // Ensure profile is loaded when user is authenticated as merchant
    useEffect(() => {
        if (isAuthenticated && user?.role === 'merchant') {
            ensureProfileLoaded()
        }
    }, [isAuthenticated, user, ensureProfileLoaded])

    // Use transactions and bank account from merchant profile
    const transactions = (merchantProfile?.lastFiveTransactions || []).map((t: any) => {
        const rawStatus = String(t?.status ?? 'APPROVED');
        const s = rawStatus.toLowerCase();
        let status = rawStatus; // keep original for visibility
        if (s.includes('block') || s.includes('fail') || s.includes('declin')) status = 'blocked';
        else if (s.includes('refund')) status = 'refunded';
        else if (s.includes('approv') || s.includes('success') || s.includes('paid')) status = 'paid';

        return {
            id: String(t?.id ?? t?.txId ?? t?.tx_id ?? `${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
            amount: (t?.amount_cents !== undefined && t?.amount_cents !== null) ? Math.round(Number(t.amount_cents)) / 100 : Number(t?.amount ?? 0),
            studentName: String(t?.studentName ?? t?.student?.name ?? t?.studentId ?? 'Unknown'),
            category: normalizeCategory(t?.category),
            date: String(t?.date ?? t?.createdAt ?? t?.created_at ?? new Date().toISOString()),
            status
        };
    });
    const bankAccount = merchantProfile?.bankAccount || {
        bankName: '',
        accountNumber: '',
        branchCode: '',
        accountHolder: ''
    }

    // Profile form state (initialized from merchantProfile)
    const [profileForm, setProfileForm] = useState({
        businessName: merchantProfile?.businessName || '',
        category: normalizeCategory(merchantProfile?.category),
        registrationNumber: merchantProfile?.registrationNumber || '',
        whatsappNumber: merchantProfile?.whatsappNumber || '',
        isOnline: merchantProfile?.isOnline || false,
        bankName: (merchantProfile?.bankAccount?.bankName) || '',
        accountNumber: (merchantProfile?.bankAccount?.accountNumber) || '',
        branchCode: (merchantProfile?.bankAccount?.branchCode) || '',
        accountHolder: (merchantProfile?.bankAccount?.accountHolder) || ''
    })

    useEffect(() => {
        if (merchantProfile) {
            setProfileForm({
                businessName: merchantProfile.businessName || '',
                category: normalizeCategory(merchantProfile.category),
                registrationNumber: merchantProfile.registrationNumber || '',
                whatsappNumber: merchantProfile.whatsappNumber || '',
                isOnline: !!merchantProfile.isOnline,
                bankName: merchantProfile.bankAccount?.bankName || '',
                accountNumber: merchantProfile.bankAccount?.accountNumber || '',
                branchCode: merchantProfile.bankAccount?.branchCode || '',
                accountHolder: merchantProfile.bankAccount?.accountHolder || ''
            })
        }
    }, [merchantProfile])

    const [isSavingProfile, setIsSavingProfile] = useState(false)

    // QR/PaymentId + Logo state
    const [paymentId, setPaymentId] = useState<string | null>(merchantProfile?.paymentId ?? null)
    const [qrDataUrl, setQrDataUrl] = useState<string | null>((merchantProfile as any)?.qrCodeUrl ?? (merchantProfile as any)?.QRCodeUrl ?? null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(merchantProfile?.logoDataUrl ?? null)

    useEffect(() => {
        if (merchantProfile) {
            setPaymentId(merchantProfile.paymentId ?? null)
            setLogoDataUrl(merchantProfile.logoDataUrl ?? null)
            const profileUrl = (merchantProfile as any)?.qrCodeUrl || (merchantProfile as any)?.QRCodeUrl || null
            if (typeof profileUrl === 'string' && profileUrl) {
                setQrDataUrl(profileUrl)
                return
            }
            // Fallback: compute deterministic public URL if we have paymentId
            if (merchantProfile.paymentId) {
                const url = PUBLIC_QR_BASE ? `${PUBLIC_QR_BASE}/merchants/qr/${merchantProfile.paymentId}/1024x1024.png` : null
                if (url) setQrDataUrl(url)
            }
        }
    }, [merchantProfile])

    const loadQrFromCacheOrFetch = async (pid: string | null) => {
        if (!token || !pid) return
        // Immediately set deterministic public URL for rendering
        const publicUrl = PUBLIC_QR_BASE ? `${PUBLIC_QR_BASE}/merchants/qr/${pid}/1024x1024.png` : null
        if (publicUrl) setQrDataUrl(publicUrl)
        // Warm the QR on the server so the image is generated and uploaded to S3
        try {
            await fetch(`${API_BASE}/merchants/qr?size=1024x1024&paymentId=${encodeURIComponent(pid)}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'image/png' },
                credentials: 'include'
            })
        } catch (e) {
            console.warn('QR warm error:', e)
        }
    }

    useEffect(() => {
        // Ensure QR is generated/cached via authenticated endpoint when paymentId is available
        if (paymentId) {
            loadQrFromCacheOrFetch(paymentId)
        }
    }, [paymentId, token])

    const handleGeneratePaymentId = async () => {
        if (!token) {
            showError('Not authenticated', 'Please sign in again.')
            return
        }
        setIsGenerating(true)
        try {
            const resp = await fetch(`${API_BASE}/merchants/payment-id`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            })
            const data = await resp.json().catch(() => ({}))
            if (!resp.ok) throw new Error(data?.error || 'Failed to generate PaymentId')
            const newPid = data?.data?.paymentId as string
            const newQrUrl = data?.data?.qrCodeUrl as string | undefined
            if (newPid) {
                // Clear old cache if any
                if (paymentId) sessionStorage.removeItem(`merchantQR:${paymentId}`)
                setPaymentId(newPid)
                if (newQrUrl) {
                    setQrDataUrl(newQrUrl)
                } else {
                    setQrDataUrl(null)
                }
                // Persist to cached merchantProfile so it survives reloads
                try {
                    const cached = sessionStorage.getItem('merchantProfile')
                    if (cached) {
                        const parsed = JSON.parse(cached)
                        const updated = { ...parsed, paymentId: newPid, qrCodeUrl: newQrUrl || parsed.qrCodeUrl }
                        sessionStorage.setItem('merchantProfile', JSON.stringify(updated))
                    }
                } catch {}
                await loadQrFromCacheOrFetch(newPid)
                showSuccess('PaymentId generated', 'Your new QR code is ready.')
            }
        } catch (e: any) {
            console.error('Generate PaymentId error:', e)
            showError('Failed to generate', e?.message || 'Please try again later')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleLogoUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!token) {
            showError('Not authenticated', 'Please sign in again.')
            return
        }
        // Read as data URL
        const reader = new FileReader()
        const dataUrl: string = await new Promise((resolve, reject) => {
            reader.onerror = () => reject(new Error('Failed to read file'))
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(file)
        })
        try {
            const resp = await fetch(`${API_BASE}/merchants/logo`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ logoDataUrl: dataUrl })
            })
            const data = await resp.json().catch(() => ({}))
            if (!resp.ok) throw new Error(data?.error || 'Failed to upload logo')
            setLogoDataUrl(dataUrl)
            // Persist to cached merchantProfile for consistency
            try {
                const cached = sessionStorage.getItem('merchantProfile')
                if (cached) {
                    const parsed = JSON.parse(cached)
                    const updated = { ...parsed, logoDataUrl: dataUrl }
                    sessionStorage.setItem('merchantProfile', JSON.stringify(updated))
                }
            } catch {}
            showSuccess('Logo uploaded', 'Your logo will appear on the printable QR.')
        } catch (err: any) {
            console.error('Logo upload failed:', err)
            showError('Upload Failed', err?.message || 'Unable to upload logo')
        }
    }

    const handleDownloadQr = () => {
        if (!qrDataUrl) {
            showInfo('No QR to download', 'Generate or load your QR code first.')
            return
        }
        const logo = logoDataUrl || merchantProfile?.logoDataUrl || ''
        const title = merchantProfile?.businessName ? `${merchantProfile.businessName} - KuduPay QR` : 'KuduPay Merchant QR'
        const w = window.open('', '_blank')
        if (!w) return
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  html, body { height: auto; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; text-align: center; }
  .container { width: 100%; max-width: 180mm; margin: 0 auto; page-break-inside: avoid; }
  .logo { max-height: 35mm; max-width: 120mm; width: auto; height: auto; margin: 6mm auto 4mm; display: block; }
  h1 { font-size: 18pt; margin: 2mm 0 1mm; }
  .info { font-size: 10pt; color: #555; margin: 0 0 4mm; word-break: break-all; }
  .qr { width: auto; height: auto; max-width: 130mm; max-height: 130mm; margin: 4mm auto 0; display: block; page-break-inside: avoid; }
  img { page-break-inside: avoid; }
</style>
</head>
<body>
  <div class="container">
    ${logo ? `<img alt="Logo" class="logo" src="${logo}" />` : ''}
    <h1>${merchantProfile?.businessName || 'Merchant'}</h1>
    ${paymentId ? `<p class="info">PaymentId: ${paymentId}</p>` : ''}
    <img class="qr" alt="QR Code" src="${qrDataUrl}" />
  </div>
  <script>
    function printWhenReady() {
      const imgs = Array.from(document.images || []);
      let left = imgs.length;
      if (left === 0) { window.print(); return; }
      imgs.forEach(img => {
        if (img.complete) { if (--left === 0) window.print(); }
        else {
          const done = () => { if (--left === 0) window.print(); };
          img.onload = done; img.onerror = done;
        }
      });
    }
    window.onload = printWhenReady;
  </script>
</body>
</html>`
        w.document.open()
        w.document.write(html)
        w.document.close()
    }

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError()
        if (!token) {
            showError('Not authenticated', 'Please sign in again.')
            return
        }
        setIsSavingProfile(true)
        try {
            const resp = await fetch(`${API_BASE}/merchants/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    businessName: profileForm.businessName,
                    category: profileForm.category,
                    registrationNumber: profileForm.registrationNumber,
                    whatsappNumber: profileForm.whatsappNumber,
                    isOnline: profileForm.isOnline,
                    bankAccount: {
                        bankName: profileForm.bankName,
                        accountNumber: profileForm.accountNumber,
                        branchCode: profileForm.branchCode,
                        accountHolder: profileForm.accountHolder
                    }
                })
            })
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}))
                throw new Error((data as any)?.error || 'Failed to update profile')
            }
            showSuccess('Profile Updated', 'Your business info has been saved.')
            // Clear cached profile to force fresh fetch
            clearMerchantProfile()
            await fetchMerchantProfile()
        } catch (err: any) {
            console.error('Save profile failed:', err)
            showError('Update Failed', err?.message || 'Unable to save profile')
        } finally {
            setIsSavingProfile(false)
        }
    }

    type JoinForm = {
        businessName: string;
        email: string;
        firstName: string;
        lastName: string;
        category: MerchantCategory;
        password: string;
        registrationNumber: string;
        whatsappNumber: string;
    };

    const [joinForm, setJoinForm] = useState<JoinForm>({
        businessName: '',
        email: '',
        firstName: '',
        lastName: '',
        category: MerchantCategoryList.FoodGroceries,
        password: '',
        registrationNumber: '',
        whatsappNumber: ''
    })

    const [loginForm, setLoginForm] = useState({
        email: '',
        password: '',
        rememberMe: false
    })

    const [koosMessage, setKoosMessage] = useState("Howzit, boet! Ready to join the KuduPay merchant family?")

    // Update welcome message based on authentication state
    useEffect(() => {
        if (isAuthenticated && user?.role === 'merchant') {
            const firstName = merchantProfile?.firstName || user.name?.split(' ')[0] || 'boet'
            setKoosMessage(`Welcome back, ${firstName}! Ready to make some sales?`)
            setActiveTab('dashboard')
        } else {
            setKoosMessage("Howzit, boet! Ready to join the KuduPay merchant family?")
        }
    }, [isAuthenticated, user, merchantProfile])

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError() // Clear any previous errors

        try {
            await register({
                businessName: joinForm.businessName,
                firstName: joinForm.firstName,
                lastName: joinForm.lastName,
                email: joinForm.email,
                role: 'merchant',
                password: joinForm.password,
                category: joinForm.category,
                registrationNumber: joinForm.registrationNumber,
                whatsappNumber: joinForm.whatsappNumber
            })

            showSuccess("Welcome to KuduPay!", "Shot, you're in! Welcome to the KuduPay merchant family, boet!")
            setActiveTab('dashboard')

            // Clear the form
            setJoinForm({
                businessName: '',
                email: '',
                firstName: '',
                lastName: '',
                category: MerchantCategoryList.FoodGroceries,
                password: '',
                registrationNumber: '',
                whatsappNumber: ''
            })
        } catch (err) {
            // Error is handled by AuthContext, but we can show additional UI feedback
            if (error) {
                showError("Registration Failed", `Eish! ${error}`)
            }
        }
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError() // Clear any previous errors

        try {
            await login(loginForm.email, loginForm.password, loginForm.rememberMe)
            // Clear the form
            setLoginForm({
                email: '',
                password: '',
                rememberMe: false
            })
        } catch (err) {
            // Error is handled by AuthContext, but we can show additional UI feedback
            if (error) {
                showError("Login Failed", `Eish! ${error}`)
            }
        }
    }

    const handleLogout = () => {
        logout()
        setActiveTab('join')
        showInfo("Logged Out", "Cheers, boet! Come back anytime to grow your business with KuduPay.")
    }

    const handleWithdraw = () => {
        setKoosMessage(`Time to withdraw, boet? You've got R${withdrawableBalance.toFixed(2)} chillin'.`)
    }

    // Use financial data from merchant profile (API returns cents for monetary fields)
    const toRands = (v: any) => {
        const n = Number(v ?? 0)
        if (!isFinite(n)) return 0
        return Math.round(n) / 100
    }
    const totalReceived = toRands(merchantProfile?.financials?.totalReceived)
    const totalTransactions = merchantProfile?.financials?.totalTransactions || 0
    const thisWeekSales = toRands(merchantProfile?.financials?.salesThisWeek)
    const withdrawableBalance = toRands(merchantProfile?.financials?.withdrawableBalance)

    const renderJoinSection = () => (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">Join KuduPay Merchants</h2>

                <form onSubmit={handleJoin} className="space-y-6">
                    <div>
                        <label htmlFor="businessName" className="block text-sm font-medium text-charcoal mb-2">
                            Business Name *
                        </label>
                        <input
                            type="text"
                            id="businessName"
                            value={joinForm.businessName}
                            onChange={(e) => setJoinForm({...joinForm, businessName: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-2">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            id="email"
                            value={joinForm.email}
                            onChange={(e) => setJoinForm({...joinForm, email: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-charcoal mb-2">
                                First Name *
                            </label>
                            <input
                                type="text"
                                id="firstName"
                                value={joinForm.firstName}
                                onChange={(e) => setJoinForm({...joinForm, firstName: e.target.value})}
                                className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-charcoal mb-2">
                                Last Name *
                            </label>
                            <input
                                type="text"
                                id="lastName"
                                value={joinForm.lastName}
                                onChange={(e) => setJoinForm({...joinForm, lastName: e.target.value})}
                                className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-charcoal mb-2">
                            Business Category *
                        </label>
                        <select
                            id="category"
                            value={joinForm.category}
                            onChange={(e) => setJoinForm({...joinForm, category: normalizeCategory(e.target.value)})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        >
                            {CATEGORY_VALUES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-2">
                            Password *
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={joinForm.password}
                            onChange={(e) => setJoinForm({...joinForm, password: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="registrationNumber" className="block text-sm font-medium text-charcoal mb-2">
                            Business Registration Number (Optional)
                        </label>
                        <input
                            type="text"
                            id="registrationNumber"
                            value={joinForm.registrationNumber}
                            onChange={(e) => setJoinForm({...joinForm, registrationNumber: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            placeholder="CK2024/123456/23"
                        />
                    </div>

                    <div>
                        <label htmlFor="whatsappNumber" className="block text-sm font-medium text-charcoal mb-2">
                            WhatsApp Number (Optional)
                        </label>
                        <input
                            type="tel"
                            id="whatsappNumber"
                            value={joinForm.whatsappNumber}
                            onChange={(e) => setJoinForm({...joinForm, whatsappNumber: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            placeholder="+27821234567"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        Join KuduPay
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-charcoal-light">
                        Already have an account?{' '}
                        <button
                            onClick={() => setActiveTab('login')}
                            className="text-kudu-brown hover:text-kudu-brown-dark font-medium"
                        >
                            Sign in here
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )

    const renderLoginSection = () => (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">Welcome Back</h2>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label htmlFor="loginEmail" className="block text-sm font-medium text-charcoal mb-2">
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="loginEmail"
                            value={loginForm.email}
                            onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="loginPassword" className="block text-sm font-medium text-charcoal mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            id="loginPassword"
                            value={loginForm.password}
                            onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div className="flex items-center">
                        <input
                            id="rememberMe"
                            type="checkbox"
                            checked={loginForm.rememberMe}
                            onChange={(e) => setLoginForm({...loginForm, rememberMe: e.target.checked})}
                            className="h-4 w-4 text-kudu-brown focus:ring-kudu-brown border-kalahari-sand-dark rounded"
                        />
                        <label htmlFor="rememberMe" className="ml-2 block text-sm text-charcoal">
                            Remember me
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        Sign In
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button className="text-kudu-brown hover:text-kudu-brown-dark font-medium">
                        Reset password
                    </button>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-charcoal-light">
                        Don't have an account?{' '}
                        <button
                            onClick={() => setActiveTab('join')}
                            className="text-kudu-brown hover:text-kudu-brown-dark font-medium"
                        >
                            Join KuduPay
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )

    const renderDashboardSection = () => (
        <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-acacia-green-light rounded-lg flex items-center justify-center">
                                <span className="text-acacia-green-dark font-bold">R</span>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-charcoal-light">Total Received</p>
                            <p className="text-2xl font-bold text-charcoal">R{totalReceived.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-sky-blue-light rounded-lg flex items-center justify-center">
                                <span className="text-sky-blue-dark font-bold">#</span>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-charcoal-light">Total Transactions</p>
                            <p className="text-2xl font-bold text-charcoal">{totalTransactions}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-sunset-orange-light rounded-lg flex items-center justify-center">
                                <span className="text-sunset-orange-dark font-bold">📊</span>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-charcoal-light">This Week's Sales</p>
                            <p className="text-2xl font-bold text-charcoal">R{thisWeekSales.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-6">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-savanna-gold-light rounded-lg flex items-center justify-center">
                                <span className="text-savanna-gold-dark font-bold">💰</span>
                            </div>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-charcoal-light">Withdrawable Balance</p>
                            <p className="text-2xl font-bold text-charcoal">R{withdrawableBalance.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* QR Code Section */}
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Your Payment QR Code</h3>
                <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="bg-kalahari-sand-light p-8 rounded-xl">
                        <div className="w-64 h-64 bg-white border-2 border-charcoal-light rounded-lg flex items-center justify-center overflow-hidden">
                            {qrDataUrl ? (
                                <img src={qrDataUrl} alt="Merchant QR Code" className="w-full h-full object-contain" onError={() => { if (paymentId) { loadQrFromCacheOrFetch(paymentId) } }} />
                            ) : (
                                <div className="text-center p-4">
                                    <div className="text-6xl mb-2">📱</div>
                                    <p className="text-sm text-charcoal-light">No QR yet</p>
                                    <p className="text-xs text-charcoal-light">Click Generate to create your QR</p>
                                </div>
                            )}
                        </div>
                        {paymentId && (
                            <p className="text-xs text-charcoal-light mt-2 break-all">PaymentId: {paymentId}</p>
                        )}
                    </div>
                    <div className="flex-1 w-full">
                        <div className="flex flex-wrap gap-3 mb-4">
                            <button
                                onClick={handleGeneratePaymentId}
                                disabled={isGenerating}
                                className="bg-kudu-brown hover:bg-kudu-brown-dark disabled:opacity-60 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                                {isGenerating ? 'Generating…' : 'Generate QR Code'}
                            </button>
                            <label className="inline-flex items-center gap-2 py-2 px-4 border border-kalahari-sand-dark rounded-lg cursor-pointer hover:bg-kalahari-sand-light">
                                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                <span role="img" aria-label="logo">🖼️</span> Upload Logo
                            </label>
                            <button
                                onClick={handleDownloadQr}
                                disabled={!qrDataUrl}
                                className="bg-white border border-kalahari-sand-dark hover:bg-kalahari-sand-light disabled:opacity-60 text-charcoal font-medium py-2 px-4 rounded-lg transition-colors">
                                Download QR Code
                            </button>
                        </div>
                        <h4 className="text-lg font-semibold text-charcoal mb-2">How to use your QR code:</h4>
                        <ul className="space-y-2 text-charcoal-light">
                            <li className="flex items-start gap-2"><span className="text-acacia-green">✓</span> Display this QR code at your point of sale</li>
                            <li className="flex items-start gap-2"><span className="text-acacia-green">✓</span> Students scan to pay instantly</li>
                            <li className="flex items-start gap-2"><span className="text-acacia-green">✓</span> Payments are validated against their budgets</li>
                            <li className="flex items-start gap-2"><span className="text-acacia-green">✓</span> You receive confirmation immediately</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )

    const renderSalesSection = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Sales Log</h3>

                {/* Filters */}
                <div className="mb-6 flex flex-wrap gap-4">
                    <select
                        className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown">
                        <option>All Categories</option>
                        {CATEGORY_VALUES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <select
                        className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown">
                        <option>All Status</option>
                        <option>Paid</option>
                        <option>Blocked</option>
                        <option>Refunded</option>
                    </select>
                    <input
                        type="date"
                        className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown"
                    />
                </div>

                {/* Transactions Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-kalahari-sand-dark">
                        <thead className="bg-kalahari-sand-light">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-charcoal uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-charcoal uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-charcoal uppercase tracking-wider">Student</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-charcoal uppercase tracking-wider">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-charcoal uppercase tracking-wider">Status</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-kalahari-sand-dark">
                        {transactions.map((transaction) => (
                            <tr key={transaction.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                                    {new Date(transaction.date).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-charcoal">
                                    R{transaction.amount.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                                    {transaction.studentName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                                    {transaction.category}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        transaction.status === 'paid'
                            ? 'bg-acacia-green-light text-acacia-green-dark'
                            : transaction.status === 'blocked'
                                ? 'bg-sunset-orange-light text-sunset-orange-dark'
                                : 'bg-charcoal-light text-charcoal-dark'
                    }`}>
                      {transaction.status}
                    </span>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )

    const renderWithdrawSection = () => (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Withdraw Funds</h3>

                {/* Current Balance */}
                <div className="bg-savanna-gold-light border border-savanna-gold rounded-lg p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-charcoal-light">Available Balance</p>
                            <p className="text-3xl font-bold text-charcoal">R{withdrawableBalance.toFixed(2)}</p>
                        </div>
                        <div className="text-4xl">💰</div>
                    </div>
                </div>

                {/* Bank Account Details */}
                <div className="mb-6">
                    <h4 className="text-lg font-semibold text-charcoal mb-4">Bank Account Details</h4>
                    <div className="bg-kalahari-sand-light rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-charcoal-light">Bank</p>
                                <p className="text-charcoal">{bankAccount.bankName}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-charcoal-light">Account Number</p>
                                <p className="text-charcoal">****{bankAccount.accountNumber.slice(-4)}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-charcoal-light">Branch Code</p>
                                <p className="text-charcoal">{bankAccount.branchCode || 'Not Set'}</p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-sm font-medium text-charcoal-light">Account Holder</p>
                                <p className="text-charcoal">{bankAccount.accountHolder}</p>
                            </div>
                        </div>
                        <button className="mt-4 text-kudu-brown hover:text-kudu-brown-dark font-medium">
                            Update Bank Details
                        </button>
                    </div>
                </div>

                {/* Withdrawal Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-charcoal mb-2">
                            Withdrawal Amount (Minimum R100)
                        </label>
                        <input
                            type="number"
                            min="100"
                            max={withdrawableBalance}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            placeholder="Enter amount"
                        />
                    </div>

                    <button
                        onClick={handleWithdraw}
                        className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        Withdraw to Bank Account
                    </button>
                </div>

                <div className="mt-6 text-sm text-charcoal-light">
                    <p>• Withdrawals are processed within 1-2 business days</p>
                    <p>• A 5% platform fee is deducted from your earnings</p>
                    <p>• Minimum withdrawal amount is R100</p>
                </div>
            </div>
        </div>
    )

    const renderProfileSection = () => (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Merchant Profile</h3>
                <form onSubmit={handleSaveProfile} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-charcoal mb-2">Business Name</label>
                        <input
                            type="text"
                            value={profileForm.businessName}
                            onChange={(e) => setProfileForm({...profileForm, businessName: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-charcoal mb-2">Category</label>
                        <select
                            value={profileForm.category}
                            onChange={(e) => setProfileForm({...profileForm, category: normalizeCategory(e.target.value)})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                        >
                            {CATEGORY_VALUES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-charcoal mb-2">Registration Number</label>
                            <input
                                type="text"
                                value={profileForm.registrationNumber}
                                onChange={(e) => setProfileForm({...profileForm, registrationNumber: e.target.value})}
                                className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-charcoal mb-2">WhatsApp Number</label>
                            <input
                                type="tel"
                                value={profileForm.whatsappNumber}
                                onChange={(e) => setProfileForm({...profileForm, whatsappNumber: e.target.value})}
                                className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex items-center">
                        <input
                            id="isOnline"
                            type="checkbox"
                            checked={profileForm.isOnline}
                            onChange={(e) => setProfileForm({...profileForm, isOnline: e.target.checked})}
                            className="h-4 w-4 text-kudu-brown focus:ring-kudu-brown border-kalahari-sand-dark rounded"
                        />
                        <label htmlFor="isOnline" className="ml-2 block text-sm text-charcoal">Currently Online</label>
                    </div>

                    <div>
                        <h4 className="text-lg font-semibold text-charcoal mb-2">Bank Account</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-charcoal mb-2">Bank Name</label>
                                <input
                                    type="text"
                                    value={profileForm.bankName}
                                    onChange={(e) => setProfileForm({...profileForm, bankName: e.target.value})}
                                    className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-charcoal mb-2">Account Number</label>
                                <input
                                    type="text"
                                    value={profileForm.accountNumber}
                                    onChange={(e) => setProfileForm({...profileForm, accountNumber: e.target.value})}
                                    className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-charcoal mb-2">Branch Code</label>
                                <input
                                    type="text"
                                    value={profileForm.branchCode}
                                    onChange={(e) => setProfileForm({...profileForm, branchCode: e.target.value})}
                                    className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-charcoal mb-2">Account Holder</label>
                                <input
                                    type="text"
                                    value={profileForm.accountHolder}
                                    onChange={(e) => setProfileForm({...profileForm, accountHolder: e.target.value})}
                                    className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={isSavingProfile}
                            className="bg-kudu-brown hover:bg-kudu-brown-dark disabled:opacity-60 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                        >
                            {isSavingProfile ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )

    const renderSupportSection = () => (
        <div className="space-y-8">
            {/* Contact Options */}
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Get Support</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-acacia-green-light rounded-lg p-6 text-center">
                        <div className="text-4xl mb-4">📱</div>
                        <h4 className="text-lg font-semibold text-charcoal mb-2">WhatsApp Support</h4>
                        <p className="text-charcoal-light mb-4">Get instant help via WhatsApp</p>
                        <button
                            className="bg-acacia-green hover:bg-acacia-green-dark text-white font-medium py-2 px-4 rounded-lg transition-colors">
                            Chat on WhatsApp
                        </button>
                    </div>

                    <div className="bg-sky-blue-light rounded-lg p-6 text-center">
                        <div className="text-4xl mb-4">📧</div>
                        <h4 className="text-lg font-semibold text-charcoal mb-2">Email Support</h4>
                        <p className="text-charcoal-light mb-4">Send us a detailed message</p>
                        <button
                            className="bg-sky-blue hover:bg-sky-blue-dark text-white font-medium py-2 px-4 rounded-lg transition-colors">
                            Send Email
                        </button>
                    </div>
                </div>
            </div>

            {/* Merchant Tips */}
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">💡 Merchant Tips</h3>

                <div className="space-y-6">
                    <div className="border-l-4 border-savanna-gold bg-savanna-gold-light p-4 rounded-r-lg">
                        <h4 className="font-semibold text-charcoal mb-2">Display Your QR Code Prominently</h4>
                        <p className="text-charcoal-light">Make sure students can easily see and scan your QR code.
                            Consider printing it large and placing it at eye level.</p>
                    </div>

                    <div className="border-l-4 border-acacia-green bg-acacia-green-light p-4 rounded-r-lg">
                        <h4 className="font-semibold text-charcoal mb-2">Offer Student-Friendly Prices</h4>
                        <p className="text-charcoal-light">Keep your prices affordable for students. Consider offering
                            combo deals or student discounts.</p>
                    </div>

                    <div className="border-l-4 border-sunset-orange bg-sunset-orange-light p-4 rounded-r-lg">
                        <h4 className="font-semibold text-charcoal mb-2">Promote Your Business</h4>
                        <p className="text-charcoal-light">Let students know you accept KuduPay! Put up signs and spread
                            the word on campus.</p>
                    </div>
                </div>
            </div>

            {/* FAQ */}
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Frequently Asked Questions</h3>

                <div className="space-y-4">
                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            How long does it take to receive payments?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            Payments are instant! As soon as a student scans your QR code and completes the transaction,
                            the funds are added to your KuduPay balance.
                        </p>
                    </details>

                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            What happens if a transaction is blocked?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            If a student doesn't have enough budget in their category, the transaction will be blocked.
                            You'll be notified immediately, and no funds will be deducted.
                        </p>
                    </details>

                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            How do I issue a refund?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            You can issue refunds through your sales log. Find the transaction and click the refund
                            button. The funds will be returned to the student's budget.
                        </p>
                    </details>

                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            What are the fees for using KuduPay?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            KuduPay charges a 5% platform fee on all successful transactions. This fee is automatically
                            deducted when you withdraw funds.
                        </p>
                    </details>
                </div>
            </div>
        </div>
    )

    return (
        <div className={`min-h-screen ${darkMode ? 'bg-charcoal text-white' : 'bg-kalahari-sand-light'}`}>
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-kalahari-sand-dark">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold text-kudu-brown">🏪 For Merchants</h1>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 rounded-lg bg-kalahari-sand-light hover:bg-kalahari-sand-dark transition-colors"
                            >
                                {darkMode ? '☀️' : '🌙'}
                            </button>
                            {isAuthenticated && user?.role === 'merchant' && (
                                <button
                                    onClick={handleLogout}
                                    className="text-charcoal-light hover:text-charcoal"
                                >
                                    Sign Out
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Koos Message */}
            <div className="bg-savanna-gold-light border-b border-savanna-gold">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🦌</span>
                        <p className="text-charcoal font-medium">{koosMessage}</p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            {isAuthenticated && user?.role === 'merchant' && (
                <div className="bg-white border-b border-kalahari-sand-dark">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <nav className="flex space-x-8 overflow-x-auto">
                            {[
                                {id: 'dashboard', label: 'Dashboard', icon: '📊'},
                                {id: 'profile', label: 'Profile', icon: '👤'},
                                {id: 'sales', label: 'Sales Log', icon: '💰'},
                                {id: 'withdraw', label: 'Withdraw', icon: '📤'},
                                {id: 'support', label: 'Support', icon: '🛠️'}
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap ${
                                        activeTab === tab.id
                                            ? 'border-kudu-brown text-kudu-brown'
                                            : 'border-transparent text-charcoal-light hover:text-charcoal hover:border-kalahari-sand-dark'
                                    }`}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {!(isAuthenticated && user?.role === 'merchant') && activeTab === 'join' && renderJoinSection()}
                {!(isAuthenticated && user?.role === 'merchant') && activeTab === 'login' && renderLoginSection()}
                {isAuthenticated && user?.role === 'merchant' && activeTab === 'dashboard' && renderDashboardSection()}
                {isAuthenticated && user?.role === 'merchant' && activeTab === 'profile' && renderProfileSection()}
                {isAuthenticated && user?.role === 'merchant' && activeTab === 'sales' && renderSalesSection()}
                {isAuthenticated && user?.role === 'merchant' && activeTab === 'withdraw' && renderWithdrawSection()}
                {isAuthenticated && user?.role === 'merchant' && activeTab === 'support' && renderSupportSection()}
            </main>
        </div>
    )
}

export default ForMerchants