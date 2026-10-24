// Absolute URL of the app root, including the deploy base path (e.g. /Harbor on GitHub Pages).
export const appUrl = () => window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
