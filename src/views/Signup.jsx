import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../apiClient';
import styles from './Signup.module.css';

const Signup = ({ inviteToken = null }) => {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Invite-mode state: none | loading | valid | invalid
    const [inviteState, setInviteState] = useState(inviteToken ? 'loading' : 'none');

    const { signup, acceptInvite } = useAuth();

    useEffect(() => {
        if (!inviteToken) return undefined;
        let active = true;
        (async () => {
            try {
                const result = await api.invitations.validate(inviteToken);
                if (!active) return;
                if (result.valid) {
                    setInviteState('valid');
                    if (result.full_name) setName(result.full_name);
                } else {
                    setInviteState('invalid');
                    setError(
                        result.status === 'used'
                            ? 'این دعوت قبلاً استفاده شده است.'
                            : result.status === 'expired'
                                ? 'این دعوت منقضی شده است.'
                                : 'این لینک دعوت معتبر نیست.'
                    );
                }
            } catch {
                if (active) {
                    setInviteState('invalid');
                    setError('این لینک دعوت معتبر نیست.');
                }
            }
        })();
        return () => { active = false; };
    }, [inviteToken]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (inviteToken) {
                await acceptInvite({ token: inviteToken, username, password, fullName: name });
            } else {
                await signup({ fullName: name, username, password });
            }
            // AuthContext auto-logs in, so App will redirect.
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (inviteToken && inviteState === 'loading') {
        return <div className={styles.container}><p>در حال بررسی دعوت...</p></div>;
    }

    if (inviteToken && inviteState === 'invalid') {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>دعوت نامعتبر</h2>
                <div className={styles.error}>{error}</div>
                <div className={styles.link}>
                    <a href="/login">بازگشت به ورود</a>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{inviteToken ? 'تکمیل ثبت‌نام دعوت' : 'ثبت نام'}</h2>
            {inviteToken && (
                <p className={styles.inviteNote}>
                    شما به‌عنوان مراجع دعوت شده‌اید. برای ساخت حساب، اطلاعات زیر را کامل کنید.
                </p>
            )}
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit}>
                <div className={styles.formField}>
                    <label className={styles.label}>نام و نام خانوادگی</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div className={styles.formField}>
                    <label className={styles.label}>نام کاربری</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (!val.includes('@')) setUsername(val);
                        }}
                        className="input-field"
                        required
                    />
                </div>
                <div className={styles.formField}>
                    <label className={styles.label}>رمز عبور</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <button type="submit" className={`btn btn-primary ${styles.submitButton}`} disabled={loading}>
                    {loading ? 'در حال ثبت نام...' : 'ثبت نام'}
                </button>
            </form>
            {!inviteToken && (
                <div className={styles.link}>
                    <a href="/login">قبلاً ثبت نام کرده‌اید؟</a>
                </div>
            )}
        </div>
    );
};

export default Signup;
