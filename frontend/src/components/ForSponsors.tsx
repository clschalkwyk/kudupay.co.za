import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { MerchantCategoryList } from '../constants/merchantCategories'
import type { MerchantCategory } from '../constants/merchantCategories'
import { toCents, formatZAR } from '../utils/currency'

// Canonicalize category label to match MerchantCategoryList (case-insensitive)
function normalizeCategoryLabel(input?: string | null): string | undefined {
  if (!input) return undefined
  const lc = String(input).toLowerCase()
  const all = Object.values(MerchantCategoryList) as string[]
  const match = all.find(c => c.toLowerCase() === lc)
  return match
}

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL)
  ? (import.meta as any).env.VITE_API_URL
  : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')

interface BudgetItem {
  category: string
  allocated_total: number
  used_total: number
  available: number
}

interface LedgerItem {
  PK: string
  SK: string
  type: 'ALLOCATION' | 'SPEND'
  category: string
  amount: number
  sponsorId?: string
  txId?: string
  created_at: string
}

interface Student {
  id: string
  firstName: string
  lastName: string
  studentNumber: string
  totalSponsored: number
  categories: Category[]
}

interface LinkedStudent {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  studentNumber?: string
}

interface Category {
  id: string
  name: string
  limit: number
  spent: number
  remaining: number
}

interface Transaction {
  id: string
  merchant?: string
  category: string
  amount_cents: number
  date: string
  status: 'completed' | 'blocked' | 'pending' | 'attempted-over-limit'
  studentName: string
}

interface EFTDeposit {
  id: string
  sponsorId: string
  reference: string
  amount_cents: number
  currency: 'ZAR'
  status: 'new' | 'allocated' | 'rejected'
  notes?: string
  created_at: string
  updated_at: string
}

function ForSponsors() {
  const SHOW_WEEKLY_SUMMARY = false;
  const SPONSOR_DYNAMIC_ALLOCATIONS = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SPONSOR_DYNAMIC_ALLOCATIONS === 'true');
  const { showSuccess, showError, showInfo } = useToast()
  const { isAuthenticated, user, register, login, logout, clearError, token } = useAuth()
  const [activeTab, setActiveTab] = useState<'join' | 'login' | 'dashboard' | 'fund' | 'activity' | 'eft' | 'support' | 'koos'>('join')
  const [darkMode, setDarkMode] = useState(false)
  const [koosMessage, setKoosMessage] = useState("Howzit! Ready to sponsor a student and make a difference?")

  // Update welcome message based on authentication state
  useEffect(() => {
    if (isAuthenticated && user?.role === 'sponsor') {
      const firstName = user.name?.split(' ')[0] || 'boet'
      setKoosMessage(`Welcome back, ${firstName}! Ready to make a difference?`)
      setActiveTab('dashboard')
    } else {
      setKoosMessage("Howzit! Ready to sponsor a student and make a difference?")
    }
  }, [isAuthenticated, user])

  const [students] = useState<Student[]>([])

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [activityCategory, setActivityCategory] = useState<string>('')
  const [activityDate, setActivityDate] = useState<string>('')

  const [joinForm, setJoinForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    organisationType: 'parent' as 'parent' | 'ngo' | 'bursary',
    password: '',
    studentCode: ''
  })

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    rememberMe: false
  })

  // Initialize fundForm with dynamic category limits based on MerchantCategoryList
  const [fundForm, setFundForm] = useState(() => {
    // Start with base fields
    const initialForm: {
      selectedStudent: string;
      totalAmount: string;
      categoryLimits: Record<MerchantCategory, string>;
      recurring: boolean;
    } = {
      selectedStudent: '',
      totalAmount: '',
      categoryLimits: {} as Record<MerchantCategory, string>,
      recurring: false
    };
    
    // Initialize all category limits with empty strings
    Object.values(MerchantCategoryList).forEach(category => {
      initialForm.categoryLimits[category] = '';
    });
    
    return initialForm;
  })

  // Sponsor budgets + ledger state
  const [budgets, setBudgets] = useState<BudgetItem[]>([])
  const [ledger, setLedger] = useState<LedgerItem[]>([])
  const [isAllocating, setIsAllocating] = useState(false)
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false)
  const [isLoadingLedger, setIsLoadingLedger] = useState(false)
  // --- Dynamic allocations (feature-flagged) ---
  const [pending, setPending] = useState<Array<{ tempId: string; category: string; amount_cents: number }>>([])
  const [newCategory, setNewCategory] = useState<string>('')
  const [newAmountInput, setNewAmountInput] = useState<string>('')
  const amountInputRef = useRef<HTMLInputElement>(null)
  const total_cents = useMemo(() => pending.reduce((a,p)=>a+p.amount_cents, 0), [pending])
  const addAllocation = () => {
    if (!SPONSOR_DYNAMIC_ALLOCATIONS) return;
    if (!newCategory) { showError('Category required', 'Please choose a category.'); return; }
    const cents = toCents(newAmountInput);
    if (!(cents > 0)) { showError('Amount required', 'Please enter a valid amount greater than 0.'); return; }
    setPending(p => [...p, { tempId: Math.random().toString(36).slice(2,10), category: newCategory, amount_cents: cents }]);
    setNewAmountInput('');
    amountInputRef.current?.focus();
  }
  const confirmAllocations = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor to allocate budgets.');
      setActiveTab('login');
      return;
    }
    if (!fundForm.selectedStudent) {
      showError('Select a student', 'Please choose a student to fund.');
      return;
    }
    if (pending.length === 0) {
      showError('No allocations', 'Please add at least one allocation.');
      return;
    }
    try {
      setIsAllocating(true)
      const idempotency_key = (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const payload = { allocations: pending.map(p => ({ category: p.category, amount_cents: p.amount_cents })), idempotency_key }
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/students/${fundForm.selectedStudent}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) })
      const data = await resp.json()
      if (!resp.ok) {
        const msg = data?.error || 'Allocation failed'
        if (resp.status === 409) {
          showError('Insufficient credits', msg)
        } else {
          showError('Allocation failed', msg)
        }
        return
      }
      const updated: BudgetItem[] = data.updated || data.budgets || []
      setBudgets(updated)
      const student = linkedStudents.find(s => s.id === fundForm.selectedStudent)
      showSuccess('Allocation successful', `Allocated ${formatZAR(total_cents)} across ${pending.length} item(s) for ${((student?.firstName || '') + ' ' + (student?.lastName || '')).trim()}.`)
      setPending([])
      setNewCategory('')
      setNewAmountInput('')
      // refresh sponsor credits summary to reflect new balance
      loadSponsorSummary()
    } catch (err: any) {
      console.error('Allocate (dynamic) error:', err)
      showError('Allocation failed', err?.message || 'Something went wrong')
    } finally {
      setIsAllocating(false)
    }
  }
  // Linked students management
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([])
  const [isLoadingLinked, setIsLoadingLinked] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [addStudentEmail, setAddStudentEmail] = useState('')

  // --- EFT deposits state ---

  // Sponsor credits summary
  interface SponsorCreditsSummary { balance_cents: number; approved_total_cents: number; allocated_total_cents: number }
  const [sponsorSummary, setSponsorSummary] = useState<SponsorCreditsSummary | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)

  const loadSponsorSummary = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') return
    try {
      setIsLoadingSummary(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/credits/summary`, { headers: { 'Authorization': `Bearer ${token}` } })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load credits summary')
      const summary: SponsorCreditsSummary = {
        balance_cents: Number(data.balance_cents || 0),
        approved_total_cents: Number(data.approved_total_cents || 0),
        allocated_total_cents: Number(data.allocated_total_cents || 0)
      }
      setSponsorSummary(summary)
    } catch (err) {
      console.error('Load sponsor summary error:', err)
    } finally {
      setIsLoadingSummary(false)
    }
  }
  const [eftReference, setEftReference] = useState<string>('')
  const [isRequestingEftRef, setIsRequestingEftRef] = useState(false)
  const [eftAmountInput, setEftAmountInput] = useState<string>('')
  const [eftNotes, setEftNotes] = useState<string>('')
  const [isSubmittingEft, setIsSubmittingEft] = useState(false)

  const [eftItems, setEftItems] = useState<EFTDeposit[]>([])
  const [eftStatus, setEftStatus] = useState<'all' | 'new' | 'allocated' | 'rejected'>('all')
  const [eftPage, setEftPage] = useState<number>(1)
  const [eftPageSize, setEftPageSize] = useState<number>(10)
  const [eftTotal, setEftTotal] = useState<number>(0)
  const [eftTotalPages, setEftTotalPages] = useState<number>(1)
  const [isLoadingEft, setIsLoadingEft] = useState(false)

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError() // Clear any previous errors
    
    try {
      await register({
        firstName: joinForm.firstName.trim(),
        lastName: joinForm.lastName.trim(),
        email: joinForm.email.toLowerCase(),
        password: joinForm.password,
        role: 'sponsor',
        studentNumber: joinForm.studentCode || undefined
      })

      showSuccess("Welcome to KuduPay!", `Lekker! Welcome to the KuduPay sponsor family, ${joinForm.firstName}! Let's help students succeed!`)
      setActiveTab('dashboard')

      // Clear the form
      setJoinForm({
        firstName: '',
        lastName: '',
        email: '',
        organisationType: 'parent',
        password: '',
        studentCode: ''
      })
    } catch (error) {
      console.error('Registration failed:', error)
      showError("Registration Failed", error instanceof Error ? error.message : "Registration failed. Please try again.")
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError() // Clear any previous errors
    
    try {
      await login(loginForm.email, loginForm.password, loginForm.rememberMe)
      
      showSuccess("Welcome back!", "Welcome back! Your students are counting on your support.")
      setActiveTab('dashboard')
      
      // Clear the form
      setLoginForm({
        email: '',
        password: '',
        rememberMe: false
      })
    } catch (error) {
      console.error('Login failed:', error)
      showError("Login Failed", "Login failed. Please check your credentials and try again.")
    }
  }

  const handleFund = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor to allocate budgets.')
      setActiveTab('login')
      return
    }
    if (!fundForm.selectedStudent) {
      showError('Select a student', 'Please choose a student to fund.')
      return
    }

    // Build allocations from dynamic category limits (only positive numbers)
    const allocations: Array<{ category: string; amount: number }> = []
    const addAlloc = (category: string, val: string) => {
      const amt = Number(val)
      if (Number.isFinite(amt) && amt > 0) allocations.push({ category, amount: amt })
    }
    
    // Process all merchant categories dynamically
    Object.entries(fundForm.categoryLimits).forEach(([category, value]) => {
      addAlloc(category, value)
    })

    if (allocations.length === 0) {
      showError('No amounts provided', 'Please enter at least one positive category amount.')
      return
    }

    try {
      setIsAllocating(true)
      const idempotency_key = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/students/${fundForm.selectedStudent}/budgets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ allocations, idempotency_key })
      })

      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error || 'Allocation failed')
      }

      // Fetch fresh budgets and ledger to ensure UI reflects latest state
      await loadBudgets()
      await loadLedger()

      const student = linkedStudents.find(s => s.id === fundForm.selectedStudent)
      setKoosMessage(`Nice one, boet! You've just allocated budgets for ${student?.firstName} ${student?.lastName}.`)
      showSuccess('Allocation successful', 'Budgets updated successfully.')

      // Reset the form with empty category limits
      setFundForm(prevForm => {
        const resetForm = { 
          ...prevForm, 
          totalAmount: '',
          categoryLimits: {} as Record<MerchantCategory, string>
        };
        // refresh sponsor credits summary to reflect new balance
        loadSponsorSummary();
        
        // Initialize all category limits with empty strings
        Object.values(MerchantCategoryList).forEach(category => {
          resetForm.categoryLimits[category] = '';
        });
        
        return resetForm;
      })
    } catch (err: any) {
      console.error('Allocate error:', err)
      showError('Allocation failed', err?.message || 'Something went wrong')
    } finally {
      setIsAllocating(false)
    }
  }

  const loadBudgets = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor to view budgets.')
      return
    }
    if (!fundForm.selectedStudent) {
      showError('Select a student', 'Please choose a student first.')
      return
    }
    try {
      setIsLoadingBudgets(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/students/${fundForm.selectedStudent}/budgets`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load budgets')
      const items: BudgetItem[] = data.budgets || data.updated || []
      setBudgets(items)
    } catch (err: any) {
      console.error('Load budgets error:', err)
      showError('Failed to load budgets', err?.message || 'Something went wrong')
    } finally {
      setIsLoadingBudgets(false)
    }
  }

  const loadLedger = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor to view history.')
      return
    }
    if (!fundForm.selectedStudent) {
      showError('Select a student', 'Please choose a student first.')
      return
    }
    try {
      setIsLoadingLedger(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/students/${fundForm.selectedStudent}/ledger?limit=20`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load history')
      const items: LedgerItem[] = data.ledger || []
      setLedger(items)
    } catch (err: any) {
      console.error('Load ledger error:', err)
      showError('Failed to load history', err?.message || 'Something went wrong')
    } finally {
      setIsLoadingLedger(false)
    }
  }

  const loadTransactions = async (filters?: { category?: string; date?: string }) => {
    if (!isAuthenticated || user?.role !== 'sponsor') return;
    if (!fundForm.selectedStudent) return;
    try {
      setIsLoadingTransactions(true)
      const params = new URLSearchParams({ limit: String(20) });
      const cat = filters?.category ? normalizeCategoryLabel(filters.category) : undefined
      if (cat) params.set('category', cat)
      if (filters?.date) {
        const start = new Date(`${filters.date}T00:00:00`)
        const end = new Date(`${filters.date}T23:59:59.999`)
        params.set('date_from', String(start.getTime()))
        params.set('date_to', String(end.getTime()))
      }
      const resp = await fetch(`${API_BASE}/students/${fundForm.selectedStudent}/transactions?${params.toString()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to load transactions');
      const arr = (data?.data?.transactions || data?.transactions || []) as any[];
      let mapped: Transaction[] = arr.map((t: any) => ({
        id: String(t.id || t.txId || `${Math.random()}`),
        merchant: t.merchantId || undefined,
        category: normalizeCategoryLabel(String(t.category || '')) || String(t.category || ''),
        amount_cents: Number(t.amount_cents || t.amount || 0),
        date: String(t.created_at || t.date || new Date().toISOString()),
        status: ((): Transaction['status'] => {
          const s = String(t.status || '').toUpperCase();
          if (s === 'APPROVED' || s === 'PARTIAL_APPROVED') return 'completed';
          if (s === 'DECLINED') return 'blocked';
          return 'pending';
        })(),
        studentName: ''
      }));
      // Client-side date filter to be safe
      if (filters?.date) {
        const startMs = new Date(`${filters.date}T00:00:00`).getTime()
        const endMs = new Date(`${filters.date}T23:59:59.999`).getTime()
        mapped = mapped.filter(t => {
          const ts = Date.parse(t.date)
          return !isNaN(ts) && ts >= startMs && ts <= endMs
        })
      }
      setTransactions(mapped);
    } catch (err) {
      console.error('Load transactions error:', err);
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  const loadLinkedStudents = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') return
    try {
      setIsLoadingLinked(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/students`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load students')
      setLinkedStudents(data.students || [])
      // Auto-select first linked student if none is selected, to load their data
      const first = (data.students || [])[0]
      if (first && !fundForm.selectedStudent) {
        setFundForm(prev => ({ ...prev, selectedStudent: first.id }))
      }
    } catch (err: any) {
      console.error('Load linked students error:', err)
      showError('Failed to load students', err?.message || 'Something went wrong')
    } finally {
      setIsLoadingLinked(false)
    }
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addStudentEmail) {
      showError('Enter student email', 'Please provide the student\'s email')
      return
    }
    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor to add students.')
      setActiveTab('login')
      return
    }
    try {
      setIsLoadingLinked(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ student_email: addStudentEmail })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to add student')
      const linked = data?.data?.student || data?.student
      if (linked) {
        setLinkedStudents(prev => prev.some(s => s.id === linked.id) ? prev : [...prev, linked])
      }
      showSuccess('Student linked', 'Student successfully linked to your sponsor account.')
      setAddStudentEmail('')
      await loadLinkedStudents()
      setShowAddStudent(false)
    } catch (err: any) {
      console.error('Add student error:', err)
      showError('Failed to add student', err?.message || 'Something went wrong')
    } finally {
      setIsLoadingLinked(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated && user?.role === 'sponsor') {
      loadLinkedStudents()
      loadSponsorSummary()
    }
  }, [isAuthenticated, user])

  // Auto-load budgets and ledger when a student is selected (including after re-authentication)
  useEffect(() => {
    if (isAuthenticated && user?.role === 'sponsor' && fundForm.selectedStudent) {
      loadBudgets()
      loadLedger()
      if (activeTab === 'activity') loadTransactions()
    }
  }, [isAuthenticated, user?.role, fundForm.selectedStudent, activeTab])

  // Refresh credits summary when switching to dashboard or fund tabs
  useEffect(() => {
    if (isAuthenticated && user?.role === 'sponsor' && (activeTab === 'dashboard' || activeTab === 'fund')) {
      loadSponsorSummary()
    }
  }, [activeTab])

  // --- EFT helpers ---
  const requestEFTReference = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor.')
      setActiveTab('login')
      return
    }
    try {
      setIsRequestingEftRef(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/eft-deposits/reference`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to generate reference')
      const ref = data?.data?.reference || data?.reference
      if (ref) {
        setEftReference(ref)
        showSuccess('Reference created', 'Use this reference when you do an EFT deposit from your bank.')
      }
    } catch (err: any) {
      console.error('Request EFT reference error:', err)
      showError('Failed to get reference', err?.message || 'Something went wrong')
    } finally {
      setIsRequestingEftRef(false)
    }
  }

  const loadEFTNotifications = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') return
    try {
      setIsLoadingEft(true)
      const params = new URLSearchParams({
        status: eftStatus,
        page: String(eftPage),
        page_size: String(eftPageSize)
      })
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/eft-deposits?${params.toString()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load EFT notifications')
      setEftItems(data.items || [])
      setEftTotal(Number(data.total || 0))
      setEftTotalPages(Number(data.total_pages || 1))
    } catch (err: any) {
      console.error('Load EFT notifications error:', err)
      showError('Failed to load EFT notifications', err?.message || 'Something went wrong')
    } finally {
      setIsLoadingEft(false)
    }
  }

  const submitEFTNotification = async () => {
    if (!isAuthenticated || user?.role !== 'sponsor') {
      showInfo('Please login', 'You need to be logged in as a sponsor to submit EFT notifications.')
      setActiveTab('login')
      return
    }
    const amount_cents = toCents(eftAmountInput)
    if (!(amount_cents > 0)) {
      showError('Invalid amount', 'Please enter a valid amount greater than 0.')
      return
    }
    if (!eftReference) {
      showError('Reference required', 'Please generate an EFT reference first.')
      return
    }
    try {
      setIsSubmittingEft(true)
      const resp = await fetch(`${API_BASE}/sponsors/${user!.id}/eft-deposits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ amount_cents, reference: eftReference, notes: eftNotes })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to submit deposit notification')
      showSuccess('Notification submitted', 'We will allocate your funds once the EFT clears.')
      setEftAmountInput('')
      setEftNotes('')
      setEftPage(1)
      await loadEFTNotifications()
    } catch (err: any) {
      console.error('Submit EFT notification error:', err)
      showError('Failed to submit', err?.message || 'Something went wrong')
    } finally {
      setIsSubmittingEft(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated && user?.role === 'sponsor' && activeTab === 'eft') {
      loadEFTNotifications()
    }
  }, [isAuthenticated, user, activeTab])

  useEffect(() => {
    if (isAuthenticated && user?.role === 'sponsor' && activeTab === 'eft') {
      loadEFTNotifications()
    }
  }, [eftStatus, eftPage, eftPageSize])

  const renderJoinSection = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">Join as a Sponsor</h2>
        
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
                minLength={2}
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
                minLength={2}
              />
            </div>
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
            <label htmlFor="organisationType" className="block text-sm font-medium text-charcoal mb-2">
              Organisation Type
            </label>
            <select
              id="organisationType"
              value={joinForm.organisationType}
              onChange={(e) => setJoinForm({...joinForm, organisationType: e.target.value as 'parent' | 'ngo' | 'bursary'})}
              className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
            >
              <option value="parent">Parent</option>
              <option value="ngo">NGO / Foundation</option>
              <option value="bursary">Corporate Bursary</option>
            </select>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-2">
              Password
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
            <label htmlFor="studentCode" className="block text-sm font-medium text-charcoal mb-2">
              Student Code (Optional)
            </label>
            <input
              type="text"
              id="studentCode"
              value={joinForm.studentCode}
              onChange={(e) => setJoinForm({...joinForm, studentCode: e.target.value})}
              className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
              placeholder="Link to a student immediately"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Join as Sponsor
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
              type="checkbox"
              id="rememberMe"
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
          <p className="text-charcoal-light">
            New to KuduPay?{' '}
            <button
              onClick={() => setActiveTab('join')}
              className="text-kudu-brown hover:text-kudu-brown-dark font-medium"
            >
              Join as sponsor
            </button>
          </p>
        </div>
      </div>
    </div>
  )

  const renderDashboardSection = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Summary Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-charcoal">Sponsor Dashboard</h2>
          <button onClick={loadSponsorSummary} className="text-sm text-kudu-brown hover:underline">Refresh</button>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-kudu-brown-light rounded-lg p-4 text-white">
            <h3 className="text-lg font-semibold">Approved Deposits</h3>
            <p className="text-2xl font-bold">{formatZAR(sponsorSummary?.approved_total_cents || 0)}</p>
            {isLoadingSummary && <p className="text-xs opacity-80">Loading…</p>}
          </div>
          <div className="bg-acacia-green-light rounded-lg p-4 text-white">
            <h3 className="text-lg font-semibold">Allocated to Students</h3>
            <p className="text-2xl font-bold">{formatZAR(sponsorSummary?.allocated_total_cents || 0)}</p>
          </div>
          <div className="bg-savanna-gold-light rounded-lg p-4 text-charcoal">
            <h3 className="text-lg font-semibold">Available to Sponsor</h3>
            <p className="text-2xl font-bold">{formatZAR(sponsorSummary?.balance_cents || 0)}</p>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-semibold text-charcoal">Your Students</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowAddStudent(true)} className="bg-kudu-brown hover:bg-kudu-brown-dark text-white px-4 py-2 rounded-lg transition-colors">
              + Add Student
            </button>
            <button onClick={loadLinkedStudents} className="bg-kalahari-sand-dark hover:bg-kalahari-sand text-charcoal px-4 py-2 rounded-lg transition-colors">
              Refresh
            </button>
          </div>
        </div>

        {showAddStudent && (
          <form onSubmit={handleAddStudent} className="mb-6 bg-kalahari-sand-light p-4 rounded-lg">
            <label htmlFor="addStudentEmail" className="block text-sm font-medium text-charcoal mb-2">
              Student Email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                id="addStudentEmail"
                value={addStudentEmail}
                onChange={(e) => setAddStudentEmail(e.target.value)}
                className="flex-1 px-4 py-2 border border-kalahari-sand-dark rounded-lg"
                placeholder="student@example.com"
                required
              />
              <button type="submit" className="bg-acacia-green hover:bg-acacia-green-dark text-white px-4 py-2 rounded-lg transition-colors">
                Link
              </button>
              <button type="button" onClick={() => setShowAddStudent(false)} className="bg-sunset-orange hover:bg-sunset-orange-dark text-white px-4 py-2 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
            {isLoadingLinked && <p className="mt-2 text-sm text-charcoal-light">Linking...</p>}
          </form>
        )}

        <div className="mb-8">
          <h4 className="text-xl font-semibold text-charcoal mb-2">Linked Students (Live)</h4>
          {isLoadingLinked ? (
            <p className="text-charcoal-light">Loading...</p>
          ) : linkedStudents.length === 0 ? (
            <p className="text-charcoal-light">No students linked yet.</p>
          ) : (
            <ul className="space-y-3">
              {linkedStudents.map(ls => (
                <li key={ls.id} className="flex items-center justify-between bg-white border border-kalahari-sand-dark rounded-lg p-3">
                  <div>
                    <p className="font-medium text-charcoal">{ls.firstName || ''} {ls.lastName || ''}</p>
                    <p className="text-sm text-charcoal-light">{ls.email || ''} {ls.studentNumber ? `• ${ls.studentNumber}` : ''}</p>
                  </div>
                  <span className="text-xs text-charcoal-light">ID: {ls.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {/* Demo list (mocked) retained below */}
        <div className="space-y-4">
          {students.map((student) => (
            <div key={student.id} className="bg-kalahari-sand-light rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-xl font-semibold text-charcoal">{student.firstName} {student.lastName}</h4>
                  <p className="text-charcoal-light">{student.studentNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-kudu-brown">R{student.totalSponsored}</p>
                  <p className="text-sm text-charcoal-light">Total Sponsored</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {student.categories.map((category) => (
                  <div key={category.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-charcoal">{category.name}</span>
                      <span className="text-sm text-charcoal-light">R{category.spent} / R{category.limit}</span>
                    </div>
                    <div className="w-full bg-kalahari-sand-dark rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          (category.spent / category.limit) > 0.8 ? 'bg-sunset-orange' :
                          (category.spent / category.limit) > 0.6 ? 'bg-savanna-gold' : 'bg-acacia-green'
                        }`}
                        style={{ width: `${Math.min((category.spent / category.limit) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
              
              {student.categories.some(cat => cat.remaining < 100) && (
                <div className="mt-4 p-3 bg-sunset-orange-light rounded-lg">
                  <p className="text-sm text-sunset-orange-dark">⚠️ Some budgets are running low</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderFundSection = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">Fund a Student</h2>
        <div className="mb-4 bg-kalahari-sand-light border border-kalahari-sand-dark rounded-lg p-3 text-sm text-charcoal">
          Amount available to sponsor: <span className="font-semibold">{formatZAR(sponsorSummary?.balance_cents || 0)}</span>
        </div>
        <form onSubmit={SPONSOR_DYNAMIC_ALLOCATIONS ? ((e) => { e.preventDefault(); confirmAllocations(); }) : handleFund} className="space-y-6">
          <div>
            <label htmlFor="selectedStudent" className="block text-sm font-medium text-charcoal mb-2">
              Select Student
            </label>
            <select
              id="selectedStudent"
              value={fundForm.selectedStudent}
              onChange={(e) => setFundForm({...fundForm, selectedStudent: e.target.value})}
              className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
              required
            >
              <option value="">Choose a student</option>
              {linkedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {(((s.firstName || '') + ' ' + (s.lastName || '')).trim()) || s.email || `ID: ${s.id}`} {s.studentNumber ? `(${s.studentNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          {SPONSOR_DYNAMIC_ALLOCATIONS ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="categoryPicker" className="block text-sm font-medium text-charcoal mb-2">Category</label>
                <select
                  id="categoryPicker"
                  value={newCategory}
                  onChange={(e) => { setNewCategory(e.target.value); setTimeout(() => amountInputRef.current?.focus(), 0); }}
                  className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                >
                  <option value="">Choose a category</option>
                  {Object.values(MerchantCategoryList).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="amountInput" className="block text-sm font-medium text-charcoal mb-2">Amount (ZAR)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  id="amountInput"
                  ref={amountInputRef}
                  value={newAmountInput}
                  onChange={(e) => setNewAmountInput(e.target.value)}
                  className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                  placeholder="e.g., 250"
                  aria-label="Amount in Rands"
                />
              </div>
              <div>
                <button type="button" onClick={addAllocation} className="bg-acacia-green hover:bg-acacia-green-dark text-white px-4 py-2 rounded-lg">Add budget</button>
              </div>
              {/* Pending allocations list */}
              {pending.length > 0 && (
                <div className="mt-2 space-y-2">
                  {pending.map((p) => (
                    <div key={p.tempId} className="flex items-center justify-between bg-kalahari-sand-light rounded-lg px-4 py-3">
                      <div className="font-medium text-charcoal">{p.category}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-charcoal-light">{formatZAR(p.amount_cents)}</span>
                        <button type="button" className="text-kudu-brown underline" onClick={() => {
                          const cur = Math.max(0, Math.round(p.amount_cents/100));
                          const next = prompt('Edit amount (R)', String(cur));
                          if (next === null) return;
                          const cents = toCents(next);
                          if (!(cents > 0)) { showError('Invalid amount', 'Please enter a positive amount.'); return; }
                          setPending(list => list.map(it => it.tempId === p.tempId ? { ...it, amount_cents: cents } : it));
                        }}>Edit</button>
                        <button type="button" className="text-sunset-orange-dark underline" onClick={() => setPending(list => list.filter(it => it.tempId !== p.tempId))}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Sticky footer */}
              <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-kalahari-sand-dark mt-4 px-4 py-3 flex items-center justify-between rounded-b-lg">
                <div className="text-sm text-charcoal">Preview Total: <span className="font-semibold">{formatZAR(total_cents)}</span></div>
                <button type="button" onClick={confirmAllocations} disabled={pending.length === 0 || isAllocating} className="bg-kudu-brown hover:bg-kudu-brown-dark disabled:opacity-60 text-white font-medium py-2 px-4 rounded-lg">
                  {isAllocating ? 'Confirming...' : 'Confirm Allocation'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="totalAmount" className="block text-sm font-medium text-charcoal mb-2">
                Total Amount (ZAR)
              </label>
              <input
                type="number"
                id="totalAmount"
                value={fundForm.totalAmount}
                onChange={(e) => setFundForm({...fundForm, totalAmount: e.target.value})}
                className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                placeholder="e.g., 1000"
                required
              />
            </div>
          )}

          {!SPONSOR_DYNAMIC_ALLOCATIONS && (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-charcoal">Set Category Limits</h3>
                
                {/* Dynamically render input fields for all merchant categories */}
                {Object.entries(MerchantCategoryList).map(([key, category]) => (
                  <div key={key}>
                    <label htmlFor={`category-${key}`} className="block text-sm font-medium text-charcoal mb-2">
                      {category} Budget
                    </label>
                    <input
                      type="number"
                      id={`category-${key}`}
                      value={fundForm.categoryLimits[category]}
                      onChange={(e) => {
                        const newCategoryLimits = {...fundForm.categoryLimits};
                        newCategoryLimits[category] = e.target.value;
                        setFundForm({...fundForm, categoryLimits: newCategoryLimits});
                      }}
                      className="w-full px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                      placeholder={`e.g., ${Math.floor(Math.random() * 300) + 100}`}
                    />
                  </div>
                ))}
              </div>

              {/* Total preview from category inputs */}
              <div className="mt-2 text-sm text-charcoal-light">
                Total preview from categories: R{
                  Object.values(fundForm.categoryLimits).reduce(
                    (total, value) => total + Number(value || 0), 
                    0
                  )
                }
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={fundForm.recurring}
                  onChange={(e) => setFundForm({...fundForm, recurring: e.target.checked})}
                  className="h-4 w-4 text-kudu-brown focus:ring-kudu-brown border-kalahari-sand-dark rounded"
                />
                <label htmlFor="recurring" className="ml-2 block text-sm text-charcoal">
                  Set up recurring monthly payment
                </label>
              </div>
            </>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={loadBudgets}
                disabled={!fundForm.selectedStudent || isLoadingBudgets}
                className="bg-acacia-green hover:bg-acacia-green-dark disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {isLoadingBudgets ? 'Loading Budgets...' : 'Load Current Budgets'}
              </button>
              <button
                type="button"
                onClick={loadLedger}
                disabled={!fundForm.selectedStudent || isLoadingLedger}
                className="bg-savanna-gold hover:bg-savanna-gold-dark disabled:opacity-60 text-charcoal px-4 py-2 rounded-lg transition-colors"
              >
                {isLoadingLedger ? 'Loading History...' : 'View Allocation History'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isAllocating}
            className="w-full mt-4 bg-kudu-brown hover:bg-kudu-brown-dark disabled:opacity-60 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            {isAllocating ? 'Allocating...' : 'Fund Student'}
          </button>
        </form>

        {/* Budgets display */}
        {budgets.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold text-charcoal mb-4">Updated Budgets</h3>
            <div className="space-y-2">
              {budgets.map((b) => (
                <div key={b.category} className="flex items-center justify-between bg-kalahari-sand-light rounded-lg px-4 py-3">
                  <div className="font-medium text-charcoal capitalize">{b.category.replace('_', ' ')}</div>
                  <div className="text-sm text-charcoal-light">{SPONSOR_DYNAMIC_ALLOCATIONS ? (<><span>Allocated: {formatZAR(b.allocated_total)}</span> • <span>Used: {formatZAR(b.used_total)}</span> • <span>Available: {formatZAR(b.available)}</span></>) : (<>Allocated: R{b.allocated_total} • Used: R{b.used_total} • Available: R{b.available}</>)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ledger display */}
        {ledger.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold text-charcoal mb-4">Allocation History</h3>
            <div className="space-y-2">
              {ledger.map((l) => (
                <div key={l.SK} className="flex items-center justify-between bg-white border border-kalahari-sand-dark rounded-lg px-4 py-3">
                  <div className="text-sm text-charcoal capitalize">{new Date(l.created_at).toLocaleString()} • {l.category} • {SPONSOR_DYNAMIC_ALLOCATIONS ? formatZAR(l.amount) : `R${l.amount}`}</div>
                  <div className="text-xs text-charcoal-light">{l.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderActivitySection = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h2 className="text-3xl font-bold text-charcoal mb-6">Student Activity</h2>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <select value={fundForm.selectedStudent} onChange={(e) => setFundForm(prev => ({...prev, selectedStudent: e.target.value}))} className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown">
            <option value="">All Students</option>
            {linkedStudents.map((s) => (
              <option key={s.id} value={s.id}>{(s.firstName || '') + ' ' + (s.lastName || '')}{s.email ? ` (${s.email})` : ''}</option>
            ))}
          </select>
          <select value={activityCategory} onChange={(e) => setActivityCategory(e.target.value)} className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown min-w-[14rem]">
            <option value="">All Categories</option>
            {Object.values(MerchantCategoryList).map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className="px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown"
          />
          <button
            type="button"
            onClick={() => loadTransactions({ category: activityCategory || undefined, date: activityDate || undefined })}
            disabled={!fundForm.selectedStudent || isLoadingTransactions}
            className="px-4 py-2 bg-kudu-brown hover:bg-kudu-brown-dark text-white rounded-lg disabled:opacity-60"
          >
            {isLoadingTransactions ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Transactions */}
        <div className="space-y-4">
          {transactions.length === 0 ? (
            <div className="text-charcoal-light">No recent transactions.</div>
          ) : (
            transactions.map((transaction) => (
              <div key={transaction.id} className="bg-kalahari-sand-light rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-charcoal">{transaction.merchant || 'Spend'}</h4>
                    <p className="text-sm text-charcoal-light">
                      {transaction.category} • {new Date(transaction.date).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-charcoal">{formatZAR(transaction.amount_cents)}</p>
                    <span className={`text-sm px-2 py-1 rounded-full ${
                      transaction.status === 'completed' ? 'bg-acacia-green-light text-acacia-green-dark' :
                      transaction.status === 'blocked' ? 'bg-sunset-orange-light text-sunset-orange-dark' :
                      'bg-savanna-gold-light text-savanna-gold-dark'
                    }`}>
                      {transaction.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Weekly Summary (hidden for now) */}
        {SHOW_WEEKLY_SUMMARY && (
          <div className="mt-8 bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-kudu-brown rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">🦌</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-charcoal mb-2">Weekly Summary</h3>
                <p className="text-charcoal-light">
                  This section is temporarily disabled.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderEFTSection = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h2 className="text-3xl font-bold text-charcoal mb-6">EFT Deposits</h2>
        <div className="space-y-6">
          <div className="bg-kalahari-sand-light rounded-lg p-4">
            <h3 className="text-lg font-semibold text-charcoal mb-2">1) Request EFT Reference</h3>
            <p className="text-sm text-charcoal-light mb-3">Use this reference when making an EFT from your bank.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={requestEFTReference} disabled={isRequestingEftRef} className="bg-kudu-brown hover:bg-kudu-brown-dark disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors">
                {isRequestingEftRef ? 'Generating...' : 'Generate EFT Reference'}
              </button>
              {eftReference && (
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 bg-white border border-kalahari-sand-dark rounded text-charcoal">{eftReference}</code>
                  <button type="button" className="bg-savanna-gold hover:bg-savanna-gold-dark text-charcoal px-3 py-1 rounded-lg transition-colors" onClick={() => {
                    try {
                      if ((navigator as any)?.clipboard?.writeText) {
                        (navigator as any).clipboard.writeText(eftReference)
                        showSuccess('Copied', 'Reference copied to clipboard')
                      } else {
                        const ta = document.createElement('textarea');
                        ta.value = eftReference; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                        showSuccess('Copied', 'Reference copied to clipboard')
                      }
                    } catch (e) { console.error(e) }
                  }}>Copy</button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-kalahari-sand-light rounded-lg p-4">
            <h3 className="text-lg font-semibold text-charcoal mb-2">2) Submit Deposit Notification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Amount (ZAR)</label>
                <input type="text" value={eftAmountInput} onChange={(e) => setEftAmountInput(e.target.value)} placeholder="e.g. 500.00" className="w-full px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-charcoal mb-2">Notes (optional)</label>
                <input type="text" value={eftNotes} onChange={(e) => setEftNotes(e.target.value)} placeholder="Any details you'd like to add" className="w-full px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown" />
              </div>
            </div>
            <button type="button" onClick={submitEFTNotification} disabled={isSubmittingEft} className="mt-3 bg-acacia-green hover:bg-acacia-green-dark disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors">
              {isSubmittingEft ? 'Submitting...' : 'Submit Notification'}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-charcoal">Past Deposit Notifications</h3>
              <div className="flex items-center gap-2">
                <select value={eftStatus} onChange={(e) => { setEftStatus(e.target.value as any); setEftPage(1) }} className="px-3 py-2 border border-kalahari-sand-dark rounded-lg">
                  <option value="all">All</option>
                  <option value="new">New</option>
                  <option value="allocated">Allocated</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select value={eftPageSize} onChange={(e) => { setEftPageSize(Number(e.target.value)); setEftPage(1) }} className="px-3 py-2 border border-kalahari-sand-dark rounded-lg">
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>

            {isLoadingEft ? (
              <div className="text-charcoal-light">Loading...</div>
            ) : (
              <>
                {eftItems.length === 0 ? (
                  <div className="text-charcoal-light">No notifications found.</div>
                ) : (
                  <div className="space-y-2">
                    {eftItems.map((it) => (
                      <div key={it.id} className="flex items-center justify-between bg-white border border-kalahari-sand-dark rounded-lg px-4 py-3">
                        <div className="text-sm text-charcoal">
                          <div className="font-medium">{new Date(it.created_at).toLocaleString()} • <span className="uppercase">{it.reference}</span></div>
                          <div className="text-charcoal-light">Status: {it.status}</div>
                        </div>
                        <div className="text-sm font-semibold text-charcoal">{formatZAR(it.amount_cents)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-charcoal-light">Page {eftPage} of {eftTotalPages} • {eftTotal} total</div>
                  <div className="flex gap-2">
                    <button type="button" disabled={eftPage <= 1} onClick={() => setEftPage((p) => Math.max(1, p - 1))} className="px-3 py-2 border border-kalahari-sand-dark rounded-lg disabled:opacity-60">Prev</button>
                    <button type="button" disabled={eftPage >= eftTotalPages} onClick={() => setEftPage((p) => Math.min(eftTotalPages, p + 1))} className="px-3 py-2 border border-kalahari-sand-dark rounded-lg disabled:opacity-60">Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const renderSupportSection = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* FAQ */}
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h2 className="text-3xl font-bold text-charcoal mb-6">Frequently Asked Questions</h2>
        
        <div className="space-y-4">
          <details className="bg-kalahari-sand-light rounded-lg p-4">
            <summary className="font-semibold text-charcoal cursor-pointer">
              Can I block certain merchants?
            </summary>
            <p className="text-charcoal-light mt-2">
              Yes! You can set merchant restrictions in your student's funding settings. This helps ensure money is spent at appropriate places.
            </p>
          </details>

          <details className="bg-kalahari-sand-light rounded-lg p-4">
            <summary className="font-semibold text-charcoal cursor-pointer">
              How often can I top up?
            </summary>
            <p className="text-charcoal-light mt-2">
              You can top up anytime! We recommend setting up recurring payments to ensure your student never runs out of funds.
            </p>
          </details>

          <details className="bg-kalahari-sand-light rounded-lg p-4">
            <summary className="font-semibold text-charcoal cursor-pointer">
              What if a student misuses funds?
            </summary>
            <p className="text-charcoal-light mt-2">
              You'll receive alerts for unusual spending patterns. You can also adjust category limits or temporarily pause funding if needed.
            </p>
          </details>

          <details className="bg-kalahari-sand-light rounded-lg p-4">
            <summary className="font-semibold text-charcoal cursor-pointer">
              How do I get tax certificates?
            </summary>
            <p className="text-charcoal-light mt-2">
              Tax certificates for bursary reporting are available in your dashboard. Download them monthly or annually as needed.
            </p>
          </details>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h3 className="text-2xl font-semibold text-charcoal mb-6">Need More Help?</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-kalahari-sand-light rounded-lg p-4">
            <h4 className="font-semibold text-charcoal mb-2">📧 Email Support</h4>
            <p className="text-charcoal-light">sponsors@kudupay.co.za</p>
          </div>
          <div className="bg-kalahari-sand-light rounded-lg p-4">
            <h4 className="font-semibold text-charcoal mb-2">📞 Phone Support</h4>
            <p className="text-charcoal-light">+27 11 123 4567</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderKoosSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8">
        <h2 className="text-3xl font-bold text-charcoal mb-6">Chat with Koos the Kudu</h2>
        
        <div className="bg-kalahari-sand-light rounded-lg p-4 mb-4 max-h-96 overflow-y-auto">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-kudu-brown rounded-full flex items-center justify-center">
              <span className="text-white text-sm">🦌</span>
            </div>
            <div className="bg-white rounded-lg p-3 max-w-xs">
              <p className="text-sm">Howzit! I'm here to help you be the best sponsor you can be. What can I assist you with today?</p>
            </div>
          </div>

          <div className="flex items-start gap-3 mb-4 justify-end">
            <div className="bg-kudu-brown rounded-lg p-3 max-w-xs text-white">
              <p className="text-sm">How can I help my student budget better?</p>
            </div>
            <div className="w-8 h-8 bg-charcoal-light rounded-full flex items-center justify-center">
              <span className="text-white text-sm">👤</span>
            </div>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-kudu-brown rounded-full flex items-center justify-center">
              <span className="text-white text-sm">🦌</span>
            </div>
            <div className="bg-white rounded-lg p-3 max-w-xs">
              <p className="text-sm">Great question! I suggest setting clear category limits and having regular check-ins. You can also use our spending alerts to catch issues early. Want me to show you how to set up smart notifications?</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask Koos anything about sponsoring students..."
            className="flex-1 px-4 py-2 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown"
          />
          <button className="bg-kudu-brown hover:bg-kudu-brown-dark text-white px-4 py-2 rounded-lg transition-colors">
            Send
          </button>
        </div>

        {/* Quick Actions */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-charcoal mb-4">Quick Questions</h3>
          <div className="flex flex-wrap gap-2">
            <button className="bg-kalahari-sand-light hover:bg-kalahari-sand-dark text-charcoal px-3 py-2 rounded-lg text-sm transition-colors">
              How to set spending limits?
            </button>
            <button className="bg-kalahari-sand-light hover:bg-kalahari-sand-dark text-charcoal px-3 py-2 rounded-lg text-sm transition-colors">
              Student spending too much?
            </button>
            <button className="bg-kalahari-sand-light hover:bg-kalahari-sand-dark text-charcoal px-3 py-2 rounded-lg text-sm transition-colors">
              How to add another student?
            </button>
          </div>
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
            <h1 className="text-3xl font-bold text-kudu-brown">🧑‍🏫 For Sponsors</h1>
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
      {isAuthenticated && (
        <div className="bg-white border-b border-kalahari-sand-dark">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8 overflow-x-auto">
              {([
                { id: 'dashboard', label: 'Dashboard', icon: '📊' },
                { id: 'fund', label: 'Fund Student', icon: '💸' },
                { id: 'activity', label: 'Activity', icon: '📈' },
                { id: 'eft', label: 'EFT Deposits', icon: '🏦' },
                { id: 'support', label: 'Support', icon: '🆘' },
                { id: 'koos', label: 'Chat with Koos', icon: '🦌' }
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
        {isAuthenticated && activeTab === 'dashboard' && renderDashboardSection()}
        {isAuthenticated && activeTab === 'fund' && renderFundSection()}
        {isAuthenticated && activeTab === 'activity' && renderActivitySection()}
        {isAuthenticated && activeTab === 'eft' && renderEFTSection()}
        {isAuthenticated && activeTab === 'support' && renderSupportSection()}
        {isAuthenticated && activeTab === 'koos' && renderKoosSection()}
      </main>
    </div>
  )
}

export default ForSponsors