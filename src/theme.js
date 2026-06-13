// Theme handling. Inline scripts are blocked by our CSP, so the saved theme is
// applied from this module (imported first in main.jsx) before React renders.
const STORAGE_KEY = 'decision_app_theme';

export const getStoredTheme = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const resolveInitialTheme = () => {
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

export const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
};

export const setTheme = (theme) => {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Persisting is best-effort.
  }
};

// Apply immediately on import to minimise flash of incorrect theme.
applyTheme(resolveInitialTheme());
