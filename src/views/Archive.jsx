import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDecision } from '../context/DecisionContext';
import styles from './Archive.module.css';

const PAGE_SIZE = 10;

const formatPercent = (value) => (value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`);
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('fa-IR') : '—');

const Archive = () => {
  const {
    goHome,
    openDecisionOutcome,
    fetchDecisionArchive,
    fetchDecisionStats,
    decisionStats,
  } = useDecision();

  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [archiveData, setArchiveData] = useState({ items: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [stats30, setStats30] = useState(null);
  const [stats90, setStats90] = useState(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((archiveData.total || 0) / PAGE_SIZE)),
    [archiveData.total]
  );
  const currentPage = useMemo(() => Math.floor(offset / PAGE_SIZE) + 1, [offset]);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    const data = await fetchDecisionArchive({
      status: statusFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setArchiveData(data);
    setLoading(false);
  }, [fetchDecisionArchive, statusFilter, fromDate, toDate, offset]);

  const loadTrendStats = useCallback(async () => {
    const [window30, window90] = await Promise.all([
      fetchDecisionStats('30d'),
      fetchDecisionStats('90d'),
    ]);
    setStats30(window30);
    setStats90(window90);
  }, [fetchDecisionStats]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    loadTrendStats();
  }, [loadTrendStats]);

  const completionDelta = useMemo(() => {
    if (stats30?.completion_rate === null || stats30?.completion_rate === undefined) return null;
    if (stats90?.completion_rate === null || stats90?.completion_rate === undefined) return null;
    return stats30.completion_rate - stats90.completion_rate;
  }, [stats30, stats90]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={goHome} className="btn back-to-list-btn">
          بازگشت
        </button>
        <h2 className={styles.title}>آرشیو تصمیم‌ها و آمار</h2>
      </div>

      <div className={`glass-panel ${styles.trendGrid}`}>
        <div className={styles.trendCard}>
          <p className={styles.trendLabel}>موفقیت 30 روز اخیر</p>
          <p className={styles.trendValue}>{formatPercent(stats30?.success_rate)}</p>
        </div>
        <div className={styles.trendCard}>
          <p className={styles.trendLabel}>موفقیت 90 روز اخیر</p>
          <p className={styles.trendValue}>{formatPercent(stats90?.success_rate)}</p>
        </div>
        <div className={styles.trendCard}>
          <p className={styles.trendLabel}>روند تکمیل (30د - 90د)</p>
          <p className={styles.trendValue}>
            {completionDelta === null ? '—' : `${completionDelta > 0 ? '+' : ''}${(completionDelta * 100).toFixed(1)}%`}
          </p>
        </div>
        <div className={styles.trendCard}>
          <p className={styles.trendLabel}>میانه زمان تا نتیجه (کل)</p>
          <p className={styles.trendValue}>
            {decisionStats?.median_time_to_outcome_days === null || decisionStats?.median_time_to_outcome_days === undefined
              ? '—'
              : `${Number(decisionStats.median_time_to_outcome_days).toFixed(1)} روز`}
          </p>
        </div>
      </div>

      <div className={`glass-panel ${styles.filters}`}>
        <div className={styles.filterField}>
          <label>وضعیت</label>
          <select
            className="input-field"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">همه</option>
            <option value="success">موفق</option>
            <option value="fail">ناموفق</option>
          </select>
        </div>
        <div className={styles.filterField}>
          <label>از تاریخ</label>
          <input
            type="date"
            className="input-field"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className={styles.filterField}>
          <label>تا تاریخ</label>
          <input
            type="date"
            className="input-field"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        {loading ? (
          <p className={styles.loading}>در حال بارگذاری...</p>
        ) : archiveData.items.length === 0 ? (
          <p className={styles.loading}>هیچ تصمیم نهایی‌شده‌ای با این فیلترها پیدا نشد.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>عنوان</th>
                <th>تاریخ نهایی</th>
                <th>وضعیت</th>
                <th>دلیل</th>
                <th>تعداد بازنگری</th>
                <th>زمان تا نتیجه</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {archiveData.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{formatDate(item.finalized_at)}</td>
                  <td>
                    <span className={item.latest_status === 'success' ? styles.successBadge : styles.failBadge}>
                      {item.latest_status === 'success' ? 'موفق' : 'ناموفق'}
                    </span>
                  </td>
                  <td className={styles.reasonCell}>{item.latest_outcome_reason || '—'}</td>
                  <td>{item.revision_count}</td>
                  <td>
                    {item.time_to_outcome_days === null || item.time_to_outcome_days === undefined
                      ? '—'
                      : `${Number(item.time_to_outcome_days).toFixed(1)} روز`}
                  </td>
                  <td>
                    <button
                      className="btn"
                      onClick={() => openDecisionOutcome(item.id)}
                    >
                      مشاهده نتیجه
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.pagination}>
        <button
          className="btn"
          disabled={currentPage <= 1}
          onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
        >
          قبلی
        </button>
        <span>{`صفحه ${currentPage} از ${totalPages}`}</span>
        <button
          className="btn"
          disabled={currentPage >= totalPages}
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
        >
          بعدی
        </button>
      </div>
    </div>
  );
};

export default Archive;
