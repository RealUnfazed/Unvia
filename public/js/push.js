// Push notification subscribe/unsubscribe.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function pushStatus() {
  if (!pushSupported()) return { supported: false };
  let key = null, sub = null;
  try { key = (await api('/push/key')).key; } catch {}
  try { const reg = await navigator.serviceWorker.getRegistration(); sub = reg ? await reg.pushManager.getSubscription() : null; } catch {}
  return { supported: true, key, perm: Notification.permission, on: !!sub && Notification.permission === 'granted' };
}

const urlB64 = (s) => Uint8Array.from([...atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))].map((c) => c.charCodeAt(0)));

async function pushOn() {
  const { key } = await api('/push/key'); if (!key) throw new Error('Push isn’t set up on this server');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked in your browser settings');
  const reg = await navigator.serviceWorker.ready, sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) }));
  await api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
}

async function pushOff() {
  const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (sub) { await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
}

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('push' in d) { try { await (b.getAttribute('aria-checked') === 'true' ? pushOff() : pushOn()); } catch (x) { toast(x.message, 1); } return settings(pages['#/settings'].el, true); }
    if ('pushtest' in d) { await api('/push/test', { method: 'POST' }); return toast('Test sent. It should arrive in a moment.'); }
  }
  return NEXT;
});
