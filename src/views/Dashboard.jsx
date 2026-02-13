import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDecision } from '../context/DecisionContext';
import Home from './Home';
import styles from './Dashboard.module.css';

const Dashboard = () => {
    const {
        currentUser,
        getMyClients,
        markClientCommentsRead,
        getAllUsers,
        getMyAssignments,
        createUserByAdmin,
        updateClientAssignmentsByAdmin
    } = useAuth();
    const { setViewingUserId } = useDecision();

    const [myClients, setMyClients] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [myAssignments, setMyAssignments] = useState({ consultant: null, psychologist: null });
    const [assignmentDrafts, setAssignmentDrafts] = useState({});
    const [createForm, setCreateForm] = useState({
        fullName: '',
        username: '',
        password: '',
        role: 'consultant'
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const loadData = useCallback(async () => {
        if (!currentUser) return;

        setLoading(true);
        setError('');

        try {
            if (currentUser.role === 'client') {
                const assignments = await getMyAssignments();
                setMyAssignments(assignments || { consultant: null, psychologist: null });
                setMyClients([]);
                setAllUsers([]);
            } else if (currentUser.role === 'consultant' || currentUser.role === 'psychologist') {
                const clients = await getMyClients();
                setMyClients(clients || []);
                setAllUsers([]);
            } else if (currentUser.role === 'supervisor') {
                const users = await getAllUsers();
                setAllUsers(users || []);
                setMyClients([]);

                const drafts = {};
                (users || []).filter(u => u.role === 'client').forEach((client) => {
                    drafts[client.id] = {
                        consultantId: client.consultant_id || '',
                        psychologistId: client.psychologist_id || ''
                    };
                });
                setAssignmentDrafts(drafts);
            }
        } catch (fetchError) {
            console.error('Error fetching dashboard data:', fetchError);
            setError(fetchError.message || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [currentUser, getAllUsers, getMyAssignments, getMyClients]);

    const handleOpenClientCase = async (clientId) => {
        try {
            await markClientCommentsRead(clientId);
            setMyClients((prev) => prev.map((client) => (
                String(client.id) === String(clientId)
                    ? { ...client, unread_comments_count: 0 }
                    : client
            )));
        } catch (markError) {
            console.error('Error marking client comments as read:', markError);
        } finally {
            setViewingUserId(clientId);
        }
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    const allClients = useMemo(
        () => allUsers.filter(u => u.role === 'client'),
        [allUsers]
    );

    const consultants = useMemo(
        () => allUsers.filter(u => u.role === 'consultant'),
        [allUsers]
    );

    const psychologists = useMemo(
        () => allUsers.filter(u => u.role === 'psychologist'),
        [allUsers]
    );

    const handleCreateUser = async (event) => {
        event.preventDefault();
        setError('');
        setSuccessMessage('');

        try {
            await createUserByAdmin(createForm);
            setCreateForm({ fullName: '', username: '', password: '', role: 'consultant' });
            setSuccessMessage('User created successfully.');
            await loadData();
        } catch (createError) {
            setError(createError.message || 'Failed to create user');
        }
    };

    const handleAssignmentDraftChange = (clientId, key, value) => {
        setAssignmentDrafts(prev => ({
            ...prev,
            [clientId]: {
                ...(prev[clientId] || { consultantId: '', psychologistId: '' }),
                [key]: value
            }
        }));
    };

    const handleSaveAssignments = async (clientId) => {
        const draft = assignmentDrafts[clientId] || { consultantId: '', psychologistId: '' };
        setError('');
        setSuccessMessage('');

        try {
            await updateClientAssignmentsByAdmin(clientId, {
                consultantId: draft.consultantId || null,
                psychologistId: draft.psychologistId || null
            });
            setSuccessMessage('Assignments updated successfully.');
            await loadData();
        } catch (assignError) {
            setError(assignError.message || 'Failed to update assignments');
        }
    };

    if (!currentUser) return null;
    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

    if (currentUser.role === 'client') {
        return (
            <div>
                <div className={styles.welcomeBox}>
                    <h3>خوش آمدید، {currentUser.full_name || currentUser.username}</h3>
                    <p>نقش: مراجع</p>
                    {myAssignments.consultant && (
                        <p>
                            مشاور: {myAssignments.consultant.full_name}
                        </p>
                    )}
                    {myAssignments.psychologist && (
                        <p>
                            روانشناس: {myAssignments.psychologist.full_name}
                        </p>
                    )}
                </div>
                <Home />
            </div>
        );
    }

    if (currentUser.role === 'consultant' || currentUser.role === 'psychologist') {
        const roleLabel = currentUser.role === 'consultant' ? 'Consultant' : 'Psychologist';

        return (
            <div className={styles.container}>
                <h2>{roleLabel} Dashboard</h2>
                <p>Welcome, {currentUser.full_name || currentUser.username}</p>
                {error && <p className={styles.errorText}>{error}</p>}

                <div style={{ marginTop: '2rem' }}>
                    <h3>Assigned Clients</h3>
                    {myClients.length === 0 ? (
                        <p>No clients are currently assigned to you.</p>
                    ) : (
                        <div className={styles.clientsGrid}>
                            {myClients.map(client => (
                                <div key={client.id} className={styles.clientCard}>
                                    <div className={styles.clientNameRow}>
                                        <h4 className={styles.clientName}>{client.full_name || client.username}</h4>
                                        {(client.unread_comments_count || 0) > 0 && (
                                            <span className={styles.unreadBubble}>
                                                {client.unread_comments_count}
                                            </span>
                                        )}
                                    </div>
                                    <p className={styles.clientUsername}>Username: {client.username}</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleOpenClientCase(client.id)}
                                    >
                                        View Case
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (currentUser.role === 'supervisor') {
        return (
            <div className={styles.container}>
                <h2>Supervisor Dashboard</h2>
                <p>Welcome, {currentUser.full_name || currentUser.username}</p>
                {error && <p className={styles.errorText}>{error}</p>}
                {successMessage && <p className={styles.successText}>{successMessage}</p>}

                <div className={styles.adminSection}>
                    <h3>Create User</h3>
                    <form onSubmit={handleCreateUser} className={styles.adminForm}>
                        <input
                            className="input-field"
                            placeholder="Full name"
                            value={createForm.fullName}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, fullName: event.target.value }))}
                            required
                        />
                        <input
                            className="input-field"
                            placeholder="Username"
                            value={createForm.username}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, username: event.target.value }))}
                            required
                        />
                        <input
                            type="password"
                            className="input-field"
                            placeholder="Password"
                            value={createForm.password}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, password: event.target.value }))}
                            required
                        />
                        <select
                            className="input-field"
                            value={createForm.role}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, role: event.target.value }))}
                        >
                            <option value="consultant">Consultant</option>
                            <option value="psychologist">Psychologist</option>
                            <option value="client">Client</option>
                        </select>
                        <button className="btn btn-primary" type="submit">Create User</button>
                    </form>
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <h3>All Clients</h3>
                    <div className={styles.clientsGrid}>
                        {allClients.map(client => {
                            const draft = assignmentDrafts[client.id] || { consultantId: '', psychologistId: '' };
                            const consultantName = consultants.find(u => u.id === client.consultant_id)?.full_name || 'Not assigned';
                            const psychologistName = psychologists.find(u => u.id === client.psychologist_id)?.full_name || 'Not assigned';

                            return (
                                <div key={client.id} className={styles.clientCard}>
                                    <h4 className={styles.clientName}>{client.full_name || client.username}</h4>
                                    <p className={styles.clientUsername}>Consultant: {consultantName}</p>
                                    <p className={styles.clientUsername}>Psychologist: {psychologistName}</p>

                                    <label className={styles.assignmentLabel}>Consultant</label>
                                    <select
                                        className="input-field"
                                        value={draft.consultantId}
                                        onChange={(event) => handleAssignmentDraftChange(client.id, 'consultantId', event.target.value)}
                                    >
                                        <option value="">Unassigned</option>
                                        {consultants.map((consultant) => (
                                            <option key={consultant.id} value={consultant.id}>
                                                {consultant.full_name || consultant.username}
                                            </option>
                                        ))}
                                    </select>

                                    <label className={styles.assignmentLabel}>Psychologist</label>
                                    <select
                                        className="input-field"
                                        value={draft.psychologistId}
                                        onChange={(event) => handleAssignmentDraftChange(client.id, 'psychologistId', event.target.value)}
                                    >
                                        <option value="">Unassigned</option>
                                        {psychologists.map((psychologist) => (
                                            <option key={psychologist.id} value={psychologist.id}>
                                                {psychologist.full_name || psychologist.username}
                                            </option>
                                        ))}
                                    </select>

                                    <div className={styles.assignmentActions}>
                                        <button
                                            className="btn"
                                            onClick={() => setViewingUserId(client.id)}
                                        >
                                            View Case
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleSaveAssignments(client.id)}
                                        >
                                            Save Assignments
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return <div>Unknown role</div>;
};

export default Dashboard;
