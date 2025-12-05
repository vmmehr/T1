import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active session
        const getSession = async () => {
            console.log('App: checking session...');
            const { data: { session }, error } = await supabase.auth.getSession();
            console.log('App session:', session);
            if (error) console.error('App session error:', error);

            if (session?.user) {
                console.log('App: found user, fetching profile...');
                await fetchProfile(session.user.id, session.user.email);
            } else {
                console.log('App: no user found.');
                setLoading(false);
            }
        };

        getSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('App: Auth State Change:', event);
            if (session?.user) {
                console.log('App: Auth change has user, fetching profile...');
                await fetchProfile(session.user.id, session.user.email);
            } else {
                console.log('App: Auth change no user, clearing.');
                setCurrentUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId, email) => {
        try {
            console.log('fetchProfile: starting for', userId);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
            }

            if (data) {
                console.log('fetchProfile: success', data);
                setCurrentUser({ ...data, email });
            } else {
                console.warn('fetchProfile: no data returned (RLS?)');
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error);
        } finally {
            setLoading(false);
        }
    };

    const DUMMY_DOMAIN = 'decisionapp.com';

    const signup = async (userData) => {
        // 1. Sign up with Supabase Auth
        const email = `${userData.username}@${DUMMY_DOMAIN}`;
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: userData.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('Signup failed');

        // 2. Create Profile
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([
                {
                    id: authData.user.id,
                    username: userData.username,
                    full_name: userData.fullName,
                    role: userData.role || 'client',
                    consultant_id: userData.consultantId || null
                }
            ]);

        if (profileError) {
            // Cleanup auth user if profile creation fails (optional but good practice)
            await supabase.auth.signOut();
            throw profileError;
        }

        // 3. Fetch profile to ensure currentUser is updated (fixes race condition with onAuthStateChange)
        await fetchProfile(authData.user.id, email);
    };

    const login = async (username, password) => {
        // Always append dummy domain, assuming username only input
        const email = `${username}@${DUMMY_DOMAIN}`;
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;
    };

    const logout = async () => {
        await supabase.auth.signOut();
    };

    const assignClientToConsultant = async (clientId, consultantId) => {
        const { error } = await supabase
            .from('profiles')
            .update({ consultant_id: consultantId })
            .eq('id', clientId);

        if (error) throw error;

        // Update local state if it's the current user
        if (currentUser && currentUser.id === clientId) {
            setCurrentUser(prev => ({ ...prev, consultant_id: consultantId }));
        }
    };

    const getClientsForConsultant = async (consultantId) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'client')
            .eq('consultant_id', consultantId);

        if (error) throw error;
        return data;
    };

    const getAllConsultants = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'consultant');

        if (error) throw error;
        return data;
    };

    // Helper to get all users (for supervisor)
    const getAllUsers = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*');
        if (error) throw error;
        return data;
    };

    const value = {
        currentUser,
        signup,
        login,
        logout,
        assignClientToConsultant,
        getClientsForConsultant,
        getAllConsultants,
        getAllUsers
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
