import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './Signup.module.css';

const Signup = () => {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { signup } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signup({
                fullName: name, // Changed from name to fullName to match DB schema
                username,
                password
            });
            // Redirect or show success (AuthContext auto-logins, so App will redirect)
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>ثبت نام</h2>
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
            <div className={styles.link}>
                <a href="/login">قبلاً ثبت نام کرده‌اید؟</a>
            </div>
        </div>
    );
};

export default Signup;
