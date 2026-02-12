import React, { useEffect, useState } from 'react';
import { useDecision } from '../context/DecisionContext';

const OutcomeTracker = ({ readOnly = false, onSaved }) => {
    const { currentDecision, setOutcome } = useDecision();
    const [reason, setReason] = useState(currentDecision.outcome_reason || '');

    useEffect(() => {
        setReason(currentDecision.outcome_reason || '');
    }, [currentDecision.id, currentDecision.outcome_reason]);

    const handleOutcome = async (status) => {
        if (status === 'fail' && !reason.trim()) {
            alert('لطفاً دلیل عدم موفقیت را بنویسید.');
            return;
        }
        const success = await setOutcome(status, reason);
        if (success && onSaved) {
            onSaved();
        }
    };

    if (readOnly) {
        if (currentDecision.status === 'pending') {
            return (
                <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
                    <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>نتیجه نهایی</h3>
                    <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        نتیجه‌ای ثبت نشده است.
                    </p>
                </div>
            );
        }

        return (
            <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)', border: `2px solid ${currentDecision.status === 'success' ? '#10b981' : '#ef4444'}` }}>
                <h3 style={{ color: currentDecision.status === 'success' ? '#10b981' : '#ef4444', textAlign: 'center' }}>
                    {currentDecision.status === 'success' ? 'تصمیم موفق' : 'تصمیم ناموفق'}
                </h3>
                {currentDecision.outcome_reason && (
                    <p style={{ textAlign: 'center', marginTop: '1rem', fontStyle: 'italic' }}>
                        "{currentDecision.outcome_reason}"
                    </p>
                )}
            </div>
        );
    };

    if (currentDecision.status !== 'pending') {
        return (
            <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)', border: `2px solid ${currentDecision.status === 'success' ? '#10b981' : '#ef4444'}` }}>
                <h3 style={{ color: currentDecision.status === 'success' ? '#10b981' : '#ef4444', textAlign: 'center' }}>
                    {currentDecision.status === 'success' ? 'تصمیم موفق' : 'تصمیم ناموفق'}
                </h3>
                {currentDecision.outcome_reason && (
                    <p style={{ textAlign: 'center', marginTop: '1rem', fontStyle: 'italic' }}>
                        "{currentDecision.outcome_reason}"
                    </p>
                )}
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <button onClick={() => setOutcome('pending', '')} className="btn" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        تغییر وضعیت
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>ثبت نتیجه نهایی</h3>
            <p style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--color-text-muted)' }}>
                آیا این تصمیم موفقیت‌آمیز بود؟
            </p>

            <div style={{ marginBottom: '1rem' }}>
                <textarea
                    className="input-field"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="توضیحات یا دلیل شکست (در صورت نیاز)..."
                    rows={3}
                />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button onClick={() => handleOutcome('success')} className="btn" style={{ background: '#10b981', color: 'white' }}>
                    بله، موفق بود
                </button>
                <button onClick={() => handleOutcome('fail')} className="btn" style={{ background: '#ef4444', color: 'white' }}>
                    خیر، موفق نبود
                </button>
            </div>
        </div>
    );
};

export default OutcomeTracker;
