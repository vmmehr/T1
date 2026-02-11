import React from 'react';
import { useDecision } from '../context/DecisionContext';
import { useTask } from '../context/TaskContext';
import CommentSection from '../components/CommentSection';
import styles from './Strategy.module.css';

const StrategyItem = ({ item, type }) => {
    const isPro = type === 'pros';
    const color = isPro ? '#10b981' : '#ef4444';
    const question = isPro ? 'چگونه می‌توانیم این مورد را تقویت کنیم؟' : 'چگونه می‌توانیم این مورد را کاهش دهیم یا حذف کنیم؟';

    const { getTasks, addTask, deleteTask } = useTask();
    const [newTaskText, setNewTaskText] = React.useState('');

    // Get tasks for this specific item
    const tasks = getTasks(item.decision_id).filter(t => t.decision_item_id === item.id);

    const handleAddTask = (e) => {
        e.preventDefault();
        if (newTaskText.trim()) {
            addTask(item.id, newTaskText);
            setNewTaskText('');
        }
    };

    return (
        <div className="glass-panel" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }}></div>
                <h4 style={{ margin: 0 }}>{item.text}</h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginRight: 'auto' }}>
                    وزن: {item.weight}
                </span>
            </div>

            <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-primary)' }}>
                    {question}
                </label>

                {/* List of Tasks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                    {tasks.map(task => (
                        <div key={task.id} style={{
                            background: 'rgba(255,255,255,0.5)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.75rem',
                            border: '1px solid var(--color-border)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <div style={{ flex: 1 }}>{task.content}</div>
                                <button
                                    onClick={() => deleteTask(task.id)}
                                    style={{
                                        color: '#ef4444',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '1.2rem',
                                        lineHeight: 1,
                                        padding: 0
                                    }}
                                    title="حذف"
                                >
                                    ×
                                </button>
                            </div>

                            {/* Granular Comments for this Task */}
                            <div style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.5rem' }}>
                                <CommentSection
                                    decisionId={item.decision_id}
                                    targetItemId={task.id}
                                    section="task"
                                    compact={true}
                                />
                            </div>
                        </div>
                    ))}

                    {tasks.length === 0 && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            هنوز راهکاری ثبت نشده است.
                        </div>
                    )}
                </div>

                {/* Add New Task */}
                <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        className="input-field"
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        placeholder="راهکار جدید..."
                        style={{ flex: 1, fontSize: '0.9rem' }}
                    />
                    <button type="submit" className="btn btn-sm btn-primary" disabled={!newTaskText.trim()}>
                        +
                    </button>
                </form>
            </div>
        </div>
    );
};

const Strategy = () => {
    const { currentDecision, setStep } = useDecision();

    // Sort items by weight (descending) to focus on most important ones first
    const sortedPros = [...currentDecision.pros].sort((a, b) => b.weight - a.weight);
    const sortedCons = [...currentDecision.cons].sort((a, b) => b.weight - a.weight);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>بهینه‌سازی تصمیم</h2>
                <p style={{ color: 'var(--color-text-muted)' }}>
                    برای هر یک از موارد، راهکارهای اجرایی بنویسید. این‌ها تبدیل به برنامه عملیاتی شما خواهند شد.
                </p>
            </div>

            <div className={styles.grid}>
                <div>
                    <h3 className={styles.sectionTitle} style={{ color: '#10b981' }}>تقویت مزایا</h3>
                    {sortedPros.map(item => (
                        <StrategyItem
                            key={item.id}
                            item={item}
                            type="pros"
                        />
                    ))}
                    {sortedPros.length === 0 && <p className={styles.emptyState}>موردی ثبت نشده است.</p>}
                </div>

                <div>
                    <h3 className={styles.sectionTitle} style={{ color: '#ef4444' }}>مدیریت معایب</h3>
                    {sortedCons.map(item => (
                        <StrategyItem
                            key={item.id}
                            item={item}
                            type="cons"
                        />
                    ))}
                    {sortedCons.length === 0 && <p className={styles.emptyState}>موردی ثبت نشده است.</p>}
                </div>
            </div>

            <div className={styles.footer}>
                <button onClick={() => setStep(3)} className="btn btn-primary">
                    مشاهده برنامه عملیاتی
                    <span style={{ marginRight: '0.5rem' }}>←</span>
                </button>
                <div className={styles.sectionFooter}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--color-text-muted)' }}>یادداشت‌های استراتژی</h3>
                    <CommentSection decisionId={currentDecision.id} section="strategy" />
                </div>
            </div>
        </div>
    );
};

export default Strategy;
