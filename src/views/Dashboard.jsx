import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDecision } from '../context/DecisionContext';
import Home from './Home';
import styles from './Dashboard.module.css';

const Dashboard = () => {
    const { currentUser, getClientsForConsultant, getAllConsultants, assignClientToConsultant, getAllUsers } = useAuth();
    const { setViewingUserId } = useDecision();
    const [selectedClient, setSelectedClient] = useState(null);
    const [consultants, setConsultants] = useState([]);
    const [myClients, setMyClients] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser) return;

            try {
                if (currentUser.role === 'client') {
                    const cons = await getAllConsultants();
                    setConsultants(cons || []);
                } else if (currentUser.role === 'consultant') {
                    const clients = await getClientsForConsultant(currentUser.id);
                    setMyClients(clients || []);
                } else if (currentUser.role === 'supervisor' || currentUser.role === 'psychologist') {
                    const users = await getAllUsers();
                    setAllUsers(users || []);
                }
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [currentUser, getAllConsultants, getAllUsers, getClientsForConsultant]);

    if (!currentUser) return null;
    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>در حال بارگذاری...</div>;

    // Client View: Shows the standard decision app
    if (currentUser.role === 'client') {
        const myConsultant = consultants.find(c => c.id === currentUser.consultant_id);

        return (
            <div>
                <div className={styles.welcomeBox}>
                    <h3>خوش آمدید، {currentUser.full_name || currentUser.username}</h3>
                    <p>نقش: مراجع</p>
                    {currentUser.consultant_id ? (
                        <p>مشاور شما: {myConsultant?.full_name || 'نامشخص'}</p>
                    ) : (
                        <div>
                            <p className={styles.warning}>شما هنوز مشاوری ندارید.</p>
                            <div className={styles.selectContainer}>
                                <select
                                    value={selectedClient || ''}
                                    onChange={(e) => setSelectedClient(e.target.value)}
                                    className="input-field"
                                    style={{ maxWidth: '200px' }}
                                >
                                    <option value="">-- انتخاب مشاور --</option>
                                    {consultants.map(c => (
                                        <option key={c.id} value={c.id}>{c.full_name || c.username}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        if (selectedClient) {
                                            await assignClientToConsultant(currentUser.id, selectedClient);
                                            alert('مشاور با موفقیت انتخاب شد.');
                                            // Refresh page or state ideally, but simple alert for now
                                            window.location.reload();
                                        }
                                    }}
                                    disabled={!selectedClient}
                                >
                                    ثبت مشاور
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <Home />
            </div>
        );
    }

    // Consultant View
    if (currentUser.role === 'consultant') {
        return (
            <div className={styles.container}>
                <h2>داشبورد مشاور</h2>
                <p>خوش آمدید، {currentUser.full_name || currentUser.username}</p>

                <div style={{ marginTop: '2rem' }}>
                    <h3>لیست مراجعین من</h3>
                    {myClients.length === 0 ? (
                        <p>شما هنوز مراجعی ندارید.</p>
                    ) : (
                        <div className={styles.clientsGrid}>
                            {myClients.map(client => (
                                <div key={client.id} className={styles.clientCard}>
                                    <h4 className={styles.clientName}>{client.full_name || client.username}</h4>
                                    <p className={styles.clientUsername}>نام کاربری: {client.username}</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setViewingUserId(client.id);
                                        }}
                                    >
                                        مشاهده پرونده
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Supervisor / Psychologist View (Can see all clients/consultants)
    if (currentUser.role === 'supervisor' || currentUser.role === 'psychologist') {
        const allClients = allUsers.filter(u => u.role === 'client');
        const allConsultants = allUsers.filter(u => u.role === 'consultant');

        return (
            <div className={styles.container}>
                <h2>داشبورد {currentUser.role === 'supervisor' ? 'سوپروایزر' : 'روانشناس'}</h2>
                <p>خوش آمدید، {currentUser.full_name || currentUser.username}</p>

                <div style={{ marginTop: '2rem' }}>
                    <h3>لیست تمام مراجعین</h3>
                    <div className={styles.clientsGrid}>
                        {allClients.map(client => (
                            <div key={client.id} className={styles.clientCard}>
                                <h4 className={styles.clientName}>{client.full_name || client.username}</h4>
                                <p className={styles.clientUsername}>
                                    مشاور: {allUsers.find(u => u.id === client.consultant_id)?.full_name || 'ندارد'}
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ marginTop: '0.5rem', width: '100%' }}
                                    onClick={() => {
                                        setViewingUserId(client.id);
                                    }}
                                >
                                    مشاهده پرونده
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <h3>لیست تمام مشاورین</h3>
                    <ul className={styles.consultantsList}>
                        {allConsultants.map(consultant => (
                            <li key={consultant.id} className={styles.consultantItem}>
                                <strong>{consultant.full_name || consultant.username}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        );
    }

    return <div>نقش ناشناخته</div>;
};

export default Dashboard;
