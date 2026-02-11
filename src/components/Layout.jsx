import React from 'react';
import styles from './Layout.module.css';

const Layout = ({ children }) => {
    return (
        <div className="app-layout">
            <header className={`glass-panel ${styles.header}`}>
                <div className={`container ${styles.headerContent}`}>
                    <div className={styles.logoContainer}>
                        <div className={styles.logo}>
                            ⚖️
                        </div>
                        <h1 className={styles.title}>سامانه تصمیم‌گیری هوشمند</h1>
                    </div>
                    <nav>
                        {/* Navigation items could go here */}
                    </nav>
                </div>
            </header>

            <main className={`container ${styles.main}`}>
                {children}
            </main>

            <footer className={`container ${styles.footer}`}>
                <p>© {new Date().getFullYear()} سامانه مشاوره و تصمیم‌گیری</p>
            </footer>
        </div>
    );
};

export default Layout;
