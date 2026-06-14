import React, { useEffect, useState } from 'react';
import { api } from '../apiClient';
import styles from './Signup.module.css';

const ResetPassword = ({ token }) => {
    const [state, setState] = useState('loading'); // loading | valid | invalid | done
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const result = await api.passwordResets.validate(token);
                if (!active) return;
                if (result.valid) {
                    setState('valid');
                    setFullName(result.full_name || '');
                } else {
                    setState('invalid');
                    setError(
                        result.status === 'used'
                            ? 'این لینک بازنشانی قبلاً استفاده شده است.'
                            : result.status === 'expired'
                                ? 'این لینک بازنشانی منقضی شده است.'
                                : 'این لینک بازنشانی معتبر نیست.'
                    );
                }
            } catch {
                if (active) {
                    setState('invalid');
                    setError('این لینک بازنشانی معتبر نیست.');
                }
            }
        })();
        return () => { active = false; };
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
            setError('رمز عبور و تکرار آن یکسان نیستند.');
            return;
        }
        setLoading(true);
        try {
            await api.auth.resetPassword({ token, password });
            setState('done');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (state === 'loading') {
        return <div className={styles.container}><p>در حال بررسی لینک...</p></div>;
    }

    if (state === 'invalid') {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>لینک نامعتبر</h2>
                <div className={styles.error}>{error}</div>
                <div className={styles.link}><a href="/login">بازگشت به ورود</a></div>
            </div>
        );
    }

    if (state === 'done') {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>رمز عبور به‌روزرسانی شد</h2>
                <p>اکنون می‌توانید با رمز عبور جدید وارد شوید.</p>
                <div className={styles.link}><a href="/login">ورود به سیستم</a></div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>تعیین رمز عبور جدید</h2>
            {fullName && <p className={styles.inviteNote}>{fullName} عزیز، رمز عبور جدید خود را وارد کنید.</p>}
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit}>
                <div className={styles.formField}>
                    <label className={styles.label}>رمز عبور جدید</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div className={styles.formField}>
                    <label className={styles.label}>تکرار رمز عبور</label>
                    <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <button type="submit" className={`btn btn-primary ${styles.submitButton}`} disabled={loading}>
                    {loading ? 'در حال ذخیره...' : 'ذخیره رمز عبور'}
                </button>
            </form>
        </div>
    );
};

export default ResetPassword;
