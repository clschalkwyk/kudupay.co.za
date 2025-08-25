import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useStudentProfile = () => {
    const { studentProfile, fetchStudentProfile, isAuthenticated, user } = useAuth();
    
    const ensureProfileLoaded = useCallback(async () => {
        if (isAuthenticated && user?.role === 'student' && !studentProfile) {
            await fetchStudentProfile();
        }
    }, [isAuthenticated, user, studentProfile, fetchStudentProfile]);

    const refreshProfile = useCallback(async () => {
        if (isAuthenticated && user?.role === 'student') {
            await fetchStudentProfile(true);
        }
    }, [isAuthenticated, user, fetchStudentProfile]);

    return {
        profile: studentProfile,
        isLoading: !studentProfile && isAuthenticated && user?.role === 'student',
        ensureProfileLoaded,
        refreshProfile
    };
};