import {createContext, useContext, useReducer, useEffect, type ReactNode} from 'react';
const baseApiUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ? (import.meta as any).env.VITE_API_URL : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');

// Types
export interface User {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email: string;
    studentNumber?: string;
    role: 'student' | 'sponsor' | 'merchant' | 'admin';
    is_active: boolean;
    created_at: string;
}

export interface Sponsor {
    id: string;
    name: string;
    type: 'parent' | 'ngo' | 'government' | 'corporate';
    totalAmount: number;
}

export interface Category {
    id: string;
    name: string;
    limit: number;
    spent: number;
    remaining: number;
}

export interface StudentProfile {
    id: string;
    fullName: string;
    studentNumber: string;
    email: string;
    sponsors: Sponsor[];
    categories: Category[];
    badge: string;
}

export interface MerchantProfile {
    id: string;
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    category: string;
    registrationNumber?: string;
    whatsappNumber?: string;
    walletAddress: string;
    qrCode: string;
    qrCodeUrl?: string;
    QRCodeUrl?: string;
    paymentId?: string | null;
    logoDataUrl?: string | null;
    qrDataUrl?: string | null;
    isApproved: boolean;
    isOnline: boolean;
    lastFiveTransactions: Array<{
        id: string;
        date: string;
        amount: number;
        studentName: string;
        category: string;
        status: 'paid' | 'blocked' | 'refunded';
    }>;
    bankAccount: {
        bankName: string;
        accountNumber: string;
        accountHolder: string;
        branchCode?: string;
    };
    financials: {
        withdrawableBalance: number;
        totalReceived: number;
        totalTransactions: number;
        salesThisWeek: number;
    };
}

export interface SponsorProfile {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    type: 'parent' | 'ngo' | 'government' | 'corporate';
    totalSponsored: number;
    activeStudents: number;
    isVerified: boolean;
}

export interface AuthState {
    user: User | null;
    token: string | null;
    studentProfile: StudentProfile | null;
    merchantProfile: MerchantProfile | null;
    sponsorProfile: SponsorProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
}

export type AuthAction =
    | { type: 'AUTH_START' }
    | { type: 'AUTH_START_STUDENT' }
    | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string } }
    | { type: 'AUTH_SUCCESS_STUDENT'; payload: { user: User; token: string } }
    | { type: 'SET_STUDENT_PROFILE'; payload: StudentProfile }
    | { type: 'CLEAR_STUDENT_PROFILE' }
    | { type: 'SET_MERCHANT_PROFILE'; payload: MerchantProfile }
    | { type: 'CLEAR_MERCHANT_PROFILE' }
    | { type: 'SET_SPONSOR_PROFILE'; payload: SponsorProfile }
    | { type: 'CLEAR_SPONSOR_PROFILE' }
    | { type: 'AUTH_FAILURE'; payload: string }
    | { type: 'LOGOUT' }
    | { type: 'CLEAR_ERROR' }
    | { type: 'SET_LOADING'; payload: boolean };

// Initial state
const initialState: AuthState = {
    user: null,
    token: null,
    studentProfile: null,
    merchantProfile: null,
    sponsorProfile: null,
    isAuthenticated: false,
    isLoading: true, // Start with loading true to check for existing token
    error: null,
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
    switch (action.type) {
        case 'AUTH_START':
            return {
                ...state,
                isLoading: true,
                error: null,
            };
        case 'AUTH_START_STUDENT':
            return {
                ...state,
                isLoading: true,
                error: null,
            };
        case 'AUTH_SUCCESS':
            return {
                ...state,
                user: action.payload.user,
                token: action.payload.token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
            };
        case 'AUTH_SUCCESS_STUDENT':
            return {
                ...state,
                isLoading: false,
                error: null,
            };
        case 'SET_STUDENT_PROFILE':
            return {
                ...state,
                studentProfile: action.payload,
            };
        case 'CLEAR_STUDENT_PROFILE':
            return {
                ...state,
                studentProfile: null,
            };
        case 'SET_MERCHANT_PROFILE':
            return {
                ...state,
                merchantProfile: action.payload,
            };
        case 'CLEAR_MERCHANT_PROFILE':
            return {
                ...state,
                merchantProfile: null,
            };
        case 'SET_SPONSOR_PROFILE':
            return {
                ...state,
                sponsorProfile: action.payload,
            };
        case 'CLEAR_SPONSOR_PROFILE':
            return {
                ...state,
                sponsorProfile: null,
            };
        case 'AUTH_FAILURE':
            return {
                ...state,
                user: null,
                token: null,
                isAuthenticated: false,
                isLoading: false,
                error: action.payload,
            };
        case 'LOGOUT':
            return {
                ...state,
                user: null,
                token: null,
                studentProfile: null,
                merchantProfile: null,
                sponsorProfile: null,
                isAuthenticated: false,
                isLoading: false,
                error: null,
            };
        case 'CLEAR_ERROR':
            return {
                ...state,
                error: null,
            };
        case 'SET_LOADING':
            return {
                ...state,
                isLoading: action.payload,
            };
        default:
            return state;
    }
}

// Context
interface AuthContextType extends AuthState {
    login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
    studentLogin: (email: string, rememberMe?: boolean) => Promise<void>;
    register: (userData: RegisterData) => Promise<void>;
    logout: () => void;
    clearError: () => void;
    checkAuthStatus: () => Promise<void>;
    fetchStudentProfile: (force?: boolean) => Promise<void>;
    clearStudentProfile: () => void;
    fetchMerchantProfile: () => Promise<void>;
    clearMerchantProfile: () => void;
    fetchSponsorProfile: () => Promise<void>;
    clearSponsorProfile: () => void;
}

interface RegisterData {
    firstName: string;
    lastName: string;
    email: string;
    studentNumber?: string;
    role: 'student' | 'sponsor' | 'merchant';
    password?: string;
    businessName?: string;
    category?: string;
    registrationNumber?  : string;
    whatsappNumber?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({children}: AuthProviderProps) {
    const [state, dispatch] = useReducer(authReducer, initialState);

    // Check for existing token on app load
    useEffect(() => {
        checkAuthStatus();
    }, []);

    const checkAuthStatus = async () => {
        try {
            const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
            if (!token) {
                dispatch({ type: 'SET_LOADING', payload: false });
                return;
            }

            // Verify token with backend
            const response = await fetch(`${baseApiUrl}/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.data?.user) {
                    const rawUser = data.data.user as any;
                    const normalizedUser: User = { ...rawUser, name: rawUser?.name ?? `${rawUser?.firstName ?? ''} ${rawUser?.lastName ?? ''}`.trim() } as User;

                    // Set authenticated state
                    dispatch({
                        type: 'AUTH_SUCCESS',
                        payload: {
                            user: normalizedUser,
                            token,
                        },
                    });

                    // Enforce single-role session: clear other role caches
                    if (normalizedUser.role !== 'student') {
                        sessionStorage.removeItem('studentProfile');
                        dispatch({ type: 'CLEAR_STUDENT_PROFILE' });
                    }
                    if (normalizedUser.role !== 'merchant') {
                        sessionStorage.removeItem('merchantProfile');
                        dispatch({ type: 'CLEAR_MERCHANT_PROFILE' });
                    }
                    if (normalizedUser.role !== 'sponsor') {
                        sessionStorage.removeItem('sponsorProfile');
                        dispatch({ type: 'CLEAR_SPONSOR_PROFILE' });
                    }
                } else {
                    // Invalid token shape
                    localStorage.removeItem('authToken');
                    sessionStorage.removeItem('authToken');
                    dispatch({ type: 'SET_LOADING', payload: false });
                }
            } else {
                // Token expired or invalid
                localStorage.removeItem('authToken');
                sessionStorage.removeItem('authToken');
                dispatch({ type: 'SET_LOADING', payload: false });
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('authToken');
            sessionStorage.removeItem('authToken');
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    const login = async (email: string, password: string, rememberMe: boolean = false) => {
        dispatch({ type: 'AUTH_START' });

        try {
            const response = await fetch(`${baseApiUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email.toLowerCase(),
                    password,
                }),
            });

            const data = await response.json();
            if (response.ok && data.data?.token && data.data?.user) {
                const token = data.data.token as string;
                const rawUser = data.data.user as any;
                const user: User = { ...rawUser, name: rawUser?.name ?? `${rawUser?.firstName ?? ''} ${rawUser?.lastName ?? ''}`.trim() } as User;

                // Store token (respect rememberMe) and ensure single storage
                if (rememberMe) {
                    localStorage.setItem('authToken', token);
                    sessionStorage.removeItem('authToken');
                } else {
                    sessionStorage.setItem('authToken', token);
                    localStorage.removeItem('authToken');
                }

                // Set authenticated state
                dispatch({
                    type: 'AUTH_SUCCESS',
                    payload: {
                        user,
                        token,
                    },
                });

                // Enforce single-role session: clear other role caches
                if (user.role !== 'student') {
                    sessionStorage.removeItem('studentProfile');
                    dispatch({ type: 'CLEAR_STUDENT_PROFILE' });
                }
                if (user.role !== 'merchant') {
                    sessionStorage.removeItem('merchantProfile');
                    dispatch({ type: 'CLEAR_MERCHANT_PROFILE' });
                }
                if (user.role !== 'sponsor') {
                    sessionStorage.removeItem('sponsorProfile');
                    dispatch({ type: 'CLEAR_SPONSOR_PROFILE' });
                }
            } else {
                dispatch({
                    type: 'AUTH_FAILURE',
                    payload: data.error || 'Login failed. Please check your credentials.',
                });
            }
        } catch (error) {
            console.error('Login error:', error);
            dispatch({
                type: 'AUTH_FAILURE',
                payload: 'Network error. Please check your connection and try again.',
            });
        }
    };

    const studentLogin = async (email: string, rememberMe: boolean = false) => {
        dispatch({ type: 'AUTH_START_STUDENT' });

        try {
            const response = await fetch(`${baseApiUrl}/auth/loginStudent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email.toLowerCase(),
                }),
            });

            const data = await response.json();

            // Case 1: Direct login (token + user returned)
            if (response.ok && data.data?.token && data.data?.user) {
                const token = data.data.token as string;
                const user = data.data.user as User;

                if (rememberMe) {
                    localStorage.setItem('authToken', token);
                    sessionStorage.removeItem('authToken');
                } else {
                    sessionStorage.setItem('authToken', token);
                    localStorage.removeItem('authToken');
                }

                // Set authenticated state
                dispatch({
                    type: 'AUTH_SUCCESS',
                    payload: {
                        user,
                        token,
                    },
                });

                // Enforce single-role session: clear other role caches
                if (user.role !== 'student') {
                    sessionStorage.removeItem('studentProfile');
                    dispatch({ type: 'CLEAR_STUDENT_PROFILE' });
                }
                if (user.role !== 'merchant') {
                    sessionStorage.removeItem('merchantProfile');
                    dispatch({ type: 'CLEAR_MERCHANT_PROFILE' });
                }
                if (user.role !== 'sponsor') {
                    sessionStorage.removeItem('sponsorProfile');
                    dispatch({ type: 'CLEAR_SPONSOR_PROFILE' });
                }
                return;
            }

            // Case 2: Magic-link initiated successfully (no token yet)
            if (response.ok && (data.data?.sent === true || data.data?.status === 'sent' || data.message?.toLowerCase?.().includes('link'))) {
                // Stop loading; UI can move to "Check your inbox" state
                dispatch({ type: 'SET_LOADING', payload: false });
                return;
            }

            // Error case
            dispatch({
                type: 'AUTH_FAILURE',
                payload: data.error || 'Login failed. Please check your email and try again.',
            });
        } catch (error) {
            console.error('Login error:', error);
            dispatch({
                type: 'AUTH_FAILURE',
                payload: 'Network error. Please check your connection and try again.',
            });
        }
    };

    const register = async (userData: RegisterData) => {
        dispatch({ type: 'AUTH_START' });

        try {
            const registerUrl = `${baseApiUrl}/auth/register`;

            const response = await fetch(registerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData),
            });

            const data = await response.json();

            if (response.ok && data.data?.token && data.data?.user) {
                const token = data.data.token as string;
                const rawUser = data.data.user as any;
                const user: User = { ...rawUser, name: rawUser?.name ?? `${rawUser?.firstName ?? ''} ${rawUser?.lastName ?? ''}`.trim() } as User;

                // Default to localStorage for registration (no rememberMe flag here)
                localStorage.setItem('authToken', token);
                sessionStorage.removeItem('authToken');

                dispatch({
                    type: 'AUTH_SUCCESS',
                    payload: {
                        user,
                        token,
                    },
                });

                // Enforce single-role session: clear other role caches
                if (user.role !== 'student') {
                    sessionStorage.removeItem('studentProfile');
                    dispatch({ type: 'CLEAR_STUDENT_PROFILE' });
                }
                if (user.role !== 'merchant') {
                    sessionStorage.removeItem('merchantProfile');
                    dispatch({ type: 'CLEAR_MERCHANT_PROFILE' });
                }
                if (user.role !== 'sponsor') {
                    sessionStorage.removeItem('sponsorProfile');
                    dispatch({ type: 'CLEAR_SPONSOR_PROFILE' });
                }
            } else {
                // Use the specific error message from the server
                const errorMessage = data.error || 'Registration failed. Please try again.';
                dispatch({
                    type: 'AUTH_FAILURE',
                    payload: errorMessage,
                });
                throw new Error(errorMessage);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Network error. Please check your connection and try again.';

            // Only dispatch if this isn't a re-thrown error from above
            if (!(error instanceof Error && error.message !== 'Network error. Please check your connection and try again.')) {
                dispatch({
                    type: 'AUTH_FAILURE',
                    payload: errorMessage,
                });
            }

            throw error; // Re-throw so handleJoin can catch it
        }
    };

    const fetchStudentProfile = async (force?: boolean) => {
        try {
            const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
            if (!token) return;

            // Check sessionStorage first (unless force-refresh)
            if (!force) {
                const cachedProfile = sessionStorage.getItem('studentProfile');
                if (cachedProfile) {
                    dispatch({
                        type: 'SET_STUDENT_PROFILE',
                        payload: JSON.parse(cachedProfile)
                    });
                    return;
                }
            }

            // Fetch from API if not cached
            const response = await fetch(`${baseApiUrl}/students/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                const profile = data.data.profile;
                
                // Store in both context and sessionStorage
                dispatch({
                    type: 'SET_STUDENT_PROFILE',
                    payload: profile
                });
                sessionStorage.setItem('studentProfile', JSON.stringify(profile));
            }
        } catch (error) {
            console.error('Failed to fetch student profile:', error);
        }
    };

    const clearStudentProfile = () => {
        sessionStorage.removeItem('studentProfile');
        dispatch({type: 'CLEAR_STUDENT_PROFILE'});
    };

    const fetchMerchantProfile = async () => {
        try {
            const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
            if (!token) return;

            // Check sessionStorage first
            const cachedProfileStr = sessionStorage.getItem('merchantProfile');
            if (cachedProfileStr) {
                const cachedProfile = JSON.parse(cachedProfileStr);
                dispatch({ type: 'SET_MERCHANT_PROFILE', payload: cachedProfile });
                // If cache is missing dynamic fields like paymentId, fetch fresh immediately
                if (!cachedProfile?.paymentId) {
                    // continue to fetch below
                } else {
                    // Refresh in background to keep cache fresh
                    (async () => {
                        try {
                            const bgResp = await fetch(`${baseApiUrl}/merchants/profile`, {
                                method: 'GET',
                                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            });
                            if (bgResp.ok) {
                                const bgData = await bgResp.json();
                                const d = bgData?.data || {};
                                const bgProfile = d.profile || {};
                                // Fallback merge: ensure QR URLs present inside profile
                                if (!bgProfile.qrCodeUrl && (d.qrCodeUrl || d.QRCodeUrl || bgProfile.QRCodeUrl)) {
                                    bgProfile.qrCodeUrl = (bgProfile.qrCodeUrl || bgProfile.QRCodeUrl || d.qrCodeUrl || d.QRCodeUrl);
                                }
                                if (!bgProfile.QRCodeUrl && (d.qrCodeUrl || d.QRCodeUrl || bgProfile.qrCodeUrl)) {
                                    bgProfile.QRCodeUrl = (bgProfile.QRCodeUrl || bgProfile.qrCodeUrl || d.QRCodeUrl || d.qrCodeUrl);
                                }
                                dispatch({ type: 'SET_MERCHANT_PROFILE', payload: bgProfile });
                                sessionStorage.setItem('merchantProfile', JSON.stringify(bgProfile));
                            }
                        } catch {}
                    })();
                    return;
                }
            }

            // Fetch from API (either no cache or missing paymentId)
            const response = await fetch(`${baseApiUrl}/merchants/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                const d = data?.data || {};
                const profile = d.profile || {};
                // Fallback merge: ensure QR URLs present inside profile
                if (!profile.qrCodeUrl && (d.qrCodeUrl || d.QRCodeUrl || profile.QRCodeUrl)) {
                    profile.qrCodeUrl = (profile.qrCodeUrl || profile.QRCodeUrl || d.qrCodeUrl || d.QRCodeUrl);
                }
                if (!profile.QRCodeUrl && (d.qrCodeUrl || d.QRCodeUrl || profile.qrCodeUrl)) {
                    profile.QRCodeUrl = (profile.QRCodeUrl || profile.qrCodeUrl || d.QRCodeUrl || d.qrCodeUrl);
                }
                // Store in both context and sessionStorage
                dispatch({ type: 'SET_MERCHANT_PROFILE', payload: profile });
                sessionStorage.setItem('merchantProfile', JSON.stringify(profile));
            }
        } catch (error) {
            console.error('Failed to fetch merchant profile:', error);
        }
    };

    const clearMerchantProfile = () => {
        sessionStorage.removeItem('merchantProfile');
        dispatch({type: 'CLEAR_MERCHANT_PROFILE'});
    };

    const fetchSponsorProfile = async () => {
        try {
            const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
            if (!token) return;

            // Check sessionStorage first
            const cachedProfile = sessionStorage.getItem('sponsorProfile');
            if (cachedProfile) {
                dispatch({
                    type: 'SET_SPONSOR_PROFILE',
                    payload: JSON.parse(cachedProfile)
                });
                return;
            }

            // Fetch from API if not cached
            const response = await fetch(`${baseApiUrl}/sponsors/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                const profile = data.data.profile;
                
                // Store in both context and sessionStorage
                dispatch({
                    type: 'SET_SPONSOR_PROFILE',
                    payload: profile
                });
                sessionStorage.setItem('sponsorProfile', JSON.stringify(profile));
            }
        } catch (error) {
            console.error('Failed to fetch sponsor profile:', error);
        }
    };

    const clearSponsorProfile = () => {
        sessionStorage.removeItem('sponsorProfile');
        dispatch({type: 'CLEAR_SPONSOR_PROFILE'});
    };

    const logout = () => {
        // Remove token from storage
        localStorage.removeItem('authToken');
        sessionStorage.removeItem('authToken');
        // Remove all profile data from storage
        sessionStorage.removeItem('studentProfile');
        sessionStorage.removeItem('merchantProfile');
        sessionStorage.removeItem('sponsorProfile');

        dispatch({type: 'LOGOUT'});
    };

    const clearError = () => {
        dispatch({type: 'CLEAR_ERROR'});
    };

    const contextValue: AuthContextType = {
        ...state,
        login,
        studentLogin,
        register,
        logout,
        clearError,
        checkAuthStatus,
        fetchStudentProfile,
        clearStudentProfile,
        fetchMerchantProfile,
        clearMerchantProfile,
        fetchSponsorProfile,
        clearSponsorProfile,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

// Custom hook to use auth context
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}