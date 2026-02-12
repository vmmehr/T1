import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDecision } from '../context/DecisionContext';
import styles from './Home.module.css';

const Home = () => {
    const { currentUser } = useAuth();
    const {
        decisions,
        createDecision,
        openDecisionFlow,
        openDecisionOutcome,
        deleteDecision,
        viewingUserId,
        setViewingUserId
    } = useDecision();
    const [showNewForm, setShowNewForm] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const isStaffViewingClient = ['consultant', 'psychologist', 'supervisor'].includes(currentUser?.role) && viewingUserId;

    const handleCreate = (e) => {
        e.preventDefault();
        if (title.trim()) {
            createDecision(title, description);
            setTitle('');
            setDescription('');
            setShowNewForm(false);
        }
    };

    const getStatusLabel = (decision) => {
        switch (decision.status) {
            case 'success': return { text: 'موفق', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
            case 'fail': return { text: 'ناموفق', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
            case 'pending':
                return decision.step >= 3
                    ? { text: 'منتظر نتیجه', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' }
                    : { text: 'در جریان', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
            default:
                return { text: 'در جریان', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    {viewingUserId && (
                        <button
                            onClick={() => setViewingUserId(null)}
                            className={`btn ${styles.backButton}`}
                            title="بازگشت به داشبورد"
                        >
                            ←
                        </button>
                    )}
                    <h2>{viewingUserId ? 'پرونده مراجع' : 'تصمیم‌های من'}</h2>
                </div>
                {!viewingUserId && (
                    <button onClick={() => setShowNewForm(true)} className="btn btn-primary">
                        + تصمیم جدید
                    </button>
                )}
            </div>

            {showNewForm && (
                <div className={`glass-panel ${styles.newForm}`}>
                    <h3 className={styles.formTitle}>تعریف تصمیم جدید</h3>
                    <form onSubmit={handleCreate}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>عنوان</label>
                            <input
                                type="text"
                                className="input-field"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>توضیحات</label>
                            <textarea
                                className="input-field"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>
                        <div className={styles.formActions}>
                            <button type="button" onClick={() => setShowNewForm(false)} className={`btn ${styles.cancelButton}`}>
                                انصراف
                            </button>
                            <button type="submit" className="btn btn-primary">
                                شروع
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {decisions.length === 0 ? (
                <div className={`glass-panel ${styles.emptyState}`}>
                    <p>هنوز تصمیمی ثبت نکرده‌اید.</p>
                    <button onClick={() => setShowNewForm(true)} className={`btn btn-primary ${styles.emptyStateButton}`}>
                        اولین تصمیم خود را بگیرید
                    </button>
                </div>
            ) : (
                <div className={styles.decisionsList}>
                    {decisions.map(decision => {
                        const status = getStatusLabel(decision);
                        const canOpenOutcome = decision.step >= 3;
                        const outcomeButtonText = isStaffViewingClient
                            ? 'مشاهده نتیجه'
                            : decision.status === 'pending'
                                ? 'ثبت نتیجه'
                                : 'مشاهده / ویرایش نتیجه';

                        return (
                            <div key={decision.id} className={`glass-panel ${styles.decisionCard}`}>
                                <div>
                                    <div className={styles.decisionHeader}>
                                        <h3 className={styles.decisionTitle}>{decision.title}</h3>
                                        <span className={styles.statusBadge} style={{ background: status.bg, color: status.color }}>
                                            {status.text}
                                        </span>
                                    </div>
                                    <p className={styles.decisionDate}>
                                        {new Date(decision.created_at).toLocaleDateString('fa-IR')}
                                    </p>
                                </div>
                                <div className={styles.decisionActions}>
                                    {canOpenOutcome && (
                                        <button
                                            onClick={() => openDecisionOutcome(decision.id)}
                                            className={`btn ${styles.actionButton} ${styles.outcomeButton}`}
                                        >
                                            {outcomeButtonText}
                                        </button>
                                    )}
                                    <button onClick={() => openDecisionFlow(decision.id)} className={`btn btn-primary ${styles.actionButton}`}>
                                        مشاهده / ادامه
                                    </button>
                                    <button
                                        onClick={() => { if (window.confirm('آیا از حذف این مورد اطمینان دارید؟')) deleteDecision(decision.id) }}
                                        className={`btn ${styles.actionButton} ${styles.deleteButton}`}
                                    >
                                        حذف
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Home;
