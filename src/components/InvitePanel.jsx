import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../apiClient';
import styles from './InvitePanel.module.css';

const faNumber = new Intl.NumberFormat('fa-IR');
const STATUS_LABELS = {
    pending: 'در انتظار',
    used: 'استفاده‌شده',
    expired: 'منقضی',
};

const inviteLink = (token) => `${window.location.origin}/invite/${token}`;
const formatDate = (value) => {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(value));
    } catch {
        return '';
    }
};

const InvitePanel = ({ role }) => {
    const isSupervisor = role === 'supervisor';
    const [invitations, setInvitations] = useState([]);
    const [consultants, setConsultants] = useState([]);
    const [fullName, setFullName] = useState('');
    const [consultantId, setConsultantId] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [copiedId, setCopiedId] = useState(null);

    const load = useCallback(async () => {
        try {
            const list = await api.invitations.list();
            setInvitations(list || []);
        } catch (loadError) {
            setError(loadError.message || 'بارگذاری دعوت‌ها انجام نشد.');
        }
    }, []);

    useEffect(() => {
        load();
        if (isSupervisor) {
            api.profiles.getAllConsultants().then((c) => setConsultants(c || [])).catch(() => {});
        }
    }, [load, isSupervisor]);

    const handleCreate = async (event) => {
        event.preventDefault();
        setError('');
        setCreating(true);
        try {
            const payload = { fullName };
            if (isSupervisor && consultantId) payload.consultantId = consultantId;
            await api.invitations.create(payload);
            setFullName('');
            setConsultantId('');
            await load();
        } catch (createError) {
            setError(createError.message || 'ساخت دعوت ناموفق بود.');
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = async (invitation) => {
        const link = inviteLink(invitation.token);
        try {
            await navigator.clipboard.writeText(link);
        } catch {
            // Clipboard may be unavailable; selection fallback is acceptable to skip.
        }
        setCopiedId(invitation.id);
        setTimeout(() => setCopiedId((prev) => (prev === invitation.id ? null : prev)), 2000);
    };

    const handleRevoke = async (invitation) => {
        if (!window.confirm('آیا این دعوت لغو شود؟')) return;
        try {
            await api.invitations.revoke(invitation.id);
            await load();
        } catch (revokeError) {
            setError(revokeError.message || 'لغو دعوت ناموفق بود.');
        }
    };

    return (
        <div className={styles.wrapper}>
            <h3>دعوت مراجع</h3>
            {error && <p className={styles.error}>{error}</p>}

            <form onSubmit={handleCreate} className={styles.form}>
                <input
                    className="input-field"
                    placeholder="نام مراجع (اختیاری)"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                />
                {isSupervisor && (
                    <select
                        className="input-field"
                        value={consultantId}
                        onChange={(event) => setConsultantId(event.target.value)}
                    >
                        <option value="">بدون مشاور</option>
                        {consultants.map((consultant) => (
                            <option key={consultant.id} value={consultant.id}>
                                {consultant.full_name || consultant.username}
                            </option>
                        ))}
                    </select>
                )}
                <button className="btn btn-primary" type="submit" disabled={creating}>
                    {creating ? 'در حال ساخت...' : 'ساخت لینک دعوت'}
                </button>
            </form>

            {invitations.length === 0 ? (
                <p className={styles.empty}>هنوز دعوتی ساخته نشده است.</p>
            ) : (
                <ul className={styles.list}>
                    {invitations.map((invitation) => (
                        <li key={invitation.id} className={styles.item}>
                            <div className={styles.itemMain}>
                                <span className={styles.itemName}>
                                    {invitation.full_name || 'بدون نام'}
                                </span>
                                <span className={`${styles.badge} ${styles[invitation.status]}`}>
                                    {STATUS_LABELS[invitation.status] || invitation.status}
                                </span>
                                <span className={styles.meta}>تاریخ انقضا: {formatDate(invitation.expires_at)}</span>
                            </div>
                            {invitation.status === 'pending' && (
                                <div className={styles.itemActions}>
                                    <button type="button" className="btn" onClick={() => handleCopy(invitation)}>
                                        {copiedId === invitation.id ? 'کپی شد ✓' : 'کپی لینک'}
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn ${styles.revoke}`}
                                        onClick={() => handleRevoke(invitation)}
                                    >
                                        لغو
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {invitations.length > 0 && (
                <p className={styles.hint}>تعداد دعوت‌ها: {faNumber.format(invitations.length)}</p>
            )}
        </div>
    );
};

export default InvitePanel;
