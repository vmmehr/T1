import React from 'react';
import styles from './DecisionTabs.module.css';

const DecisionTabs = ({ activeStep, currentStep, onTabChange }) => {
    const tabs = [
        { id: 0, label: 'تعریف تصمیم' },
        { id: 1, label: 'تحلیل (مزایا/معایب)' },
        { id: 2, label: 'استراتژی' },
        { id: 3, label: 'برنامه عملیاتی' },
    ];

    return (
        <div className={`no-print ${styles.tabsContainer}`}>
            {tabs.map((tab) => {
                const isDisabled = tab.id > currentStep;
                const isActive = tab.id === activeStep;

                return (
                    <button
                        key={tab.id}
                        onClick={() => !isDisabled && onTabChange(tab.id)}
                        disabled={isDisabled}
                        className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${isDisabled ? styles.tabDisabled : ''}`}
                        style={{
                            color: !isActive && !isDisabled ? 'var(--color-text)' : undefined
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
