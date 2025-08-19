import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useSponsorProfile = () => {
    const { 
        isAuthenticated, 
        user, 
        sponsorProfile, 
        fetchSponsorProfile, 
        clearSponsorProfile 
    } = useAuth();
    
    const ensureProfileLoaded = useCallback(async () => {
        if (isAuthenticated && user?.role === 'sponsor' && !sponsorProfile) {
            await fetchSponsorProfile();
        }
    }, [isAuthenticated, user, sponsorProfile, fetchSponsorProfile]);

    return {
        profile: sponsorProfile,
        isLoading: !sponsorProfile && isAuthenticated && user?.role === 'sponsor',
        error: null, // Error handling is now managed by AuthContext
        ensureProfileLoaded,
        fetchSponsorProfile,
        clearSponsorProfile
    };
};