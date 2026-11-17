// Generic buttons and card actions. Registered last because they are the catch-all handlers.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('login' in d) { reg = d.login === 'reg'; return openAuth(); }
    if ('need' in d) { e.preventDefault(); return openAuth(); }
    if (b?.getAttribute('href') === '#/' && cur === '#/') return scrollTo({ top: 0, behavior: 'smooth' });
    if ('back' in d) return history.length > 1 ? history.back() : (location.hash = '#/');
    if ('sw' in d) { reg = !reg; return openAuth(); }
    if ('out' in d) { localStorage.removeItem('token'); localStorage.removeItem('me'); location.hash = '#/'; return location.reload(); }
    if ('compose' in d) return me ? openDlg(`<div class="p-2">${composer()}</div>`) : openAuth();
    if ('edit' in d) return openDlg(`<form id="ef" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Edit profile</h2><input name="name" maxlength="30" value="${esc(me.name)}" placeholder="Name" class="${inp}"><textarea name="bio" maxlength="160" rows="3" placeholder="Bio" class="${inp}">${esc(me.bio)}</textarea><input name="location" maxlength="30" value="${esc(me.location)}" placeholder="Location" class="${inp}"><input name="website" maxlength="100" value="${esc(me.website)}" placeholder="Website" class="${inp}"><div class="grid grid-cols-2 gap-2"><label class="block text-sm text-zinc-400">Birthday<input name="birthday" type="date" value="${esc(me.birthday)}" max="${new Date().toISOString().slice(0, 10)}" class="${inp} mt-1"></label><label class="block text-sm text-zinc-400">Show on profile<select name="birthdayVisible" class="${inp} mt-1">${[['none', 'Hidden'], ['monthday', 'Month & day'], ['full', 'Full date']].map(([k, t]) => `<option value="${k}" ${me.birthdayVisible === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div><label class="block text-sm text-zinc-400">Profile photo<input name="avatar" type="file" accept="image/*" class="mt-1 block w-full text-sm"></label><label class="block text-sm text-zinc-400">Banner<input name="banner" type="file" accept="image/*" class="mt-1 block w-full text-sm"></label><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-white py-2.5 font-bold text-black">Save</button></form>`);
    if (d.tab) { if (d.tab !== 'all' && !me) return openAuth(); tab = d.tab; scrollTo(0, 0); return home(pages[cur].el, pages[cur]); }
    if (d.follow) { if (!me) return openAuth(); const r = await api(`/users/${d.follow}/follow`, { method: 'POST' }); b.outerHTML = fbtn(d.follow, r.isFollowing, r.requested); if (r.requested) toast('Follow request sent'); return; }
    if (d.act) {
      if (!me) return openAuth();
      const id = art.dataset.id, p = P[id];
      if (d.act === 'views') { if (p.author?.id === me.id || me.admin) showAnalytics(id); return; }
      if (d.act === 'repost') return openDlg(`<div class="p-2" data-pid="${id}"><button data-rq="toggle" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900">${p.reposted ? 'Undo repost' : 'Repost'}</button><button data-rq="quote" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900">Quote</button></div>`);
      if (d.act === 'reply' && p.canReply === false) return toast(replyMsg(p), 1);
      if (d.act === 'reply') { b.classList.add('a-reply'); return setTimeout(() => openDlg(`<div class="p-2">${composer(id)}</div>`), 200); }
      if (d.act === 'more') return openDlg(`<div class="p-2" data-pid="${id}">${[['copy', 'Copy link'], ...(me.id === p.author?.id || me.admin ? [['analytics', 'View analytics']] : []), ...(me.id !== p.author?.id ? [['note', 'Add a community note']] : []), ...(p.bookmarked ? [['folder', 'Move to folder']] : []), ...(me.id === p.author?.id && !p.repostBy && Date.now() - new Date(p.at) < 3600e3 ? [['edit', 'Edit post']] : []), ...(me.id === p.author?.id && !p.reply && !p.repostBy ? [['pin', me.pinned === id ? 'Unpin from profile' : 'Pin to profile']] : []), ...(me.id !== p.author?.id ? [['muteu', `Mute @${p.author?.username}`], ['blocku', `Block @${p.author?.username}`]] : []), ['report', 'Report post'], ...(me.id === p.author?.id || me.admin ? [['del', 'Delete post']] : [])].map(([m, t]) => `<button data-m="${m}" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900 ${m === 'del' ? 'text-red-500' : ''}${m === 'muteu' || m === 'blocku' ? 'text-red-400' : ''}">${t}</button>`).join('')}</div>`);
      if (d.act === 'del') { if (!confirm('Delete this post?')) return; await api('/posts/' + id, { method: 'DELETE' }); art.style.cssText = 'opacity:0;transform:translateX(24px);transition:.25s'; return setTimeout(() => document.querySelectorAll(`article[data-id="${id}"]`).forEach((a) => a.remove()), 250); }
      const [k, n] = { like: ['liked', 'likes'], repost: ['reposted', 'reposts'], bookmark: ['bookmarked', 'saves'] }[d.act];
      p[k] = !p[k]; if (n) p[n] += p[k] ? 1 : -1; rerender(id); if (p[k]) document.querySelectorAll(`article[data-id="${id}"] [data-act="${d.act}"]`).forEach((x) => x.classList.add('a-' + d.act)); if (d.act === 'bookmark') drop('#/bookmarks');
      return api(`/posts/${id}/${d.act}`, { method: 'POST' });
    }
    if (art && !e.target.closest('a,button')) location.hash = '#/p/' + art.dataset.id;
  }
  return NEXT;
});
