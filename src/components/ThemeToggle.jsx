import React, { useEffect, useState } from 'react';
import { resolveInitialTheme, setTheme } from '../theme';
import styles from './ThemeToggle.module.css';

const ThemeToggle = () => {
    const [theme, setThemeState] = useState(() => resolveInitialTheme());

    useEffect(() => {
        setTheme(theme);
    }, [theme]);

    const toggle = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            className={styles.toggle}
            onClick={toggle}
            aria-label={isDark ? 'حالت روشن' : 'حالت تیره'}
            title={isDark ? 'حالت روشن' : 'حالت تیره'}
        >
            <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
        </button>
    );
};

export default ThemeToggle;
