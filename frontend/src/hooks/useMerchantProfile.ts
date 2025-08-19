import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useMerchantProfile = () => {
    const { 
        isAuthenticated, 
        user, 
        merchantProfile, 
        fetchMerchantProfile, 
        clearMerchantProfile 
    } = useAuth();
    
    const ensureProfileLoaded = useCallback(async () => {
        if (isAuthenticated && user?.role === 'merchant' && !merchantProfile) {
            await fetchMerchantProfile();
        }
    }, [isAuthenticated, user, merchantProfile, fetchMerchantProfile]);

    return {
        profile: merchantProfile,
        isLoading: !merchantProfile && isAuthenticated && user?.role === 'merchant',
        error: null, // Error handling is now managed by AuthContext
        ensureProfileLoaded,
        fetchMerchantProfile,
        clearMerchantProfile
    };
};