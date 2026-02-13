import React, { useState } from 'react';
import { useDecision } from '../context/DecisionContext';
import CommentSection from '../components/CommentSection';
import styles from './DecisionInput.module.css';

const DecisionInput = () => {
    const { currentDecision, updateDecisionInfo, isReadOnlyView } = useDecision();
    const [title, setTitle] = useState(currentDecision?.title || '');
    const [description, setDescription] = useState(currentDecision?.description || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isReadOnlyView) return;
        if (title.trim()) {
            updateDecisionInfo(title, description);
        }
    };

    return (
        <div className={`glass-panel ${styles.container}`}>
            <h2 className={styles.title}>تعریف تصمیم</h2>
            <p className={styles.description}>
                لطفاً تصمیمی که می‌خواهید بگیرید را به دقت شرح دهید.
            </p>

            <form onSubmit={handleSubmit}>
                <div className={styles.formField}>
                    <label className={styles.label}>
                        عنوان تصمیم
                    </label>
                    <input
                        type="text"
                        className={`input-field ${styles.input}`}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="مثلاً: مهاجرت به شهر جدید"
                        disabled={isReadOnlyView}
                        required
                    />
                </div>

                <div className={styles.formField}>
                    <label className={styles.label}>
                        توضیحات تکمیلی (اختیاری)
                    </label>
                    <textarea
                        className={`input-field ${styles.textarea}`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="جزئیات بیشتر در مورد شرایط و محدودیت‌ها..."
                        rows={4}
                        disabled={isReadOnlyView}
                    />
                </div>

                <div className={styles.formActions}>
                    <button type="submit" className="btn btn-primary" style={{ minWidth: '200px' }} disabled={isReadOnlyView}>
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
