import React, { useEffect, useMemo, useState } from 'react';
import { useDecision } from '../context/DecisionContext';
import { useComment } from '../context/CommentContext';
import CommentSection from './CommentSection';

const OutcomeTracker = ({ readOnly = false, onSaved }) => {
    const { currentDecision, setOutcome } = useDecision();
    const { addComment } = useComment();
    const [reason, setReason] = useState(currentDecision.outcome_reason || '');
    const [showFailureReflection, setShowFailureReflection] = useState(false);
    const [selectedConIds, setSelectedConIds] = useState([]);
    const [selectedProIds, setSelectedProIds] = useState([]);
    const [unseenReason, setUnseenReason] = useState('');
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        setReason(currentDecision.outcome_reason || '');
        setShowFailureReflection(false);
        setSelectedConIds([]);
        setSelectedProIds([]);
        setUnseenReason('');
        setStatusMessage('');
    }, [currentDecision.id, currentDecision.outcome_reason]);

    const selectedCons = useMemo(
        () => currentDecision.cons.filter((item) => selectedConIds.includes(item.id)),
        [currentDecision.cons, selectedConIds]
    );

    const selectedPros = useMemo(
        () => currentDecision.pros.filter((item) => selectedProIds.includes(item.id)),
        [currentDecision.pros, selectedProIds]
    );

    const toggleSelection = (id, type) => {
        if (type === 'con') {
            setSelectedConIds((prev) => (
                prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
            ));
            return;
        }

        setSelectedProIds((prev) => (
            prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
        ));
    };

    const buildFailureReflectionText = () => {
        const parts = [];

        if (selectedCons.length > 0) {
            parts.push(
                `معایبی که بدتر از انتظار بودند:\n${selectedCons.map((item) => `- ${item.text}`).join('\n')}`
            );
        }

        if (selectedPros.length > 0) {
            parts.push(
                `مزایایی که بیش‌برآورد شده بودند:\n${selectedPros.map((item) => `- ${item.text}`).join('\n')}`
            );
        }

        if (unseenReason.trim()) {
            parts.push(`دلیل پیش‌بینی‌نشده:\n${unseenReason.trim()}`);
        }

        if (parts.length === 0) return '';
        return `بازنگری دلیل عدم موفقیت:\n\n${parts.join('\n\n')}`;
    };

    const handleSuccessOutcome = async () => {
        const result = await setOutcome('success', reason.trim());
        if (result?.outcomeEvent?.event_type === 'revised') {
            setStatusMessage('A revision record was created for this finalized decision.');
            alert('Revision recorded in archive history.');
        }
        if (result?.ok && onSaved) {
            onSaved();
        }
    };

    const handleFailedOutcomeSubmit = async () => {
        if (!reason.trim()) {
            alert('لطفاً دلیل اصلی عدم موفقیت را بنویسید.');
            return;
        }

        const result = await setOutcome('fail', reason.trim());
        if (!result?.ok) return;

        const reflectionText = buildFailureReflectionText();
        if (reflectionText) {
            try {
                await addComment(
                    currentDecision.id,
                    reflectionText,
                    null,
                    'public',
                    'outcome_reflection'
                );
            } catch (error) {
                console.error('Error saving failure reflection:', error);
            }
        }

        if (result?.outcomeEvent?.event_type === 'revised') {
            setStatusMessage('A revision record was created for this finalized decision.');
            alert('Revision recorded in archive history.');
        }

        if (result?.ok && onSaved) {
            onSaved();
        }
    };

    if (currentDecision.status !== 'pending') {
        return (
            <div>
                <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)', border: `2px solid ${currentDecision.status === 'success' ? '#10b981' : '#ef4444'}` }}>
                    <h3 style={{ color: currentDecision.status === 'success' ? '#10b981' : '#ef4444', textAlign: 'center' }}>
                        {currentDecision.status === 'success' ? 'تصمیم موفق' : 'تصمیم ناموفق'}
                    </h3>
                    {currentDecision.outcome_reason && (
                        <p style={{ textAlign: 'center', marginTop: '1rem', fontStyle: 'italic' }}>
                            "{currentDecision.outcome_reason}"
                        </p>
                    )}
                    {!readOnly && (
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <button onClick={() => setOutcome('pending', '')} className="btn" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                تغییر وضعیت
                            </button>
                        </div>
                    )}
                </div>

                {currentDecision.status === 'fail' && (
                    <div style={{ marginTop: '1rem' }}>
                        <CommentSection
                            decisionId={currentDecision.id}
                            section="outcome_reflection"
                            forcePublic
                        />
                    </div>
                )}
            </div>
        );
    }

    if (readOnly) {
        return (
            <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>نتیجه نهایی</h3>
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    نتیجه‌ای ثبت نشده است.
                </p>
            </div>
        );
    }

    if (showFailureReflection) {
        return (
            <div className="glass-panel" style={{ marginTop: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>مرور دلیل عدم موفقیت</h3>
                <p style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--color-text-muted)' }}>
                    موارد زیر اختیاری هستند و برای مشاور/روان‌شناس قابل مشاهده خواهند بود.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                        خلاصه دلیل (الزامی)
                    </label>
                    <textarea
                        className="input-field"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="دلیل اصلی عدم موفقیت را بنویسید..."
                        rows={2}
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>کدام معایب بدتر از انتظار بودند؟</h4>
                    {currentDecision.cons.length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>معیبی ثبت نشده است.</p>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {currentDecision.cons.map((item) => (
                                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedConIds.includes(item.id)}
                                        onChange={() => toggleSelection(item.id, 'con')}
                                    />
                                    <span>{item.text}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>کدام مزایا بیش‌برآورد شده بودند؟</h4>
                    {currentDecision.pros.length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>مزیتی ثبت نشده است.</p>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {currentDecision.pros.map((item) => (
                                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedProIds.includes(item.id)}
                                        onChange={() => toggleSelection(item.id, 'pro')}
                                    />
                                    <span>{item.text}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                        دلیل پیش‌بینی‌نشده دیگر (اختیاری)
                    </label>
                    <textarea
                        className="input-field"
                        value={unseenReason}
                        onChange={(e) => setUnseenReason(e.target.value)}
                        placeholder="اگر دلیل دیگری وجود دارد بنویسید..."
                        rows={3}
                    />
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={() => setShowFailureReflection(false)} className="btn">
                        بازگشت
                    </button>
                    <button onClick={handleFailedOutcomeSubmit} className="btn" style={{ background: '#ef4444', color: 'white' }}>
                        ثبت به عنوان ناموفق
                    </button>
                </div>
                {statusMessage && (
                    <p style={{ marginTop: '1rem', textAlign: 'center', color: '#1e3a8a', fontWeight: 600 }}>
                        {statusMessage}
                    </p>
                )}
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
                    placeholder="توضیح کوتاه نتیجه (اختیاری)..."
                    rows={3}
                />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button onClick={handleSuccessOutcome} className="btn" style={{ background: '#10b981', color: 'white' }}>
                    بله، موفق بود
                </button>
                <button onClick={() => setShowFailureReflection(true)} className="btn" style={{ background: '#ef4444', color: 'white' }}>
                    خیر، موفق نبود
                </button>
            </div>
            {statusMessage && (
                <p style={{ marginTop: '1rem', textAlign: 'center', color: '#1e3a8a', fontWeight: 600 }}>
                    {statusMessage}
                </p>
            )}
        </div>
    );
};

export default OutcomeTracker;
