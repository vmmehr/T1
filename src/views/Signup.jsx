import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('client');
    const [consultantId, setConsultantId] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [consultants, setConsultants] = useState([]);

    const { signup, getAllConsultants } = useAuth();

    useEffect(() => {
        const fetchConsultants = async () => {
            try {
                const data = await getAllConsultants();
                setConsultants(data || []);
            } catch (err) {
                console.error('Failed to load consultants', err);
            }
        };
        fetchConsultants();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signup({
                fullName: name, // Changed from name to fullName to match DB schema
                username,
                password,
                role,
                consultantId: role === 'client' ? consultantId : null
            });
            // Redirect or show success (AuthContext auto-logins, so App will redirect)
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '2rem auto', padding: '2rem', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: 'var(--color-surface)' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>ثبت نام</h2>
            {error && <div style={{ color: 'red', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>نام و نام خانوادگی</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>نام کاربری</label>
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
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>رمز عبور</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                        required
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>نقش</label>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="input-field"
                    >
                        <option value="client">مراجع (Client)</option>
                        <option value="consultant">مشاور (Consultant)</option>
                        <option value="psychologist">روانشناس (Psychologist)</option>
                        <option value="supervisor">سوپروایزر (Supervisor)</option>
                    </select>
                </div>

                {role === 'client' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>انتخاب مشاور (اختیاری)</label>
                        <select
                            value={consultantId}
                            onChange={(e) => setConsultantId(e.target.value)}
                            className="input-field"
                        >
                            <option value="">-- انتخاب کنید --</option>
                            {consultants.map(c => (
                                <option key={c.id} value={c.id}>{c.full_name || c.username}</option>
                            ))}
                        </select>
                    </div>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                    {loading ? 'در حال ثبت نام...' : 'ثبت نام'}
                </button>
            </form>
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <a href="/login" style={{ color: 'var(--color-primary)' }}>قبلاً ثبت نام کرده‌اید؟</a>
            </div>
        </div>
    );
};

export default Signup;
