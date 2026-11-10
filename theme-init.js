/**
 * Apply the persisted theme before CSS parses to avoid a flash of the wrong
 * theme. Kept as an external file so the page can run under a CSP that blocks
 * inline scripts.
 */
(function () {
  var saved = localStorage.getItem('echolocate-theme');
  var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}());
