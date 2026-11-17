// Admin / moderation panel and the owner growth tools.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

async function admin(v) {
  if (!me?.admin && !me?.mod) return (v.innerHTML = head('Admin', '', false) + '<p class="p-10 text-center text-zinc-500">Moderators and admins only.</p>');
  const title = me.admin ? 'Admin panel' : 'Moderation';
  v.innerHTML = head(title, 'Manage your platform', false) + skel;
  try {
    const d = await api('/admin/overview'), owner = !!me.admin;
    const stat = ([t, n]) => `<div class="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"><div class="text-2xl font-extrabold">${fmt(n)}</div><div class="text-xs text-zinc-500">${t}</div></div>`;
    const rep = (r) => `<div class="border-b border-zinc-800 p-4" data-rid="${r.id}"><div class="flex flex-wrap items-center gap-2 text-sm"><span class="rounded-full bg-red-500/15 px-2 py-0.5 font-bold text-red-400">${r.count} report${r.count === 1 ? '' : 's'}</span><span class="text-zinc-500">${r.reasons.map(esc).join(', ')}</span></div><p class="my-2 rounded-xl bg-zinc-900 p-3 text-sm">${esc(r.preview)}</p><p class="mb-2 text-xs text-zinc-500">Reported by ${r.by.map((u) => '@' + esc(u)).join(', ')}${r.count > r.by.length ? ' and others' : ''}</p><div class="flex flex-wrap gap-2">${[['dismiss', 'Dismiss'], ...(r.kind === 'post' ? [['delete', 'Delete post'], ['sensitive', 'Mark sensitive']] : []), ['suspend7', 'Suspend 7 days'], ['ban', 'Ban']].map(([x, t]) => `<button data-ra="${x}" class="${btnO}">${t}</button>`).join('')}</div></div>`;
    const usr = (u) => `<div class="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3" data-uid="${u.id}">${av(u)}<div class="min-w-0 flex-1"><div class="truncate"><b>${esc(u.name)}</b>${bdg(u)} ${u.mod ? '<span class="rounded bg-sky-500/20 px-1.5 text-xs text-sky-400">mod</span>' : ''}</div><div class="truncate text-sm text-zinc-500">@${esc(u.username)}${u.banned ? ' · banned' : u.suspended ? ' · suspended until ' + new Date(u.until).toLocaleDateString() : ''}</div></div>${owner ? `<select data-badge class="rounded bg-zinc-900 px-2 py-1 text-sm">${['', 'verified', 'business', 'government', 'owner'].map((x) => `<option value="${x}" ${u.badge === x ? 'selected' : ''}>${x || 'no badge'}</option>`).join('')}</select>` : ''}${u.admin || (u.mod && !owner) ? '' : u.suspended ? '<button data-sus="lift" class="text-sm text-emerald-400">Lift</button>' : '<button data-sus="open" class="text-sm text-red-400">Suspend</button>'}${owner && !u.admin ? `<button data-modtoggle="${u.mod ? 0 : 1}" class="text-sm text-sky-400">${u.mod ? 'Remove mod' : 'Make mod'}</button>` : ''}${owner ? '<button data-rlink class="text-sm text-sky-400">Reset link</button>' : ''}</div>`;
    v.innerHTML = head(title, 'Manage your platform', false) + `<div class="grid grid-cols-3 gap-2 p-4">${[['Users', d.users], ['Posts', d.posts], ['Open reports', d.openReports]].map(stat).join('')}</div>
    <h2 class="px-4 pt-2 text-xl font-extrabold">Reports</h2>${d.reports.length ? d.reports.map(rep).join('') : '<p class="p-6 text-zinc-500">No open reports.</p>'}
    <h2 class="px-4 pt-4 text-xl font-extrabold">${owner ? 'Users &amp; roles' : 'Users'}</h2>${d.recent.map(usr).join('')}
    <h2 class="px-4 pt-4 text-xl font-extrabold">Moderation log</h2>${d.modlog.length ? d.modlog.map((l) => `<div class="border-b border-zinc-800 px-4 py-2 text-sm"><b>@${esc(l.mod)}</b> ${esc(l.action)} ${esc(l.target)}${l.note ? ` <span class="text-zinc-500">— ${esc(l.note)}</span>` : ''} <span class="text-zinc-500">· ${ago(l.at)}</span></div>`).join('') : '<p class="p-6 text-zinc-500">Nothing yet.</p>'}
    ${owner ? `<section class="mt-4 border-t border-zinc-800 p-4"><h2 class="text-xl font-extrabold">Blocked words</h2><p class="mt-1 text-sm text-zinc-500">Posts, edits, names and bios containing these words are rejected.</p><form id="wff" class="mt-2 flex gap-2"><input name="word" maxlength="40" placeholder="Word or phrase" class="${inp}"><button class="shrink-0 rounded-full bg-white px-4 font-bold text-black">Add</button></form><div class="mt-2 flex flex-wrap gap-2">${d.filters.map((w) => `<button data-wfrm="${esc(w)}" class="rounded-full bg-zinc-900 px-3 py-1 text-sm hover:bg-zinc-800">${esc(w)} ✕</button>`).join('') || '<span class="text-sm text-zinc-500">None yet.</span>'}</div></section>
    <section class="border-t border-zinc-800 p-4"><h2 class="text-xl font-extrabold">Maintenance</h2><p class="mt-1 text-sm text-zinc-500">Posts written before topics existed aren’t tagged yet, so they won’t show on topic pages.</p><button data-backfill class="mt-2 ${btnO}">Tag older posts with topics</button></section>` : ''}
    ${me.badge === 'owner' ? growthHTML() : ''}`;
    if (me.badge === 'owner') loadActive();
  } catch (x) { v.innerHTML = head(title, '', false) + `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
}

const pidOf = (s) => (s.match(/\/p\/([a-f0-9]{24})/) || [])[1] || s.trim();

const modePair = (name, cls = 'form') => `<div class="flex gap-4 text-sm"><label class="flex items-center gap-1.5"><input type="radio" name="${name}_mode" value="instant" checked onchange="this.closest('.${cls}').querySelector('.${name}-until').classList.add('hidden')"> Instant</label><label class="flex items-center gap-1.5"><input type="radio" name="${name}_mode" value="gradual" onchange="this.closest('.${cls}').querySelector('.${name}-until').classList.remove('hidden')"> Gradually, over time</label></div><input name="${name}_until" type="datetime-local" class="${name}-until hidden ${inp}">`;

function growthHTML() {
  return `<div class="mt-4 space-y-6 border-t border-zinc-800 p-4"><h2 class="flex items-center gap-2 text-xl font-extrabold">Growth tools <span class="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-400">Owner only</span></h2>
  <p class="text-sm text-zinc-500">Padded numbers layered on top of real activity. Nobody is notified. Use "Instant" to set a number right now, or "Gradually" to have it climb on its own until a date you pick.</p>

  <form id="ffForm" class="form space-y-2 rounded-2xl border border-zinc-800 p-4">
    <h3 class="font-bold">Boost your followers</h3>
    <input name="amount" type="number" min="0" max="50000000" required placeholder="Target follower count, e.g. 1000000" class="${inp}">
    ${modePair('ff')}
    <p class="err text-sm text-red-400"></p>
    <button class="rounded-full bg-sky-500 px-4 py-2 font-bold text-white">Apply to my account</button>
  </form>

  <form id="peForm" class="form space-y-3 rounded-2xl border border-zinc-800 p-4">
    <h3 class="font-bold">Boost a post</h3>
    <input name="post" required placeholder="Post link or ID — use ⋯ → Copy link on the post" class="${inp}">
    ${['likes', 'reposts', 'saves', 'views'].map((k) => `<div class="space-y-1 border-t border-zinc-800 pt-2 first:border-0 first:pt-0"><div class="flex items-center gap-2"><span class="w-16 shrink-0 text-sm capitalize">${k}</span><input name="${k}_amount" type="number" min="0" max="50000000" placeholder="target amount" class="${inp}"></div>${modePair(k)}</div>`).join('')}
    <p class="err text-sm text-red-400"></p>
    <button class="rounded-full bg-sky-500 px-4 py-2 font-bold text-white">Apply to post</button>
  </form>

  <form id="frForm" class="form space-y-2 rounded-2xl border border-zinc-800 p-4">
    <h3 class="font-bold">Fake replies</h3>
    <input name="post" required placeholder="Post link or ID" class="${inp}">
    <textarea name="messages" required rows="4" placeholder="One reply message per line — cycled if you ask for more replies than lines" class="${inp}"></textarea>
    <input name="count" type="number" min="1" max="500" required placeholder="How many replies (max 500)" class="${inp}">
    ${modePair('fr')}
    <p class="err text-sm text-red-400"></p>
    <button class="rounded-full bg-sky-500 px-4 py-2 font-bold text-white">Create replies</button>
  </form>

  <div id="active"><h3 class="mb-2 font-bold">Active gradual boosts</h3><p class="text-sm text-zinc-500">Loading…</p></div>
  </div>`;
}

async function loadActive() {
  const el = $('#active'); if (!el) return;
  try {
    const d = await api('/admin/fake/active');
    const bar = (f) => `<div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"><div class="h-full bg-sky-500" style="width:${f.target ? Math.min(100, Math.round(f.now / f.target * 100)) : 100}%"></div></div><div class="mt-1 text-xs text-zinc-500">${f.now.toLocaleString()} of ${f.target.toLocaleString()} so far</div>`;
    const rows = [
      ...d.users.map((u) => `<div class="rounded-xl border border-zinc-800 p-3 text-sm"><div class="flex items-center justify-between gap-2"><span>@${esc(u.username)} · followers</span><button data-stopf="user" data-stopid="${u.id}" class="shrink-0 rounded-full border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-900">Stop</button></div>${bar(u)}</div>`),
      ...d.posts.flatMap((p) => Object.entries(p.fake).map(([k, f]) => `<div class="rounded-xl border border-zinc-800 p-3 text-sm"><div class="flex items-center justify-between gap-2"><span>@${esc(p.author)}'s post · ${k}</span><button data-stopf="post" data-stopid="${p.id}" data-stopkind="${k}" class="shrink-0 rounded-full border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-900">Stop</button></div>${bar(f)}</div>`)),
    ];
    el.innerHTML = `<h3 class="mb-2 font-bold">Active gradual boosts</h3>${rows.length ? `<div class="space-y-2">${rows.join('')}</div>` : '<p class="text-sm text-zinc-500">Nothing running right now.</p>'}`;
  } catch { el.innerHTML = `<h3 class="mb-2 font-bold">Active gradual boosts</h3><p class="text-sm text-red-400">Couldn’t load.</p>`; }
}

document.addEventListener('change', (e) => { const s = e.target.closest('[data-badge]'); if (s) api('/admin/users/' + s.closest('[data-uid]').dataset.uid, { method: 'POST', body: JSON.stringify({ badge: s.value }) }).then(() => toast('Badge updated')).catch((x) => toast(x.message, 1)); });

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('backfill' in d) { const r = await api('/admin/backfill-topics', { method: 'POST' }); return toast(`${r.updated} post${r.updated === 1 ? '' : 's'} tagged`); }
    if ('rlink' in d) { const r = await api(`/admin/users/${b.closest('[data-uid]').dataset.uid}/reset-link`, { method: 'POST' }); return openDlg(`<div class="space-y-3 p-6"><h2 class="text-xl font-extrabold">Password reset link</h2><p class="text-sm text-zinc-400">Send this to the user. It works once and expires in 1 hour.</p><input readonly value="${esc(r.link)}" onclick="this.select()" class="${inp}"></div>`); }
    if (d.ra) { const row = b.closest('[data-rid]'); await api('/admin/reports/' + row.dataset.rid, { method: 'POST', body: JSON.stringify({ action: d.ra }) }); collapse(row); return toast('Done'); }
    if (d.sus === 'open') { const id = b.closest('[data-uid]').dataset.uid; return openDlg(`<form id="susf" data-uid="${id}" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Suspend account</h2><label class="block text-sm text-zinc-400">For how long<select name="days" class="${inp} mt-1"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="0">Permanent ban</option></select></label><input name="reason" maxlength="200" placeholder="Reason (kept in the moderation log)" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-red-600 py-2.5 font-bold text-white">Suspend</button></form>`); }
    if (d.sus === 'lift') { await api(`/admin/users/${b.closest('[data-uid]').dataset.uid}/suspend`, { method: 'POST', body: JSON.stringify({ days: -1 }) }); toast('Suspension lifted'); drop('#/admin'); cur = null; return route(); }
    if (d.modtoggle !== undefined) { await api(`/admin/users/${b.closest('[data-uid]').dataset.uid}/mod`, { method: 'POST', body: JSON.stringify({ on: d.modtoggle === '1' }) }); drop('#/admin'); cur = null; route(); return toast('Role updated'); }
    if (d.wfrm) { await api('/admin/filters/' + encodeURIComponent(d.wfrm), { method: 'DELETE' }); drop('#/admin'); cur = null; return route(); }
    if (d.stopf) { await api('/admin/fake/stop', { method: 'POST', body: JSON.stringify({ type: d.stopf, id: d.stopid, kind: d.stopkind }) }); toast('Stopped — frozen at the current number'); return loadActive(); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'susf') { const x = Object.fromEntries(new FormData(f)); await api(`/admin/users/${f.dataset.uid}/suspend`, { method: 'POST', body: JSON.stringify({ days: +x.days, reason: x.reason }) }); dlg.close(); toast('Account suspended'); drop('#/admin'); cur = null; route(); }
    if (f.id === 'wff') { const w = f.word.value.trim(); if (!w) return; await api('/admin/filters', { method: 'POST', body: JSON.stringify({ word: w }) }); drop('#/admin'); cur = null; route(); }
    if (f.id === 'ffForm') {
      await api('/admin/fake/followers', { method: 'POST', body: JSON.stringify({ amount: f.amount.value, mode: f.ff_mode.value, until: f.ff_until.value }) });
      toast('Follower boost applied'); f.reset(); loadActive();
      if (cur?.startsWith('#/u/')) { drop(cur); route(); }
    }
    if (f.id === 'peForm') {
      const pid = pidOf(f.post.value); let applied = false, err = '';
      for (const k of ['likes', 'reposts', 'saves', 'views']) {
        const amt = f[k + '_amount'].value; if (!amt) continue;
        try { await api('/admin/fake/engagement', { method: 'POST', body: JSON.stringify({ postId: pid, kind: k, amount: amt, mode: f[k + '_mode'].value, until: f[k + '_until'].value }) }); applied = true; }
        catch (x) { err = x.message; }
      }
      if (err) f.querySelector('.err').textContent = err;
      else if (!applied) f.querySelector('.err').textContent = 'Enter an amount for at least one metric';
      else { toast('Post boosted'); f.reset(); loadActive(); }
    }
    if (f.id === 'frForm') {
      await api('/admin/fake/replies', { method: 'POST', body: JSON.stringify({ postId: pidOf(f.post.value), messages: f.messages.value, count: f.count.value, mode: f.fr_mode.value, until: f.fr_until.value }) });
      toast('Fake replies created'); f.reset(); loadActive();
    }
  }
  return NEXT;
});
