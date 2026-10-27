import { THEME_KEY } from './state.js';

export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    localStorage.setItem(THEME_KEY, theme);
}

export function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(saved);
}

export function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
}
