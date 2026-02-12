import React from 'react';

const LogoutConfirm = ({ onConfirm, onCancel }) => {
  return (
    <div
      className="glass-panel"
      style={{
        maxWidth: '560px',
        margin: '4rem auto',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginBottom: '0.75rem' }}>آیا از خروج مطمئن هستید؟</h2>
      <p style={{ marginBottom: '1.5rem', opacity: 0.9 }}>
        با خروج از حساب، برای ورود دوباره باید نام کاربری و رمز عبور را وارد کنید.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button onClick={onCancel} className="btn">
          انصراف
        </button>
        <button
          onClick={onConfirm}
          className="btn"
          style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
        >
          بله، خارج می‌شوم
        </button>
      </div>
    </div>
  );
};

export default LogoutConfirm;
