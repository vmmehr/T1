import React, { useEffect, useState } from 'react';
import { api } from '../apiClient';
import styles from './AnalyticsPanel.module.css';

const faNumber = new Intl.NumberFormat('fa-IR');
const fmt = (value) => faNumber.format(Number(value ?? 0));
const fmtPercent = (value) => (
  value === null || value === undefined
    ? '—'
    : `${faNumber.format(Math.round(value * 100))}٪`
);
const fmtDays = (value) => (
  value === null || value === undefined
    ? '—'
    : `${faNumber.format(Math.round(value * 10) / 10)} روز`
);

const AnalyticsPanel = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await api.analytics.overview();
        if (active) setData(result);
      } catch (fetchError) {
        if (active) setError(fetchError.message || 'بارگذاری آمار انجام نشد.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <div className={styles.state}>در حال بارگذاری آمار...</div>;
  if (error) return <div className={`${styles.state} ${styles.error}`}>{error}</div>;
  if (!data) return null;

  const { totals, breakdown, breakdown_by: breakdownBy } = data;
  const ci = totals.success_rate_ci_95;

  const cards = [
    { label: 'مراجعان', value: fmt(totals.total_clients), hint: `${fmt(totals.active_clients)} فعال` },
    { label: 'تصمیم‌ها', value: fmt(totals.total_decisions), hint: `${fmt(totals.finalized_count)} نهایی‌شده` },
    {
      label: 'نرخ موفقیت',
      value: fmtPercent(totals.success_rate),
      hint: ci ? `بازه اطمینان: ${fmtPercent(ci.low)} تا ${fmtPercent(ci.high)}` : null,
    },
    { label: 'نرخ تکمیل', value: fmtPercent(totals.completion_rate), hint: `${fmt(totals.pending_count)} در جریان` },
    { label: 'میانهٔ زمان تا نتیجه', value: fmtDays(totals.median_time_to_outcome_days), hint: null },
  ];

  const isConsultantBreakdown = breakdownBy === 'consultant';

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>آمار کلی</h3>
      {totals.low_sample_size && totals.finalized_count > 0 && (
        <p className={styles.note}>به‌دلیل تعداد کم نمونه، نرخ‌ها با احتیاط تفسیر شوند.</p>
      )}

      <div className={styles.kpiGrid}>
        {cards.map((card) => (
          <div key={card.label} className={`glass-panel ${styles.kpiCard}`}>
            <span className={styles.kpiLabel}>{card.label}</span>
            <span className={styles.kpiValue}>{card.value}</span>
            {card.hint && <span className={styles.kpiHint}>{card.hint}</span>}
          </div>
        ))}
      </div>

      <h4 className={styles.subHeading}>
        {isConsultantBreakdown ? 'تفکیک بر اساس مشاور' : 'تفکیک بر اساس مراجع'}
      </h4>
      {breakdown.length === 0 ? (
        <p className={styles.note}>داده‌ای برای نمایش وجود ندارد.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{isConsultantBreakdown ? 'مشاور' : 'مراجع'}</th>
                {isConsultantBreakdown && <th>مراجعان</th>}
                <th>تصمیم‌ها</th>
                <th>نهایی‌شده</th>
                <th>نرخ موفقیت</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.id}>
                  <td className={styles.nameCell}>{row.full_name || row.username}</td>
                  {isConsultantBreakdown && <td>{fmt(row.clients_count)}</td>}
                  <td>{fmt(row.total_decisions)}</td>
                  <td>{fmt(row.finalized_count)}</td>
                  <td>
                    <span className={styles.ratePill}>{fmtPercent(row.success_rate)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPanel;
