// Start-up.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('/sw.js').catch(() => {}); // enables push + installing to the Home Screen

applyTheme(); chrome(); route(); sugg(); trend();

if (token) api('/lists/pinned').then((l) => { if (l.length) { PL = l; drop('#/'); if (cur === '#/') { cur = null; route(); } } }).catch(() => {});

if (token) { pollUnread(); setInterval(pollUnread, 10000); }

if (token) api('/me').then((d) => { me = d.user; localStorage.me = JSON.stringify(me); chrome(); }).catch(() => {});
