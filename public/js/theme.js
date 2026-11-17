// Dark / dim / light / auto themes.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const THEMES = [['dark', 'Default', '#000000'], ['dim', 'Dim', '#15202b'], ['light', 'Light', '#ffffff'], ['auto', 'Auto', null]];

function applyTheme() {
  const pref = localStorage.theme || 'dark', t = pref === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', { dark: '#000000', dim: '#15202b', light: '#ffffff' }[t]);
}

matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => localStorage.theme === 'auto' && applyTheme());
