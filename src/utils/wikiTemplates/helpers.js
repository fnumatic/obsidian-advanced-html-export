/**
 * DOM Helpers - jQuery-lite utilities
 */

export function el(selector) {
    try {
        return document.querySelector(selector);
    } catch (e) {
        return null;
    }
}

export function els(selector) {
    try {
        return Array.from(document.querySelectorAll(selector) || []);
    } catch (e) {
        return [];
    }
}

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function scrollToId(id) {
    const element = typeof id === 'string' ? el('#' + id) : id;
    if (element) element.scrollIntoView({ behavior: 'smooth' });
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

export function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

export function toggleTheme() {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
}
