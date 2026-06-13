import React, { useEffect, useState } from 'react';
import { api } from '../apiClient';
import styles from './AuditPanel.module.css';

const ACTION_LABELS = {
    user_created: 'ایجاد کاربر',
    user_deleted: 'حذف کاربر',
    assignments_updated: 'تغییر ارجاع',
    invitation_created: 'ساخت دعوت',
    invitation_accepted: 'پذیرش دعوت',
    invitation_revoked: 'لغو دعوت',
};

const formatDateTime = (value) => {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
        return '';
    }
};

const describeDetails = (entry) => {
    const d = entry.details || {};
    if (entry.action === 'user_created' || entry.action === 'user_deleted') {
        return d.username ? `کاربر: ${d.username}` : '';
    }
    if (entry.action === 'invitation_created' || entry.action === 'invitation_accepted') {
        return d.username ? `کاربر: ${d.username}` : (d.full_name ? `نام: ${d.full_name}` : '');
    }
    return '';
};

const AuditPanel = () => {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const data = await api.audit.list(50);
                if (active) setEntries(data || []);
            } catch (fetchError) {
                if (active) setError(fetchError.message || 'بارگذاری گزارش رویدادها انجام نشد.');
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    return (
        <div className={styles.wrapper}>
            <h3>گزارش رویدادها</h3>
            {loading && <p className={styles.muted}>در حال بارگذاری...</p>}
            {error && <p className={styles.error}>{error}</p>}
            {!loading && !error && entries.length === 0 && (
                <p className={styles.muted}>رویدادی ثبت نشده است.</p>
            )}
            {entries.length > 0 && (
                <ul className={styles.list}>
                    {entries.map((entry) => (
                        <li key={entry.id} className={styles.item}>
                            <span className={styles.action}>{ACTION_LABELS[entry.action] || entry.action}</span>
                            <span className={styles.actor}>{entry.actor_name || entry.actor_username || '—'}</span>
                            <span className={styles.details}>{describeDetails(entry)}</span>
                            <span className={styles.time}>{formatDateTime(entry.created_at)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default AuditPanel;
