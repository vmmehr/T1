import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useDecision } from '../context/DecisionContext';
import OutcomeTracker from '../components/OutcomeTracker';
import styles from './DecisionOutcome.module.css';

const DecisionOutcome = () => {
  const { currentUser } = useAuth();
  const { currentDecision, goHome } = useDecision();

  const isStaff = ['consultant', 'psychologist', 'supervisor'].includes(currentUser?.role);
  const isOwner = currentUser?.id === currentDecision?.user_id;
  const readOnly = isStaff && !isOwner;

  return (
    <div className={styles.container}>
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={goHome}
          className="btn back-to-list-btn"
        >
          ← بازگشت به لیست تصمیم‌ها
        </button>
      </div>

      <div className={`glass-panel ${styles.panel}`}>
        <h2 className={styles.title}>ثبت نتیجه نهایی</h2>
        <p className={styles.subtitle}>{currentDecision.title}</p>
        <OutcomeTracker readOnly={readOnly} onSaved={goHome} />
      </div>
    </div>
  );
};

export default DecisionOutcome;
