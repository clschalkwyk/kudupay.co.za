import {useState, useEffect} from 'react'
import {useToast} from '../contexts/ToastContext'
import {useAuth} from '../contexts/AuthContext'
import {useStudentProfile} from '../hooks/useStudentProfile'
import {useNavigate} from 'react-router-dom'
import {MerchantCategoryList} from '../constants/merchantCategories'

interface Transaction {
    id: string
    merchant: string
    category: string
    amount: number
    date: string
    status: 'completed' | 'pending' | 'failed'
}

function ForStudents() {
    const [activeTab, setActiveTab] = useState<'join' | 'login' | 'profile' | 'history' | 'scan' | 'tips' | 'support' | 'loginWait'>('join')
    const [darkMode, setDarkMode] = useState(false)
    const {showSuccess, showError, showInfo} = useToast()
    const {isAuthenticated, user, register, logout, error, clearError, studentLogin} = useAuth()
    const {
        profile: studentProfile,
        isLoading: profileLoading,
        ensureProfileLoaded,
        refreshProfile
    } = useStudentProfile()
    const navigate = useNavigate()
    const [manualMerchantCode, setManualMerchantCode] = useState('')

        // Inline edit state for mini profile editor
        const [editingProfile, setEditingProfile] = useState(false)
        const [firstName, setFirstName] = useState('')
        const [lastName, setLastName] = useState('')
        const [studentNumber, setStudentNumber] = useState('')
        const [savingProfile, setSavingProfile] = useState(false)
        const [profileError, setProfileError] = useState<string | null>(null)

        // Prefill fields when profile loads or when entering edit mode
        useEffect(() => {
            if (studentProfile) {
                setFirstName((studentProfile as any).firstName || studentProfile.fullName?.split(' ')[0] || '')
                setLastName((studentProfile as any).lastName || studentProfile.fullName?.split(' ').slice(1).join(' ') || '')
                setStudentNumber(studentProfile.studentNumber || '')
            }
        }, [studentProfile, editingProfile])

        const saveProfile = async () => {
            try {
                setProfileError(null)
                setSavingProfile(true)
                const apiBaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ? (import.meta as any).env.VITE_API_URL : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')
                const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
                const resp = await fetch(`${apiBaseUrl}/students/me`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': token ? `Bearer ${token}` : '',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ firstName, lastName, studentNumber })
                })
                const data = await resp.json().catch(() => ({}))
                if (!resp.ok) {
                    throw new Error(data?.error || data?.message || `Failed to save (${resp.status})`)
                }
                await refreshProfile()
                setEditingProfile(false)
                showSuccess('Profile updated')
            } catch (e: any) {
                setProfileError(e?.message || 'Failed to update profile')
                showError(e?.message || 'Failed to update profile')
            } finally {
                setSavingProfile(false)
            }
        }

    // Ensure profile is loaded when user is authenticated as student
    useEffect(() => {
        if (isAuthenticated && user?.role === 'student') {
            ensureProfileLoaded()
        }
    }, [isAuthenticated, user, ensureProfileLoaded])

    // Default active tab behavior
    useEffect(() => {
        // If authenticated student, default to Scan to Pay; otherwise, ensure join for guests
        if (isAuthenticated && user?.role === 'student') {
            setActiveTab(prev => (prev === 'join' || prev === 'login' || prev === 'loginWait') ? 'scan' : prev)
        } else {
            setActiveTab(prev => (prev === 'profile' || prev === 'history' || prev === 'scan' || prev === 'tips' || prev === 'support') ? 'join' : prev)
        }
    }, [isAuthenticated, user])

    // Auto-refresh profile less frequently while viewing dashboard (every 60s)
    useEffect(() => {
        if (!(isAuthenticated && user?.role === 'student')) return;
        if (activeTab !== 'profile') return;

        let inFlight = false;
        const tick = () => {
            // Avoid refreshing in background tabs or overlapping requests
            if (typeof document !== 'undefined' && (document as any).hidden) return;
            if (inFlight) return;
            inFlight = true;
            refreshProfile().catch(() => void 0).finally(() => {
                inFlight = false;
            });
        };

        const interval = setInterval(tick, 60000); // 60s
        // No immediate refresh to prevent bursts
        return () => clearInterval(interval);
    }, [isAuthenticated, user, activeTab, refreshProfile])

    // While on Scan tab, refresh more frequently (every 20s)
    useEffect(() => {
        if (!(isAuthenticated && user?.role === 'student')) return;
        if (activeTab !== 'scan') return;
        let inFlight = false;
        const tick = () => {
            if (typeof document !== 'undefined' && (document as any).hidden) return;
            if (inFlight) return;
            inFlight = true;
            refreshProfile().catch(() => void 0).finally(() => { inFlight = false; });
        };
        const interval = setInterval(tick, 20000); // 20s
        return () => clearInterval(interval);
    }, [isAuthenticated, user, activeTab, refreshProfile])

    // Refresh when app regains focus or becomes visible
    useEffect(() => {
        if (!(isAuthenticated && user?.role === 'student')) return;
        const onFocus = () => {
            if (typeof document !== 'undefined' && (document as any).hidden) return;
            refreshProfile().catch(() => void 0);
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [isAuthenticated, user, refreshProfile])

    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false)
    const [transactionsError, setTransactionsError] = useState<string | null>(null)

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                if (!isAuthenticated || user?.role !== 'student' || !user?.id) return
                setIsLoadingTransactions(true)
                setTransactionsError(null)

                const apiBaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ? (import.meta as any).env.VITE_API_URL : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')
                const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
                const resp = await fetch(`${apiBaseUrl}/students/${user.id}/transactions`, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        'Authorization': token ? `Bearer ${token}` : '',
                        'Content-Type': 'application/json'
                    }
                })
                const data = await resp.json()
                const list = Array.isArray(data?.data?.transactions) ? data.data.transactions : []
                // Map to UI Transaction shape if backend provides different fields
                const mapped: Transaction[] = list.map((t: any) => {
                    const rawStatus = String(t.status ?? 'completed').toLowerCase();
                    let status: 'completed' | 'pending' | 'failed' = 'completed';
                    if (rawStatus.includes('pend')) status = 'pending';
                    else if (rawStatus.includes('fail') || rawStatus.includes('block') || rawStatus.includes('declin') || rawStatus.includes('refund') || rawStatus.includes('error')) status = 'failed';
                    else status = 'completed';

                    // Normalize fields coming from backend (amount_cents, created_at, merchantId, etc.)
                    const id = String(t.id ?? t.transactionId ?? t.tx_id ?? t.txId ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
                    const merchant = String(t.merchant?.name ?? t.merchantName ?? t.recipient ?? t.merchantId ?? 'Unknown');
                    const category = String(t.category ?? t.notes ?? 'other');
                    const amount = (t.amount_cents !== undefined && t.amount_cents !== null)
                        ? Math.round(Number(t.amount_cents)) / 100
                        : Number(t.amount ?? t.amountZar ?? 0);
                    const date = String(
                        t.timestamp ?? t.createdAt ?? t.created_at ?? t.date ?? new Date().toISOString().slice(0, 10)
                    );

                    return {id, merchant, category, amount, date, status} as Transaction;
                })
                setTransactions(mapped)
            } catch (err: any) {
                console.error('Failed to fetch transactions', err)
                setTransactionsError(err?.message ?? 'Failed to load transactions')
            } finally {
                setIsLoadingTransactions(false)
            }
        }
        fetchTransactions()
    }, [isAuthenticated, user])

    const [joinForm, setJoinForm] = useState({
        firstName: '',
        lastName: '',
        studentNumber: '',
        email: '',
        sponsorCode: ''
    })

    const [loginForm, setLoginForm] = useState({
        email: '',
        password: '',
        rememberMe: false
    })


    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError() // Clear any previous errors

        try {
            await register({
                firstName: joinForm.firstName,
                lastName: joinForm.lastName,
                email: joinForm.email,
                studentNumber: joinForm.studentNumber,
                role: 'student'
            })

            showSuccess("Welcome to KuduPay!", "Lekker! Welcome to the KuduPay family. Let's get you sorted!")
            setActiveTab('profile')

            // Clear the form
            setJoinForm({
                firstName: '',
                lastName: '',
                studentNumber: '',
                email: '',
                sponsorCode: ''
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
            await studentLogin(loginForm.email, loginForm.rememberMe)

            showSuccess("Welcome Back!", "Welcome back, boet! Ready to manage your money like a pro?")
            setActiveTab('loginWait')

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

    const handleScanToPay = () => {
        showInfo("Budget Check", "Lekker, you've got R92 left for chow this month. That kota looks like a good move.")
    }

    // Allow manual merchant code entry and navigation to Pay page
    const extractPaymentId = (raw: string): string => {
        const val = (raw || '').trim()
        if (!val) return ''
        try {
            const u = new URL(val)
            const pid = u.searchParams.get('paymentId') || u.searchParams.get('code') || u.searchParams.get('m')
            return pid || val
        } catch {
            return val
        }
    }

    const handleManualSubmit = () => {
        const code = extractPaymentId(manualMerchantCode)
        if (!code) {
            showError('Merchant code required', 'Please enter the merchant code shown by the merchant or on the QR.')
            return
        }
        // Navigate to Pay page which will auto-resolve the merchant from querystring
        navigate(`/pay?paymentId=${encodeURIComponent(code)}`)
    }

    const renderJoinSection = () => (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">Join KuduPay</h2>

                <form onSubmit={handleJoin} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-charcoal mb-2">
                                First Name
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
                                Last Name
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
                        <label htmlFor="studentNumber" className="block text-sm font-medium text-charcoal mb-2">
                            Student Number
                        </label>
                        <input
                            type="text"
                            id="studentNumber"
                            value={joinForm.studentNumber}
                            onChange={(e) => setJoinForm({...joinForm, studentNumber: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-2">
                            Email Address
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

                    <div>
                        <label htmlFor="sponsorCode" className="block text-sm font-medium text-charcoal mb-2">
                            Sponsor Code (Optional)
                        </label>
                        <input
                            type="text"
                            id="sponsorCode"
                            value={joinForm.sponsorCode}
                            onChange={(e) => setJoinForm({...joinForm, sponsorCode: e.target.value})}
                            className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                            placeholder="Enter sponsor code if you have one"
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

                    <button
                        type="submit"
                        className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        Sign In
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-charcoal-light">
                        New to KuduPay?{' '}
                        <button
                            onClick={() => setActiveTab('join')}
                            className="text-kudu-brown hover:text-kudu-brown-dark font-medium"
                        >
                            Join now
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )

    const renderLoginWaitSection = () => (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">Welcome Back, please check your
                    inbox</h2>
            </div>
        </div>
    )

    const renderProfileSection = () => {
        if (profileLoading || !studentProfile) {
            return (
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                        <div className="text-center">
                            <div
                                className="animate-spin rounded-full h-12 w-12 border-b-2 border-kudu-brown mx-auto mb-4"></div>
                            <p className="text-charcoal-light">Loading your profile...</p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Profile Header */}
                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                    <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-kudu-brown rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-3xl">🦌</span>
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-charcoal">{studentProfile.fullName}</h2>
                                <p className="text-charcoal-light">{studentProfile.studentNumber}</p>
                                <div
                                    className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-savanna-gold-light text-kudu-brown">
                                    🏆 {studentProfile.badge}
                                </div>
                            </div>
                        </div>
                        <div className="ml-auto text-right">
                            <p className="text-sm text-charcoal-light">Available Balance</p>
                            <p className="text-3xl font-bold text-charcoal">
                                {`R${Number(Array.isArray(studentProfile?.categories) ? studentProfile.categories.reduce((sum: number, c: any) => sum + Number(c?.remaining || 0), 0) : 0).toFixed(2)}`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Personal details (editable) */}
                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-semibold text-charcoal">Personal details</h3>
                        {!editingProfile ? (
                            <button
                                className="px-3 py-1.5 text-sm rounded bg-kudu-brown text-white hover:bg-kudu-brown-dark"
                                onClick={() => setEditingProfile(true)}
                            >
                                Edit
                            </button>
                        ) : (
                            <div className="space-x-2">
                                <button
                                    className="px-3 py-1.5 text-sm rounded bg-kalahari-sand-light hover:bg-kalahari-sand-dark"
                                    onClick={() => { setEditingProfile(false); setProfileError(null); }}
                                    disabled={savingProfile}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="px-3 py-1.5 text-sm rounded bg-acacia-green-dark text-white hover:bg-acacia-green"
                                    onClick={saveProfile}
                                    disabled={savingProfile}
                                >
                                    {savingProfile ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Email: read-only */}
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-charcoal-light">Email</label>
                        <div className="mt-1 text-charcoal">{studentProfile.email}</div>
                    </div>

                    {!editingProfile ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-charcoal-light">First name</label>
                                <div className="mt-1 text-charcoal">{(studentProfile as any).firstName || studentProfile.fullName?.split(' ')[0] || '-'}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-charcoal-light">Last name</label>
                                <div className="mt-1 text-charcoal">{(studentProfile as any).lastName || studentProfile.fullName?.split(' ').slice(1).join(' ') || '-'}</div>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-charcoal-light">Student number</label>
                                <div className="mt-1 text-charcoal">{studentProfile.studentNumber || '-'}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-charcoal-light">First name</label>
                                <input
                                    className="mt-1 w-full rounded-lg border border-kalahari-sand-dark px-3 py-2 focus:outline-none focus:ring-2 focus:ring-kudu-brown"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    maxLength={50}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-charcoal-light">Last name</label>
                                <input
                                    className="mt-1 w-full rounded-lg border border-kalahari-sand-dark px-3 py-2 focus:outline-none focus:ring-2 focus:ring-kudu-brown"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    maxLength={50}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-charcoal-light">Student number</label>
                                <input
                                    className="mt-1 w-full rounded-lg border border-kalahari-sand-dark px-3 py-2 focus:outline-none focus:ring-2 focus:ring-kudu-brown"
                                    value={studentNumber}
                                    onChange={(e) => setStudentNumber(e.target.value)}
                                    maxLength={20}
                                />
                            </div>
                            {profileError && (<div className="sm:col-span-2 text-sm text-desert-red">{profileError}</div>)}
                        </div>
                    )}
                </div>

                {/* Sponsors */}
                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                    <h3 className="text-2xl font-semibold text-charcoal mb-6">Your Sponsors</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        {studentProfile?.sponsors && studentProfile.sponsors.map((sponsor) => (
                            <div key={sponsor.id} className="bg-kalahari-sand-light rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-semibold text-charcoal">{sponsor.name}</h4>
                                        <p className="text-sm text-charcoal-light capitalize">{sponsor.type}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-kudu-brown">R{Number(sponsor.totalAmount || 0).toFixed(2)}</p>
                                        <p className="text-sm text-charcoal-light">Total</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Categories */}
                <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                    <h3 className="text-2xl font-semibold text-charcoal mb-6">Spending Categories</h3>
                    <div className="space-y-4">
                        {studentProfile?.categories && studentProfile.categories.map((category) => (
                            <div key={category.id} className="bg-kalahari-sand-light rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold text-charcoal">{category.name}</h4>
                                    <span className="text-sm text-charcoal-light">
                      R{Number(category.spent || 0).toFixed(2)} / R{Number(category.limit || 0).toFixed(2)}
                    </span>
                                </div>
                                <div className="w-full bg-kalahari-sand-dark rounded-full h-2">
                                    <div
                                        className="bg-kudu-brown h-2 rounded-full"
                                        style={{width: `${(Number(category.limit) > 0 ? Math.max(0, Math.min(100, (Number(category.spent || 0) / Number(category.limit)) * 100)) : 0)}%`}}
                                    ></div>
                                </div>
                                <p className="text-sm text-acacia-green-dark mt-1">R{Number(category.remaining || 0).toFixed(2)} remaining</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const renderHistorySection = () => (
        <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h2 className="text-3xl font-bold text-charcoal mb-6">Transaction History</h2>

                {/* Filters */}
                <div className="flex flex-wrap gap-4 mb-6">
                    <select
                        className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown">
                        <option>All Categories</option>
                        {Object.values(MerchantCategoryList).map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <input
                        type="date"
                        className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown"
                    />
                </div>

                {/* Transactions */}
                <div className="space-y-4">
                    {isLoadingTransactions && (
                        <p className="text-charcoal-light">Loading transactions...</p>
                    )}
                    {transactionsError && (
                        <p className="text-desert-red">Error: {transactionsError}</p>
                    )}
                    {!isLoadingTransactions && !transactionsError && transactions.length === 0 && (
                        <p className="text-charcoal-light">No transactions found.</p>
                    )}
                    {!isLoadingTransactions && !transactionsError && transactions.length > 0 && transactions.map((transaction) => (
                        <div key={transaction.id} className="bg-kalahari-sand-light rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-semibold text-charcoal">{transaction.merchant}</h4>
                                    <p className="text-sm text-charcoal-light">{transaction.category} • {transaction.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-charcoal">-R{transaction.amount}</p>
                                    <span className={`text-sm px-2 py-1 rounded-full ${
                                        transaction.status === 'completed' ? 'bg-acacia-green-light text-acacia-green-dark' :
                                            transaction.status === 'pending' ? 'bg-savanna-gold-light text-savanna-gold-dark' :
                                                'bg-sunset-orange-light text-sunset-orange-dark'
                                    }`}>
                                        {transaction.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )

    const renderScanSection = () => (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 text-center">
                <h2 className="text-3xl font-bold text-charcoal mb-6">Scan to Pay</h2>

                <div className="bg-kalahari-sand-light rounded-lg p-8 mb-6">
                    <div
                        className="w-32 h-32 bg-charcoal-light rounded-lg mx-auto mb-4 flex items-center justify-center">
                        <span className="text-white text-4xl">📷</span>
                    </div>
                    <p className="text-charcoal-light">Point your camera at the merchant's QR code</p>
                </div>

                <button
                    onClick={handleScanToPay}
                    className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors mb-4"
                >
                    Start Scanning
                </button>

                <p className="text-sm text-charcoal-light">
                    Or enter merchant code manually
                </p>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleManualSubmit();
                    }}
                    className="w-full mt-2 flex gap-2 items-center"
                >
                    <div className="flex-col">
                        <div className={"my-2"}>
                            <input
                                type="text"
                                value={manualMerchantCode}
                                onChange={(e) => setManualMerchantCode(e.target.value)}
                                placeholder="Enter merchant code or paste full payment link"
                                className="flex-1 px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown"
                            />
                        </div>
                        <div className={"my-2"}>
                        <button
                            type="submit"
                            className="bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            aria-label="Proceed with merchant code"
                        >
                            Proceed
                        </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )

    const renderTipsSection = () => (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-kudu-brown rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-lg">🦌</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-charcoal mb-2">Nice! R38 saved on transport this
                            week.</h3>
                        <p className="text-charcoal-light">
                            You've been using the campus shuttle more often. Keep it up, boet!
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-acacia-green-light border-l-4 border-acacia-green rounded-r-lg p-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-acacia-green rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-lg">🏆</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-charcoal mb-2">You've stayed on track 3 weeks in a
                            row!</h3>
                        <p className="text-charcoal-light">
                            Your budgeting skills are getting stronger. I'm proud of you!
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-sunset-orange-light border-l-4 border-sunset-orange rounded-r-lg p-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-sunset-orange rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-lg">⚠️</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-charcoal mb-2">Food budget running low</h3>
                        <p className="text-charcoal-light">
                            You've got R92 left for food this month. Maybe cook at home more often?
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )

    const renderSupportSection = () => (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Koos Chatbot */}
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h2 className="text-3xl font-bold text-charcoal mb-6">Chat with Koos</h2>

                <div className="bg-kalahari-sand-light rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-8 h-8 bg-kudu-brown rounded-full flex items-center justify-center">
                            <span className="text-white text-sm">🦌</span>
                        </div>
                        <div className="bg-white rounded-lg p-3 max-w-xs">
                            <p className="text-sm">Howzit! I'm here to help. What can I assist you with today?</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Ask Koos anything..."
                        className="flex-1 px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown"
                    />
                    <button
                        className="bg-kudu-brown hover:bg-kudu-brown-dark text-white px-4 py-2 rounded-lg transition-colors">
                        Send
                    </button>
                </div>
            </div>

            {/* FAQ */}
            <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
                <h3 className="text-2xl font-semibold text-charcoal mb-6">Frequently Asked Questions</h3>

                <div className="space-y-4">
                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            What if a merchant QR fails?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            If the QR code doesn't work, you can enter the merchant code manually or ask the merchant
                            for a new QR code.
                        </p>
                    </details>

                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            What happens if I overspend?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            If you try to spend more than your category limit, the transaction will be blocked. You can
                            contact your sponsor to request additional funds.
                        </p>
                    </details>

                    <details className="bg-kalahari-sand-light rounded-lg p-4">
                        <summary className="font-semibold text-charcoal cursor-pointer">
                            How do I add a new sponsor?
                        </summary>
                        <p className="text-charcoal-light mt-2">
                            You can add a new sponsor by sharing your student code with them. They'll need to create a
                            sponsor account and link to you.
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
                        <h1 className="text-3xl font-bold text-kudu-brown">🧑‍🎓 For Students</h1>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 rounded-lg bg-kalahari-sand-light hover:bg-kalahari-sand-dark transition-colors"
                            >
                                {darkMode ? '☀️' : '🌙'}
                            </button>
                            {isAuthenticated && (
                                <button
                                    onClick={logout}
                                    className="text-charcoal-light hover:text-charcoal"
                                >
                                    Sign Out
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            {/* Navigation Tabs */}
            {isAuthenticated && (
                <div className="bg-white border-b border-kalahari-sand-dark">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <nav className="flex space-x-8 overflow-x-auto">
                            {[
                                {id: 'profile', label: 'Profile', icon: '👤'},
                                {id: 'history', label: 'History', icon: '📊'},
                                {id: 'scan', label: 'Scan to Pay', icon: '📱'},
                                {id: 'tips', label: 'Koos Tips', icon: '💡'},
                                {id: 'support', label: 'Support', icon: '🆘'}
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
                {!isAuthenticated && activeTab === 'join' && renderJoinSection()}
                {!isAuthenticated && activeTab === 'login' && renderLoginSection()}
                {!isAuthenticated && activeTab === 'loginWait' && renderLoginWaitSection()}
                {isAuthenticated && activeTab === 'profile' && renderProfileSection()}
                {isAuthenticated && activeTab === 'history' && renderHistorySection()}
                {isAuthenticated && activeTab === 'scan' && renderScanSection()}
                {isAuthenticated && activeTab === 'tips' && renderTipsSection()}
                {isAuthenticated && activeTab === 'support' && renderSupportSection()}
            </main>
        </div>
    )
}

export default ForStudents