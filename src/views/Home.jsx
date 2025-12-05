import React, { useState } from 'react';
import { useDecision } from '../context/DecisionContext';

const Home = () => {
    const { decisions, createDecision, selectDecision, deleteDecision, viewingUserId, setViewingUserId } = useDecision();
    const [showNewForm, setShowNewForm] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleCreate = (e) => {
        e.preventDefault();
        if (title.trim()) {
            createDecision(title, description);
            setTitle('');
            setDescription('');
            setShowNewForm(false);
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'success': return { text: 'موفق', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
            case 'fail': return { text: 'ناموفق', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
            default: return { text: 'در جریان', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {viewingUserId && (
                        <button
                            onClick={() => setViewingUserId(null)}
                            className="btn"
                            style={{ background: 'transparent', padding: 0, fontSize: '1.5rem', lineHeight: 1, color: 'var(--color-text)' }}
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
                <div className="glass-panel" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>تعریف تصمیم جدید</h3>
                    <form onSubmit={handleCreate}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>عنوان</label>
                            <input
                                type="text"
                                className="input-field"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>توضیحات</label>
                            <textarea
                                className="input-field"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowNewForm(false)} className="btn" style={{ background: '#e2e8f0' }}>
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
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <p>هنوز تصمیمی ثبت نکرده‌اید.</p>
                    <button onClick={() => setShowNewForm(true)} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                        اولین تصمیم خود را بگیرید
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {decisions.map(decision => {
                        const status = getStatusLabel(decision.status);
                        return (
                            <div key={decision.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{decision.title}</h3>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '1rem',
                                            background: status.bg,
                                            color: status.color
                                        }}>
                                            {status.text}
                                        </span>
                                    </div>
                                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                        {new Date(decision.created_at).toLocaleDateString('fa-IR')}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => selectDecision(decision.id)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                                        مشاهده / ادامه
                                    </button>
                                    <button
                                        onClick={() => { if (window.confirm('آیا از حذف این مورد اطمینان دارید؟')) deleteDecision(decision.id) }}
                                        className="btn"
                                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', background: '#fee2e2', color: '#ef4444' }}
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
