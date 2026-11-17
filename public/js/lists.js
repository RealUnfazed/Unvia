// Lists.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const lrow = (l) => `<a href="#/list/${l.id}" class="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-white/[.03]"><span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-500/20 text-sky-400">${ic('lists', '!h-6 !w-6')}</span><span class="min-w-0 flex-1 leading-tight"><span class="flex items-center gap-1 font-bold"><span class="truncate">${esc(l.name)}</span>${l.private ? LOCK : ''}${l.pinned ? ic('pin', '!h-3.5 !w-3.5 text-zinc-500') : ''}</span><span class="block truncate text-sm text-zinc-500">${l.owner && !l.mine ? 'by @' + esc(l.owner.username) + ' · ' : ''}${fmt(l.members)} member${l.members === 1 ? '' : 's'}${l.subs ? ' · ' + fmt(l.subs) + ' subscriber' + (l.subs === 1 ? '' : 's') : ''}</span></span></a>`;

async function listsPage(v, pg) {
  if (!me) return void (v.innerHTML = head('Lists', '', false) + guest());
  let tabL = 'owned', data = null;
  v.innerHTML = `<div class="sticky top-0 z-10 bg-black/80 backdrop-blur"><div class="flex items-center justify-between px-4 py-2"><h1 class="text-xl font-bold">Lists</h1><button data-newlist aria-label="New list" class="rounded-full p-2 hover:bg-zinc-900">${ic('edit', '!h-5 !w-5')}</button></div><div class="lstabs flex border-b border-zinc-800"></div></div><div class="lb">${skel}</div>`;
  const draw = () => {
    v.querySelector('.lstabs').innerHTML = [['owned', 'Yours'], ['subscribed', 'Subscribed'], ['discover', 'Discover']].map(([k, l]) => `<button data-lstab="${k}" class="relative flex-1 py-3 text-[15px] hover:bg-zinc-900 ${tabL === k ? 'font-bold' : 'text-zinc-500'}">${l}${tabL === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join('');
    if (!data) return;
    const ls = data[tabL], msg = { owned: 'You haven’t created any lists. Tap the pencil to make one.', subscribed: 'You aren’t subscribed to any lists.', discover: 'No public lists to discover yet.' }[tabL];
    v.querySelector('.lb').innerHTML = ls.length ? ls.map(lrow).join('') : `<p class="p-10 text-center text-zinc-500">${msg}</p>`;
  };
  v._lsTab = (k) => { tabL = k; draw(); };
  const load = async () => { try { const d = await api('/lists'), sig = JSON.stringify(d); if (sig !== v._sig) { v._sig = sig; data = d; draw(); } } catch (x) { v.querySelector('.lb').innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; } };
  draw(); await load(); pg.refresh = load;
}

async function listPage(v, id, pg) {
  let tabL = 'posts', d;
  try { d = await api('/lists/' + id); } catch { return void (v.innerHTML = head('List') + '<p class="p-10 text-center text-zinc-500">This list isn’t available.</p>'); }
  const L = d.list, owner = L.mine; v._listId = id;
  const rows = () => (d.members.length ? d.members.map((u) => `<div class="flex items-center gap-3 px-4 py-3">${av(u)}<a href="#/u/${esc(u.username)}" class="min-w-0 flex-1 leading-tight"><div class="truncate font-bold hover:underline">${esc(u.name)}${bdg(u)}</div><div class="truncate text-sm text-zinc-500">@${esc(u.username)}</div></a>${owner ? `<button data-lmrm="${esc(u.username)}" class="rounded-full border border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-900">Remove</button>` : u.id === me?.id ? '' : fbtn(u.username, u.isFollowing)}</div>`).join('') : '<p class="p-10 text-center text-zinc-500">No members yet.</p>');
  const stat = () => `${L.owner ? 'by <a href="#/u/' + esc(L.owner.username) + '" class="hover:underline">@' + esc(L.owner.username) + '</a> · ' : ''}${fmt(d.members.length)} member${d.members.length === 1 ? '' : 's'} · ${fmt(L.subs)} subscriber${L.subs === 1 ? '' : 's'}`;
  v.innerHTML = head(`${esc(L.name)}${L.private ? LOCK : ''}`, '') + `<div class="px-4 pb-3">${L.description ? `<p class="text-[15px]">${esc(L.description)}</p>` : ''}<p class="lstat mt-1 text-sm text-zinc-500">${stat()}</p><div class="mt-3 flex flex-wrap gap-2">${!me ? '' : owner ? `<button data-ledit class="${btnO}">Edit list</button>` : `<button data-lsub class="rounded-full px-4 py-1.5 text-sm font-bold ${L.subscribed ? 'border border-zinc-600 hover:border-red-500 hover:text-red-500' : 'bg-white text-black hover:bg-zinc-200'}">${L.subscribed ? 'Subscribed' : 'Subscribe'}</button>`}${me && (owner || L.subscribed) ? `<button data-lpin class="${btnO}">${L.pinned ? 'Unpin from Home' : 'Pin to Home'}</button>` : ''}</div></div><div class="ltabs flex border-b border-zinc-800"></div><div class="lbody"></div>`;
  const body = v.querySelector('.lbody');
  const draw = () => {
    v.querySelector('.ltabs').innerHTML = [['posts', 'Posts'], ['members', 'Members']].map(([k, l]) => `<button data-ltab="${k}" class="relative flex-1 py-3 text-[15px] hover:bg-zinc-900 ${tabL === k ? 'font-bold' : 'text-zinc-500'}">${l}${tabL === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join('');
    if (tabL === 'posts') { body.innerHTML = '<div class="f"></div>'; feed(body.querySelector('.f'), 'feed=list:' + id, L.members ? 'No posts from this list yet.' : 'Add people to this list to see their posts here.'); }
    else body.innerHTML = (owner ? '<div class="p-3"><input class="lmq ' + inp + '" placeholder="Search people to add" autocomplete="off" autocapitalize="none"><div class="lmres mt-2"></div></div>' : '') + `<div class="lml">${rows()}</div>`;
  };
  v._lTab = (k) => { tabL = k; draw(); };
  v._lmRefresh = async () => { d = await api('/lists/' + id); L.members = d.members.length; v.querySelector('.lstat').innerHTML = stat(); const l = v.querySelector('.lml'); if (l) l.innerHTML = rows(); };
  draw(); pg.refresh = () => tabL === 'posts' && refreshVisible(body.querySelector('.f'));
}

async function listsDlg(un) { // add/remove someone from your lists
  try {
    const ls = await api(`/users/${un}/list-memberships`);
    openDlg(`<div class="p-4"><h2 class="mb-2 text-xl font-extrabold">Add or remove @${esc(un)}</h2>${ls.length ? ls.map((l) => `<label class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-zinc-900"><input type="checkbox" data-lmtoggle="${l.id}" data-un="${esc(un)}" ${l.has ? 'checked' : ''} class="h-5 w-5 accent-sky-500"><span class="min-w-0 flex-1 truncate font-semibold">${esc(l.name)}</span>${l.private ? LOCK : ''}</label>`).join('') : '<p class="px-3 py-4 text-zinc-500">You don’t have any lists yet.</p>'}<button data-newlist data-un="${esc(un)}" class="mt-2 w-full rounded-full border border-zinc-600 py-2 font-bold hover:bg-zinc-900">Create a new list</button></div>`);
  } catch (x) { toast(x.message, 1); }
}

const listForm = (l = {}, un = '') => `<form id="${l.id ? 'lef' : 'nlf'}" data-id="${l.id || ''}" data-un="${esc(un)}" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">${l.id ? 'Edit list' : 'Create a list'}</h2><input name="name" required maxlength="40" value="${esc(l.name)}" placeholder="Name" class="${inp}"><textarea name="description" maxlength="100" rows="2" placeholder="Description (optional)" class="${inp}">${esc(l.description)}</textarea><label class="flex items-center gap-3 text-sm"><input type="checkbox" name="private" ${l.private ? 'checked' : ''} class="h-5 w-5 accent-sky-500"> Make private (only you can see it)</label><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">${l.id ? 'Save' : 'Create'}</button>${l.id ? '<button type="button" data-ldel class="w-full rounded-full border border-red-500 py-2.5 font-bold text-red-400 hover:bg-red-500/10">Delete list</button>' : ''}</form>`;

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset?.lmtoggle) { try { const r = await api(`/lists/${t.dataset.lmtoggle}/members/${t.dataset.un}`, { method: 'POST' }); toast(r.in ? 'Added to list' : 'Removed from list'); Object.keys(pages).filter((k) => k.startsWith('#/list')).forEach(drop); } catch (x) { t.checked = !t.checked; toast(x.message, 1); } }
});

let lmT;

document.addEventListener('input', (e) => { // search people to add to a list
  const t = e.target; if (!t.classList?.contains('lmq')) return;
  clearTimeout(lmT); const q = t.value.trim().replace(/^@/, ''), res = t.closest('.pg').querySelector('.lmres'); if (!q) return void (res.innerHTML = '');
  lmT = setTimeout(async () => {
    try { const us = await api('/mentions?q=' + encodeURIComponent(q)); res.innerHTML = us.length ? us.map((u) => `<button type="button" data-lmadd="${esc(u.username)}" class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-900">${dot(u, 'h-9 w-9 text-sm')}<span class="min-w-0 truncate"><b>${esc(u.name)}</b> <span class="text-zinc-500">@${esc(u.username)}</span></span></button>`).join('') : '<p class="px-2 py-3 text-sm text-zinc-500">No matching accounts.</p>'; } catch {}
  }, 200);
});

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    // lists
    if (d.lstab) return b.closest('.pg')._lsTab(d.lstab);
    if (d.ltab) return b.closest('.pg')._lTab(d.ltab);
    if ('newlist' in d) return openDlg(listForm({}, d.un || ''));
    if ('ledit' in d) { const v = b.closest('.pg'), L = (await api('/lists/' + v._listId)).list; return openDlg(listForm(L)); }
    if ('ldel' in d) { const id = dlg.querySelector('#lef').dataset.id; if (!confirm('Delete this list?')) return; await api('/lists/' + id, { method: 'DELETE' }); dlg.close(); PL = PL.filter((l) => l.id !== id); if (tab === 'list:' + id) tab = 'all'; Object.keys(pages).filter((k) => k === '#/' || k.startsWith('#/list')).forEach(drop); location.hash = '#/lists'; return toast('List deleted'); }
    if ('lsub' in d) { const v = b.closest('.pg'), r = await api(`/lists/${v._listId}/subscribe`, { method: 'POST' }); drop('#/list/' + v._listId); drop('#/lists'); cur = null; route(); return toast(r.subscribed ? 'Subscribed' : 'Unsubscribed'); }
    if ('lpin' in d) { const v = b.closest('.pg'), id = v._listId, r = await api(`/lists/${id}/pin`, { method: 'POST' }); PL = await api('/lists/pinned'); if (tab.startsWith('list:') && !PL.some((l) => 'list:' + l.id === tab)) tab = 'all'; ['#/', '#/lists', '#/list/' + id].forEach(drop); cur = null; route(); return toast(r.pinned ? 'Pinned to Home' : 'Unpinned'); }
    if (d.lmadd || d.lmrm) { const v = b.closest('.pg'), un = d.lmadd || d.lmrm, r = await api(`/lists/${v._listId}/members/${un}`, { method: 'POST' }); const q = v.querySelector('.lmq'); if (q) q.value = ''; const rs = v.querySelector('.lmres'); if (rs) rs.innerHTML = ''; toast(r.in ? 'Added to list' : 'Removed from list'); return v._lmRefresh(); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'nlf') {
      const x = Object.fromEntries(new FormData(f)), r = await api('/lists', { method: 'POST', body: JSON.stringify({ name: x.name, description: x.description, private: !!x.private }) });
      drop('#/lists'); dlg.close();
      if (f.dataset.un) { await api(`/lists/${r.id}/members/${f.dataset.un}`, { method: 'POST' }); toast('List created and member added'); } else location.hash = '#/list/' + r.id;
    }
    if (f.id === 'lef') { const x = Object.fromEntries(new FormData(f)); await api('/lists/' + f.dataset.id, { method: 'PATCH', body: JSON.stringify({ name: x.name, description: x.description, private: !!x.private }) }); dlg.close(); ['#/', '#/lists', '#/list/' + f.dataset.id].forEach(drop); cur = null; route(); toast('List updated'); }
  }
  return NEXT;
});
