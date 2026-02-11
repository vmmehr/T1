import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username, password);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>ورود به سیستم</h2>
            {error && <div className={styles.error}>{error}</div>}
            <form onSubmit={handleSubmit}>
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
                    {loading ? 'در حال ورود...' : 'ورود'}
                </button>
            </form>
            <div className={styles.link}>
                <a href="/signup">ثبت نام نکرده‌اید؟</a>
            </div>
        </div>
    );
};

export default Login;
