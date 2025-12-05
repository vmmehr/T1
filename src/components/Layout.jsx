import React from 'react';

const Layout = ({ children }) => {
    return (
        <div className="app-layout">
            <header className="glass-panel" style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                marginBottom: 'var(--spacing-lg)',
                borderRadius: 0,
                borderLeft: 'none',
                borderRight: 'none',
                borderTop: 'none'
            }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            background: 'var(--color-accent)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1.2rem'
                        }}>
                            ⚖️
                        </div>
                        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>سامانه تصمیم‌گیری هوشمند</h1>
                    </div>
                    <nav>
                        {/* Navigation items could go here */}
                    </nav>
                </div>
            </header>

            <main className="container">
                {children}
            </main>

            <footer className="container" style={{ textAlign: 'center', marginTop: 'var(--spacing-xl)', color: 'var(--color-text-muted)' }}>
                <p>© {new Date().getFullYear()} سامانه مشاوره و تصمیم‌گیری</p>
            </footer>
        </div>
    );
};

export default Layout;
