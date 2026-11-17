// Settings page and muted words.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

let _mw = '', _mr = [];

const muted = (p) => {
  const ws = me?.mutedWords; if (!ws?.length || p.author?.id === me.id) return false;
  const k = ws.join('\u0001'); if (k !== _mw) { _mw = k; _mr = ws.map((w) => new RegExp('(^|[^\\w#@])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'i')); }
  return _mr.some((r) => r.test(p.text || ''));
};

async function settings(v, quiet) {
  if (!me) return void (v.innerHTML = head('Settings', '', false) + guest());
  if (!quiet) v.innerHTML = head('Settings', '', false) + skel;
  let rel = { blocked: [], muted: [] };
  let ps = { supported: false };
  try { const [m, r, p] = await Promise.all([api('/me'), api('/me/relations'), pushStatus()]); me = m.user; localStorage.me = JSON.stringify(me); rel = r; ps = p; } catch {}
  const theme = localStorage.theme || 'dark';
  const urel = (u, k) => `<div class="flex items-center gap-3">${av(u, 'h-9 w-9 text-sm')}<div class="min-w-0 flex-1 truncate"><b>${esc(u.name)}</b> <span class="text-zinc-500">@${esc(u.username)}</span></div><button data-rel="${k}" data-un="${esc(u.username)}" class="${btnO}">${k === 'block' ? 'Unblock' : 'Unmute'}</button></div>`;
  v.innerHTML = head('Settings', '', false)
    + sec('Appearance', `<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">${THEMES.map(([k, l, c]) => `<button data-th="${k}" class="rounded-2xl border p-3 text-left transition-colors ${theme === k ? 'border-sky-500' : 'border-zinc-800 hover:bg-zinc-900'}"><span class="mb-2 block h-8 rounded-lg border border-zinc-800" style="background:${c || 'linear-gradient(90deg,#000 50%,#fff 50%)'}"></span><span class="text-sm font-bold">${l}</span></button>`).join('')}</div>`)
    + sec('Your account', `<p class="text-sm text-zinc-500">@${esc(me.username)}</p><div class="flex flex-wrap gap-2"><button data-edit class="${btnO}">Edit profile</button><a href="#/drafts" class="${btnO}">Drafts &amp; scheduled</a></div>
      <div class="border-t border-zinc-800 pt-3"><b>Email</b>${me.email ? `<p class="text-sm">${esc(me.email)} ${me.emailVerified ? '<span class="text-emerald-400">✓ verified</span>' : '<span class="text-amber-400">not verified</span>'}</p>` : '<p class="text-sm text-zinc-500">No email yet. Add one so you can reset your password.</p>'}${me.pendingEmail ? `<p class="text-sm text-amber-400">Waiting for you to confirm ${esc(me.pendingEmail)}. Check your inbox.</p>` : ''}
      <form id="emf" class="mt-2 space-y-2"><input name="email" type="email" required placeholder="${me.email ? 'New email address' : 'Email address'}" class="${inp}"><input name="password" type="password" required placeholder="Current password" class="${inp}"><p class="err text-sm text-red-400"></p><button class="rounded-full bg-white px-5 py-2 font-bold text-black">Send confirmation</button></form></div>`)
    + sec('Privacy & safety', `<div class="flex items-center justify-between gap-4"><div><b>Protect your posts</b><p class="text-sm text-zinc-500">Only followers you approve can see your posts. People who already follow you stay.</p></div>${swt(me.protected, 'data-prot')}</div>${me.protected || me.requests ? `<a href="#/follow-requests" class="${btnO} inline-block">Follow requests${me.requests ? ` (${me.requests})` : ''}</a>` : ''}
      <div class="border-t border-zinc-800 pt-3"><b>Muted words</b><p class="text-sm text-zinc-500">Posts containing these are hidden from your timelines and search.</p><form id="mwf" class="mt-2 flex gap-2"><input name="word" maxlength="40" placeholder="Word, phrase or #hashtag" class="${inp}"><button class="shrink-0 rounded-full bg-white px-4 font-bold text-black">Add</button></form><div class="mt-2 flex flex-wrap gap-2">${(me.mutedWords || []).map((w) => `<button data-mwrm="${esc(w)}" class="rounded-full bg-zinc-900 px-3 py-1 text-sm hover:bg-zinc-800">${esc(w)} ✕</button>`).join('') || '<span class="text-sm text-zinc-500">None yet.</span>'}</div></div>
      <div class="border-t border-zinc-800 pt-3"><b>Blocked accounts</b><div class="mt-2 space-y-2">${rel.blocked.map((u) => urel(u, 'block')).join('') || '<p class="text-sm text-zinc-500">You haven’t blocked anyone.</p>'}</div></div>
      <div class="border-t border-zinc-800 pt-3"><b>Muted accounts</b><div class="mt-2 space-y-2">${rel.muted.map((u) => urel(u, 'mute')).join('') || '<p class="text-sm text-zinc-500">You haven’t muted anyone.</p>'}</div></div>`)
    + sec('Push notifications', !ps.supported ? '<p class="text-sm text-zinc-500">This browser doesn’t support push notifications. On iPhone, add Unvia to your Home Screen first (Share → Add to Home Screen), then open it from there.</p>'
        : !ps.key ? '<p class="text-sm text-zinc-500">Push notifications aren’t set up on this server yet.</p>'
        : `<div class="flex items-center justify-between gap-4"><div><b>On this device</b><p class="text-sm text-zinc-500">${ps.perm === 'denied' ? 'Blocked in your browser settings. Allow notifications for this site to turn it on.' : 'Alerts for replies, mentions, messages and more, even when Unvia is closed.'}</p></div>${swt(ps.on, 'data-push')}</div>${ps.on ? `<label class="block text-sm text-zinc-400">What to send<select data-pushlvl class="${inp} mt-1"><option value="all" ${me.pushLevel !== 'important' ? 'selected' : ''}>Everything</option><option value="important" ${me.pushLevel === 'important' ? 'selected' : ''}>Only replies, mentions, messages and requests</option></select></label><button data-pushtest class="${btnO}">Send a test</button>` : ''}`)
    + sec('Security', `<form id="pf" class="space-y-2"><b>Change password</b><input name="current" type="password" required placeholder="Current password" class="${inp}"><input name="next" type="password" required minlength="8" placeholder="New password (8+ characters)" class="${inp}"><p class="err text-sm text-red-400"></p><button class="rounded-full bg-white px-5 py-2 font-bold text-black">Update password</button></form>
      <div class="flex items-center justify-between gap-4 border-t border-zinc-800 pt-3"><div><b>Two-factor authentication</b><p class="text-sm text-zinc-500">${me.twofa ? 'On. You’ll enter a code from your authenticator app when you log in.' : 'Add a second step at login using an authenticator app.'}</p></div><button data-tfa="${me.twofa ? 'off' : 'on'}" class="shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${me.twofa ? 'border border-zinc-600 hover:bg-zinc-900' : 'bg-white text-black'}">${me.twofa ? 'Turn off' : 'Turn on'}</button></div>
      <div class="border-t border-zinc-800 pt-3"><button data-logoutall class="${btnO}">Log out of all other devices</button></div>`)
    + sec('Your data', `<button data-export class="${btnO}">Download my data</button>`, 'A JSON file with your profile, posts, lists, bookmarks and messages.')
    + `<section class="p-4"><h2 class="mb-2 font-bold text-red-500">Danger zone</h2><button data-out class="mr-2 ${btnO}">Log out</button><button data-delacct class="rounded-full bg-red-600 px-4 py-1.5 font-bold text-white">Delete account</button></section>`;
}

document.addEventListener('change', async (e) => {
  const t = e.target;
  if ('pushlvl' in (t.dataset || {})) { try { await api('/me/push', { method: 'PUT', body: JSON.stringify({ level: t.value }) }); me.pushLevel = t.value; localStorage.me = JSON.stringify(me); toast('Saved'); } catch (x) { toast(x.message, 1); } }
});

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (d.th) { localStorage.theme = d.th; applyTheme(); return settings(pages['#/settings'].el, true); }
    if ('prot' in d) {
      const r = await api('/me/privacy', { method: 'POST', body: JSON.stringify({ protected: !me.protected }) }); me.protected = r.protected; localStorage.me = JSON.stringify(me);
      Object.keys(pages).filter((k) => k !== '#/settings').forEach(drop); toast(r.protected ? 'Your posts are now protected' : 'Your posts are public'); return settings(pages['#/settings'].el, true);
    }
    if (d.mwrm) { const w = (me.mutedWords || []).filter((x) => x !== d.mwrm); await api('/me/muted-words', { method: 'PUT', body: JSON.stringify({ words: w }) }); me.mutedWords = w; localStorage.me = JSON.stringify(me); Object.keys(pages).filter((k) => k !== '#/settings').forEach(drop); return settings(pages['#/settings'].el, true); }
    if (d.rel) { await api(`/users/${d.un}/${d.rel}`, { method: 'POST' }); Object.keys(pages).filter((k) => k !== '#/settings').forEach(drop); toast(d.rel === 'block' ? `Unblocked @${d.un}` : `Unmuted @${d.un}`); sugg(); return settings(pages['#/settings'].el, true); }
    if ('logoutall' in d) { if (!confirm('Log out of every other device? This one stays signed in.')) return; const r = await api('/me/logout-all', { method: 'POST' }); token = localStorage.token = r.token; return toast('Signed out of all other devices'); }
    if ('delacct' in d) return openDlg(`<form id="daf" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold text-red-500">Delete account</h2><p class="text-sm text-zinc-400">This permanently deletes your account, posts and messages. Enter your password to confirm.</p><input name="password" type="password" required placeholder="Password" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-red-600 py-2.5 font-bold text-white">Delete everything</button></form>`);
    if ('export' in d) { const r = await fetch(API + '/api/me/export', { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Couldn’t export your data'); const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'unvia-data.json'; a.click(); return toast('Download started'); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'daf') { await api('/me', { method: 'DELETE', body }); localStorage.removeItem('token'); localStorage.removeItem('me'); location.hash = '#/'; return void location.reload(); }
    if (f.id === 'emf') {
      const d = await api('/me/email', { method: 'POST', body }); f.reset();
      if (d.link) openDlg(`<div class="space-y-3 p-6"><h2 class="text-xl font-extrabold">Confirmation link</h2><p class="text-sm text-zinc-400">Email sending isn’t set up on this server, so here’s your link. Open it to confirm.</p><input readonly value="${esc(d.link)}" onclick="this.select()" class="${inp}"><a href="${esc(d.link)}" class="block rounded-full bg-sky-500 py-2.5 text-center font-bold text-white">Confirm now</a></div>`);
      else if (!d.sent) toast('Email sending isn’t set up on this server yet', 1); else toast('Check your inbox to confirm');
      settings(pages['#/settings'].el, true);
    }
    if (f.id === 'mwf') {
      const w = f.word.value.trim().toLowerCase(); if (!w) return;
      const words = [...new Set([...(me.mutedWords || []), w])], r = await api('/me/muted-words', { method: 'PUT', body: JSON.stringify({ words }) });
      me.mutedWords = r.words; localStorage.me = JSON.stringify(me); Object.keys(pages).filter((k) => k !== '#/settings').forEach(drop); settings(pages['#/settings'].el, true);
    }
    if (f.id === 'pf') { const d = await api('/me/password', { method: 'POST', body }); token = localStorage.token = d.token; f.reset(); toast('Password updated. Other devices were signed out.'); }
  }
  return NEXT;
});
