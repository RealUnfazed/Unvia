// View counting: a view is recorded when a post stays on screen.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

// Counts a view when a post stays mostly on screen for a moment (once per post per session; your own posts don't count)
const seenV = new Set(JSON.parse(sessionStorage.seenV || '[]')), vq = new Set(), vt = new Map();

const vobs = new IntersectionObserver((es) => es.forEach((e) => {
  const id = e.target.dataset.id;
  if (e.isIntersecting) { if (!seenV.has(id) && !vt.has(id)) vt.set(id, setTimeout(() => { vt.delete(id); seenV.add(id); vq.add(id); }, 700)); }
  else if (vt.has(id)) { clearTimeout(vt.get(id)); vt.delete(id); }
}), { threshold: 0.6 });

new MutationObserver(() => document.querySelectorAll('article[data-id]:not([data-vo])').forEach((a) => { a.dataset.vo = 1; vobs.observe(a); })).observe($('#view'), { childList: true, subtree: true });

async function flushViews(keep) {
  if (!vq.size) return; const ids = [...vq].slice(0, 40); ids.forEach((i) => vq.delete(i)); sessionStorage.seenV = JSON.stringify([...seenV].slice(-500));
  try { await api('/views', { method: 'POST', body: JSON.stringify({ ids }), keepalive: !!keep }); } catch {}
}

setInterval(() => flushViews(), 6000); document.addEventListener('visibilitychange', () => document.hidden && flushViews(true));
