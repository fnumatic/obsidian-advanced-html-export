/**
 * DOM Helpers - jQuery-lite utilities
 */

function el(selector) {
    try {
        return document.querySelector(selector);
    } catch (e) {
        return null;
    }
}

function els(selector) {
    try {
        return Array.from(document.querySelectorAll(selector) || []);
    } catch (e) {
        return [];
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToId(id) {
    const element = typeof id === 'string' ? el('#' + id) : id;
    if (element) element.scrollIntoView({ behavior: 'smooth' });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function toggleTheme() {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
}
