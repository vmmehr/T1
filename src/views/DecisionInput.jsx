import React, { useState } from 'react';
import { useDecision } from '../context/DecisionContext';
import CommentSection from '../components/CommentSection';

const DecisionInput = () => {
    const { currentDecision, updateDecisionInfo } = useDecision();
    const [title, setTitle] = useState(currentDecision?.title || '');
    const [description, setDescription] = useState(currentDecision?.description || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (title.trim()) {
            updateDecisionInfo(title, description);
        }
    };

    return (
        <div className="glass-panel" style={{ padding: 'var(--spacing-lg)', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)' }}>تعریف تصمیم</h2>
            <p style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)', color: 'var(--color-text-muted)' }}>
                لطفاً تصمیمی که می‌خواهید بگیرید را به دقت شرح دهید.
            </p>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontWeight: 'bold' }}>
                        عنوان تصمیم
                    </label>
                    <input
                        type="text"
                        className="input-field"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="مثلاً: مهاجرت به شهر جدید"
                        required
                        style={{ fontSize: '1.2rem' }}
                    />
                </div>

                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontWeight: 'bold' }}>
                        توضیحات تکمیلی (اختیاری)
                    </label>
                    <textarea
                        className="input-field"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="جزئیات بیشتر در مورد شرایط و محدودیت‌ها..."
                        rows={4}
                        style={{ resize: 'vertical' }}
                    />
                </div>

                <div style={{ textAlign: 'center' }}>
                    <button type="submit" className="btn btn-primary" style={{ minWidth: '200px' }}>
                        شروع تحلیل
                        <span style={{ marginRight: '0.5rem' }}>←</span>
                    </button>
                </div>
            </form>

            <div style={{ marginTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
                <CommentSection decisionId={currentDecision.id} />
            </div>
        </div >
    );
};

export default DecisionInput;
