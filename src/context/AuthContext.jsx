import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, tokenStorage } from '../apiClient';

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const bootstrapSession = async () => {
            const token = tokenStorage.get();
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const { user } = await api.auth.me();
                if (isMounted) {
                    setCurrentUser(user);
                }
            } catch {
                tokenStorage.clear();
                if (isMounted) {
                    setCurrentUser(null);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        bootstrapSession();

        return () => {
            isMounted = false;
        };
    }, []);

    const signup = useCallback(async (userData) => {
        const { token, user } = await api.auth.signup(userData);
        tokenStorage.set(token);
        setCurrentUser(user);
    }, []);

    const login = useCallback(async (username, password) => {
        const { token, user } = await api.auth.login(username, password);
        tokenStorage.set(token);
        setCurrentUser(user);
    }, []);

    const logout = useCallback(async () => {
        tokenStorage.clear();
        setCurrentUser(null);
    }, []);

    const assignClientToConsultant = useCallback(async (clientId, consultantId) => {
        await api.profiles.assignClientToConsultant(clientId, consultantId);

        // Update local state if it's the current user
        setCurrentUser(prev => {
            if (!prev || prev.id !== clientId) return prev;
            return { ...prev, consultant_id: consultantId };
        });
    }, []);

    const getClientsForConsultant = useCallback(async (consultantId) => {
        return api.profiles.getClientsForConsultant(consultantId);
    }, []);

    const getAllConsultants = useCallback(async () => {
        return api.profiles.getAllConsultants();
    }, []);

    // Helper to get all users (for supervisor)
    const getAllUsers = useCallback(async () => {
        return api.profiles.getAllUsers();
    }, []);

    const value = useMemo(() => ({
        currentUser,
        signup,
        login,
        logout,
        assignClientToConsultant,
        getClientsForConsultant,
        getAllConsultants,
        getAllUsers
    }), [
        currentUser,
        signup,
        login,
        logout,
        assignClientToConsultant,
        getClientsForConsultant,
        getAllConsultants,
        getAllUsers
    ]);

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
