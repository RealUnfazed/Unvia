// Formatting, API calls, toasts and small DOM helpers.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const esc = (s) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const urlify = (s) => s.replace(/https?:\/\/[^\s<]+/g, (u) => {
  const tail = (u.match(/(?:[.,!?;:)\]]|&quot;|&#39;)+$/) || [''])[0], url = tail ? u.slice(0, -tail.length) : u, txt = url.replace(/^https?:\/\//, '');
  return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" class="text-sky-500 hover:underline">${txt.length > 36 ? txt.slice(0, 36) + '…' : txt}</a>${tail}`;
});

const linkify = (t) => urlify(esc(t)).replace(/(^|\s)@(\w+)/g, '$1<a href="#/u/$2" class="text-sky-500 hover:underline">@$2</a>').replace(/(^|\s)#(\w+)/g, '$1<a href="#/search/%23$2" class="text-sky-500 hover:underline">#$2</a>');

const ago = (t) => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'now' : s < 3600 ? (s / 60 | 0) + 'm' : s < 86400 ? (s / 3600 | 0) + 'h' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

const hue = (s) => Math.abs([...(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 360;

// Caps at 3 significant digits like X does: "37.1K" (2-digit + decimal) but "371K" (3-digit, no decimal) — a decimal only shows below 100 in its tier.
function fmt(n) {
  n = Math.round(+n || 0);
  const neg = n < 0 ? '-' : '', abs = Math.abs(n), tiers = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (let i = 0; i < tiers.length; i++) {
    const [v, s] = tiers[i]; if (abs < v) continue;
    const scaled = abs / v, digits = scaled >= 100 ? 0 : 1;
    let val = +scaled.toFixed(digits);
    if (val >= 1000 && i > 0) { const [v2, s2] = tiers[i - 1]; return neg + (+(abs / v2).toFixed(1)) + s2; } // rounded into the next tier, e.g. 999.6K -> 1M
    if (val >= 100 && digits === 1) val = Math.round(val); // rounding pushed a 2-digit decimal over 100, e.g. 99.96 -> 100
    return neg + val + s;
  }
  return neg + abs.toLocaleString('en-US');
}

// Smoothly counts from the last displayed value to `n`, formatting at every frame — always a real number mid-flight, never a mismatched unit like a stray "K" flashing before an "M".
function animateCount(el, n) {
  if (!el) return;
  const to = +n || 0, from = +el.dataset.val || to;
  el.dataset.val = to;
  if (from === to) return void (el.textContent = fmt(to));
  cancelAnimationFrame(el._raf);
  const t0 = performance.now(), dur = 1500;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); // slow, ease-out settle
    el.textContent = fmt(Math.round(from + (to - from) * e));
    el._raf = p < 1 ? requestAnimationFrame(step) : null;
  };
  el._raf = requestAnimationFrame(step);
}

async function api(path, o = {}) {
  const headers = { ...(typeof o.body === 'string' && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) };
  const r = await fetch(API + '/api' + path, { ...o, headers });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token && !path.startsWith('/auth/')) { localStorage.removeItem('token'); localStorage.removeItem('me'); location.reload(); } // session ended (password changed / logged out everywhere)
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}

const head = (t, sub = '', back = true) => `<div class="sticky top-0 z-10 flex items-center gap-6 bg-black/80 px-4 py-2 backdrop-blur">${back ? `<button data-back class="rounded-full p-2 hover:bg-zinc-900">${ic('back')}</button>` : ''}<div><h1 class="text-xl font-bold leading-tight">${t}</h1>${sub ? `<div class="text-xs text-zinc-500">${sub}</div>` : ''}</div></div>`;

const skel = '<div class="skl m-4 h-24 rounded-2xl bg-zinc-900"></div>'.repeat(3);

const drop = (k) => { pages[k]?.el.remove(); delete pages[k]; };

const ins = (ref, pos, html) => { ref.insertAdjacentHTML(pos, html); (pos === 'afterbegin' ? ref.firstElementChild : ref.nextElementSibling).classList.add('drop'); };

function toast(m, err) {
  const t = document.createElement('div');
  t.className = `drop fixed left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2 text-sm font-bold text-white shadow-lg ${err ? 'bg-red-600' : 'bg-sky-500'}`;
  t.style.bottom = 'calc(5rem + env(safe-area-inset-bottom))'; t.textContent = m;
  (dlg.open ? dlg : document.body).append(t); setTimeout(() => t.remove(), 2600);
}

const collapse = (el) => {
  el.style.cssText = `height:${el.offsetHeight}px;overflow:hidden;transition:all .5s cubic-bezier(.4,0,.2,1)`;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.cssText += ';height:0;padding-top:0;padding-bottom:0;opacity:0;transform:translateX(60px) rotate(3deg);border-width:0'; }));
  setTimeout(() => el.remove(), 520);
};

const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const dayLbl = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
