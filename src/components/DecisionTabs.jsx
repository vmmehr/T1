import React from 'react';
import styles from './DecisionTabs.module.css';

const faNumberFormatter = new Intl.NumberFormat('fa-IR');

const STEP_SCOPE_BY_ID = {
    0: 'definition',
    1: 'analysis',
    2: 'strategy',
    3: 'action_plan'
};

const DecisionTabs = ({ activeStep, currentStep, onTabChange, unreadCounts = {} }) => {
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
                const stepScope = STEP_SCOPE_BY_ID[tab.id];
                const unreadCount = stepScope === 'action_plan'
                    ? 0
                    : Number(unreadCounts?.[stepScope] || 0);

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
                        <span className={styles.tabLabelWrap}>
                            <span>{tab.label}</span>
                            {unreadCount > 0 && (
                                <span className={styles.tabUnreadBubble}>
                                    {faNumberFormatter.format(unreadCount)}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default DecisionTabs;
