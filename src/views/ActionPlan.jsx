import React from 'react';
import { useDecision } from '../context/DecisionContext';
import { useTask } from '../context/TaskContext';
import styles from './ActionPlan.module.css';

const ActionPlan = () => {
    const { currentDecision, goHome, setStep } = useDecision();
    const { getTasks, updateTask } = useTask();

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
        <div className={styles.container}>
            {/* Print Header - Only visible in print */}
            <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                <h1>برنامه عملیاتی: {currentDecision.title}</h1>
                <p>تاریخ چاپ: {todayJalali}</p>
            </div>

            <div className={`glass-panel no-print ${styles.panel}`}>
                <div className={styles.header}>
                    <h2 style={{ color: 'var(--color-accent)' }}>برنامه عملیاتی: {currentDecision.title}</h2>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                        لیست کارهایی که برای موفقیت این تصمیم باید انجام دهید.
                    </p>
                </div>

                {allActions.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>هیچ راهکار عملیاتی ثبت نشده است.</p>
                        <button onClick={() => setStep(2)} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                            بازگشت به مرحله قبل
                        </button>
                    </div>
                ) : (
                    <ul className={styles.actionsList}>
                        {allActions.map(item => (
                            <li key={item.id} className={styles.actionItem} style={{
                                background: item.is_completed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={!!item.is_completed}
                                    onChange={() => handleToggleComplete(item.id, item.is_completed)}
                                    style={{ marginTop: '0.3rem', width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <div className={styles.actionContent} style={{ opacity: item.is_completed ? 0.5 : 1, textDecoration: item.is_completed ? 'line-through' : 'none' }}>
                                    <div className={styles.actionTitle}>
                                        {item.strategy}
                                    </div>
                                    <div className={styles.actionSubtitle}>
                                        {item.type === 'pro' ? 'برای تقویت: ' : 'برای مدیریت: '} {item.text}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div className={styles.footer}>
                    <button onClick={() => window.print()} className="btn btn-accent">
                        چاپ برنامه
                    </button>
                    <button onClick={goHome} className="btn" style={{ border: '1px solid var(--color-text-muted)' }}>
                        پایان و بازگشت به خانه
                    </button>
                </div>

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
