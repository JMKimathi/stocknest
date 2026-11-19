// Loaded in <head> so the saved light/dark theme is applied before the page
// draws (no white flash when dark mode is on).
(function () {
  let theme = null;
  try { theme = localStorage.getItem('sn_theme'); } catch (_) { /* storage blocked */ }
  if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
