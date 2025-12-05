
import React, { useState } from 'react';
import { useDecision } from '../context/DecisionContext';
import OutcomeTracker from '../components/OutcomeTracker';

const ActionPlan = () => {
    const { currentDecision, goHome, setStep, getTasks, updateTask } = useDecision();

    // Get all tasks associated with current decision
    const tasks = getTasks(currentDecision.id);

    const allActions = [];

    // Helper to find parent item text
    const findParentItem = (itemId, type) => {
        const list = type === 'pro' ? currentDecision.pros : currentDecision.cons;
        return list.find(i => i.id === itemId);
    };

    // Map tasks to actionable items
    tasks.forEach(task => {
        // Try to find if it belongs to a pro or con
        const proParent = findParentItem(task.decision_item_id, 'pro');
        const conParent = findParentItem(task.decision_item_id, 'con');
        const parent = proParent || conParent;
        const type = proParent ? 'pro' : 'con';

        if (parent) {
            allActions.push({
                id: task.id,
                strategy: task.content,
                text: parent.text,
                type: type,
                is_completed: task.is_completed // Include completion status
            });
        }
    });

    const handleToggleComplete = (id, currentStatus) => {
        updateTask(id, { is_completed: !currentStatus });
    };

    const todayJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date());

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Print Header - Only visible in print */}
            <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                <h1>برنامه عملیاتی: {currentDecision.title}</h1>
                <p>تاریخ چاپ: {todayJalali}</p>
            </div>

            <div className="glass-panel no-print" style={{ padding: 'var(--spacing-lg)' }}>
                <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                    <h2 style={{ color: 'var(--color-accent)' }}>برنامه عملیاتی: {currentDecision.title}</h2>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                        لیست کارهایی که برای موفقیت این تصمیم باید انجام دهید.
                    </p>
                </div>

                {allActions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <p>هیچ راهکار عملیاتی ثبت نشده است.</p>
                        <button onClick={() => setStep(2)} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                            بازگشت به مرحله قبل
                        </button>
                    </div>
                ) : (
                    <ul style={{ listStyle: 'none' }}>
                        {allActions.map(item => (
                            <li key={item.id} style={{
                                marginBottom: '1rem',
                                padding: '1rem',
                                background: item.is_completed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)',
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '1rem',
                                transition: 'all 0.2s'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={!!item.is_completed}
                                    onChange={() => handleToggleComplete(item.id, item.is_completed)}
                                    style={{ marginTop: '0.3rem', width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <div style={{ flex: 1, opacity: item.is_completed ? 0.5 : 1, textDecoration: item.is_completed ? 'line-through' : 'none' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>
                                        {item.strategy}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                        {item.type === 'pro' ? 'برای تقویت: ' : 'برای مدیریت: '} {item.text}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div style={{ marginTop: 'var(--spacing-xl)', textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={() => window.print()} className="btn btn-accent">
                        چاپ برنامه
                    </button>
                    <button onClick={goHome} className="btn" style={{ border: '1px solid var(--color-text-muted)' }}>
                        پایان و بازگشت به خانه
                    </button>
                </div>

                <OutcomeTracker />
            </div>

            {/* Print View - Simple Checklist */}
            <div className="print-only" style={{ display: 'none' }}>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {allActions.map(item => (
                        <li key={item.id} style={{
                            borderBottom: '1px solid #ccc',
                            padding: '1rem 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem'
                        }}>
                            <div style={{
                                width: '20px',
                                height: '20px',
                                border: '2px solid black',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px'
                            }}>
                                {item.is_completed && '✓'}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.strategy}</div>
                                <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                    {item.type === 'pro' ? 'تقویت: ' : 'مدیریت: '} {item.text}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                {todayJalali}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ActionPlan;
