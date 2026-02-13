import React, { useState } from 'react';
import { useDecision } from '../context/DecisionContext';
import CommentSection from '../components/CommentSection';

const ItemList = ({ title, items, onItemAdd, onItemUpdate, onItemRemove, color, decisionId, readOnly }) => {
    const [newItem, setNewItem] = useState('');
    const [newWeight, setNewWeight] = useState(50);

    const handleAdd = (e) => {
        e.preventDefault();
        if (readOnly) return;
        if (newItem.trim()) {
            onItemAdd(newItem, newWeight);
            setNewItem('');
            setNewWeight(50);
        }
    };

    return (
        <div className="glass-panel" style={{ padding: 'var(--spacing-md)', flex: 1 }}>
            <h3 style={{ color: color, borderBottom: `2px solid ${color}`, paddingBottom: '0.5rem' }}>
                {title}
            </h3>

            <div style={{ marginTop: 'var(--spacing-md)' }}>
                {items.map(item => (
                    <div key={item.id} style={{
                        background: 'rgba(255,255,255,0.5)',
                        padding: '1rem',
                        marginBottom: '1rem',
                        borderRadius: 'var(--radius-sm)',
                        borderRight: `4px solid ${color}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 600 }}>{item.text}</span>
                            <button
                                onClick={() => onItemRemove(item.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                disabled={readOnly}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={item.weight}
                                onChange={(e) => onItemUpdate(item.id, parseInt(e.target.value))}
                                style={{ flex: 1, accentColor: color }}
                                disabled={readOnly}
                            />
                            <span style={{ fontWeight: 'bold', color: color, minWidth: '30px', textAlign: 'center' }}>
                                {item.weight}
                            </span>
                        </div>

                        {/* Item Comments */}
                        <CommentSection
                            decisionId={decisionId}
                            targetItemId={item.id}
                            compact={true}
                        />
                    </div>
                ))}
            </div>

            <form onSubmit={handleAdd} style={{ marginTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <input
                    type="text"
                    className="input-field"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="مورد جدید..."
                    style={{ marginBottom: '0.5rem' }}
                    disabled={readOnly}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>اهمیت:</span>
                    <input
                        type="range"
                        min="1"
                        max="100"
                        value={newWeight}
                        onChange={(e) => setNewWeight(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: color }}
                        disabled={readOnly}
                    />
                    <span style={{ fontWeight: 'bold', color: color }}>{newWeight}</span>
                </div>
                <button type="submit" className="btn" style={{ width: '100%', background: color, color: 'white' }} disabled={readOnly}>
                    افزودن
                </button>
            </form>
        </div>
    );
};

const Analysis = () => {
    const { currentDecision, addPro, addCon, updateItemWeight, removeItem, setStep, setViewStep, isReadOnlyView } = useDecision();

    const totalPros = currentDecision.pros.reduce((acc, curr) => acc + curr.weight, 0);
    const totalCons = currentDecision.cons.reduce((acc, curr) => acc + curr.weight, 0);
    const score = totalPros - totalCons;

    return (
        <div>
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ textAlign: 'center' }}>
                    <h2>{currentDecision.title}</h2>
                    <p style={{ color: 'var(--color-text-muted)' }}>مزایا و معایب را وارد کنید و به هر کدام وزن دهید (۱ تا ۱۰۰)</p>
                </div>

                {/* General Decision Comments - Moved to Definition step */}
            </div>

            <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexDirection: 'row', flexWrap: 'wrap' }}>
                <ItemList
                    title="مزایا (Pros)"
                    items={currentDecision.pros}
                    onItemAdd={addPro}
                    onItemUpdate={(id, w) => updateItemWeight('pros', id, w)}
                    onItemRemove={(id) => removeItem('pros', id)}
                    color="#10b981" // Emerald 500
                    decisionId={currentDecision.id}
                    readOnly={isReadOnlyView}
                />
                <ItemList
                    title="معایب (Cons)"
                    items={currentDecision.cons}
                    onItemAdd={addCon}
                    onItemUpdate={(id, w) => updateItemWeight('cons', id, w)}
                    onItemRemove={(id) => removeItem('cons', id)}
                    color="#ef4444" // Red 500
                    decisionId={currentDecision.id}
                    readOnly={isReadOnlyView}
                />
            </div>

            <div className="glass-panel" style={{ marginTop: 'var(--spacing-lg)', padding: 'var(--spacing-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
                    نتیجه اولیه:
                    <span style={{
                        fontWeight: 'bold',
                        marginRight: '0.5rem',
                        color: score > 0 ? '#10b981' : score < 0 ? '#ef4444' : 'var(--color-text)'
                    }}>
                        {score > 0 ? 'مثبت (+)' : score < 0 ? 'منفی (-)' : 'خنثی'} {Math.abs(score)}
                    </span>
                </div>
                <button onClick={() => (isReadOnlyView ? setViewStep(2) : setStep(2))} className="btn btn-primary">
                    مرحله بعد: بهینه‌سازی و استراتژی
                    <span style={{ marginRight: '0.5rem' }}>←</span>
                </button>
            </div>
        </div>
    );
};

export default Analysis;
