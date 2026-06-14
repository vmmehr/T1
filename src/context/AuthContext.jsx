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

    const acceptInvite = useCallback(async (inviteData) => {
        const { token, user } = await api.auth.acceptInvite(inviteData);
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

    const getMyClients = useCallback(async () => {
        return api.profiles.getMyClients();
    }, []);

    const markClientCommentsRead = useCallback(async (clientId) => {
        return api.profiles.markClientCommentsRead(clientId);
    }, []);

    const getAllConsultants = useCallback(async () => {
        return api.profiles.getAllConsultants();
    }, []);

    const getAllUsers = useCallback(async () => {
        return api.profiles.getAllUsers();
    }, []);

    const getMyAssignments = useCallback(async () => {
        return api.profiles.getMyAssignments();
    }, []);

    const createUserByAdmin = useCallback(async (data) => {
        return api.admin.createUser(data);
    }, []);

    const deleteUserByAdmin = useCallback(async (userId) => {
        return api.admin.deleteUser(userId);
    }, []);

    const updateClientAssignmentsByAdmin = useCallback(async (clientId, data) => {
        return api.admin.updateClientAssignments(clientId, data);
    }, []);

    const createPasswordResetLink = useCallback(async (userId) => {
        return api.passwordResets.create(userId);
    }, []);

    const value = useMemo(() => ({
        currentUser,
        signup,
        acceptInvite,
        login,
        logout,
        getMyClients,
        markClientCommentsRead,
        getAllConsultants,
        getAllUsers,
        getMyAssignments,
        createUserByAdmin,
        deleteUserByAdmin,
        updateClientAssignmentsByAdmin,
        createPasswordResetLink
    }), [
        currentUser,
        signup,
        acceptInvite,
        login,
        logout,
        getMyClients,
        markClientCommentsRead,
        getAllConsultants,
        getAllUsers,
        getMyAssignments,
        createUserByAdmin,
        deleteUserByAdmin,
        updateClientAssignmentsByAdmin,
        createPasswordResetLink
    ]);

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
