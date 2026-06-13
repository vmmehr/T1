import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDecision } from '../context/DecisionContext';
import Home from './Home';
import AnalyticsPanel from '../components/AnalyticsPanel';
import InvitePanel from '../components/InvitePanel';
import AuditPanel from '../components/AuditPanel';
import styles from './Dashboard.module.css';

const faNumberFormatter = new Intl.NumberFormat('fa-IR');

const ROLE_LABELS = {
    client: 'مراجع',
    consultant: 'مشاور',
    psychologist: 'روان‌شناس',
    supervisor: 'سرپرست',
};
const roleLabel = (role) => ROLE_LABELS[role] || role;

const Dashboard = () => {
    const {
        currentUser,
        getMyClients,
        markClientCommentsRead,
        getAllUsers,
        getMyAssignments,
        createUserByAdmin,
        deleteUserByAdmin,
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
    const [deletingUserId, setDeletingUserId] = useState(null);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const formatNumber = (value) => faNumberFormatter.format(Number(value ?? 0));

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
            setError(fetchError.message || 'بارگذاری اطلاعات داشبورد انجام نشد.');
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

    const usersByCreatedAt = useMemo(
        () => [...allUsers],
        [allUsers]
    );

    const handleCreateUser = async (event) => {
        event.preventDefault();
        setError('');
        setSuccessMessage('');

        try {
            await createUserByAdmin(createForm);
            setCreateForm({ fullName: '', username: '', password: '', role: 'consultant' });
            setSuccessMessage('کاربر با موفقیت ایجاد شد.');
            await loadData();
        } catch (createError) {
            setError(createError.message || 'ایجاد کاربر ناموفق بود.');
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
            setSuccessMessage('ارجاع‌ها با موفقیت به‌روزرسانی شد.');
            await loadData();
        } catch (assignError) {
            setError(assignError.message || 'به‌روزرسانی ارجاع‌ها ناموفق بود.');
        }
    };

    const handleDeleteUser = async (user) => {
        const isSelf = String(user.id) === String(currentUser?.id);
        if (isSelf) {
            setError('نمی‌توانید حساب کاربری خودتان را حذف کنید.');
            return;
        }

        const displayName = user.full_name || user.username;
        const confirmed = window.confirm(
            `آیا از حذف «${displayName}» (${user.username}) مطمئن هستید؟\nاین عملیات قابل بازگشت نیست.`
        );
        if (!confirmed) return;

        setError('');
        setSuccessMessage('');
        setDeletingUserId(user.id);

        try {
            await deleteUserByAdmin(user.id);
            setSuccessMessage(`کاربر «${user.username}» با موفقیت حذف شد.`);
            await loadData();
        } catch (deleteError) {
            setError(deleteError.message || 'حذف کاربر ناموفق بود.');
        } finally {
            setDeletingUserId(null);
        }
    };

    if (!currentUser) return null;
    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>در حال بارگذاری...</div>;

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
        const roleTitle = currentUser.role === 'consultant' ? 'مشاور' : 'روان‌شناس';

        return (
            <div className={styles.container}>
                <h2>داشبورد {roleTitle}</h2>
                <p>خوش آمدید، {currentUser.full_name || currentUser.username}</p>
                {error && <p className={styles.errorText}>{error}</p>}

                <AnalyticsPanel />

                <InvitePanel role={currentUser.role} />

                <div style={{ marginTop: '2rem' }}>
                    <h3>مراجع‌های ارجاع‌شده</h3>
                    {myClients.length === 0 ? (
                        <p>در حال حاضر مراجعی به شما ارجاع نشده است.</p>
                    ) : (
                        <div className={styles.clientsGrid}>
                            {myClients.map(client => (
                                <div key={client.id} className={styles.clientCard}>
                                    <div className={styles.clientNameRow}>
                                        <h4 className={styles.clientName}>{client.full_name || client.username}</h4>
                                        {(client.unread_comments_count || 0) > 0 && (
                                            <span className={styles.unreadBubble}>
                                                {formatNumber(client.unread_comments_count)}
                                            </span>
                                        )}
                                    </div>
                                    <p className={styles.clientUsername}>نام کاربری: {client.username}</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleOpenClientCase(client.id)}
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

    if (currentUser.role === 'supervisor') {
        return (
            <div className={styles.container}>
                <h2>داشبورد سرپرست</h2>
                <p>خوش آمدید، {currentUser.full_name || currentUser.username}</p>
                {error && <p className={styles.errorText}>{error}</p>}
                {successMessage && <p className={styles.successText}>{successMessage}</p>}

                <AnalyticsPanel />

                <InvitePanel role={currentUser.role} />

                <div className={styles.adminSection}>
                    <h3>ایجاد کاربر</h3>
                    <form onSubmit={handleCreateUser} className={styles.adminForm}>
                        <input
                            className="input-field"
                            placeholder="نام و نام خانوادگی"
                            value={createForm.fullName}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, fullName: event.target.value }))}
                            required
                        />
                        <input
                            className="input-field"
                            placeholder="نام کاربری"
                            value={createForm.username}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, username: event.target.value }))}
                            required
                        />
                        <input
                            type="password"
                            className="input-field"
                            placeholder="رمز عبور"
                            value={createForm.password}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, password: event.target.value }))}
                            required
                        />
                        <select
                            className="input-field"
                            value={createForm.role}
                            onChange={(event) => setCreateForm(prev => ({ ...prev, role: event.target.value }))}
                        >
                            <option value="consultant">مشاور</option>
                            <option value="psychologist">روان‌شناس</option>
                            <option value="supervisor">سرپرست</option>
                            <option value="client">مراجع</option>
                        </select>
                        <button className="btn btn-primary" type="submit">ایجاد کاربر</button>
                    </form>
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <h3>همه مراجعان</h3>
                    <div className={styles.clientsGrid}>
                        {allClients.map(client => {
                            const draft = assignmentDrafts[client.id] || { consultantId: '', psychologistId: '' };
                            const consultantName = consultants.find(u => u.id === client.consultant_id)?.full_name || 'تعیین‌نشده';
                            const psychologistName = psychologists.find(u => u.id === client.psychologist_id)?.full_name || 'تعیین‌نشده';

                            return (
                                <div key={client.id} className={styles.clientCard}>
                                    <h4 className={styles.clientName}>{client.full_name || client.username}</h4>
                                    <p className={styles.clientUsername}>مشاور: {consultantName}</p>
                                    <p className={styles.clientUsername}>روان‌شناس: {psychologistName}</p>

                                    <label className={styles.assignmentLabel}>مشاور</label>
                                    <select
                                        className="input-field"
                                        value={draft.consultantId}
                                        onChange={(event) => handleAssignmentDraftChange(client.id, 'consultantId', event.target.value)}
                                    >
                                        <option value="">تعیین‌نشده</option>
                                        {consultants.map((consultant) => (
                                            <option key={consultant.id} value={consultant.id}>
                                                {consultant.full_name || consultant.username}
                                            </option>
                                        ))}
                                    </select>

                                    <label className={styles.assignmentLabel}>روان‌شناس</label>
                                    <select
                                        className="input-field"
                                        value={draft.psychologistId}
                                        onChange={(event) => handleAssignmentDraftChange(client.id, 'psychologistId', event.target.value)}
                                    >
                                        <option value="">تعیین‌نشده</option>
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
                                            مشاهده پرونده
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleSaveAssignments(client.id)}
                                        >
                                            ذخیره ارجاع‌ها
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <h3>همه کاربران</h3>
                    <div className={styles.usersGrid}>
                        {usersByCreatedAt.map((user) => {
                            const isSelf = String(user.id) === String(currentUser.id);
                            const isDeletingThis = String(deletingUserId) === String(user.id);

                            return (
                                <div key={user.id} className={styles.userCard}>
                                    <h4 className={styles.clientName}>{user.full_name || user.username}</h4>
                                    <p className={styles.clientUsername}>نام کاربری: {user.username}</p>
                                    <p className={styles.clientUsername}>نقش: {roleLabel(user.role)}</p>
                                    {isSelf && <p className={styles.warningText}>حساب فعلی قابل حذف نیست.</p>}
                                    <div className={styles.userActions}>
                                        <button
                                            type="button"
                                            className={`btn ${styles.removeUserButton}`}
                                            onClick={() => handleDeleteUser(user)}
                                            disabled={isSelf || isDeletingThis}
                                        >
                                            {isDeletingThis ? 'در حال حذف...' : 'حذف کاربر'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <AuditPanel />
            </div>
        );
    }

    return <div>نقش کاربری نامعتبر است.</div>;
};

export default Dashboard;
