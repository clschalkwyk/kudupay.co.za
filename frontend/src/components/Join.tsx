import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth} from '../contexts/AuthContext'
import {useToast} from '../contexts/ToastContext'
import { MerchantCategoryList } from '../constants/merchantCategories'
import type { MerchantCategory } from '../constants/merchantCategories'

type UserType = 'student' | 'sponsor' | 'merchant'
type FormMode = 'login' | 'register'


interface FormData {
    email: string
    password: string
    firstName: string
    lastName: string
    studentNumber: string
    businessName: string
    sponsorType: 'parent' | 'ngo' | 'government' | 'corporate'
    category: MerchantCategory | ''
    registrationNumber: string
    whatsappNumber: string
}

function Join() {
    const [activeTab, setActiveTab] = useState<UserType>('student')
    const [formMode, setFormMode] = useState<FormMode>('login')
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState<FormData>({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        studentNumber: '',
        businessName: '',
        sponsorType: 'parent',
        category: '',
        registrationNumber: '',
        whatsappNumber: ''
    })

    const navigate = useNavigate()
    const {showSuccess, showError} = useToast()
    const { login: authLogin, studentLogin, register: registerUser, checkAuthStatus } = useAuth()

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value} = e.target
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
    }

    const resetForm = () => {
        setFormData({
            email: '',
            password: '',
            firstName: '',
            lastName: '',
            studentNumber: '',
            businessName: '',
            sponsorType: 'parent',
            category: '',
            registrationNumber: '',
            whatsappNumber: ''
        })
    }

    const handleTabChange = (tab: UserType) => {
        setActiveTab(tab)
        setFormMode('login')
        resetForm()
    }

    const handleModeChange = (mode: FormMode) => {
        setFormMode(mode)
        resetForm()
    }

    const handleStudentSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            if (formMode === 'login') {
                await studentLogin(formData.email)
                showSuccess('Magic Link Sent!', 'Check your email for a magic link to log in.')
            } else {
                await registerUser({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    studentNumber: formData.studentNumber,
                    role: 'student'
                })
                await checkAuthStatus()
                showSuccess('Registration Successful!', 'Welcome to KuduPay!')
                navigate('/for-students')
            }
        } catch (error: any) {
            console.error('Student auth error:', error)
            showError('Error', error?.message || 'Unable to process request.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleSponsorSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            if (formMode === 'login') {
                await authLogin(formData.email, formData.password)
                await checkAuthStatus()
                showSuccess('Login Successful!', 'Welcome back!')
                navigate('/for-sponsors')
            } else {
                await registerUser({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    password: formData.password,
                    role: 'sponsor'
                })
                await checkAuthStatus()
                showSuccess('Registration Successful!', 'Welcome to KuduPay!')
                navigate('/for-sponsors')
            }
        } catch (error: any) {
            console.error('Sponsor auth error:', error)
            showError('Error', error?.message || 'Unable to process request.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleMerchantSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            if (formMode === 'login') {
                await authLogin(formData.email, formData.password)
                await checkAuthStatus()
                showSuccess('Login Successful!', 'Welcome back!')
                navigate('/for-merchants')
            } else {
                await registerUser({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    password: formData.password,
                    businessName: formData.businessName,
                    category: (formData as any).category as any,
                    role: 'merchant'
                })
                await checkAuthStatus()
                showSuccess('Registration Successful!', 'Welcome to KuduPay!')
                navigate('/for-merchants')
            }
        } catch (error: any) {
            console.error('Merchant auth error:', error)
            showError('Error', error?.message || 'Unable to process request.')
        } finally {
            setIsLoading(false)
        }
    }

    const renderStudentForm = () => (
        <form onSubmit={handleStudentSubmit} className="space-y-4">
            {formMode === 'register' && (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-charcoal mb-1">
                                First Name
                            </label>
                            <input
                                type="text"
                                id="firstName"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                            />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-charcoal mb-1">
                                Last Name
                            </label>
                            <input
                                type="text"
                                id="lastName"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="studentNumber" className="block text-sm font-medium text-charcoal mb-1">
                            Student Number
                        </label>
                        <input
                            type="text"
                            id="studentNumber"
                            name="studentNumber"
                            value={formData.studentNumber}
                            onChange={handleInputChange}
                            required
                            className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                        />
                    </div>
                </>
            )}

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1">
                    Email Address
                </label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                />
            </div>


            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-kudu-orange text-white py-2 px-4 rounded-lg hover:bg-kudu-orange-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Processing...' : formMode === 'login' ? 'Send Magic Link' : 'Register'}
            </button>
        </form>
    )

    const renderSponsorForm = () => (
        <form onSubmit={handleSponsorSubmit} className="space-y-4">
            {formMode === 'register' && (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-charcoal mb-1">
                                First Name
                            </label>
                            <input
                                type="text"
                                id="firstName"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                            />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-charcoal mb-1">
                                Last Name
                            </label>
                            <input
                                type="text"
                                id="lastName"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="sponsorType" className="block text-sm font-medium text-charcoal mb-1">
                            Sponsor Type
                        </label>
                        <select
                            id="sponsorType"
                            name="sponsorType"
                            value={formData.sponsorType}
                            onChange={handleInputChange}
                            required
                            className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                        >
                            <option value="parent">Parent/Guardian</option>
                            <option value="ngo">NGO</option>
                            <option value="government">Government</option>
                            <option value="corporate">Corporate</option>
                        </select>
                    </div>
                </>
            )}

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1">
                    Email Address
                </label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1">
                    Password
                </label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                />
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-kudu-orange text-white py-2 px-4 rounded-lg hover:bg-kudu-orange-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Processing...' : formMode === 'login' ? 'Sign In' : 'Register'}
            </button>
        </form>
    )

    const renderMerchantForm = () => (
        <form onSubmit={handleMerchantSubmit} className="space-y-4">
            {formMode === 'register' && (
                <>
                    <div>
                        <label htmlFor="businessName" className="block text-sm font-medium text-charcoal mb-1">
                            Business Name
                        </label>
                        <input
                            type="text"
                            id="businessName"
                            name="businessName"
                            value={formData.businessName}
                            onChange={handleInputChange}
                            required
                            className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-charcoal mb-1">
                                First Name
                            </label>
                            <input
                                type="text"
                                id="firstName"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                            />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-charcoal mb-1">
                                Last Name
                            </label>
                            <input
                                type="text"
                                id="lastName"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-charcoal mb-1">
                            Business Category
                        </label>
                        <select
                            id="category"
                            name="category"
                            value={formData.category}
                            onChange={handleInputChange}
                            required
                            className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                        >
                            <option value="">Select a category</option>
                            {Object.values(MerchantCategoryList).map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </div>
                </>
            )}

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1">
                    Email Address
                </label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1">
                    Password
                </label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-kalahari-sand-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-kudu-orange"
                />
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-kudu-orange text-white py-2 px-4 rounded-lg hover:bg-kudu-orange-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Processing...' : formMode === 'login' ? 'Sign In' : 'Register'}
            </button>
        </form>
    )

    return (
        <div className="min-h-screen bg-kalahari-sand-light flex items-center justify-center px-4 py-8">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Header */}
                <div className="bg-kudu-brown text-white p-6 text-center">
                    <img
                        src="/img/kudu_logo.svg"
                        alt="KuduPay Logo"
                        className="h-12 w-12 mx-auto mb-3"
                    />
                    <h1 className="text-2xl font-bold">Join KuduPay</h1>
                    <p className="text-kudu-brown-light mt-1">Choose your account type</p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-kalahari-sand-dark">
                    {(['student', 'sponsor', 'merchant'] as UserType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => handleTabChange(tab)}
                            className={`flex-1 py-3 px-4 text-sm font-medium capitalize transition-colors ${
                                activeTab === tab
                                    ? 'bg-kudu-orange text-white border-b-2 border-kudu-orange'
                                    : 'text-charcoal hover:bg-kalahari-sand-light'
                            }`}
                        >
                            {tab === 'student' && '🎓'} {tab === 'sponsor' && '💝'} {tab === 'merchant' && '🏪'} {tab}
                        </button>
                    ))}
                </div>

                {/* Form Mode Toggle */}
                <div className="p-6 pb-4">
                    <div className="flex bg-kalahari-sand-light rounded-lg p-1 mb-6">
                        <button
                            onClick={() => handleModeChange('login')}
                            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                                formMode === 'login'
                                    ? 'bg-white text-charcoal shadow-sm'
                                    : 'text-charcoal-light hover:text-charcoal'
                            }`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => handleModeChange('register')}
                            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                                formMode === 'register'
                                    ? 'bg-white text-charcoal shadow-sm'
                                    : 'text-charcoal-light hover:text-charcoal'
                            }`}
                        >
                            Register
                        </button>
                    </div>

                    {/* Form Content */}
                    {activeTab === 'student' && renderStudentForm()}
                    {activeTab === 'sponsor' && renderSponsorForm()}
                    {activeTab === 'merchant' && renderMerchantForm()}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6">
                    <p className="text-xs text-charcoal-light text-center">
                        By {formMode === 'register' ? 'registering' : 'signing in'}, you agree to our Terms of Service
                        and Privacy Policy.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default Join