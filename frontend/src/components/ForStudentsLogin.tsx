import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

function ForStudentsLogin() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { showSuccess, showError } = useToast()
    const { isAuthenticated, isLoading, checkAuthStatus } = useAuth()
    const [verifying, setVerifying] = useState(false)
    const [verificationComplete, setVerificationComplete] = useState(false)

    useEffect(() => {
        const token = searchParams.get('token')
        
        if (!token) {
            showError('Invalid Magic Link', 'No token found in the URL. Please check your magic link.')
            navigate('/for-students')
            return
        }

        if (verificationComplete) {
            return
        }

        verifyMagicLink(token)
    }, [searchParams, navigate, showError, verificationComplete])

    const verifyMagicLink = async (token: string) => {
        setVerifying(true)
        
        try {
            const baseApiUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ? (import.meta as any).env.VITE_API_URL : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');
            const response = await fetch(`${baseApiUrl}/auth/verify-magic-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token }),
            })

            const data = await response.json()

            if (response.ok && data.data?.token && data.data?.user) {
                // Store the JWT token
                localStorage.setItem('authToken', data.data.token)
                
                showSuccess('Login Successful!', `Welcome back, ${data.data.user.name}! You've been successfully logged in.`)
                
                // Update auth context with new token
                await checkAuthStatus()
                
                // Redirect to student dashboard/profile
                navigate('/for-students')
            } else {
                showError('Magic Link Verification Failed', data.error || 'The magic link is invalid or has expired.')
                navigate('/for-students')
            }
        } catch (error) {
            console.error('Magic link verification error:', error)
            showError('Connection Error', 'Unable to verify magic link. Please check your connection and try again.')
            navigate('/for-students')
        } finally {
            setVerifying(false)
            setVerificationComplete(true)
        }
    }

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated && !isLoading) {
            navigate('/for-students')
        }
    }, [isAuthenticated, isLoading, navigate])

    return (
        <div className="min-h-screen bg-kalahari-sand-light flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="mb-6">
                    <img 
                        src="/img/kudu_logo.svg" 
                        alt="KuduPay Logo" 
                        className="h-16 w-16 mx-auto mb-4"
                    />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Verifying Magic Link
                    </h1>
                </div>

                {verifying ? (
                    <div className="space-y-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kudu-orange mx-auto"></div>
                        <p className="text-gray-600">
                            Please wait while we verify your magic link...
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="text-gray-600">
                            <p>Processing your login request...</p>
                        </div>
                    </div>
                )}

                <div className="mt-8 pt-6 border-t border-gray-200">
                    <p className="text-sm text-gray-500">
                        Having trouble? Contact support or try requesting a new magic link.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default ForStudentsLogin