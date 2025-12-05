import React from 'react';

const DecisionTabs = ({ activeStep, currentStep, onTabChange }) => {
    const tabs = [
        { id: 0, label: 'تعریف تصمیم' },
        { id: 1, label: 'تحلیل (مزایا/معایب)' },
        { id: 2, label: 'استراتژی' },
        { id: 3, label: 'برنامه عملیاتی' },
    ];

    // Only show tabs up to the highest step reached (plus maybe one if we want next available?)
    // Actually, for editing, we want to see all steps that have been reached.
    // If currentDecision.step is 3 (ActionPlan), we should be able to go back to 0, 1, 2.
    // But we shouldn't be able to jump to 3 if we are at 1.

    return (
        <div className="no-print" style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 'var(--spacing-lg)',
            borderBottom: '1px solid var(--color-border)'
        }}>
            {tabs.map((tab) => {
                const isDisabled = tab.id > currentStep;
                const isActive = tab.id === activeStep;

                return (
                    <button
                        key={tab.id}
                        onClick={() => !isDisabled && onTabChange(tab.id)}
                        disabled={isDisabled}
                        style={{
                            background: 'none',
                            border: 'none',
                            borderBottom: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                            color: isActive ? 'var(--color-primary)' : isDisabled ? 'var(--color-text-muted)' : 'var(--color-text)',
                            padding: '1rem',
                            fontSize: '1rem',
                            fontWeight: isActive ? 'bold' : 'normal',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            opacity: isDisabled ? 0.5 : 1
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
};

export default DecisionTabs;
